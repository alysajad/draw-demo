import { sampleEvent, mockDraw } from "./fixtures";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { columnMapping, participantPreview, readParticipantFile, winnersWorkbook } from "../lib/spreadsheet";

function file(name: string, data: Buffer) {
  return { name, size: data.length, text: async () => data.toString(), arrayBuffer: async () => Uint8Array.from(data).buffer };
}
test("sample Excel eligibility and mapping match test fixtures", async () => {
  const [sheet] = await readParticipantFile(file("samp.xlsx", await readFile("samp.xlsx")));
  const preview = participantPreview(sheet.csv, columnMapping(sheet.csv));
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(preview.entries.map(({ mobile, ...entry }) => entry), sampleEvent().entries);
  assert.equal(preview.entries.length, 43);
  assert.ok(preview.entries.every(entry => entry.mobile));
});
test("workbooks support sheet selection and preserve text and zero-formatted IDs", async () => {
  const book = new ExcelJS.Workbook();
  for (const name of ["First", "Second"]) {
    const sheet = book.addWorksheet(name);
    sheet.addRow(["Ticket ID", "Name", "Branch", "Phone"]);
    for (let i = 1; i <= 3; i++) { const row = sheet.addRow([i, "സൂര്യ നായർ", name, "0123456789"]); row.getCell(1).numFmt = "0000"; }
  }
  const sheets = await readParticipantFile(file("participants.xlsx", Buffer.from(await book.xlsx.writeBuffer())));
  assert.deepEqual(sheets.map(s => s.name), ["First", "Second"]);
  const preview = participantPreview(sheets[1].csv, columnMapping(sheets[1].csv));
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.entries[0].entry_id, "0001");
  assert.equal(preview.entries[0].mobile, "0123456789");
  assert.equal(preview.entries[0].showroom, "Second");
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
