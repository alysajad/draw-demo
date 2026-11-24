import Papa from "papaparse";
export type Entry = {
  entry_id: string;
  name: string;
  showroom?: string;
  vehicle?: string;
  mobile?: string;
};
export type Result = Entry & {
  rank: number;
  drawn_at: string;
  eligible_count: number;
  acknowledged: boolean;
};
export type Event = {
  id: string;
  status: "draft" | "locked" | "complete";
  entries: Entry[];
  prizes: string[];
  results: Result[];
  snapshot_hash?: string;
  branch_draw?: boolean;
};
export const rankName = (rank: number) =>
  rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd";
export function parseCSV(csv: string, mapping: Record<string, string> = {}) {
  const parsed = Papa.parse<Record<string, string>>(
    csv.replace(/^\uFEFF/, ""),
    { header: true, skipEmptyLines: "greedy" },
  );
  const headers = parsed.meta.fields || [];
  const errors = parsed.errors.map(
    (e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`,
  );
  for (const key of ["entry_id", "name"])
    if (!headers.includes(mapping[key] ?? key))
      errors.push(`Map a column to ${key}.`);
  const entries: Entry[] = parsed.data.map(
    (row) =>
      Object.fromEntries(
        ["entry_id", "name", "showroom", "vehicle", "mobile"].map((k) => [
          k,
          (row[mapping[k] ?? k] || "").trim(),
        ]),
      ) as Entry,
  );
  errors.push(...validateEntries(entries));
  const names = new Set<string>();
  const duplicates = new Set<string>();
  entries.forEach((e) => {
    const n = e.name.toLocaleLowerCase();
    if (names.has(n)) duplicates.add(e.name);
    names.add(n);
  });
  return {
    headers,
    entries,
    errors,
    warnings: [...duplicates].map(
      (n) => `Repeated name: ${n}. Review the separate entry IDs.`,
    ),
  };
}
export function validateEntries(entries: Entry[]) {
  const errors: string[] = [];
  const ids = new Set<string>();
  if (entries.length < 3)
    errors.push("At least three valid entries are required.");
  if (entries.length > 50000) errors.push("Maximum 50,000 entries per event.");
  entries.forEach((e, i) => {
    if (!e.entry_id || !e.name)
      errors.push(`Row ${i + 2}: entry_id and name are required.`);
    if (e.entry_id?.length > 120 || e.name?.length > 240)
      errors.push(`Row ${i + 2}: ID or name is too long.`);
    if (ids.has(e.entry_id))
      errors.push(`Row ${i + 2}: duplicate entry ID ${e.entry_id}.`);
    ids.add(e.entry_id);
  });
  return errors;
}
export function csvResults(event: Event) {
  return Papa.unparse(
    event.results.map((r) => ({
      rank: rankName(r.rank),
      prize: safe(event.prizes[r.rank - 1] || ""),
      entry_id: safe(r.entry_id),
      name: safe(r.name),
      showroom: safe(r.showroom || ""),
      vehicle: safe(r.vehicle || ""),
      mobile: safe(r.mobile || ""),
      drawn_at: r.drawn_at,
      eligible_count: r.eligible_count,
      snapshot_hash: event.snapshot_hash || "",
    })),
  );
}
function safe(v: string) {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
export function branches(event: Event): string[] {
  return event.branch_draw ? [...new Set(event.entries.map(e => e.showroom || ""))] : [""];
}
export function drawSchedule(event: Event) {
  return branches(event).flatMap(branch => [3, 2, 1].map(rank => ({ branch, rank })));
}
export function nextDraw(event: Event, selectedBranch?: string) {
  const candidates = selectedBranch === undefined ? branches(event) : [selectedBranch];
  for (const branch of candidates) {
    if (!branches(event).includes(branch)) continue;
    const drawn = event.results.filter(
      result => !event.branch_draw || result.showroom === branch,
    ).length;
    if (drawn < 3) return { branch, rank: 3 - drawn };
  }
}
export function eligibleEntries(event: Event, branch: string) {
  const won = new Set(event.results.map(r => r.entry_id));
  return event.entries.filter(e => (!event.branch_draw || e.showroom === branch) && !won.has(e.entry_id));
}
export function validateBranches(entries: Entry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.showroom || "", (counts.get(entry.showroom || "") || 0) + 1);
  return [...counts].flatMap(([branch, count]) => !branch ? ["Every entry needs a branch."] : count < 3 ? [`${branch} needs at least three eligible entries.`] : []);
}
