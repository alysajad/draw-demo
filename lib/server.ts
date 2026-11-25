import { Pool, PoolClient } from "pg";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { Entry, Event, validateEntries, validateBranches, validateBranchNames, normalizeBranch, nextDraw, eligibleEntries, branches } from "./model";
const globalDB = globalThis as unknown as { drawPool?: Pool };
export const sharedOrganizer = "00000000-0000-4000-8000-000000000001";
function pool() {
  if (!process.env.DATABASE_URL)
    throw new Error("Event storage is not configured. Set DATABASE_URL on the server.");
  return (globalDB.drawPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 120000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
  }));
}
async function state(db: PoolClient, id: string, user?: string): Promise<Event> {
  const {
    rows: [e],
  } = await db.query(`select e.*, coalesce((select json_agg(r order by drawn_at, branch, rank desc)
    from results r where r.event_id=e.id), '[]'::json) as saved_results
    from events e where id=$1 and ($2::uuid is null or organizer=$2)`, [id, user || null]);
  if (!e) throw new Error("Event not found");
  const { saved_results: rows, ...event } = e;
  const order = branches(event);
  return {
    ...event,
    results: (rows as { branch: string; winner: Entry; rank: number; drawn_at: string; eligible_count: number; acknowledged: boolean }[])
      .sort((a, b) => order.indexOf(a.branch) - order.indexOf(b.branch) || b.rank - a.rank).map((r) => ({
      ...r.winner,
      rank: r.rank,
      drawn_at: new Date(r.drawn_at).toISOString(),
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
    // Idle polling does not need a transaction or a row lock.
    if (action === "state") {
      let id = body.id as string;
      if (!id) {
        const { rows } = await db.query("select id from events where organizer=$1 order by created_at desc limit 1", [user]);
        if (!rows.length) return null;
        id = rows[0].id;
      }
      return await state(db, id, user);
    }
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
    const { rows: [event] } = await db.query("select * from events where id=$1 and organizer=$2 for update", [id, user]);
    if (!event) throw new Error("Event not found");
    let details: Record<string, unknown> = {};
    let result: Event | undefined;
    if (action === "import") {
      const finalize = body.finalize === true;
      if (event.status !== "draft" && !finalize) throw new Error("Event is locked");
      const entries = body.entries as Entry[];
      if (
        !Array.isArray(entries) ||
        entries.some(
          (e) =>
            !e ||
            typeof e.entry_id !== "string" ||
            typeof e.name !== "string" ||
            (e.showroom !== undefined && typeof e.showroom !== "string") ||
            (e.vehicle !== undefined && typeof e.vehicle !== "string") ||
            (e.mobile !== undefined && typeof e.mobile !== "string"),
        )
      )
        throw new Error("Invalid entries");
      const clean = entries.map((e) => ({
        entry_id: e.entry_id.trim(),
        name: e.name.trim(),
        showroom: body.branch_draw === true ? normalizeBranch(e.showroom || "") : e.showroom?.trim(),
        vehicle: e.vehicle?.trim(),
        mobile: e.mobile?.trim(),
      }));
      if (body.branch_draw !== undefined && typeof body.branch_draw !== "boolean") throw new Error("Invalid branch draw mode");
      const branchDraw = body.branch_draw === true;
      const errors = [...validateEntries(clean), ...(branchDraw ? [...validateBranches(clean), ...validateBranchNames(clean)] : [])];
      if (errors.length) throw new Error(errors.slice(0, 5).join(" "));
      const prizes = body.prizes;
      if (
        !Array.isArray(prizes) ||
        prizes.length !== 3 ||
        prizes.some((p) => typeof p !== "string" || p.length > 200)
      )
        throw new Error("Invalid prizes");
      const hash = finalize ? createHash("sha256").update(JSON.stringify({ entries: clean, prizes, branch_draw: branchDraw })).digest("hex") : null;
      if (event.status !== "draft") {
        if (hash !== event.snapshot_hash) throw new Error("Event is locked");
        action = "recover";
      } else {
        await db.query("update events set entries=$2,prizes=$3,branch_draw=$4,status=$5,snapshot_hash=$6 where id=$1", [
          id,
          JSON.stringify(clean),
          JSON.stringify(prizes),
          branchDraw,
          finalize ? "locked" : "draft",
          hash,
        ]);
        details = { count: clean.length, ...(finalize ? { snapshot_hash: hash } : {}) };
        result = { ...event, entries: clean, prizes, branch_draw: branchDraw, status: finalize ? "locked" : "draft", snapshot_hash: hash || undefined, results: [] };
      }
    }
    if (action === "lock") {
      if (event.status !== "draft") throw new Error("Event is already locked");
      const errors = [...validateEntries(event.entries), ...(event.branch_draw ? validateBranches(event.entries) : [])];
      if (errors.length) throw new Error(errors.join(" "));
      const hash = createHash("sha256")
        .update(
          JSON.stringify({ entries: event.entries, prizes: event.prizes, branch_draw: event.branch_draw }),
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
      result = current;
      const same = await db.query(
        "select 1 from results where event_id=$1 and idempotency_key=$2",
        [id, body.key],
      );
      if (!same.rowCount) {
        const pending = current.results.find((r) => !r.acknowledged);
        if (!pending) {
          const next = nextDraw(current, current.branch_draw ? String(body.branch) : undefined);
          if (
            event.status !== "locked" || !next ||
            body.rank !== next.rank || (current.branch_draw && body.branch !== next.branch)
          )
            throw new Error("Refresh event state before drawing");
          const eligible = eligibleEntries(current, next.branch);
          if (!eligible.length) throw new Error("No eligible entries remain for this branch");
          const winner = eligible[randomInt(eligible.length)];
          const { rows: [saved] } = await db.query(
            "insert into results(event_id,rank,entry_id,winner,idempotency_key,eligible_count,organizer,branch) values($1,$2,$3,$4,$5,$6,$7,$8) returning drawn_at",
            [
              id,
              body.rank,
              winner.entry_id,
              JSON.stringify(winner),
              body.key,
              eligible.length,
              user,
              next.branch,
            ],
          );
          result = { ...current, results: [...current.results, { ...winner, rank: next.rank, drawn_at: saved.drawn_at.toISOString(), eligible_count: eligible.length, acknowledged: false }] };
          details = {
            rank: body.rank,
            branch: next.branch,
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
      if (pending && (body.rank !== pending.rank || (current.branch_draw && body.entry_id !== pending.entry_id)))
        throw new Error("Result changed; refresh first");
      if (pending) {
        await db.query(
          "update results set acknowledged=true where event_id=$1 and entry_id=$2",
          [id, pending.entry_id],
        );
        if (!nextDraw(current))
          await db.query("update events set status='complete' where id=$1", [
            id,
          ]);
        details = { rank: pending.rank };
      }
      result = { ...current, status: pending && !nextDraw(current) ? "complete" : current.status,
        results: current.results.map(r => r === pending ? { ...r, acknowledged: true } : r) };
    }
    if (action !== "state")
      await db.query(
        "insert into audit(event_id,organizer,action,details) values($1,$2,$3,$4)",
        [id, user, action, JSON.stringify(details)],
      );
    result ??= await state(db, id);
    await db.query("commit");
    return result;
  } catch (e) {
    if (action !== "state") await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
