"use client";
import { useState } from "react";
import { Entry, Event, rankName } from "@/lib/model";
import { columnMapping, participantPreview, ParticipantSheet, readParticipantFile } from "@/lib/spreadsheet";

export default function ParticipantImport({ event, busy, save, lock }: {
  event: Event; busy: boolean;
  save: (entries: Entry[], prizes: string[]) => Promise<void>;
  lock: () => Promise<void>;
}) {
  const [sheets, setSheets] = useState<ParticipantSheet[]>([]);
  const [selected, setSelected] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [prizes, setPrizes] = useState(event.prizes);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const csv = sheets[selected]?.csv;
  const preview = csv !== undefined ? participantPreview(csv, mapping) : null;
  const blocked = busy || reading;
  async function upload(file?: File) {
    if (!file) return;
    setReading(true); setError(""); setSheets([]);
    try {
      const next = await readParticipantFile(file);
      setSheets(next); setSelected(0); setMapping(columnMapping(next[0].csv));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read file."); }
    finally { setReading(false); }
  }
  return <section className="participant-import" aria-label="Participant upload">
    <h3>Prepare participants</h3>
    <label>Participant Excel or CSV
      <input type="file" accept=".xlsx,.csv" disabled={blocked} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
    <a href="/participants-example.xlsx" download>Download Excel template</a>
    {reading && <p role="status">Reading participants…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {sheets.length > 1 && <label>Worksheet<select value={selected} onChange={e => {
      const index = Number(e.target.value); setSelected(index); setMapping(columnMapping(sheets[index].csv));
    }}>{sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select></label>}
    {preview && <>
      <div className="mapping">{Object.entries({ entry_id: "Ticket ID", name: "Name", showroom: "Branch", vehicle: "Vehicle", mobile: "Mobile" }).map(([key, label]) =>
        <label key={key}>{label}<select value={mapping[key] || ""} onChange={e => setMapping({ ...mapping, [key]: e.target.value })}>
          <option value="">Choose column</option>{preview.headers.map(h => <option key={h}>{h}</option>)}
        </select></label>)}</div>
      <p>{preview.entries.length} eligible entries · {preview.errors.length} errors</p>
      {preview.errors.slice(0, 8).map((message, i) => <p className="error" key={i}>{message}</p>)}
      {preview.warnings.map(message => <p className="notice" key={message}>{message}</p>)}
      <div className="table-wrap"><table><thead><tr>{["Ticket ID", "Name", "Branch", "Vehicle", "Mobile"].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{preview.entries.slice(0, 50).map((entry, i) => <tr key={i}>{[entry.entry_id, entry.name, entry.showroom, entry.vehicle, entry.mobile].map((value, j) => <td key={j}>{value || "Not provided"}</td>)}</tr>)}</tbody>
      </table></div><small>Preview shows the first 50 rows. All rows are validated.</small>
    </>}
    {[3, 2, 1].map(rank => <label key={rank}>{rankName(rank)} prize description (optional)
      <input maxLength={200} value={prizes[rank - 1]} onChange={e => setPrizes(prizes.map((p, i) => i === rank - 1 ? e.target.value : p))} />
    </label>)}
    <div className="actions">
      <button disabled={blocked || !preview || !!preview.errors.length} onClick={() => {
        void save(preview!.entries, prizes);
      }}>Save reviewed entries</button>
      <button className="primary" disabled={blocked || !!error || event.entries.length < 3 || JSON.stringify(prizes) !== JSON.stringify(event.prizes) || (!!preview && (!!preview.errors.length || JSON.stringify(preview.entries) !== JSON.stringify(event.entries)))} onClick={() => void lock()}>Lock live event</button>
    </div>
  </section>;
}
