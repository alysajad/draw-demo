"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  ArrowRight,
  Check,
  Download,
  Flower2,
  Settings2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  Event,
  rankName,
  branches,
  drawSchedule,
  nextDraw,
} from "@/lib/model";
import GoldCoinReveal from "./GoldCoinReveal";
import ParticipantImport from "./ParticipantImport";
import { saveWorkbook, winnersWorkbook } from "@/lib/spreadsheet";
const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => <div className="scene-fallback">Preparing the draw box…</div>,
});
import { ceremonyTiming as timing } from "@/lib/draw-animation";
const liveStorage = "nippon-onam-live-event";
const emptyEvent: Event = { id: "", status: "draft", entries: [], results: [], prizes: ["", "", ""], branch_draw: true };
export default function Ceremony() {
  const [event, setEvent] = useState<Event | null>(null),
    [ready, setReady] = useState(false),
    [setup, setSetup] = useState(false),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState(""),
    [sequence, setSequence] = useState(0),
    [revealing, setRevealing] = useState(false),
    [shown, setShown] = useState(false),
    [error, setError] = useState(""),
    [muted, setMuted] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const [coinVisible, setCoinVisible] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [deadline, setDeadline] = useState(0);
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const graphicsFailure = useCallback(() => setGraphicsFailed(true), []);
  const reduced = useReducedMotion();
  const gate = useRef(false);
  const drumClicked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const player = music.current;
    if (!player) return;
    player.volume = 0.35;
    if ((revealing || shown) && !muted) {
      void player.play().catch(() => {});
    } else player.pause();
  }, [revealing, shown, muted]);
  const pending = event?.results.find((r) => !r.acknowledged);
  useEffect(() => {
    setShown(false);
    if (!event) return;
    if (!pending) {
      if (!gate.current) {
        timer.current.forEach(clearTimeout);
        setRevealing(false);
        setDeadline(0);
        const attempt = JSON.parse(sessionStorage.getItem(`draw-attempt-${event.id}`) || "null");
        if (attempt?.resultCount !== event.results.length)
          sessionStorage.removeItem(`reveal-deadline-${event.id}`);
      }
      return;
    }
    if (pending.showroom) setSelectedBranch(pending.showroom);
    const stored = Number(sessionStorage.getItem(`reveal-deadline-${event.id}`));
    const end = stored || Date.now() + timing.reveal;
    sessionStorage.setItem(`reveal-deadline-${event.id}`, String(end));
    setDeadline(end);
    setRevealing(true);
  }, [event?.id, pending?.entry_id]);
  useEffect(() => {
    if (!deadline || !revealing) return;
    const finish = () => {
      if (!pending) { setPhase("Confirming winner…"); return; }
      timer.current.forEach(clearTimeout);
      timer.current = [];
      setRevealing(false);
      setShown(true);
      setPhase("");
    };
    const id = setTimeout(finish, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(id);
  }, [deadline, pending?.entry_id, revealing]);
  const latest = event?.results.at(-1);
  const branchList = event ? branches(event) : [];
  const activeBranch = event?.branch_draw
    ? pending?.showroom || (branchList.includes(selectedBranch) ? selectedBranch : "") || ""
    : "";
  const next = event ? nextDraw(event, activeBranch) : undefined;
  const rank = next?.rank || 1;
  const totalPrizes = event ? drawSchedule(event).length : 0;
  const noDrawsLeft = event ? !nextDraw(event) : true;
  const complete = event?.status === "complete";
  const request = useCallback(
    async (action = "state", data: Record<string, unknown> = {}) => {
      const payload = JSON.stringify({ action, ...data });
      if (new Blob([payload]).size > 4_000_000)
        throw new Error(
          "Import exceeds the hosting limit. Reduce the participant data size and retry.",
        );
      const response = await fetch("/api/event", {
        signal: AbortSignal.timeout(20000),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: payload,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      return body.event as Event | null;
    },
    [],
  );
  useEffect(() => {
    const savedId = sessionStorage.getItem(liveStorage);
    let active = true;
    request("state", savedId ? { id: savedId } : {})
      .then(restored => { if (active) setEvent(restored); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Unable to load event."); })
      .finally(() => { if (active) setReady(true); });
    return () => {
      active = false;
      timer.current.forEach(clearTimeout);
    };
  }, [request]);
  useEffect(() => {
    if (ready && event) sessionStorage.setItem(liveStorage, event.id);
  }, [event?.id, ready]);
  useEffect(() => {
    if (!event) return;
    const refresh = () => {
      if (!gate.current)
        request("state", { id: event.id }).then(e => { if (e) setEvent(e); })
          .catch(e => setError(e.message));
    };
    window.addEventListener("focus", refresh);
    const id = setInterval(refresh, 5000);
    return () => { window.removeEventListener("focus", refresh); clearInterval(id); };
  }, [event?.id, request]);
  async function work(task: () => Promise<void>) {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!immersive) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setImmersive(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", escape);
    };
  }, [immersive]);
  function play(end = Date.now() + timing.reveal) {
    if (!event) return;
    drumClicked.current = false;
    sessionStorage.setItem(`reveal-deadline-${event.id}`, String(end));
    setDeadline(end);
    setCoinVisible(false);
    setImmersive(true);
    setShown(false);
    setRevealing(true);
    setSequence((s) => s + 1);
    setPhase("Good fortune is on its way.");
    timer.current.forEach(clearTimeout);
    timer.current = [];
    if (reduced) return;
    const elapsed = timing.reveal - Math.max(0, end - Date.now());
    timer.current.push(
      setTimeout(() => setPhase("One winner. A golden moment."), Math.max(0, timing.lidOpen - elapsed)),
      setTimeout(() => setCoinVisible(true), Math.max(0, timing.paperRise - elapsed)),
    );
  }
  function revealNow() {
    if (!event || !revealing) return;
    const end = Date.now();
    sessionStorage.setItem(`reveal-deadline-${event.id}`, String(end));
    setDeadline(end);
    if (!pending) setPhase("Confirming winner…");
  }
  function draw() {
    if (!event || !next || pending || revealing || gate.current) return;
    void work(async () => {
      const attemptName = `draw-attempt-${event.id}`;
      const stored = sessionStorage.getItem(attemptName);
      const previous = stored ? JSON.parse(stored) : null;
      const attempt = previous?.resultCount === event.results.length ? previous : {
        resultCount: event.results.length, key: crypto.randomUUID(), rank, branch: activeBranch, deadline: Date.now() + timing.reveal,
      };
      sessionStorage.setItem(attemptName, JSON.stringify(attempt));
      setSelectedBranch(attempt.branch);
      play(attempt.deadline);
      try {
        const updated = (await request("draw", { id: event.id, rank: attempt.rank, branch: attempt.branch, key: attempt.key }))!;
        setEvent(updated);
      } catch (error) {
        timer.current.forEach(clearTimeout);
        setRevealing(false);
        setImmersive(false);
        setSequence(0);
        throw error;
      }
    });
  }
  function acknowledge() {
    if (!event || !pending) return;
    void work(async () => {
      setEvent(await request("ack", { id: event.id, rank: pending.rank, entry_id: pending.entry_id }));
      sessionStorage.removeItem(`draw-attempt-${event.id}`);
      sessionStorage.removeItem(`reveal-deadline-${event.id}`);
      if (!nextDraw(event, activeBranch)) setSelectedBranch("");
      setDeadline(0);
      setShown(false);
      setSequence(0);
      setCoinVisible(false);
      setImmersive(false);
    });
  }
  function download() {
    if (!event || revealing) return;
    void work(async () => {
      const revealed = { ...event, results: event.results.filter(r => r.acknowledged || (shown && r.entry_id === pending?.entry_id)) };
      saveWorkbook(await winnersWorkbook(revealed), "onam-winners.xlsx");
    });
  }
  const winner = pending || (!revealing ? latest : undefined);
  return (
    <MotionConfig reducedMotion="user">
      <main
        className={`${immersive ? "immersive" : ""} ${shown ? "result-shown" : ""} ${graphicsFailed ? "graphics-failed" : ""} ${immersive && (coinVisible || shown) && winner ? "golden-active" : ""}`}
      >
        {immersive && (
          <button
            className="exit-ceremony"
            onClick={() => {
              setImmersive(false);
            }}
            aria-label="Exit immersive ceremony"
          >
            <X size={18} /> Back to event
          </button>
        )}
        <header className="header">
          <a className="brand" href="/" aria-label="Nippon Toyota home">
            <img className="brand-mark" src="/toyota-emblem.svg" alt="" width={48} height={31} />
            <span>
              Nippon Toyota
              <small>HAPPINESS, DRIVEN TOGETHER.</small>
            </span>
          </a>
          <div className="header-right">
            <button
              className="icon-button sound-toggle"
              aria-label={muted ? "Enable sound" : "Mute sound"}
              aria-pressed={!muted}
              title={muted ? "Sound off" : "Sound on"}
              onClick={() => setMuted(value => !value)}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button disabled={revealing || busy || !!pending} onClick={() => setSetup(true)}>Upload Excel sheet</button>
            <button
              className="icon-button"
              aria-label="Open event preparation"
              onClick={() => setSetup(true)}
              disabled={revealing || busy || !!pending}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </header>
        <section className="intro">
          <div className="eyebrow">
            <span /> A SEASON OF TOGETHERNESS <span />
          </div>
          <h1>
            Good fortune.
            <br className="mobile-break" /> Great journeys.
          </h1>
          <p>
            Nippon Toyota <span>·</span> Onam Lucky Draw
          </p>
        </section>
        {!event && <section className="event-empty" aria-live="polite">
          <h2>{!ready ? "Loading event…" : "Ready for a little luck?"}</h2>
          <p>Upload the participant sheet, then select a branch to draw its three winners.</p>
          <button className="primary" disabled={!ready} onClick={() => setSetup(true)}>Prepare event</button>
          {error && <p className="error" role="alert">{error}</p>}
        </section>}
        {event?.branch_draw && <section className="branch-progress" aria-label="Branch progress">
          <div><span className="eyebrow">{complete ? "ALL BRANCHES COMPLETE" : (activeBranch ? `BRANCH ${branchList.indexOf(activeBranch) + 1} OF ${branchList.length}` : `${branchList.length} BRANCHES`)}</span>
            <h2>{complete ? "Every branch. A golden moment." : activeBranch || "Select a branch to begin"}</h2>
            <p>{event.results.filter(r => r.acknowledged).length} of {totalPrizes} winners revealed · 3rd → 2nd → 1st per branch</p></div>
          <label className="branch-select">Select branch
            <select aria-label="Select branch" value={activeBranch} disabled={!!pending || revealing || busy} onChange={e => setSelectedBranch(e.target.value)}>
              <option value="">Select branch</option>
              {branchList.map(branch => <option key={branch} value={branch}>
                {branch} — {event.results.filter(r => r.showroom === branch && r.acknowledged).length}/3
              </option>)}
            </select>
          </label>
        </section>}
        <section className="stage" aria-label="Lucky draw ceremony" hidden={!event}>
          <div className="side-note">
            <Flower2 size={25} />
            <span>
              A little luck.
              <br />A lot to celebrate.
            </span>
          </div>
          <div className={`scene ${sequence > 0 ? "scene-closeup" : ""}`} onClick={e => { if (revealing && e.detail === 1) drumClicked.current = true; }}
            onDoubleClick={() => { if (drumClicked.current) revealNow(); drumClicked.current = false; }}>
            {event && !(immersive && (coinVisible || shown) && winner) && <Scene
              sequence={sequence}
              reduced={!!reduced}
              quality="auto"
              shown={shown}
              winner={winner}
              prize={winner ? event?.prizes[winner.rank - 1] || "" : ""}
              onFailure={graphicsFailure}
            />}
          </div>
          <div className="pool-note">
            <span className="pool-number">{(event?.branch_draw && !complete && activeBranch ? event.entries.filter(e => e.showroom === activeBranch).length : event?.entries.length) || "·"}</span>
            <span>
              ENTRIES
              <br />
              ONE CELEBRATION
            </span>
            <i />
          </div>
          {immersive && (coinVisible || shown) && winner && !complete && (
            <GoldCoinReveal
              key={sequence}
              winner={winner}
              prize={event?.prizes[winner.rank - 1] || ""}
              shown={shown}
              reduced={!!reduced}
            />
          )}
          <AnimatePresence>
            {shown && winner && !complete && (
              <motion.div
                className={`winner-card ${immersive ? "paper-accessibility" : "paper-fallback"}`}
                initial={reduced ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="status"
              >
                <span className="paper-brand">NIPPON TOYOTA</span>
                <span className="eyebrow">
                  CONGRATULATIONS · {rankName(winner.rank)} PRIZE
                </span>
                <h2>{winner.name}</h2>
                <p>
                  {winner.entry_id}
                  {winner.showroom && ` · ${winner.showroom}`}
                </p>
                <p>Car: {winner.vehicle || "Not provided"}</p>
                <p>Mobile no.: {winner.mobile || "Not provided"}</p>
                {event?.prizes[winner.rank - 1] && (
                  <p>{event.prizes[winner.rank - 1]}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {shown && !reduced && !immersive && (
            <div className="celebration" aria-hidden="true">
              {Array.from({ length: 24 }, (_, i) => (
                <motion.i
                  key={`${sequence}-${i}`}
                  initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                  animate={{
                    x: Math.sin(i * 4) * 420,
                    y: 100 + Math.cos(i * 2) * 160,
                    opacity: 0,
                    rotate: i * 40,
                  }}
                  transition={{ duration: 2, delay: i * 0.018 }}
                  style={{ background: i % 2 ? "#e9af32" : "#eb0a1e" }}
                />
              ))}
            </div>
          )}
        </section>
        <section className="draw-controls" aria-live="polite" hidden={!event}>
          {complete ? (
            <>
              <span className="eyebrow">
                {totalPrizes} WINNERS. ONE WONDERFUL CELEBRATION.
              </span>
              <h2>Here's to your next great journey.</h2>
              <div className="actions">
                <button disabled={busy} onClick={download}>
                  <Download size={16} /> Download winners sheet
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="draw-label">
                <i />
                {revealing
                  ? phase
                  : pending
                    ? shown
                      ? "A moment worth celebrating."
                      : "A saved winner is ready to reveal."
                    : event?.branch_draw && !activeBranch ? "Select a branch to draw its three winners." : `${activeBranch ? activeBranch + " · " : ""}${rankName(Math.max(rank, 1))} PRIZE${event?.prizes[rank - 1] ? ` · ${event.prizes[rank - 1]}` : ""}`}
              </div>
              {revealing ? (
                <><p role="status">{phase === "Confirming winner…" ? "Waiting for the saved result." : "Double-click the drum to reveal now."}</p><button className="text-button" onClick={e => { if (e.detail < 2) revealNow(); }}>Reveal now</button></>
              ) : pending ? (
                shown ? (
                  <>
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      className="primary"
                      disabled={busy}
                      onClick={acknowledge}
                    >
                      {noDrawsLeft ? "Celebrate all winners" : !next
                        ? "Choose another branch" : `Continue to ${rankName(next.rank)} prize`}
                      <ArrowRight size={18} />
                    </motion.button>
                    <button
                      className="text-button"
                      disabled={busy || revealing} onClick={() => play()}
                    >
                      Replay reveal
                    </button>
                  </>
                ) : (
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={busy || revealing} onClick={() => play()}
                    >
                      Reveal saved winner <ArrowRight size={18} />
                    </button>

                  </div>
                )
              ) : (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  className="primary"
                  disabled={busy || !ready || event?.status !== "locked" || !next}
                  onClick={draw}
                >
                  {busy
                    ? "Saving the winner…"
                    : next ? `Draw ${rankName(rank)} prize` : activeBranch ? "Branch draw complete" : "Select branch to draw"}
                  <ArrowRight size={18} />
                </motion.button>
              )}

            </>
          )}
        {!complete && !revealing && event?.results.some(r => r.acknowledged || (shown && r.entry_id === pending?.entry_id)) && (
          <div className="winners-download"><button disabled={busy} onClick={download}><Download size={16} /> Download winners sheet</button></div>
        )}
          {error && (
            <p className="error" role="alert">
              {error}{" "}
              {ready && (
                <button
                  onClick={() =>
                    void work(async () => {
                      setEvent(
                        await request("state", {
                          id: event?.id || sessionStorage.getItem(liveStorage),
                        }),
                      );
                      setShown(false);
                    })
                  }
                >
                  Recover event
                </button>
              )}
            </p>
          )}
        </section>
        <section
          className={`prizes ${complete ? "podium" : ""}`}
          hidden={!event}
          aria-label="Prize winners"
        >
          {(complete ? branchList : [activeBranch]).flatMap(branch => (complete ? [2, 1, 3] : [3, 2, 1]).map(r => ({ branch, r }))).map(({ branch, r }) => {
            const result = event?.results.find(w => w.rank === r && (!event.branch_draw || w.showroom === branch));
            const visible = result && (result.acknowledged || shown);
            return (
              <motion.div
                layout={!reduced}
                className={`prize ${rank === r && !pending ? "current" : ""} ${complete && r === 1 ? "first" : ""}`}
                key={`${branch}-${r}`}
              >
                <span className="prize-medal">
                  {r}
                  <small>{r === 1 ? "ST" : r === 2 ? "ND" : "RD"}</small>
                </span>
                <div>
                  <span className="prize-label">{branch && `${branch} · `}{rankName(r)} PRIZE</span>
                  <h3>
                    {visible
                      ? result.name
                      : event?.prizes[r - 1] || "A journey awaits"}
                  </h3>
                  <p>
                    {visible
                      ? result.entry_id
                      : rank === r && !pending
                        ? "Up next"
                        : "Waiting for a little luck"}
                  </p>
                </div>
                {visible ? (
                  <Check size={16} />
                ) : (
                  <span className="prize-dash">·</span>
                )}
              </motion.div>
            );
          })}
        </section>
        <audio ref={music} src="/draw-music.mp3" loop muted={muted} preload="auto" />
        {setup && (
          <div
            className="modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSetup(false);
            }}
          >
            <section
              className="setup"
              role="dialog"
              aria-modal="true"
              aria-label="Event preparation"
              onKeyDown={(e) => {
                if (e.key === "Escape") setSetup(false);
                if (e.key === "Tab") {
                  const nodes = e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),input,select,a[href],iframe",
                  );
                  const first = nodes[0],
                    last = nodes[nodes.length - 1];
                  if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                  } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                  }
                }
              }}
            >
              <div className="setup-heading">
                <div>
                  <span className="eyebrow">BEFORE THE CELEBRATION</span>
                  <h2>Set the stage.</h2>
                </div>
                <button
                  autoFocus
                  className="icon-button"
                  onClick={() => setSetup(false)}
                  aria-label="Close preparation"
                >
                  <X />
                </button>
              </div>
              {(!event || event.status === "draft") && <ParticipantImport
                key={event?.id || "new"} event={event || emptyEvent} busy={busy || !ready}
                save={(entries, descriptions) => work(async () => {
                  const current = event || await request("create");
                  if (!current) throw new Error("Unable to create event.");
                  try {
                    setEvent(await request("import", { id: current.id, entries, prizes: descriptions, branch_draw: true }));
                  } catch (error) {
                    setEvent(current);
                    throw error;
                  }
                })}
                lock={() => work(async () => {
                  if (!event) return;
                  setEvent(await request("lock", { id: event.id })); setSelectedBranch(""); setSetup(false);
                })}
              />}
              {event && event.status !== "draft" && <>
                <p className="notice">Entries are frozen. Create a separate event to upload another sheet.</p>
                <button disabled={busy} onClick={() => void work(async () => {
                  setEvent(await request("create")); setShown(false); setSelectedBranch("");
                })}>Create separate event</button>
              </>}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </section>
          </div>
        )}
      </main>
    </MotionConfig>
  );
}
