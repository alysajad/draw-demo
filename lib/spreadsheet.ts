import Papa from "papaparse";
import { branches, Event, formatDrawTimeIST, NIPPON_BRANCHES, normalizeBranch, parseCSV, rankName, validateBranches, validateBranchNames } from "./model";

export type ParticipantSheet = { name: string; csv: string };
const aliases: Record<string, string[]> = {
  entry_id: ["entry_id", "ticket id", "id"],
  name: ["name", "customer", "customer name"],
  showroom: ["showroom", "branch"],
  vehicle: ["vehicle", "model", "car"],
  mobile: ["mobile", "phone", "mobile no.", "mobile number"],
};
export function columnMapping(csv: string) {
  const headers = Papa.parse(csv, { header: true }).meta.fields || [];
  return Object.fromEntries(Object.entries(aliases).map(([key, names]) =>
    [key, headers.find(h => names.includes(h.trim().toLowerCase())) || ""]));
}
export function participantPreview(csv: string, mapping: Record<string, string>) {
  const source = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: "greedy" });
  const headers = source.meta.fields || [];
  const excluded = headers.find(h => h.trim().toLowerCase() === "excluded");
  const flagged = headers.find(h => h.trim().toLowerCase() === "flagged");
  const eligibilityErrors: string[] = [];
  const rows = source.data.filter((row, i) => {
    for (const field of [excluded, flagged]) {
      if (field && !["yes", "no"].includes((row[field] || "").trim().toLowerCase()))
        eligibilityErrors.push(`Row ${i + 2}: review unknown ${field} flag.`);
    }
    if (excluded && row[excluded]?.trim().toLowerCase() === "yes") return false;
    if (flagged && row[flagged]?.trim().toLowerCase() === "yes")
      eligibilityErrors.push(`Row ${i + 2}: review flagged entry before importing.`);
    return true;
  });
  const parsed = parseCSV(Papa.unparse({ fields: headers, data: rows }), mapping);
  const entries = parsed.entries.map(entry => ({ ...entry, showroom: normalizeBranch(entry.showroom || "") }));
  const missingBranches = NIPPON_BRANCHES.filter(branch => !entries.some(entry => entry.showroom === branch));
  return { ...parsed, entries, missingBranches,
    errors: [...source.errors.map(e => e.message), ...parsed.errors, ...eligibilityErrors, ...validateBranches(entries), ...validateBranchNames(entries)],
  };
}
export async function readParticipantFile(file: Pick<File, "name" | "size" | "text" | "arrayBuffer">): Promise<ParticipantSheet[]> {
  if (file.size > 8_000_000) throw new Error("Participant file must be smaller than 8 MB.");
  if (/\.csv$/i.test(file.name)) return [{ name: file.name, csv: await file.text() }];
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Choose an .xlsx or .csv file.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await file.arrayBuffer()); }
  catch { throw new Error("Unable to read workbook. Choose a valid, unencrypted .xlsx file."); }
  if (!workbook.worksheets.length) throw new Error("The workbook has no worksheets.");
  return workbook.worksheets.map(sheet => {
    if (sheet.rowCount > 50001) throw new Error("Maximum 50,000 entries per worksheet.");
    const rows: string[][] = [];
    sheet.eachRow(row => {
      const values: string[] = [];
      for (let i = 1; i <= sheet.columnCount; i++) {
        const cell = row.getCell(i);
        let value = cell.text;
        // Excel stores formatted numeric IDs as numbers; retain their displayed zero padding.
        if (typeof cell.value === "number" && /^0+$/.test(cell.numFmt || ""))
          value = String(cell.value).padStart(cell.numFmt.length, "0");
        values.push(value);
      }
      if (values.some(v => v.trim())) rows.push(values);
    });
    if (rows[0] && new Set(rows[0].map(v => v.trim().toLowerCase())).size !== rows[0].length)
      throw new Error(`${sheet.name}: column headers must be unique and nonempty.`);
    if (rows[0]?.some(v => !v.trim())) throw new Error(`${sheet.name}: every column needs a header.`);
    return { name: sheet.name, csv: Papa.unparse(rows) };
  });
}
export async function winnersWorkbook(event: Event) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Winners");
  sheet.addRow(["Branch", "Prize Rank", "Prize", "Ticket ID", "Name", "Vehicle", "Mobile", "Draw Time (IST)"]);
  const order = branches(event);
  [...event.results].sort((a, b) => order.indexOf(a.showroom || "") - order.indexOf(b.showroom || "") || a.rank - b.rank)
    .forEach(r => sheet.addRow([r.showroom || "", rankName(r.rank), event.prizes[r.rank - 1] || "", r.entry_id, r.name, r.vehicle || "", r.mobile || "", formatDrawTimeIST(r.drawn_at)]));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach(column => { column.width = 25; column.numFmt = "@"; });
  sheet.getColumn(8).width = 30;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:H1";
  return workbook.xlsx.writeBuffer();
}
export function saveWorkbook(buffer: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
