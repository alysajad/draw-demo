import { testEvent, sampleEvent } from "./fixtures";
import { test } from "node:test";
import assert from "node:assert/strict";
import EmbeddedPostgres from "embedded-postgres";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { operate, sharedOrganizer } from "../lib/server";
import { GET, POST } from "../app/api/event/route";
import { nextDraw } from "../lib/model";
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
    const initial = await GET(new Request("http://localhost:3000/api/event"));
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).event, null);
    const created = await POST(new Request("http://localhost:3000/api/event", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create" }),
    }));
    assert.equal(created.status, 200);
    const shared = (await created.json()).event;
    assert.equal(shared.organizer, sharedOrganizer);
    const loaded = await GET(new Request("http://localhost:3000/api/event"));
    assert.equal((await loaded.json()).event.id, shared.id);
    const upload = { id: shared.id, entries: sampleEvent().entries, prizes: ["Gold", "Gold", "Gold"], branch_draw: true, finalize: true };
    await assert.rejects(operate(sharedOrganizer, "import", { ...upload, entries: upload.entries.slice(0, 2) }), /three/);
    assert.equal((await operate(sharedOrganizer, "state", { id: shared.id }))!.status, "draft");
    const saved = (await operate(sharedOrganizer, "import", upload))!;
    assert.equal(saved.status, "locked");
    assert.equal(saved.entries.length, 43);
    assert.equal(saved.snapshot_hash?.length, 64);
    const retried = (await operate(sharedOrganizer, "import", upload))!;
    assert.equal(retried.id, saved.id);
    assert.equal(retried.snapshot_hash, saved.snapshot_hash);
    await assert.rejects(operate(sharedOrganizer, "import", { ...upload, prizes: ["Changed", "Gold", "Gold"] }), /locked/);
    const crossOrigin = await POST(new Request("http://localhost:3000/api/event", {
      method: "POST", headers: { Origin: "https://another-site.test" }, body: JSON.stringify({ action: "create" }),
    }));
    assert.equal(crossOrigin.status, 403);
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
      entries: testEvent().entries.map(entry => ({ ...entry, vehicle: "Glanza", mobile: "0123456789" })),
      prizes: ["First", "Second", "Third"],
    }))!;
    e = (await operate(user, "lock", { id }))!;
    assert.equal(e.snapshot_hash?.length, 64);
    await assert.rejects(
      operate(user, "import", {
        id,
        entries: testEvent().entries,
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
    await assert.rejects(operate(user, "import", { id: branchId, entries: sampleEvent().entries.slice(0, 2), prizes: ["", "", ""], branch_draw: true }), /three/);
    branchEvent = (await operate(user, "import", { id: branchId, entries: sampleEvent().entries, prizes: ["Gold", "Gold", "Gold"], branch_draw: true }))!;
    branchEvent = (await operate(user, "lock", { id: branchId }))!;
    await assert.rejects(db.query("update events set branch_draw=false where id=$1", [branchId]), /immutable/);
    let previousId = "stale-ticket";
    for (const branch of ["Kayamkulam", "Enjakkal", "Kalamaserry", "Irinjalakuda"]) {
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
    // Upgrade existing account-owned events without modifying their saved winners.
    await db.query(await readFile("supabase/migrations/20261125_shared_organizer.sql", "utf8"));
    const migrated = (await operate(sharedOrganizer, "state", { id: branchId }))!;
    assert.deepEqual(migrated.results, branchEvent.results);
    assert.equal(migrated.snapshot_hash, branchEvent.snapshot_hash);
    await db.query(await readFile("supabase/migrations/20261126_event_reset.sql", "utf8"));
    await assert.rejects(operate(sharedOrganizer, "reset", { id: branchId }), /Confirm/);
    await assert.rejects(operate(other, "reset", { id: branchId, confirmed: true }), /not found/);
    await assert.rejects(operate(sharedOrganizer, "reset", { id: branchId, confirmed: true, snapshot_hash: "stale" }), /changed/);
    assert.equal((await operate(sharedOrganizer, "state", { id: branchId }))!.results.length, 12);
    const resetResponse = await POST(new Request("http://localhost:3000/api/event", {
      method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", id: branchId, confirmed: true, snapshot_hash: migrated.snapshot_hash }),
    }));
    assert.equal(resetResponse.status, 200);
    const reset = (await resetResponse.json()).event;
    assert.equal(reset.status, "draft");
    assert.deepEqual(reset.entries, []);
    assert.deepEqual(reset.results, []);
    assert.equal((await db.query("select count(*)::int n from results where event_id=$1", [branchId])).rows[0].n, 0);
    assert.equal((await db.query("select details from audit where event_id=$1 and action='reset'", [branchId])).rows[0].details.winners_deleted, 12);
    assert.equal((await operate(sharedOrganizer, "state", { id }))!.results.length, 3);
    await assert.rejects(db.query("delete from results where event_id=$1", [id]), /cannot be deleted/);
    await assert.rejects(db.query("update events set entries='[]' where id=$1", [id]), /immutable/);
    await operate(sharedOrganizer, "reset", { id: branchId, confirmed: true, snapshot_hash: migrated.snapshot_hash });
    await assert.rejects(operate(sharedOrganizer, "draw", { id: branchId, rank: 3, branch: "Enjakkal", key: randomUUID() }), /Refresh/);
    const reuploaded = (await operate(sharedOrganizer, "import", { ...upload, id: branchId }))!;
    assert.equal(reuploaded.entries.length, 43);
    const redrawn = (await operate(sharedOrganizer, "draw", { id: branchId, rank: 3, branch: "Enjakkal", key: randomUUID() }))!;
    assert.equal(redrawn.results.length, 1);
  } finally {
    await db?.end();
    await (globalThis as unknown as { drawPool?: Pool }).drawPool?.end();
    await postgres.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
