import { test } from "node:test";
import assert from "node:assert/strict";
import EmbeddedPostgres from "embedded-postgres";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { operate } from "../lib/server";
import { rehearsal, sampleRehearsal, nextDraw } from "../lib/model";
test("PostgreSQL transactions: concurrent draws, retry, immutable snapshots, ownership and completion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "onam-pg-"));
  const postgres = new EmbeddedPostgres({
    databaseDir: dir,
    port: 55439,
    user: "postgres",
    password: "local-test-only",
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  let db: Pool | undefined;
  try {
    await postgres.initialise();
    await postgres.start();
    process.env.DATABASE_URL =
      "postgresql://postgres:local-test-only@localhost:55439/postgres";
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    await db.query(
      "create schema auth; create table auth.users(id uuid primary key)",
    );
    await db.query(await readFile("supabase/schema.sql", "utf8"));
    const user = randomUUID(),
      other = randomUUID();
    await db.query("insert into auth.users values($1),($2)", [user, other]);
    await db.query("insert into organizers values($1),($2)", [user, other]);
    let e = (await operate(user, "create", {}))!;
    const id = e.id;
    await assert.rejects(operate(other, "state", { id }), /not found/);
    await assert.rejects(operate(user, "lock", { id }), /three/);
    e = (await operate(user, "import", {
      id,
      entries: rehearsal().entries.map(entry => ({ ...entry, vehicle: "Glanza", mobile: "0123456789" })),
      prizes: ["First", "Second", "Third"],
    }))!;
    e = (await operate(user, "lock", { id }))!;
    assert.equal(e.snapshot_hash?.length, 64);
    await assert.rejects(
      operate(user, "import", {
        id,
        entries: rehearsal().entries,
        prizes: ["", "", ""],
      }),
      /locked/,
    );
    await assert.rejects(
      db.query("update events set entries='[]' where id=$1", [id]),
      /immutable/,
    );
    const key = randomUUID();
    const draws = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        operate(user, "draw", { id, rank: 3, key: i % 2 ? key : randomUUID() }),
      ),
    );
    assert.ok(draws.every((d) => d!.results.length === 1));
    assert.equal(new Set(draws.map((d) => d!.results[0].entry_id)).size, 1);
    const original = draws[0]!.results[0];
    assert.equal(original.vehicle, "Glanza");
    assert.equal(original.mobile, "0123456789");
    e = (await operate(user, "state", { id }))!;
    assert.equal(e.results[0].entry_id, original.entry_id);
    await assert.rejects(
      db.query("update results set entry_id=$2 where event_id=$1", [
        id,
        "overwrite",
      ]),
      /immutable/,
    );
    await assert.rejects(
      db.query("delete from results where event_id=$1", [id]),
      /cannot be deleted/,
    );
    await operate(user, "ack", { id, rank: 3 });
    await assert.rejects(
      operate(user, "draw", { id, rank: 3, key: randomUUID() }),
      /Refresh/,
    );
    for (const rank of [2, 1]) {
      e = (await operate(user, "draw", { id, rank, key: randomUUID() }))!;
      await operate(user, "ack", { id, rank });
    }
    e = (await operate(user, "state", { id }))!;
    assert.equal(e.status, "complete");
    assert.equal(new Set(e.results.map((r) => r.entry_id)).size, 3);
    await assert.rejects(
      operate(user, "draw", { id, rank: 1, key: randomUUID() }),
      /Refresh/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from audit where event_id=$1 and action='draw'",
          [id],
        )
      ).rows[0].n,
      3,
    );
    await assert.rejects(
      db.query("delete from audit where event_id=$1", [id]),
      /immutable/,
    );
    let branchEvent = (await operate(user, "create", {}))!;
    const branchId = branchEvent.id;
    await assert.rejects(operate(user, "import", { id: branchId, entries: sampleRehearsal().entries.slice(0, 2), prizes: ["", "", ""], branch_draw: true }), /three/);
    branchEvent = (await operate(user, "import", { id: branchId, entries: sampleRehearsal().entries, prizes: ["Gold", "Gold", "Gold"], branch_draw: true }))!;
    branchEvent = (await operate(user, "lock", { id: branchId }))!;
    await assert.rejects(db.query("update events set branch_draw=false where id=$1", [branchId]), /immutable/);
    let previousId = "stale-ticket";
    for (const branch of ["Kayamkulam", "Enjakkal", "Kalamaserry", "Irinjalkuda"]) {
      while (nextDraw(branchEvent, branch)) {
        const next = nextDraw(branchEvent, branch)!;
        await assert.rejects(operate(user, "draw", { id: branchId, rank: next.rank, branch: "Wrong branch", key: randomUUID() }), /Refresh/);
        const key = randomUUID();
        const draws = await Promise.all(Array.from({ length: 3 }, () => operate(user, "draw", { id: branchId, ...next, key })));
        branchEvent = draws[0]!;
        assert.ok(draws.every(d => d!.results.length === branchEvent.results.length));
        const winner = branchEvent.results.find(result => !result.acknowledged)!;
        assert.equal(winner.showroom, next.branch);
        assert.equal(winner.rank, next.rank);
        await assert.rejects(operate(user, "ack", { id: branchId, rank: next.rank, entry_id: previousId }), /changed/);
        branchEvent = (await operate(user, "ack", { id: branchId, rank: next.rank, entry_id: winner.entry_id }))!;
        previousId = winner.entry_id;
        assert.equal(branchEvent.status, branchEvent.results.length === 12 ? "complete" : "locked");
      }
    }
    assert.equal(branchEvent.results.length, 12);
    assert.equal(new Set(branchEvent.results.map(r => r.entry_id)).size, 12);
    assert.ok(branchEvent.results.every(r => r.acknowledged));
  } finally {
    await db?.end();
    await (globalThis as unknown as { drawPool?: Pool }).drawPool?.end();
    await postgres.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
