import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, rehearsal, rehearsalDraw, csvResults } from "../lib/model";
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
