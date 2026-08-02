import { useState, useEffect, useRef } from "react";
import RIDDLES from "./riddles.json";
import { ADSENSE_CLIENT, AD_SLOTS, SITE_URL } from "./config.js";

// ---- THE ENIGMA — deployable site ------------------------------------------
// Assets are hosted files in /public (same-origin). Riddles are served from the
// bundled 100-riddle library (no API key needed in the browser). Render mode
// (/?render=1&r=<riddle>&a=<answer>&t=30) drives the 30s clip exporter.

const BG = "/fairground.jpg";
const POSTER = "/poster.png";
const VIDEO_SRC = "/machine.mp4";
const USE_VIDEO = false; // static poster only for now — source video resolution is too low
const RIDDLE_SECONDS = 30;
const GOLD = "#C9A24B", GOLD_HI = "#EBD08A";
const ACCENT = "#E0342A", GREEN = "#5CE05C";

const Q = (typeof window !== "undefined") ? new URLSearchParams(window.location.search) : new URLSearchParams();
const RENDER = Q.get("render") === "1" || Q.get("mode") === "render";
const P_RIDDLE = Q.get("r") ? decodeURIComponent(Q.get("r")) : "";
const P_ANSWER = Q.get("a") ? decodeURIComponent(Q.get("a")) : "";
const P_T = parseInt(Q.get("t") || "", 10);
const RENDER_SECS = Number.isFinite(P_T) && P_T > 0 ? P_T : 30;
const HOOK = Q.get("hook") !== "0";

const LIB = (RIDDLES && RIDDLES.riddles) ? RIDDLES.riddles : (Array.isArray(RIDDLES) ? RIDDLES : []);

function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

