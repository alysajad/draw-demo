import { Pool, PoolClient } from "pg";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { Entry, Event, validateEntries } from "./model";
const globalDB = globalThis as unknown as { drawPool?: Pool };
function pool() {
  return (globalDB.drawPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  }));
}
export async function authorized(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new Error("Unauthorized");
  if (!process.env.DATABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL)
    throw new Error("Live service is not configured. Use rehearsal.");
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  const exists = await pool().query(
    "select 1 from organizers where user_id=$1",
    [data.user.id],
  );
  if (!exists.rowCount) throw new Error("Unauthorized");
  return data.user.id;
}
async function state(db: PoolClient, id: string): Promise<Event> {
  const {
    rows: [e],
  } = await db.query("select * from events where id=$1", [id]);
  const { rows } = await db.query(
    "select * from results where event_id=$1 order by rank desc",
    [id],
  );
  return {
    ...e,
    results: rows.map((r) => ({
      ...r.winner,
      rank: r.rank,
      drawn_at: r.drawn_at.toISOString(),
      eligible_count: r.eligible_count,
      acknowledged: r.acknowledged,
    })),
  };
}
export async function operate(
  user: string,
  action: string,
  body: Record<string, unknown>,
) {
  const db = await pool().connect();
  try {
    await db.query("begin");
    let id = body.id as string;
    if (action === "create") {
      id = randomUUID();
      await db.query("insert into events(id,organizer) values($1,$2)", [
        id,
        user,
      ]);
    } else if (!id) {
      const { rows } = await db.query(
        "select id from events where organizer=$1 order by created_at desc limit 1",
        [user],
      );
      if (!rows.length) {
        await db.query("commit");
        return null;
      }
      id = rows[0].id;
    }
    const {
      rows: [event],
    } = await db.query(
      "select * from events where id=$1 and organizer=$2 for update",
      [id, user],
    );
    if (!event) throw new Error("Event not found");
    let details: Record<string, unknown> = {};
    if (action === "import") {
      if (event.status !== "draft") throw new Error("Event is locked");
      const entries = body.entries as Entry[];
      if (
        !Array.isArray(entries) ||
        entries.some(
          (e) =>
            !e ||
            typeof e.entry_id !== "string" ||
            typeof e.name !== "string" ||
            (e.showroom !== undefined && typeof e.showroom !== "string") ||
            (e.vehicle !== undefined && typeof e.vehicle !== "string"),
        )
      )
        throw new Error("Invalid entries");
      const clean = entries.map((e) => ({
        entry_id: e.entry_id.trim(),
        name: e.name.trim(),
        showroom: e.showroom?.trim(),
        vehicle: e.vehicle?.trim(),
      }));
      const errors = validateEntries(clean);
      if (errors.length) throw new Error(errors.slice(0, 5).join(" "));
      const prizes = body.prizes;
      if (
        !Array.isArray(prizes) ||
        prizes.length !== 3 ||
        prizes.some((p) => typeof p !== "string" || p.length > 200)
      )
        throw new Error("Invalid prizes");
      await db.query("update events set entries=$2,prizes=$3 where id=$1", [
        id,
        JSON.stringify(clean),
        JSON.stringify(prizes),
      ]);
      details = { count: clean.length };
    }
    if (action === "lock") {
      if (event.status !== "draft") throw new Error("Event is already locked");
      const errors = validateEntries(event.entries);
      if (errors.length) throw new Error(errors.join(" "));
      const hash = createHash("sha256")
        .update(
          JSON.stringify({ entries: event.entries, prizes: event.prizes }),
        )
        .digest("hex");
      await db.query(
        "update events set status='locked',snapshot_hash=$2 where id=$1",
        [id, hash],
      );
      details = { snapshot_hash: hash };
    }
    if (action === "draw") {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.key)))
        throw new Error("Invalid idempotency key");
      const current = await state(db, id);
      const same = await db.query(
        "select 1 from results where event_id=$1 and idempotency_key=$2",
        [id, body.key],
      );
      if (!same.rowCount) {
        const pending = current.results.find((r) => !r.acknowledged);
        if (!pending) {
          if (
            event.status !== "locked" ||
            current.results.length >= 3 ||
            body.rank !== 3 - current.results.length
          )
            throw new Error("Refresh event state before drawing");
          const eligible = current.entries.filter(
            (e) => !current.results.some((r) => r.entry_id === e.entry_id),
          );
          const winner = eligible[randomInt(eligible.length)];
          await db.query(
            "insert into results(event_id,rank,entry_id,winner,idempotency_key,eligible_count,organizer) values($1,$2,$3,$4,$5,$6,$7)",
            [
              id,
              body.rank,
              winner.entry_id,
              JSON.stringify(winner),
              body.key,
              eligible.length,
              user,
            ],
          );
          details = {
            rank: body.rank,
            entry_id: winner.entry_id,
            eligible_count: eligible.length,
            snapshot_hash: event.snapshot_hash,
          };
        } else {
          action = "recover";
        }
      } else {
        action = "recover";
      }
    }
    if (action === "ack") {
      const current = await state(db, id);
      const pending = current.results.find((r) => !r.acknowledged);
      if (pending && body.rank !== pending.rank)
        throw new Error("Result changed; refresh first");
      if (pending) {
        await db.query(
          "update results set acknowledged=true where event_id=$1 and rank=$2",
          [id, pending.rank],
        );
        if (pending.rank === 1)
          await db.query("update events set status='complete' where id=$1", [
            id,
          ]);
        details = { rank: pending.rank };
      }
    }
    if (action !== "state")
      await db.query(
        "insert into audit(event_id,organizer,action,details) values($1,$2,$3,$4)",
        [id, user, action, JSON.stringify(details)],
      );
    const result = await state(db, id);
    await db.query("commit");
    return result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
