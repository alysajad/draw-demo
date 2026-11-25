"use client";
import { useMemo, useState } from "react";
import { Entry } from "@/lib/model";
import { columnMapping, participantPreview, ParticipantSheet, readParticipantFile } from "@/lib/spreadsheet";

export default function ParticipantImport({ busy, progress, save }: {
  busy: boolean;
  progress: { percent: number | null; label: string } | null;
  save: (entries: Entry[]) => Promise<void>;
}) {
  const [sheets, setSheets] = useState<ParticipantSheet[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const csv = sheets[selected]?.csv;
  const preview = useMemo(() => csv !== undefined ? participantPreview(csv, columnMapping(csv)) : null, [csv]);
  const blocked = busy || reading;
  async function upload(file?: File) {
    if (!file) return;
    setReading(true); setError(""); setSheets([]);
    try {
      const next = await readParticipantFile(file);
      setSheets(next); setSelected(0);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read file."); }
    finally { setReading(false); }
  }
  return <section className="participant-import" aria-label="Participant upload">
    <h3>Upload participant sheet</h3>
    <label>Participant Excel or CSV
      <input type="file" accept=".xlsx,.csv" disabled={blocked} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
    <a href="/participants-example.xlsx" download>Download Excel template</a>
    {reading && <p role="status">Reading participants…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {sheets.length > 1 && <label>Worksheet<select disabled={blocked} value={selected} onChange={e => setSelected(Number(e.target.value))}>
      {sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select></label>}
    {preview && <>
      <p>{preview.entries.length} eligible entries · {preview.errors.length} errors</p>
      <p>{13 - preview.missingBranches.length} of 13 branches have participants.</p>
      {preview.missingBranches.length > 0 && <p className="notice">No participants for: {preview.missingBranches.join(", ")}. Include their participants before uploading if you want to draw all 13 branches.</p>}
      {preview.errors.slice(0, 8).map((message, i) => <p className="error" key={i}>{message}</p>)}
      {preview.warnings.map(message => <p className="notice" key={message}>{message}</p>)}
      <div className="table-wrap"><table><thead><tr>{["Ticket ID", "Name", "Branch", "Vehicle", "Mobile"].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{preview.entries.slice(0, 50).map((entry, i) => <tr key={i}>{[entry.entry_id, entry.name, entry.showroom, entry.vehicle, entry.mobile].map((value, j) => <td key={j}>{value || "Not provided"}</td>)}</tr>)}</tbody>
      </table></div><small>Preview shows the first 50 rows. All rows are validated.</small>
    </>}
    {preview && <div className="actions">
      {progress && <div className="upload-progress" role="status">
        <span>{progress.label}</span>
        <progress aria-label="Participant upload progress" max={100} value={progress.percent ?? undefined} />
      </div>}
      <button className="primary" disabled={blocked || !!preview.errors.length} onClick={() => {
        void save(preview.entries);
      }}>{busy ? "Uploading…" : "Upload sheet"}</button>
    </div>}
  </section>;
}