export default function EnigmaPage() {
  const [phase, setPhase] = useState("idle");
  const [riddle, setRiddle] = useState(null);
  const [guess, setGuess] = useState("");
  const [left, setLeft] = useState(RIDDLE_SECONDS);
  const [streak, setStreak] = useState(0);
  const [solveTime, setSolveTime] = useState(null);
  const [copied, setCopied] = useState(false);
  const [miss, setMiss] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [vidReady, setVidReady] = useState(false);

  const startedAt = useRef(0); const tick = useRef(null); const gi = useRef(null);
  const videoRef = useRef(null);
  const voiceRef = useRef(false); const musicRef = useRef(true); const gestured = useRef(false); const amb = useRef(null);
  const queue = useRef(shuffle(LIB)); const qi = useRef(0);

  useEffect(() => { voiceRef.current = voiceOn; if (!voiceOn && "speechSynthesis" in window) window.speechSynthesis.cancel(); }, [voiceOn]);
  useEffect(() => { musicRef.current = musicOn; }, [musicOn]);
  useEffect(() => { if (musicOn) { if (gestured.current) startMusic(); } else stopMusic(); }, [musicOn]);
  useEffect(() => {
    const v = videoRef.current; if (v) { v.loop = true; v.muted = true; try { v.play(); } catch (e) {} }
    if ("speechSynthesis" in window) { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }
    const kick = () => { gestured.current = true; if (musicRef.current) startMusic(); };
    window.addEventListener("pointerdown", kick, { once: true });
    return () => { window.removeEventListener("pointerdown", kick); try { stopMusic(); if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch (e) {} };
  }, []);
  useEffect(() => () => clearInterval(tick.current), []);

  // ---- render mode: deterministic auto-run for the clip exporter ----
  useEffect(() => {
    if (!RENDER) return;
    const fallback = LIB[0] || { riddle: "I have cities but no houses, forests but no trees, and water but no fish. What am I?", answer: "a map", accept: [] };
    const rd = (P_RIDDLE && P_ANSWER) ? { riddle: P_RIDDLE, answer: P_ANSWER, accept: [] } : fallback;
    setRiddle(rd);
    try { window.__renderDuration = (HOOK ? 2.6 : 0) + RENDER_SECS + 4.2; window.__renderComplete = false; } catch (e) {}
    if (musicRef.current) startMusic();
    const v = videoRef.current; if (v) { v.loop = false; try { v.currentTime = 0; v.play(); } catch (e) {} }
    const begin = () => { setPhase("playing"); runRenderTimer(); };
    if (HOOK) { setPhase("hook"); const id = setTimeout(begin, 2600); return () => clearTimeout(id); }
    begin();
  }, []);
  function runRenderTimer() {
    clearInterval(tick.current); setLeft(RENDER_SECS); startedAt.current = Date.now();
    tick.current = setInterval(() => {
      const r = Math.max(0, RENDER_SECS - (Date.now() - startedAt.current) / 1000); setLeft(r);
      if (r <= 0) { clearInterval(tick.current); freeze(); setPhase("timeup"); setTimeout(() => { try { window.__renderComplete = true; } catch (e) {} }, 4200); }
    }, 100);
  }

  function startMusic() { try { if (!amb.current) amb.current = makeCarnival(); amb.current.start(); } catch (e) {} }
  function stopMusic() { try { amb.current && amb.current.stop(); } catch (e) {} }

  function startTimer() {
    clearInterval(tick.current); setLeft(RIDDLE_SECONDS); startedAt.current = Date.now();
    tick.current = setInterval(() => {
      const r = Math.max(0, RIDDLE_SECONDS - (Date.now() - startedAt.current) / 1000); setLeft(r);
      if (r <= 0) { clearInterval(tick.current); setStreak(0); freeze(); setPhase("timeup"); speak("Time's up. The answer was " + (riddle ? riddle.answer : ""), voiceRef.current); }
    }, 100);
  }
  function nextRiddle() {
    if (!queue.current.length) return null;
    if (qi.current >= queue.current.length) { queue.current = shuffle(LIB); qi.current = 0; }
    return queue.current[qi.current++];
  }
  function newRiddle() {
    clearInterval(tick.current); setPhase("working"); setGuess(""); setCopied(false); setSolveTime(null);
    const r = nextRiddle();
    if (!r) { setPhase("error"); return; }
    setTimeout(() => {
      setRiddle(r); setPhase("playing"); startTimer();
      const v = videoRef.current; if (v) { v.loop = false; try { v.currentTime = 0; v.play(); } catch (e) {} }
      speak(r.riddle, voiceRef.current);
      setTimeout(() => gi.current && gi.current.focus(), 50);
    }, 520);
  }
  function freeze() { const v = videoRef.current; if (v) { try { v.pause(); } catch (e) {} } }
  function norm(x) { return (x || "").toLowerCase().replace(/^(a |an |the )/, "").replace(/[^a-z0-9 ]/g, "").trim(); }
  function submitGuess() {
    if (phase !== "playing") return; const g = norm(guess); if (!g) return;
    const pool = [riddle.answer, ...(riddle.accept || [])].map(norm);
    const hit = pool.some((a) => a && (a === g || (g.length > 3 && a.includes(g)) || g.includes(a)));
    if (hit) { clearInterval(tick.current); const st = Math.max(0.1, (Date.now() - startedAt.current) / 1000); setSolveTime(st); setStreak((s) => s + 1); freeze(); setPhase("solved"); speak("Correct. " + riddle.answer, voiceRef.current); }
    else { setGuess(""); setMiss(true); setTimeout(() => setMiss(false), 400); }
  }
  function copyShare() { const url = SITE_URL ? ("\n\nPlay: " + SITE_URL) : ""; const payload = "\uD83E\uDDE9 Can you solve this?\n\n" + riddle.riddle + "\n\nI got it in " + solveTime.toFixed(1) + "s." + url; navigator.clipboard?.writeText(payload); setCopied(true); setTimeout(() => setCopied(false), 1800); }
  function tap() { if (phase === "working") return; if (phase !== "playing") newRiddle(); }

  const working = phase === "working";

  return (
    <div style={{ ...ui.stage, ...(RENDER ? ui.stageRender : {}), backgroundImage: `linear-gradient(rgba(8,6,12,0.25), rgba(8,6,12,0.55)), url(${BG})` }}>
      <style>{css}</style>

      {!RENDER && (
        <div style={ui.soundbar}>
          <button style={pill(voiceOn)} onClick={() => setVoiceOn((v) => !v)}>&#128266; Voice {voiceOn ? "on" : "off"}</button>
          <button style={pill(musicOn)} onClick={() => setMusicOn((m) => !m)}>&#127925; Music {musicOn ? "on" : "off"}</button>
        </div>
      )}

      {!RENDER && (
        <header style={ui.header}>
          <div style={ui.bulbRow}>{bulbs(9)}</div>
          <div style={ui.titleWrap}>
            <span style={ui.flourish}>&#10087;</span>
            <h1 style={ui.title} className="e-glow">THE ENIGMA</h1>
            <span style={{ ...ui.flourish, transform: "scaleX(-1)" }}>&#10087;</span>
          </div>
          <p style={ui.tags}>Riddles &middot; Puzzles &middot; Conundrums</p>
          <p style={ui.invite}>Solve me if you can &mdash; before the clock runs out.</p>
        </header>
      )}

      {!RENDER && <AdUnit slotKey="leaderboard" label="Leaderboard &middot; 728&times;90" wide />}

      <div style={RENDER ? { ...ui.machineWrap, maxWidth: "100%", width: "100%" } : ui.machineWrap} onClick={tap}>
        <img src={POSTER} alt="The Enigma riddle machine" style={ui.poster} draggable="false" />
        {USE_VIDEO && <video ref={videoRef} src={VIDEO_SRC} style={{ ...ui.video, opacity: vidReady ? 1 : 0 }} muted loop autoPlay playsInline preload="auto" onPlaying={() => setVidReady(true)} />}
        {phase === "hook" && <div style={ui.hook}>Can you solve it?</div>}
        {phase === "idle" && <div style={ui.tapChip}>tap for a riddle &#10022;</div>}
        {working && <div style={ui.working}>summoning&hellip;</div>}
        {(phase === "playing" || phase === "solved" || phase === "timeup") && riddle && (
          <div style={ui.bubble} className="e-pop">
            <p style={ui.riddleText}>{riddle.riddle}</p>
            {(phase === "solved" || phase === "timeup") && (
              <p style={ui.answerText}>{phase === "solved" ? "\u2713 " + riddle.answer : "Answer: " + riddle.answer}</p>
            )}
            <span style={ui.bubbleTail} />
          </div>
        )}
        {phase === "playing" && (
          <div style={ui.timerBar}>
            <div style={{ ...ui.timerFill, width: (left / RIDDLE_SECONDS * 100) + "%", background: left < 6 ? ACCENT : GOLD_HI }} />
            <span style={ui.timerNum}>{Math.ceil(left)}s</span>
          </div>
        )}
      </div>

      {!RENDER && (
        <div style={ui.controls}>
          {phase === "idle" && (<><button style={askBtn} onClick={newRiddle}>&#9679; ASK A RIDDLE</button><span style={ui.tokenNote}>&#9672; free to play</span></>)}
          {working && <p style={ui.workNote} className="e-flicker">summoning a riddle&hellip;</p>}
          {phase === "playing" && (
            <div style={ui.row} className={miss ? "e-shake" : ""}>
              <input ref={gi} style={ui.input} value={guess} onChange={(e) => setGuess(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitGuess()} placeholder="type your answer&hellip;" onClick={(e) => e.stopPropagation()} />
              <button style={{ ...askBtn, width: "auto", padding: "12px 18px" }} onClick={submitGuess}>SOLVE</button>
            </div>
          )}
          {phase === "solved" && (
            <div style={ui.row}>
              <span style={ui.streak}>SOLVED in {solveTime.toFixed(1)}s &middot; STREAK <b style={{ color: GREEN }}>{streak}</b></span>
              <button style={shareBtn} onClick={copyShare}>{copied ? "Copied &mdash; challenge them" : "Share the challenge"}</button>
              <button style={ghost} onClick={newRiddle}>Next &rarr;</button>
            </div>
          )}
          {phase === "timeup" && <button style={askBtn} onClick={newRiddle}>&#9679; TRY ANOTHER</button>}
          {phase === "error" && (<div style={{ textAlign: "center" }}><p style={ui.err}>The machine jammed.</p><button style={shareBtn} onClick={newRiddle}>Try again</button></div>)}
        </div>
      )}

      {!RENDER && <AdUnit slotKey="rectangle" label="Medium rectangle &middot; 300&times;250" />}
    </div>
  );
}

function AdUnit({ slotKey, label, wide }) {
  const client = ADSENSE_CLIENT, slot = AD_SLOTS[slotKey];
  useEffect(() => {
    if (!client || !slot) return;
    if (!document.querySelector("script[data-adsbygoogle]")) {
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + client;
      s.crossOrigin = "anonymous"; s.setAttribute("data-adsbygoogle", "1");
      document.head.appendChild(s);
    }
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  }, []);
  if (!client || !slot) {
    return (
      <div style={{ ...ui.adSlot, maxWidth: wide ? 620 : 300 }}>
        <span style={ui.adTag}>AD</span>
        <div style={{ textAlign: "center" }}>
          <span style={ui.adLabel}>Sponsor billboard &mdash; banner slot</span>
          <span style={ui.adDims} dangerouslySetInnerHTML={{ __html: label }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ width: "100%", maxWidth: wide ? 728 : 300, minHeight: wide ? 90 : 250 }}>
      <ins className="adsbygoogle" style={{ display: "block" }} data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}

function bulbs(n) { return Array.from({ length: n }).map((_, i) => (<span key={i} className="e-bulb" style={{ animationDelay: (i * 0.13) + "s" }} />)); }

function speak(text, enabled) {
  if (!enabled || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const vs = window.speechSynthesis.getVoices() || [];
    const pk = vs.find((x) => /en-GB/i.test(x.lang)) || vs.find((x) => /en/i.test(x.lang));
    if (pk) u.voice = pk; u.pitch = 0.95; u.rate = 0.98;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

function makeCarnival() {
  let ctx, master, timer = null, playing = false, nextTime = 0, bar = 0;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  } catch (e) { return { start() {}, stop() {} }; }
  const F = { C2: 65.41, F2: 87.31, G2: 98.0, A2: 110.0, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46 };
  const PROG = [
    { bass: F.C2, chord: [F.E4, F.G4], mel: [F.G4, F.C5, F.E5] }, { bass: F.G2, chord: [F.D4, F.F4], mel: [F.D5, F.B4, F.G4] },
    { bass: F.A2, chord: [F.C4, F.E4], mel: [F.E5, F.C5, F.A4] }, { bass: F.F2, chord: [F.F4, F.A4], mel: [F.F5, F.A4, F.C5] },
    { bass: F.C2, chord: [F.E4, F.G4], mel: [F.G4, F.C5, F.E5] }, { bass: F.G2, chord: [F.D4, F.F4], mel: [F.F5, F.D5, F.B4] },
    { bass: F.F2, chord: [F.F4, F.A4], mel: [F.A4, F.C5, F.F4] }, { bass: F.G2, chord: [F.D4, F.G4], mel: [F.E5, F.G4, F.C5] },
  ];
  const beat = 0.34;
  function note(freq, t, dur, type, vol) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = 0; o.connect(g).connect(master); o.start(t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.stop(t + dur + 0.03);
  }
  function scheduleBar(t) {
    const b = PROG[bar % PROG.length];
    note(b.bass, t, 0.28, "triangle", 0.12);
    b.chord.forEach((f) => note(f, t + beat, 0.16, "sine", 0.045));
    b.chord.forEach((f) => note(f, t + 2 * beat, 0.16, "sine", 0.045));
    b.mel.forEach((f, i) => note(f, t + i * beat, 0.26, "square", 0.05)); bar++;
  }
  function loop() { while (nextTime < ctx.currentTime + 0.35) { scheduleBar(nextTime); nextTime += beat * 3; } timer = setTimeout(loop, 60); }
  return {
    start() { try { ctx.resume(); master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.8); if (!playing) { playing = true; nextTime = ctx.currentTime + 0.12; loop(); } } catch (e) {} },
    stop() { try { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5); clearTimeout(timer); playing = false; } catch (e) {} },
  };
}

const askBtn = { width: "100%", background: "linear-gradient(180deg, #F0463A, #B01E16)", color: "#FFF3F1", border: "none", borderRadius: 10, padding: "13px 18px", fontWeight: 700, fontSize: 15, letterSpacing: 1.5, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 0 16px rgba(224,52,42,0.4)" };
const shareBtn = { background: ACCENT, color: "#FFF3F1", border: "none", borderRadius: 999, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
const ghost = { background: "transparent", color: GOLD_HI, border: `1.5px solid ${GOLD}`, borderRadius: 999, padding: "10px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
const pill = (on) => ({ background: on ? "rgba(201,162,75,0.2)" : "rgba(0,0,0,0.3)", color: on ? GOLD_HI : "#9C8A66", border: `1px solid ${on ? GOLD : "#5A4A2E"}`, borderRadius: 999, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" });

const ui = {
  stage: { minHeight: "100%", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundColor: "#0A0810", fontFamily: "Georgia, 'Times New Roman', serif", color: "#F3E9D2", padding: "18px 14px 40px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 },
  stageRender: { minHeight: "100vh", padding: 0, justifyContent: "center", gap: 0 },
  soundbar: { alignSelf: "flex-end", display: "flex", gap: 8 },
  header: { textAlign: "center", maxWidth: 430 },
  bulbRow: { display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 },
  titleWrap: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12 },
  flourish: { color: GOLD, fontSize: 22, opacity: 0.95, display: "inline-block" },
  title: { margin: 0, fontSize: 40, letterSpacing: 3, fontWeight: 700, lineHeight: 1.05, color: GREEN, textShadow: "-1.5px -1.5px 0 #0C3A12, 1.5px -1.5px 0 #0C3A12, -1.5px 1.5px 0 #0C3A12, 1.5px 1.5px 0 #0C3A12, 0 3px 0 #0C3A12, 0 6px 10px rgba(0,0,0,0.7), 0 0 22px rgba(92,224,92,0.5)" },
  tags: { margin: "10px 0 0", color: GOLD_HI, fontSize: 13, letterSpacing: 2, textTransform: "uppercase", textShadow: "0 1px 3px rgba(0,0,0,0.8)" },
  invite: { margin: "6px auto 0", color: "#E4D3B4", fontStyle: "italic", fontSize: 14, maxWidth: 320, lineHeight: 1.4, textShadow: "0 1px 3px rgba(0,0,0,0.8)" },

  machineWrap: { position: "relative", width: "100%", maxWidth: 340, cursor: "pointer", lineHeight: 0 },
  poster: { width: "100%", height: "auto", display: "block", borderRadius: 10, filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.7))" },
  video: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: 10, transition: "opacity 0.3s", zIndex: 1 },
  tapChip: { position: "absolute", bottom: "16%", left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.62)", color: GOLD_HI, fontSize: 12, letterSpacing: 2, padding: "5px 12px", borderRadius: 999, border: `1px solid ${GOLD}`, whiteSpace: "nowrap", zIndex: 3 },
  working: { position: "absolute", top: "42%", left: "50%", transform: "translate(-50%,-50%)", color: GOLD_HI, letterSpacing: 3, fontSize: 15, textShadow: "0 1px 4px #000", zIndex: 3 },
  bubble: { position: "absolute", top: "54%", left: "7%", right: "7%", background: "rgba(10,12,10,0.05)", border: "1.5px solid rgba(201,162,75,0.45)", borderRadius: 16, padding: "12px 14px", zIndex: 2 },
  bubbleTail: { position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "13px solid transparent", borderRight: "13px solid transparent", borderBottom: "14px solid rgba(10,12,10,0.05)" },
  riddleText: { margin: 0, textAlign: "center", fontFamily: "ui-monospace, monospace", fontSize: 15, lineHeight: 1.45, color: "#F7F1E4", whiteSpace: "pre-line", textShadow: "-1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000, 1px 1px 2px #000, 0 2px 6px rgba(0,0,0,0.95)" },
  answerText: { margin: "8px 0 0", textAlign: "center", fontFamily: "ui-monospace, monospace", fontSize: 17, fontWeight: 700, color: "#FFFFFF", textShadow: "-1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000, 1px 1px 2px #000, 0 2px 6px rgba(0,0,0,0.95)" },
  timerBar: { position: "absolute", left: "3%", right: "3%", bottom: "8%", height: 26, borderRadius: 6, overflow: "hidden", background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", border: "1px solid rgba(201,162,75,0.35)", zIndex: 2 },
  timerFill: { position: "absolute", left: 0, top: 0, bottom: 0, transition: "width 0.1s linear, background 0.3s", opacity: 0.85 },
  timerNum: { position: "relative", margin: "0 auto", fontFamily: "ui-monospace, monospace", fontSize: 15, color: "#fff", fontWeight: 700, letterSpacing: 1, textShadow: "0 1px 2px rgba(0,0,0,0.9)" },

  controls: { width: "100%", maxWidth: 340, background: "rgba(10,8,14,0.55)", border: "1px solid rgba(201,162,75,0.32)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 10px 26px rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" },
  row: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", alignItems: "center" },
  input: { flex: 1, minWidth: 150, background: "rgba(6,4,8,0.7)", color: "#F3E9D2", border: `1.5px solid ${GOLD}`, borderRadius: 8, padding: "11px 12px", fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  tokenNote: { textAlign: "center", color: "#CBB98C", fontSize: 11, letterSpacing: 1, fontFamily: "ui-monospace, monospace" },
  workNote: { margin: 0, textAlign: "center", color: GOLD_HI, letterSpacing: 1.5 },
  streak: { fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#CBB98C", letterSpacing: 1 },
  err: { color: "#E8908A", margin: "0 0 8px", fontSize: 14, textAlign: "center" },

  adSlot: { width: "100%", position: "relative", minHeight: 58, border: "1px dashed rgba(201,162,75,0.5)", borderRadius: 12, background: "rgba(10,8,14,0.4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 12px", boxSizing: "border-box", backdropFilter: "blur(2px)" },
  adTag: { position: "absolute", top: 6, left: 8, fontSize: 9, letterSpacing: 1, color: "#0A0810", background: GOLD, borderRadius: 3, padding: "1px 6px", fontWeight: 700 },
  adLabel: { display: "block", color: GOLD_HI, fontSize: 13, letterSpacing: 1 },
  adDims: { display: "block", color: "#9C7B4A", fontSize: 11, marginTop: 2, letterSpacing: 1, fontFamily: "ui-monospace, monospace" },
};

const css = `
.e-bulb { width: 7px; height: 7px; border-radius: 50%; background: ${GOLD_HI}; box-shadow: 0 0 8px ${GOLD}; display: inline-block; animation: eBulb 1.5s ease-in-out infinite; }
@keyframes eBulb { 0%,100%{ opacity: 1; } 50%{ opacity: 0.35; } }
.e-glow { animation: eGlow 3s ease-in-out infinite; }
@keyframes eGlow { 0%,100%{ filter: brightness(1); } 50%{ filter: brightness(1.14); } }
.e-pop { animation: ePop 0.36s ease-out; transform-origin: 50% -20%; }
@keyframes ePop { 0%{ opacity: 0; transform: scale(0.86) translateY(6px); } 100%{ opacity: 1; transform: none; } }
.e-flicker { animation: eFlick 1.1s ease-in-out infinite; }
@keyframes eFlick { 0%,100%{ opacity: 1; } 50%{ opacity: 0.55; } }
.e-shake { animation: eShake 0.4s; }
@keyframes eShake { 0%,100%{ transform: translateX(0); } 25%{ transform: translateX(-5px); } 75%{ transform: translateX(5px); } }
input::placeholder { color: #8C7A58; }
@media (prefers-reduced-motion: reduce){ .e-bulb,.e-glow,.e-pop,.e-flicker,.e-shake{ animation: none !important; } }
`;
