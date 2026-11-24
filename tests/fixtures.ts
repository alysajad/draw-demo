import { Event, nextDraw, eligibleEntries } from "../lib/model";
import sampleEntries from "./fixtures/sample-entries.json";
export function testEvent(): Event {
  return {
    id: crypto.randomUUID(),
    status: "locked",
    entries: [
      "Ananya Menon",
      "Arjun Nair",
      "Meera Krishnan",
      "Rahul Varma",
      "Devika Pillai",
      "Vivek Kumar",
      "Aparna Das",
      "Nikhil Raj",
      "സൂര്യ നായർ",
      "Kavya Mohan",
      "Aditya Suresh",
      "Lakshmi Ravi",
    ].map((name, i) => ({
      entry_id: `DEMO-${String(i + 1).padStart(3, "0")}`,
      name,
      showroom: ["Kochi", "Thrissur", "Kozhikode"][i % 3],
    })),
    prizes: ["", "", ""],
    results: [],
  };
}
export function sampleEvent(): Event {
  return { id: crypto.randomUUID(), status: "locked", branch_draw: true, entries: sampleEntries,
    prizes: ["Gold coin · 1st prize", "Gold coin · 2nd prize", "Gold coin · 3rd prize"], results: [] };
}
export function mockDraw(event: Event, selectedBranch?: string): Event {
  const next = nextDraw(event, selectedBranch);
  if (event.status !== "locked" || event.results.some(r => !r.acknowledged) || !next) return event;
  const eligible = eligibleEntries(event, next.branch);
  if (!eligible.length) throw new Error("No eligible entries remain for this branch.");
  const limit = Math.floor(4294967296 / eligible.length) * eligible.length;
  let n: number;
  do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= limit);
  return { ...event, results: [...event.results, {
    ...eligible[n % eligible.length], rank: next.rank, drawn_at: new Date().toISOString(),
    eligible_count: eligible.length, acknowledged: false,
  }] };
}
