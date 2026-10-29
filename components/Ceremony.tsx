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
  ChevronDown,
  Download,
  Expand,
  Flower2,
  Leaf,
  LockKeyhole,
  Settings2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  csvResults,
  Event,
  parseCSV,
  rankName,
  sampleRehearsal,
  branches,
  drawSchedule,
  nextDraw,
  validateBranches,
  rehearsalDraw,
} from "@/lib/model";
import GoldCoinReveal from "./GoldCoinReveal";
const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => <div className="scene-fallback">Preparing the draw box…</div>,
});
import { ceremonyTiming as timing, boxSound } from "@/lib/draw-animation";
const storage = "nippon-onam-branch-rehearsal-v2";
const liveStorage = "nippon-onam-live-event";
let auth: SupabaseClient | undefined;
function client() {
  if (
    !auth &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    auth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  return auth;
}
export default function Ceremony() {
  const [event, setEvent] = useState<Event | null>(null),
    [live, setLive] = useState(false),
    [ready, setReady] = useState(false),
    [setup, setSetup] = useState(false),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState(""),
    [sequence, setSequence] = useState(0),
    [revealing, setRevealing] = useState(false),
    [shown, setShown] = useState(false),
    [error, setError] = useState(""),
    [quality, setQuality] = useState("auto"),
    [muted, setMuted] = useState(true),
    [clean, setClean] = useState(false),
    [signedIn, setSignedIn] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [coinVisible, setCoinVisible] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const graphicsFailure = useCallback(() => setGraphicsFailed(true), []);
  const reduced = useReducedMotion();
  const gate = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audio = useRef<AudioContext | null>(null);
  const stopAudio = useRef<(() => void) | null>(null);
  const music = useRef<HTMLAudioElement | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicError, setMusicError] = useState("");
  useEffect(() => {
    if (!musicFile) { setMusicUrl(""); return; }
    const url = URL.createObjectURL(musicFile);
    setMusicUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [musicFile]);
  useEffect(() => {
    const player = music.current;
    if (!player || !musicUrl) return;
    player.volume = 0.35;
    if (immersive && !muted) {
      void player.play().catch(() => setMusicError("Music could not play. Preview the track in event preparation, then try again."));
    } else player.pause();
  }, [immersive, muted, musicUrl, setup]);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [csv, setCsv] = useState(""),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [prizes, setPrizes] = useState(["", "", ""]);
  const parsedPreview = csv ? parseCSV(csv, mapping) : null;
  const preview = parsedPreview ? { ...parsedPreview, errors: [...parsedPreview.errors, ...validateBranches(parsedPreview.entries)] } : null;
  const pending = event?.results.find((r) => !r.acknowledged);
  useEffect(() => {
    setShown(false);
    if (pending?.showroom) setSelectedBranch(pending.showroom);
  }, [pending?.entry_id]);
  const latest = event?.results.at(-1);
  const branchList = event ? branches(event) : [];
  const activeBranch = event?.branch_draw
    ? pending?.showroom || (branchList.includes(selectedBranch) ? selectedBranch : branchList[0]) || ""
    : "";
  const next = event ? nextDraw(event, activeBranch) : undefined;
  const rank = next?.rank || 1;
  const totalPrizes = event ? drawSchedule(event).length : 0;
  const noDrawsLeft = event ? !nextDraw(event) : true;
  const complete = event?.status === "complete";
  const request = useCallback(
    async (action = "state", data: Record<string, unknown> = {}) => {
      const session = await client()?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("Sign in with an invited organizer account.");
      const payload = JSON.stringify({ action, ...data });
      if (new Blob([payload]).size > 4_000_000)
        throw new Error(
          "Import exceeds the hosting limit. Reduce the CSV size and retry.",
        );
      const response = await fetch("/api/event", {
        signal: AbortSignal.timeout(20000),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
    try {
      const saved = sessionStorage.getItem(storage);
      setEvent(saved ? JSON.parse(saved) : sampleRehearsal());
    } catch {
      setEvent(sampleRehearsal());
    }
    const savedLiveId = sessionStorage.getItem(liveStorage);
    setReady(!savedLiveId);
    if (savedLiveId) {
      setLive(true);
      setEvent(null);
    }
    const c = client();
    if (!c && savedLiveId) {
      setError(
        "Live service is not configured. Restore the connection to recover this event.",
      );
      setSetup(true);
    }
    c?.auth.getSession().then(async ({ data }) => {
      setSignedIn(!!data.session);
      const savedId = savedLiveId;
      if (savedId) {
        setLive(true);
        setEvent(null);
        setReady(false);
        try {
          const recovered = await request("state", { id: savedId });
          setEvent(recovered);
          if (recovered) setPrizes(recovered.prizes);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to recover event");
          setSetup(true);
        } finally {
          setReady(true);
        }
      }
    });
    const subscription = c?.auth.onAuthStateChange((_event, session) =>
      setSignedIn(!!session),
    ).data.subscription;
    return () => {
      subscription?.unsubscribe();
      timer.current.forEach(clearTimeout);
      stopAudio.current?.();
    };
  }, []);
  useEffect(() => {
    if (ready && !live && event) {
      sessionStorage.setItem(storage, JSON.stringify(event));
    }
    if (ready && live && event) sessionStorage.setItem(liveStorage, event.id);
  }, [event, live, ready]);
  useEffect(() => {
    if (!live) return;
    const refresh = () => {
      if (!gate.current)
        request("state", {
          id: event?.id || sessionStorage.getItem(liveStorage),
        })
          .then((e) => {
            if (e) setEvent(e);
          })
          .catch((e) => setError(e.message));
    };
    window.addEventListener("focus", refresh);
    const id = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(id);
    };
  }, [live, event?.id, request]);
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
        stopReveal();
        setImmersive(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", escape);
    };
  }, [immersive]);
  function stopReveal() {
    setImmersive(true);
    stopAudio.current?.();
    timer.current.forEach(clearTimeout);
    timer.current = [];
    setRevealing(false);
    setShown(true);
    setPhase("");
  }
  function play(resultRank: number) {
    setCoinVisible(false);
    setImmersive(true);
    setShown(false);
    setRevealing(true);
    setSequence((s) => s + 1);
    setPhase("A little anticipation…");
    timer.current.forEach(clearTimeout);
    stopAudio.current?.();
    const duration =
      timing.reveal + (resultRank === 1 ? timing.firstPrizePause : 0);
    if (!muted && !musicUrl && audio.current && !reduced)
      stopAudio.current = boxSound(audio.current, duration / 1000);
    if (reduced) {
      timer.current.push(setTimeout(stopReveal, 400));
      return;
    }
    timer.current.push(
      setTimeout(
        () => setPhase("Good fortune is on its way."),
        timing.spinStart,
      ),
      setTimeout(
        () => setPhase("One winner. A golden moment."),
        timing.lidOpen,
      ),
      setTimeout(() => setCoinVisible(true), timing.paperRise),
      setTimeout(stopReveal, duration),
    );
  }
  function draw() {
    if (!event) return;
    void work(async () => {
      let updated: Event;
      if (live) {
        const keyName = `draw-key-${event.id}-${event.results.length}-${rank}`;
        const key = sessionStorage.getItem(keyName) || crypto.randomUUID();
        sessionStorage.setItem(keyName, key);
        updated = (await request("draw", { id: event.id, rank, branch: activeBranch, key }))!;
      } else updated = rehearsalDraw(event, activeBranch);
      setEvent(updated);
      const winner = updated.results.find((r) => !r.acknowledged);
      if (winner) play(winner.rank);
    });
  }
  function acknowledge() {
    if (!event || !pending) return;
    void work(async () => {
      if (live)
        setEvent(await request("ack", { id: event.id, rank: pending.rank, entry_id: pending.entry_id }));
      else
        setEvent({
          ...event,
          status: nextDraw(event) ? "locked" : "complete",
          results: event.results.map((r) => ({ ...r, acknowledged: true })),
        });
      setShown(false);
      setSequence(0);
      setCoinVisible(false);
      setImmersive(false);
    });
  }
  function download() {
    if (!event) return;
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csvResults(event)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${live ? "onam" : "rehearsal"}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError(
        "Fullscreen is unavailable in this browser. Use the browser presentation controls.",
      );
    }
  }
  const winner = pending || latest;
  return (
    <MotionConfig reducedMotion="user">
      <main
        className={`${clean ? "clean" : ""} ${immersive ? "immersive" : ""} ${shown ? "result-shown" : ""} ${graphicsFailed ? "graphics-failed" : ""} ${immersive && (coinVisible || shown) ? "golden-active" : ""}`}
      >
        {immersive && (
          <button
            className="exit-ceremony"
            onClick={() => {
              stopReveal();
              setImmersive(false);
            }}
            aria-label="Exit immersive ceremony"
          >
            <X size={18} /> Back to event
          </button>
        )}
        <header className="header">
          <a className="brand" href="/" aria-label="Nippon Toyota home">
            <span className="brand-mark">N</span>
            <span>
              NIPPON <b>TOYOTA</b>
              <small>HAPPINESS, DRIVEN TOGETHER.</small>
            </span>
          </a>
          <div className="header-right">
            <span className={`mode ${live ? "live" : ""}`}>
              <i />
              {live ? "Private event" : "Rehearsal"}
            </span>
            <button
              className="icon-button"
              aria-label="Open event preparation"
              onClick={() => setSetup(true)}
              disabled={revealing}
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
        {event?.branch_draw && <section className="branch-progress" aria-label="Branch progress">
          <div><span className="eyebrow">{complete ? "ALL BRANCHES COMPLETE" : `BRANCH ${branchList.indexOf(activeBranch) + 1} OF ${branchList.length}`}</span>
            <h2>{complete ? "Every branch. A golden moment." : activeBranch}</h2>
            <p>{event.results.filter(r => r.acknowledged).length} of {totalPrizes} winners revealed · 3rd → 2nd → 1st per branch</p></div>
          <div className="branch-list">{branchList.map(branch => <button
            type="button"
            key={branch}
            aria-pressed={branch === activeBranch}
            disabled={!!pending || revealing || busy}
            onClick={() => setSelectedBranch(branch)}
          >
            {branch}<small>{event.results.filter(r => r.showroom === branch && r.acknowledged).length}/3</small>
          </button>)}</div>
        </section>}
        <section className="stage" aria-label="Lucky draw ceremony">
          <div className="side-note">
            <Flower2 size={25} />
            <span>
              A little luck.
              <br />A lot to celebrate.
            </span>
          </div>
          <div className={`scene ${sequence > 0 ? "scene-closeup" : ""}`}>
            {!(immersive && (coinVisible || shown)) && <Scene
              sequence={sequence}
              reduced={!!reduced}
              quality={quality}
              shown={shown}
              winner={winner}
              prize={winner ? event?.prizes[winner.rank - 1] || "" : ""}
              onFailure={graphicsFailure}
            />}
          </div>
          <div className="pool-note">
            <span className="pool-number">{(event?.branch_draw && !complete ? event.entries.filter(e => e.showroom === activeBranch).length : event?.entries.length) || "·"}</span>
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
                initial={{ opacity: 0, y: reduced ? 0 : 18 }}
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
        <section className="draw-controls" aria-live="polite">
          {complete ? (
            <>
              <span className="eyebrow">
                {totalPrizes} WINNERS. ONE WONDERFUL CELEBRATION.
              </span>
              <h2>Here's to your next great journey.</h2>
              <div className="actions">
                <button onClick={download}>
                  <Download size={16} /> Download results
                </button>
                <button onClick={() => setClean(!clean)}>
                  {clean ? "Exit screenshot view" : "Screenshot view"}
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
                    : `${activeBranch ? activeBranch + " · " : ""}${rankName(Math.max(rank, 1))} PRIZE${event?.prizes[rank - 1] ? ` · ${event.prizes[rank - 1]}` : ""}`}
              </div>
              {revealing ? (
                <button
                  className="primary"
                  onClick={() => {
                    stopReveal();
                  }}
                >
                  Show saved result <ArrowRight size={18} />
                </button>
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
                      onClick={() => play(pending.rank)}
                    >
                      Replay reveal
                    </button>
                  </>
                ) : (
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() => play(pending.rank)}
                    >
                      Reveal saved winner <ArrowRight size={18} />
                    </button>
                    <button
                      onClick={() => {
                        stopReveal();
                      }}
                    >
                      Show saved result
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
                    : next ? `Draw ${rankName(rank)} prize` : "Branch draw complete"}
                  <ArrowRight size={18} />
                </motion.button>
              )}
              <p className="control-hint">
                {live
                  ? "Every entry. An equal chance."
                  : "samp.xlsx · Dummy rehearsal · No live winners"}
              </p>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}{" "}
              {live && (
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
        <footer>
          <span>
            <Leaf size={14} /> Together, this Onam.
          </span>
          <div>
            <button
              onClick={() => {
                if (muted) {
                  audio.current ??= new AudioContext();
                  void audio.current.resume();
                } else {
                  void audio.current?.suspend();
                }
                setMuted(!muted);
              }}
              aria-label={muted ? "Enable sound" : "Mute sound"}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              <span>Sound {muted ? "off" : "on"}</span>
            </button>
            <label className="quality">
              <select
                aria-label="Presentation quality"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                <option value="auto">Auto quality</option>
                <option value="low">Low quality</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <button onClick={fullscreen}>
              <Expand size={15} />
              <span>Fullscreen</span>
            </button>
          </div>
        </footer>
        <audio
          ref={music}
          src={musicUrl || undefined}
          loop
          muted={muted}
          preload="auto"
          onError={() => setMusicError("This track could not be loaded. Choose a supported MP3 or WAV file.")}
        />
        {clean && (
          <button className="exit-clean" onClick={() => setClean(false)}>
            Exit screenshot view
          </button>
        )}
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
              <div className="rehearsal-panel">
                <div>
                  <h3>A little practice. A perfect moment.</h3>
                  <p>Use samp.xlsx: 43 dummy entries, four branches, three prizes per branch.</p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      sessionStorage.removeItem(liveStorage);
                      setLive(false);
                      setEvent(sampleRehearsal());
                      setShown(false);
                      setError("");
                      setSetup(false);
                    }}
                  >
                    Restart sample rehearsal <ArrowRight size={15} />
                  </button>
                </div>
                <div className="ticket-preview">
                  <iframe
                    src="/hairline-tickets.html"
                    title="Interactive ticket tray"
                    loading="lazy"
                  />
                </div>
              </div>
              <h3 className="section-title">Draw music</h3>
              <label>
                Kerala lottery music file
                <input type="file" accept="audio/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setMusicError("");
                  setMusicFile(file);
                  setMuted(false);
                }} />
              </label>
              <p className="notice">Choose the recording to loop during the draw and winner reveal. Select it again after refreshing this page.</p>
              {musicFile && <>
                <p>{musicFile.name}</p>
                <div className="actions">
                  <button onClick={() => {
                    setMuted(false);
                    if (music.current) {
                      music.current.muted = false;
                      music.current.volume = 0.35;
                      void music.current.play().catch(() => setMusicError("Unable to play this track. Choose another audio file."));
                    }
                  }}>Preview music</button>
                  <button onClick={() => music.current?.pause()}>Stop preview</button>
                  <button onClick={() => { music.current?.pause(); setMusicFile(null); setMusicError(""); }}>Remove music</button>
                </div>
              </>}
              {musicError && <p className="error" role="alert">{musicError}</p>}
              <h3 className="section-title">
                <LockKeyhole size={17} /> Live event preparation
              </h3>
              {!client() ? (
                <p className="notice">
                  Live draws need a dedicated Supabase connection. Rehearsal is
                  ready to use. See the project README for setup.
                </p>
              ) : !signedIn ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void work(async () => {
                      const result = await client()!.auth.signInWithPassword({
                        email,
                        password,
                      });
                      if (result.error) throw result.error;
                      setPassword("");
                      const saved = await request();
                      setLive(true);
                      setEvent(saved);
                      if (saved) setPrizes(saved.prizes);
                    });
                  }}
                >
                  <p>Sign in with your invited organizer account.</p>
                  <label>
                    Email
                    <input
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Sign in
                  </button>
                </form>
              ) : (
                <>
                  <details>
                    <summary>Set organizer password</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void work(async () => {
                          const result = await client()!.auth.updateUser({
                            password,
                          });
                          if (result.error) throw result.error;
                          setPassword("");
                          setError("Password updated.");
                        });
                      }}
                    >
                      <label>
                        New password
                        <input
                          type="password"
                          autoComplete="new-password"
                          minLength={12}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </label>
                      <button disabled={busy}>Save password</button>
                    </form>
                  </details>
                  <div className="actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void work(async () => {
                          const saved = await request();
                          setLive(true);
                          setEvent(saved);
                          if (saved) setPrizes(saved.prizes);
                        })
                      }
                    >
                      Load live event
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void work(async () => {
                          setEvent(await request("create"));
                          setLive(true);
                          setPrizes(["", "", ""]);
                          setCsv("");
                          setShown(false);
                        })
                      }
                    >
                      Create separate event
                    </button>
                    <button
                      onClick={() =>
                        void work(async () => {
                          await client()!.auth.signOut();
                          sessionStorage.removeItem(liveStorage);
                          setLive(false);
                          setEvent(sampleRehearsal());
                          setShown(false);
                        })
                      }
                    >
                      Sign out
                    </button>
                  </div>
                  {live && event && (
                    <>
                      <p className="notice">
                        {event.status === "draft"
                          ? "Draft · upload, review, then lock."
                          : `Event ${event.status}. Entries and prizes are frozen.`}
                      </p>
                      {event.status === "draft" ? (
                        <>
                          <label>
                            Participant CSV
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 8_000_000) {
                                    setError("CSV must be smaller than 8 MB.");
                                    return;
                                  }
                                  setCsv(await file.text());
                                  setMapping({});
                                }
                              }}
                            />
                          </label>
                          <a href="/participants-example.csv" download>
                            Download CSV template
                          </a>
                          {preview && (
                            <>
                              <div className="mapping">
                                {[
                                  "entry_id",
                                  "name",
                                  "showroom",
                                  "vehicle",
                                  "mobile",
                                ].map((k) => (
                                  <label key={k}>
                                    {k}
                                    <select
                                      value={
                                        mapping[k] ||
                                        (preview.headers.includes(k) ? k : "")
                                      }
                                      onChange={(e) =>
                                        setMapping({
                                          ...mapping,
                                          [k]: e.target.value,
                                        })
                                      }
                                    >
                                      <option value="">Choose column</option>
                                      {preview.headers.map((h) => (
                                        <option key={h}>{h}</option>
                                      ))}
                                    </select>
                                  </label>
                                ))}
                              </div>
                              <p>
                                {preview.entries.length} entries ·{" "}
                                {preview.errors.length} errors
                              </p>
                              {preview.errors.slice(0, 8).map((e, i) => (
                                <p className="error" key={i}>
                                  {e}
                                </p>
                              ))}
                              {preview.warnings.map((w) => (
                                <p className="notice" key={w}>
                                  {w}
                                </p>
                              ))}
                              <div className="table-wrap">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Entry ID</th>
                                      <th>Name</th>
                                      <th>Showroom</th>
                                      <th>Car</th>
                                      <th>Mobile no.</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {preview.entries
                                      .slice(0, 50)
                                      .map((entry, i) => (
                                        <tr key={i}>
                                          <td>{entry.entry_id}</td>
                                          <td>{entry.name}</td>
                                          <td>{entry.showroom}</td>
                                          <td>{entry.vehicle || "Not provided"}</td>
                                          <td>{entry.mobile || "Not provided"}</td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                              <small>
                                Preview shows the first 50 rows. All rows are
                                validated.
                              </small>
                            </>
                          )}
                          {[3, 2, 1].map((r) => (
                            <label key={r}>
                              {rankName(r)} prize description (optional)
                              <input
                                maxLength={200}
                                value={prizes[r - 1]}
                                onChange={(e) =>
                                  setPrizes(
                                    prizes.map((p, i) =>
                                      i === r - 1 ? e.target.value : p,
                                    ),
                                  )
                                }
                              />
                            </label>
                          ))}
                          <div className="actions">
                            <button
                              disabled={
                                busy || !preview || !!preview.errors.length
                              }
                              onClick={() =>
                                void work(async () =>
                                  setEvent(
                                    await request("import", {
                                      id: event.id,
                                      entries: preview!.entries,
                                      prizes,
                                      branch_draw: true,
                                    }),
                                  ),
                                )
                              }
                            >
                              Save reviewed entries
                            </button>
                            <button
                              className="primary"
                              disabled={
                                busy ||
                                event.entries.length < 3 ||
                                JSON.stringify(prizes) !==
                                  JSON.stringify(event.prizes) ||
                                (!!preview &&
                                  JSON.stringify(preview.entries) !==
                                    JSON.stringify(event.entries))
                              }
                              onClick={() =>
                                void work(async () => {
                                  setEvent(
                                    await request("lock", { id: event.id }),
                                  );
                                  setSetup(false);
                                })
                              }
                            >
                              Lock live event <LockKeyhole size={15} />
                            </button>
                          </div>
                          <p>
                            Locking freezes {event.entries.length} saved entries
                            and prize descriptions. Winners cannot be redrawn.
                          </p>
                        </>
                      ) : (
                        <>
                          <p>
                            {event.entries.length} frozen entries ·{" "}
                            {event.results.length}/{drawSchedule(event).length} winners committed
                          </p>
                          <button
                            className="primary"
                            onClick={() => {
                              setShown(false);
                              setSetup(false);
                            }}
                          >
                            Open ceremony <ArrowRight size={16} />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
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
