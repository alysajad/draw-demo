import { sampleEvent, mockDraw, sampleWorkbook } from "./fixtures";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { columnMapping, participantPreview, readParticipantFile, winnersWorkbook } from "../lib/spreadsheet";
import { csvResults, NIPPON_BRANCHES, normalizeBranch } from "../lib/model";

function file(name: string, data: Buffer) {
  return { name, size: data.length, text: async () => data.toString(), arrayBuffer: async () => Uint8Array.from(data).buffer };
}
test("sample Excel eligibility and mapping match test fixtures", async () => {
  const [sheet] = await readParticipantFile(file("samp (1).xlsx", await sampleWorkbook()));
  const preview = participantPreview(sheet.csv, columnMapping(sheet.csv));
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(preview.entries.map(({ mobile, ...entry }) => entry), sampleEvent().entries.map(entry => ({ ...entry, showroom: normalizeBranch(entry.showroom || "") })));
  assert.equal(preview.entries.length, 43);
  assert.ok(preview.entries.every(entry => entry.mobile));
  assert.deepEqual(columnMapping(sheet.csv), { entry_id: "Ticket ID", name: "Name", showroom: "Branch", vehicle: "Model", mobile: "Phone" });
  assert.deepEqual(preview.missingBranches, NIPPON_BRANCHES.slice(4));
});
test("workbooks support sheet selection and preserve text and zero-formatted IDs", async () => {
  const book = new ExcelJS.Workbook();
  for (const name of ["Enjakkal", "Kollam"]) {
    const sheet = book.addWorksheet(name);
    sheet.addRow(["Ticket ID", "Name", "Branch", "Phone"]);
    for (let i = 1; i <= 3; i++) { const row = sheet.addRow([i, "സൂര്യ നായർ", name, "0123456789"]); row.getCell(1).numFmt = "0000"; }
  }
  const sheets = await readParticipantFile(file("participants.xlsx", Buffer.from(await book.xlsx.writeBuffer())));
  assert.deepEqual(sheets.map(s => s.name), ["Enjakkal", "Kollam"]);
  const preview = participantPreview(sheets[1].csv, columnMapping(sheets[1].csv));
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.entries[0].entry_id, "0001");
  assert.equal(preview.entries[0].mobile, "0123456789");
  assert.equal(preview.entries[0].showroom, "Kollam");
});
test("branch spelling is normalized and unfamiliar branches cannot be imported", () => {
  assert.equal(normalizeBranch("  IRINJALKUDA  "), "Irinjalakuda");
  assert.equal(normalizeBranch("Kalamassery"), "Kalamaserry");
  assert.equal(normalizeBranch("Kazhakoottam"), "Kazhakootam");
  assert.equal(normalizeBranch("Thrissur"), "Trichur");
  const csv = "Ticket ID,Name,Branch\n1,A,Irinjalkuda\n2,B,irinjalkuda\n3,C,IRINJALAKUDA";
  const valid = participantPreview(csv, columnMapping(csv));
  assert.deepEqual(valid.errors, []);
  assert.ok(valid.entries.every(entry => entry.showroom === "Irinjalakuda"));
  const unknown = csv.replace(/Irinjalkuda|irinjalkuda|IRINJALAKUDA/g, "Misspelled branch");
  assert.ok(participantPreview(unknown, columnMapping(unknown)).errors.some(error => error.includes("Unknown branch")));
});
test("downloadable template matches the supplied columns and lists all thirteen branches without fake participants", async () => {
  const [sheet] = await readParticipantFile(file("template.xlsx", await readFile("public/participants-example.xlsx")));
  const preview = participantPreview(sheet.csv, columnMapping(sheet.csv));
  assert.deepEqual(preview.headers, ["Ticket ID", "Name", "Phone", "Model", "Colour", "VIN", "Flagged", "Excluded", "Created At", "Branch"]);
  assert.equal(preview.entries.length, 39);
  assert.deepEqual(preview.missingBranches, []);
  assert.ok(preview.errors.some(error => error.includes("entry_id and name are required")));
});
test("bad files and invalid or flagged participants fail review", async () => {
  await assert.rejects(readParticipantFile(file("bad.xlsx", Buffer.from("not excel"))), /Unable to read/);
  await assert.rejects(readParticipantFile(file("old.xls", Buffer.from("data"))), /xlsx or .csv/);
  await assert.rejects(readParticipantFile({ ...file("big.csv", Buffer.alloc(0)), size: 8_000_001 }), /8 MB/);
  const csv = "Ticket ID,Name,Branch,Flagged,Excluded\n1,A,X,Yes,No\n1,B,,No,No\n3,C,Y,No,No";
  const parsed = participantPreview(csv, columnMapping(csv));
  assert.ok(parsed.errors.some(e => e.includes("flagged")));
  assert.ok(parsed.errors.some(e => e.includes("duplicate")));
  assert.ok(parsed.errors.some(e => e.includes("branch")));
  assert.ok(parsed.errors.some(e => e.includes("three")));
  const unmapped = participantPreview("entry_id,name,showroom\n1,A,X\n2,B,X\n3,C,X", { name: "" });
  assert.ok(unmapped.errors.length);
});
test("one winners worksheet combines branches and writes literal text, including formula-like values", async () => {
  let event = sampleEvent();
  for (const branch of ["Kayamkulam", "Enjakkal"]) {
    event = mockDraw(event, branch);
    event.results = event.results.map(r => ({ ...r, acknowledged: true, name: "=HYPERLINK(\"bad\")", mobile: "0123456789" }));
  }
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await winnersWorkbook(event));
  assert.equal(book.worksheets.length, 1);
  const sheet = book.getWorksheet("Winners")!;
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getCell("A2").text, "Enjakkal");
  assert.equal(sheet.getCell("A3").text, "Kayamkulam");
  assert.equal(sheet.getCell("E2").value, '=HYPERLINK("bad")');
  assert.equal(sheet.getCell("E2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("G2").text, "0123456789");
  assert.ok(sheet.getCell("H2").text);
});
test("winner exports use IST regardless of machine timezone, including date rollover", async () => {
  for (const [timestamp, expected] of [
    ["2026-11-25T10:42:17.000Z", "25/11/2026, 16:12:17 IST"],
    ["2026-12-31T18:30:00.000Z", "01/01/2027, 00:00:00 IST"],
  ]) {
    const event = mockDraw(sampleEvent(), "Enjakkal");
    event.results[0].drawn_at = timestamp;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await winnersWorkbook(event));
    const sheet = book.getWorksheet("Winners")!;
    assert.equal(sheet.getCell("H1").text, "Draw Time (IST)");
    assert.equal(sheet.getCell("H2").text, expected);
    assert.ok(csvResults(event).includes(expected));
    assert.equal(event.results[0].drawn_at, timestamp);
  }
});
test("branch exports exclude other branches and combined exports sort branches then prize rank", async () => {
  let event = sampleEvent();
  for (const branch of ["Kayamkulam", "Enjakkal"]) {
    for (let i = 0; i < 3; i++) {
      event = mockDraw(event, branch);
      event.results = event.results.map(r => ({ ...r, acknowledged: true }));
    }
  }
  const before = JSON.stringify(event);
  for (const branch of [undefined, "Kayamkulam", "Kollam"]) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await winnersWorkbook(event, branch));
    const sheet = book.worksheets[0];
    const expected = branch === undefined ? ["Enjakkal", "Kayamkulam"] : branch === "Kollam" ? [] : [branch];
    assert.equal(sheet.rowCount, 1 + expected.length * 3);
    expected.forEach((name, index) => ["1st", "2nd", "3rd"].forEach((rank, offset) => {
      assert.equal(sheet.getCell(`A${2 + index * 3 + offset}`).text, name);
      assert.equal(sheet.getCell(`B${2 + index * 3 + offset}`).text, rank);
    }));
  }
  assert.equal(JSON.stringify(event), before);
});
