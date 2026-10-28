import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, rehearsal, rehearsalDraw, csvResults, sampleRehearsal, drawSchedule, nextDraw, validateBranches } from "../lib/model";
test("CSV validates quoting, UTF-8, BOM and explicit mapping", () => {
  const parsed = parseCSV(
    '\uFEFFID,Person\r\n1,"Nair, Meera"\r\n2,സൂര്യ നായർ\r\n3,Ananya',
    { entry_id: "ID", name: "Person" },
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.entries[0].name, "Nair, Meera");
  assert.equal(parsed.entries[1].name, "സൂര്യ നായർ");
});
test("malformed CSV, missing columns, duplicate IDs, insufficient and long entries fail", () => {
  for (const csv of [
    "entry_id,name\n1,A",
    "entry_id,name\n1,A\n1,B\n3,C",
    "id,name\n1,A\n2,B\n3,C",
    'entry_id,name\n1,"bad\n2,B\n3,C',
    `entry_id,name\n1,${"x".repeat(241)}\n2,B\n3,C`,
  ])
    assert.ok(parseCSV(csv).errors.length);
  const repeated = parseCSV("entry_id,name\n1,A\n2,A\n3,C");
  assert.equal(repeated.errors.length, 0);
  assert.equal(repeated.warnings.length, 1);
});
test("ceremony commits once, holds result, draws in order without replacement", () => {
  let e = rehearsal();
  for (const rank of [3, 2, 1]) {
    e = rehearsalDraw(e);
    assert.equal(e.results.at(-1)!.rank, rank);
    assert.deepEqual(rehearsalDraw(e), e);
    e = { ...e, results: e.results.map((r) => ({ ...r, acknowledged: true })) };
  }
  assert.equal(new Set(e.results.map((r) => r.entry_id)).size, 3);
  assert.deepEqual(rehearsalDraw(e), e);
});
test("exports protect against spreadsheet formulas", () => {
  const e = rehearsalDraw(rehearsal());
  e.results[0].name = '=HYPERLINK("bad")';
  assert.ok(csvResults(e).includes("'=HYPERLINK"));
});

test("sample workbook produces twelve branch-isolated winners and supports thirteen branches", () => {
  const sample = sampleRehearsal();
  assert.equal(sample.entries.length, 43);
  assert.deepEqual(validateBranches(sample.entries), []);
  assert.ok(validateBranches(sample.entries.slice(0, 2)).length);
  assert.ok(validateBranches([{ entry_id: "x", name: "X" }]).length);
  const full = { ...sample, entries: Array.from({ length: 13 }, (_, i) => Array.from({ length: 4 }, (_, j) => ({
    entry_id: `${i}-${j}`, name: `Branch ${i} person ${j}`, showroom: `Branch ${i}`,
  }))).flat() };
  for (let event of [sample, full]) {
    const schedule = drawSchedule(event);
    assert.equal(schedule.length, event === sample ? 12 : 39);
    for (const expected of schedule) {
      const before = event.results.length;
      event = rehearsalDraw(event);
      const winner = event.results.at(-1)!;
      assert.equal(winner.showroom, expected.branch);
      assert.equal(winner.rank, expected.rank);
      assert.equal(winner.eligible_count, event.entries.filter(e => e.showroom === expected.branch).length - (3 - expected.rank));
      assert.equal(event.results.length, before + 1);
      assert.deepEqual(rehearsalDraw(event), event);
      event = JSON.parse(JSON.stringify({ ...event, results: event.results.map(r => ({ ...r, acknowledged: true })) }));
    }
    assert.equal(nextDraw(event), undefined);
    assert.equal(new Set(event.results.map(r => r.entry_id)).size, schedule.length);
    assert.deepEqual(rehearsalDraw(event), event);
    assert.equal(csvResults(event).split("\r\n").length, schedule.length + 1);
  }
});

test("an operator can select branches in any order while prize order stays third to first", () => {
  let event = sampleRehearsal();
  const order = ["Kayamkulam", "Enjakkal", "Kalamaserry", "Irinjalkuda"];
  for (const branch of order) {
    for (const rank of [3, 2, 1]) {
      assert.deepEqual(nextDraw(event, branch), { branch, rank });
      event = rehearsalDraw(event, branch);
      assert.equal(event.results.at(-1)!.showroom, branch);
      assert.equal(event.results.at(-1)!.rank, rank);
      event = {
        ...event,
        results: event.results.map(result => ({ ...result, acknowledged: true })),
      };
    }
    assert.equal(nextDraw(event, branch), undefined);
  }
  assert.equal(nextDraw(event), undefined);
  assert.deepEqual(
    event.results.map(result => result.showroom).filter((branch, index, all) => branch !== all[index - 1]),
    order,
  );
});
