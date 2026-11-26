"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
  LoaderCircle,
  Settings2,
  RotateCcw,
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
  NIPPON_BRANCHES,
  normalizeBranch,
} from "@/lib/model";
import GoldCoinReveal from "./GoldCoinReveal";
import ParticipantImport from "./ParticipantImport";
import { saveWorkbook, winnersWorkbook } from "@/lib/spreadsheet";
const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => <div className="scene-fallback">Preparing the draw box…</div>,
});
import { ceremonyTiming as timing, drawAudio } from "@/lib/draw-animation";
const liveStorage = "nippon-onam-live-event";
export default function Ceremony({ audioAvailable = false }: { audioAvailable?: boolean }) {
  const [event, setEvent] = useState<Event | null>(null),
    [ready, setReady] = useState(false),
    [setup, setSetup] = useState(false),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState(""),
    [sequence, setSequence] = useState(0),
    [revealing, setRevealing] = useState(false),
    [shown, setShown] = useState(false),
    [error, setError] = useState(""),
    [muted, setMuted] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [coinVisible, setCoinVisible] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [deadline, setDeadline] = useState(0);
  const [revealDuration, setRevealDuration] = useState(timing.reveal);
  const [audioReady, setAudioReady] = useState(!audioAvailable);
  const [audioFailed, setAudioFailed] = useState(false);
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number | null; label: string } | null>(null);
  const graphicsFailure = useCallback(() => setGraphicsFailed(true), []);
  const reduced = useReducedMotion();
  const gate = useRef(false);
  const stateRevision = useRef(0);
  const refreshInFlight = useRef(false);
  const updates = useRef<BroadcastChannel | null>(null);
  const drumClicked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>[]>([]);
  const music = useRef<HTMLAudioElement | null>(null);
  const audioRunning = useRef(false);
  const playbackRequest = useRef(0);
  const mediaTime = useCallback(() => audioRunning.current && music.current ? music.current.currentTime / drawAudio.playbackRate * 1000 : null, []);
  useEffect(() => {
    if (music.current) music.current.muted = muted;
  }, [muted]);
  useEffect(() => {
    const player = music.current;
    if (!player) return;
    const failed = () => { setAudioFailed(true); setAudioReady(true); setRevealDuration(timing.reveal); };
    const loaded = () => {
      if (!Number.isFinite(player.duration) || player.duration <= 0) { failed(); return; }
      setRevealDuration(Math.round(Math.min(player.duration, drawAudio.revealAt) / drawAudio.playbackRate * 1000));
      setAudioReady(true);
    };
    player.addEventListener("loadedmetadata", loaded);
    player.addEventListener("error", failed);
    if (player.error) failed();
    else if (player.readyState >= 1) loaded();
    return () => {
      player.removeEventListener("loadedmetadata", loaded);
      player.removeEventListener("error", failed);
    };
  }, [audioAvailable]);
  const startAudio = useCallback((end: number) => {
    const player = music.current;
    const remaining = end - Date.now();
    if (!player || !audioReady || audioFailed || remaining <= 0) return;
    player.volume = 0.65;
    player.playbackRate = drawAudio.playbackRate;
    player.preservesPitch = true;
    const offset = Math.max(0, Math.min(player.duration, drawAudio.revealAt) - remaining / 1000 * drawAudio.playbackRate);
    if (Math.abs(player.currentTime - offset) > .05) player.currentTime = offset;
    audioRunning.current = true;
    const request = ++playbackRequest.current;
    void player.play().catch(() => {
      if (request !== playbackRequest.current) return;
      audioRunning.current = false;
      if (Date.now() >= end) setDeadline(Date.now());
    });
  }, [audioReady, audioFailed]);
  useEffect(() => {
    if (!revealing) {
      if (!shown) { playbackRequest.current++; audioRunning.current = false; music.current?.pause(); }
      return;
    }
    if (!audioRunning.current) startAudio(deadline);
  }, [revealing, shown, sequence, deadline, startAudio]);
  useEffect(() => () => { playbackRequest.current++; audioRunning.current = false; music.current?.pause(); }, []);
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
      if (event.status === "draft") {
        timer.current.forEach(clearTimeout);
        sessionStorage.removeItem(`draw-attempt-${event.id}`);
        sessionStorage.removeItem(`reveal-deadline-${event.id}`);
        setRevealing(false);
        setDeadline(0);
        setSequence(0);
        setCoinVisible(false);
        setImmersive(false);
        setSelectedBranch("");
        setPhase("");
      }
      return;
    }
    if (pending.showroom) setSelectedBranch(pending.showroom);
    const stored = Number(sessionStorage.getItem(`reveal-deadline-${event.id}`));
    const end = stored || Date.now() + timing.reveal;
    sessionStorage.setItem(`reveal-deadline-${event.id}`, String(end));
    setDeadline(end);
    setRevealing(true);
  }, [event?.id, event?.status, pending?.entry_id]);
  useEffect(() => {
    if (!deadline || !revealing) return;
    const finish = () => {
      if (audioRunning.current && music.current && !music.current.ended && !music.current.error && music.current.currentTime < Math.min(music.current.duration, drawAudio.revealAt)) return;
      if (!pending) { setPhase("Confirming winner…"); return; }
      timer.current.forEach(clearTimeout);
      timer.current = [];
      setRevealing(false);
      setShown(true);
      setPhase("");
    };
    const id = setTimeout(finish, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(id);
  }, [deadline, pending?.entry_id, revealing, audioFailed]);
  const latest = event?.results.at(-1);
  const branchList = event ? branches(event) : [];
  const branchOptions = event?.branch_draw ? [
    ...NIPPON_BRANCHES.map(branch => branchList.find(name => normalizeBranch(name) === branch) || branch),
    ...branchList.filter(branch => !NIPPON_BRANCHES.includes(normalizeBranch(branch))),
  ] : branchList;
  const activeBranch = event?.branch_draw
    ? pending?.showroom || (branchList.includes(selectedBranch) ? selectedBranch : "") || ""
    : "";
  const next = event ? nextDraw(event, activeBranch) : undefined;
  const rank = next?.rank || 1;
  const totalPrizes = event?.branch_draw ? branchOptions.length * 3 : event ? drawSchedule(event).length : 0;
  const noDrawsLeft = event ? !nextDraw(event) : true;
  const complete = event?.status === "complete";
  const branchProgress = branchOptions.map(branch => ({
    branch,
    available: branchList.includes(branch),
    drawn: event!.results.filter(r => r.acknowledged && (!event!.branch_draw || r.showroom === branch)).length,
  }));
  const branchComplete = !!activeBranch && branchProgress.some(item => item.branch === activeBranch && item.drawn === 3);
  const viewingCompletedBranch = branchComplete && !pending && !revealing;
  const showAllWinners = complete && !activeBranch;
  const revealedResults = event?.results.filter(r => r.acknowledged || (shown && r.entry_id === pending?.entry_id)) || [];
  const exportBranches = [...new Set(revealedResults.map(r => r.showroom || ""))]
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  const request = useCallback(
    async (action = "state", data: Record<string, unknown> = {}, onProgress?: (percent: number | null) => void) => {
      const payload = JSON.stringify({ action, ...data });
      if (new Blob([payload]).size > 4_000_000)
        throw new Error(
          "Import exceeds the hosting limit. Reduce the participant data size and retry.",
        );
      const response = onProgress ? await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/event");
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.timeout = 20000;
        xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
        xhr.upload.onload = () => onProgress(null);
        xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status }));
        xhr.onerror = () => reject(new Error("Upload failed. Please retry."));
        xhr.ontimeout = () => reject(new Error("Upload timed out. Please retry; saved entries will not be duplicated."));
        xhr.send(payload);
      }) : await fetch("/api/event", {
        signal: AbortSignal.timeout(20000),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: payload,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (action !== "state" && body.event) updates.current?.postMessage(body.event.id);
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
  const refresh = useCallback(async () => {
    if (!event?.id || gate.current || revealing || refreshInFlight.current || document.hidden) return;
    refreshInFlight.current = true;
    const revision = stateRevision.current;
    try {
      const updated = await request("state", { id: event.id });
      if (updated && !gate.current && revision === stateRevision.current)
        setEvent(current => JSON.stringify(current) === JSON.stringify(updated) ? current : updated);
    } catch (e) {
      if (revision === stateRevision.current) setError(e instanceof Error ? e.message : "Unable to refresh event.");
    } finally { refreshInFlight.current = false; }
  }, [event?.id, revealing, request]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("nippon-draw-updates") : null;
    updates.current = channel;
    if (channel) channel.onmessage = message => { if (message.data === event?.id) void refresh(); };
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      channel?.close();
      updates.current = null;
    };
  }, [event?.id, refresh]);
  async function work(task: () => Promise<void>) {
    if (gate.current) return;
    gate.current = true;
    stateRevision.current++;
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
  function play(end = Date.now() + revealDuration) {
    if (!event) return;
    startAudio(end);
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
    if (reduced || audioRunning.current) return;
    const elapsed = revealDuration - Math.max(0, end - Date.now());
    const scale = revealDuration / timing.reveal;
    timer.current.push(
      setTimeout(() => setPhase("One winner. A golden moment."), Math.max(0, timing.lidOpen * scale - elapsed)),
      setTimeout(() => setCoinVisible(true), Math.max(0, timing.paperRise * scale - elapsed)),
    );
  }
  function revealNow() {
    if (!event || !revealing) return;
    const player = music.current;
    if (player && audioReady && !audioFailed && !player.ended) {
      timer.current.forEach(clearTimeout);
      const revealAt = Math.min(player.duration, drawAudio.revealAt);
      const cue = Math.max(player.currentTime, revealAt - drawAudio.leadIn * drawAudio.playbackRate);
      player.currentTime = cue;
      const end = Date.now() + (revealAt - cue) / drawAudio.playbackRate * 1000;
      sessionStorage.setItem(`reveal-deadline-${event.id}`, String(end));
      setDeadline(end);
      setCoinVisible(true);
      setPhase("One winner. A golden moment.");
      startAudio(end);
      return;
    }
    finishReveal();
  }
  function finishReveal() {
    if (!event || !revealing) return;
    const end = Date.now();
    sessionStorage.setItem(`reveal-deadline-${event.id}`, String(end));
    setDeadline(end);
    if (!pending) setPhase("Confirming winner…");
    else {
      timer.current.forEach(clearTimeout);
      setRevealing(false);
      setShown(true);
      setPhase("");
    }
  }
  function syncAudio() {
    const player = music.current;
    if (!revealing || !audioRunning.current || !player || player.error) return;
    const remaining = (Math.min(player.duration, drawAudio.revealAt) - player.currentTime) / drawAudio.playbackRate;
    if (remaining <= 0) flushSync(finishReveal);
    else if (!coinVisible && remaining <= drawAudio.leadIn) {
      flushSync(() => {
        setCoinVisible(true);
        setPhase("One winner. A golden moment.");
      });
    }
  }
  function draw() {
    if (!event || !next || pending || revealing || gate.current) return;
    void work(async () => {
      const attemptName = `draw-attempt-${event.id}`;
      const stored = sessionStorage.getItem(attemptName);
      const previous = stored ? JSON.parse(stored) : null;
      const attempt = previous?.resultCount === event.results.length ? previous : {
        resultCount: event.results.length, key: crypto.randomUUID(), rank, branch: activeBranch, deadline: Date.now() + revealDuration,
      };
      sessionStorage.setItem(attemptName, JSON.stringify(attempt));
      setSelectedBranch(attempt.branch);
      setPhase("Preparing draw…");
      setImmersive(true);
      try {
        const updated = (await request("draw", { id: event.id, rank: attempt.rank, branch: attempt.branch, key: attempt.key }))!;
        play();
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
  function download(branch?: string) {
    if (!event || revealing) return;
    void work(async () => {
      const revealed = { ...event, results: revealedResults };
      saveWorkbook(await winnersWorkbook(revealed, branch), branch === undefined ? "onam-winners.xlsx" : `onam-winners-${branch.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "branch"}.xlsx`);
    });
  }
  function reset() {
    if (!event || busy || revealing || !window.confirm("Reset this event? This permanently deletes all uploaded participants and selected winners across every branch. You will need to upload a new sheet.")) return;
    void work(async () => {
      setEvent(await request("reset", { id: event.id, confirmed: true, snapshot_hash: event.snapshot_hash }));
      setShown(false);
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
            <img className="brand-mark" src="/toyota-emblem.svg" alt="" width={56} height={56} />
            <span>
              Nippon Toyota
              <small>HAPPINESS, DRIVEN TOGETHER.</small>
            </span>
          </a>
          <div className="header-right">
            <button
              className="icon-button sound-toggle"
              aria-label={!audioAvailable || audioFailed ? "Sound unavailable" : muted ? "Enable sound" : "Mute sound"}
              aria-pressed={audioAvailable && !audioFailed && !muted}
              title={!audioAvailable || audioFailed ? "Draw music is unavailable" : muted ? "Sound off" : "Sound on"}
              disabled={!audioAvailable || audioFailed}
              onClick={() => {
                if (music.current) music.current.muted = !muted;
                setMuted(!muted);
              }}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button
              className="icon-button"
              aria-label="Open settings"
              title="Settings"
              onClick={() => setSetup(true)}
              disabled={revealing || busy}
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
          <div><span className="eyebrow">{complete ? (branchList.length === branchOptions.length ? "ALL BRANCHES COMPLETE" : "UPLOADED BRANCHES COMPLETE") : (activeBranch ? `BRANCH ${branchOptions.indexOf(activeBranch) + 1} OF ${branchOptions.length}` : `${branchOptions.length} BRANCHES`)}</span>
            <h2>{activeBranch ? normalizeBranch(activeBranch) : (complete ? "Uploaded branch draws complete." : "Select a branch to begin")}</h2>
            <p>{branchProgress.filter(item => item.drawn === 3).length} of {branchOptions.length} branches drawn · {event.results.filter(r => r.acknowledged).length} of {totalPrizes} winners revealed</p></div>
          <label className="branch-select">Select branch
            <select aria-label="Select branch" value={activeBranch} disabled={!!pending || revealing || busy} onChange={e => { setSelectedBranch(e.target.value); void refresh(); }}>
              <option value="">{complete ? "All branches" : "Select branch"}</option>
              {branchProgress.map(({ branch, drawn, available }) => <option key={branch} value={branch} disabled={!available}>
                {normalizeBranch(branch)} — {!available ? "No participants" : drawn === 3 ? "Already drawn · 3/3" : drawn ? `${drawn}/3 drawn` : "Not drawn · 0/3"}
              </option>)}
            </select>
          </label>
        </section>}
        <section className="stage" aria-label="Lucky draw ceremony" hidden={viewingCompletedBranch}>
          <div className="side-note">
            <Flower2 size={25} />
            <span>
              A little luck.
              <br />A lot to celebrate.
            </span>
          </div>
          <div className="scene" hidden={!!(immersive && (coinVisible || shown) && winner)} onClick={e => { if (revealing && e.detail === 1) drumClicked.current = true; }}
            onDoubleClick={() => { if (drumClicked.current) revealNow(); drumClicked.current = false; }}>
            {!viewingCompletedBranch && <Scene
              active={!(immersive && (coinVisible || shown) && winner)}
              sequence={sequence}
              duration={revealDuration}
              mediaTime={mediaTime}
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
        <section className="draw-controls" aria-live="polite">
          {viewingCompletedBranch ? (
            <>
              <h2>Already drawn</h2>
              <p>All three winners for {activeBranch} are shown below.</p>
            </>
          ) : complete ? (
            <>
              <span className="eyebrow">
                {event?.results.length} WINNERS. ONE WONDERFUL CELEBRATION.
              </span>
              <h2>Here's to your next great journey.</h2>
            </>
          ) : (
            <>
              <div className="draw-label">
                <i />
                {!ready ? "Loading event…"
                  : !event || event.status === "draft" ? "Upload a participant sheet in Settings to begin."
                  : busy && !pending && !revealing ? "Preparing draw…"
                  : revealing
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
                      {busy ? "Preparing next prize…" : noDrawsLeft ? "Celebrate all winners" : !next
                        ? "Choose another branch" : `Continue to ${rankName(next.rank)} prize`}
                      {busy ? <LoaderCircle className="loading-indicator" size={18} aria-hidden="true" /> : <ArrowRight size={18} />}
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
                  disabled={busy || !ready || !audioReady || event?.status !== "locked" || !next}
                  onClick={draw}
                >
                  {!event || event.status === "draft" ? "Draw 3rd prize"
                    : busy
                    ? "Saving the winner…"
                    : next ? `Draw ${rankName(rank)} prize` : activeBranch ? "Branch draw complete" : "Select branch to draw"}
                  {busy ? <LoaderCircle className="loading-indicator" size={18} aria-hidden="true" /> : <ArrowRight size={18} />}
                </motion.button>
              )}

            </>
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
          className={`prizes ${showAllWinners ? "podium" : ""} ${viewingCompletedBranch ? "branch-results" : ""}`}
          hidden={!event}
          aria-label="Prize winners"
        >
          {(showAllWinners ? branchList : [activeBranch]).flatMap(branch => (showAllWinners ? [2, 1, 3] : viewingCompletedBranch ? [1, 2, 3] : [3, 2, 1]).map(r => ({ branch, r }))).map(({ branch, r }) => {
            const result = event?.results.find(w => w.rank === r && (!event.branch_draw || w.showroom === branch));
            const visible = result && (result.acknowledged || shown);
            return (
              <motion.div
                layout={!reduced}
                className={`prize ${next && rank === r && !pending ? "current" : ""} ${showAllWinners && r === 1 ? "first" : ""}`}
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
        {audioAvailable && <audio ref={music} src="/draw-music.mp3" muted={muted} preload="auto"
          onTimeUpdate={syncAudio}
          onSeeked={syncAudio}
          onEnded={() => { audioRunning.current = false; finishReveal(); }}
        />}
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
              aria-label="Settings"
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
                  <h2>Settings</h2>
                </div>
                <button
                  autoFocus
                  className="icon-button"
                  onClick={() => setSetup(false)}
                  aria-label="Close settings"
                >
                  <X />
                </button>
              </div>
              {(!event || event.status === "draft") && <ParticipantImport
                busy={busy || !ready}
                progress={uploadProgress}
                save={entries => work(async () => {
                  setUploadProgress({ percent: null, label: `Preparing ${entries.length} entries…` });
                  try {
                  const current = event || await request("create");
                  if (!current) throw new Error("Unable to create event.");
                  setEvent(current);
                  setUploadProgress({ percent: 0, label: `Sending ${entries.length} entries… 0%` });
                  setEvent(await request("import", { id: current.id, entries, prizes: current.prizes, branch_draw: true, finalize: true }, percent => {
                    setUploadProgress({ percent, label: percent === null ? `Saving ${entries.length} entries…` : `Sending ${entries.length} entries… ${percent}%` });
                  }));
                  setSelectedBranch("");
                  setSetup(false);
                  } finally { setUploadProgress(null); }
                })}
              />}
              {event && event.status !== "draft" && <>
                <p className="notice">Entries are frozen. Reset this event to clear its participants and winners, or create a separate event to keep them.</p>
                <button disabled={busy} onClick={() => void work(async () => {
                  setEvent(await request("create")); setShown(false); setSelectedBranch("");
                })}>Create separate event</button>
              </>}
              {revealedResults.length > 0 && <section className="settings-section" aria-label="Winner downloads">
                <h3>Winner downloads</h3>
                <p>Download revealed winners by branch, or all branches in alphabetical order.</p>
                <button disabled={busy} onClick={() => download()}><Download size={16} /> Download all branch winners</button>
                <div className="branch-downloads">
                  {exportBranches.map(branch => <button key={branch} disabled={busy} onClick={() => download(branch)}>
                    <Download size={16} /> Download {branch || "draw"} winners
                  </button>)}
                </div>
              </section>}
              {!!(event?.entries.length || event?.results.length) && <section className="settings-section" aria-label="Reset event">
                <h3>Reset event</h3>
                <p>Delete the current uploaded participants and selected winners for all branches. This cannot be undone.</p>
                <button className="reset-button" disabled={busy || revealing} onClick={reset}><RotateCcw size={16} /> Reset</button>
              </section>}
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
