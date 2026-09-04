import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IMG, ITEMS, MISSIONS, INTRO_CARDS } from './gameData';
import * as horror from './audio';
import Jumpscare from './components/Jumpscare';
import { HorrorEngine, DIFFS, type WorldEvents, type Difficulty, type DeathCause } from './engine';

type Screen = 'title' | 'intro' | 'game' | 'dead' | 'escaped';

let uid = 1;
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = 'none';
};
/* A polaroid whose photograph never arrives must not be left behind as a blank
   cream card with a caption floating on the title screen — take the whole
   figure with it. */
const hideCardOnError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const fig = e.currentTarget.closest('figure');
  if (fig) fig.style.display = 'none';
  else e.currentTarget.style.display = 'none';
};
/* A corrupt or hand-edited localStorage value must not turn into a best time of
   0, which would make every escape afterwards look slower than the record. */
const readBest = (): number | null => {
  try {
    const v = localStorage.getItem('hollow-best');
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
};

const TICKER =
  'DO NOT ANSWER WHEN SHE COUNTS \u2022 THE THIRD CANDLE IS FOR YOU \u2022 SHE WEARS THE MOTHER\u2019S FACE NOW \u2022 THE DOLL MOVES WHEN YOU BLINK \u2022 IF YOU HEAR HUMMING, HUM BACK \u2022 ';

/* ---------- inline icons ---------- */
const CandleIcon = ({ lit }: { lit: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={lit ? '#ff9e4a' : 'currentColor'} strokeWidth="1.8" aria-hidden>
    {lit && <path d="M12 2c1 2.2 2 3.2 2 4.6A2 2 0 0 1 12 8.5a2 2 0 0 1-2-1.9C10 5.2 11 4.2 12 2z" fill="#ff9e4a" stroke="none" />}
    <path d="M9 11h6v10a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V11z" />
  </svg>
);
const SpeakerIcon = ({ muted }: { muted: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
    {muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a8 8 0 0 1 0 11" /></>}
  </svg>
);
const SkullIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2a8 8 0 0 0-8 8c0 3 1.6 5.3 4 6.6V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3.4c2.4-1.3 4-3.6 4-6.6a8 8 0 0 0-8-8zM8.5 12.5A1.8 1.8 0 1 1 8.5 9a1.8 1.8 0 0 1 0 3.5zm7 0A1.8 1.8 0 1 1 15.5 9a1.8 1.8 0 0 1 0 3.5zM12 17l-1.3-2.4h2.6L12 17z" />
  </svg>
);
const GhostIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2c-4.4 0-8 3.6-8 8v12l3-2 2.5 2 2.5-2 2.5 2 2.5-2 3 2V10c0-4.4-3.6-8-8-8zM9 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
  </svg>
);
const TorchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
    <path d="M8.5 8h7l1-4.5h-9L8.5 8z" />
    <path d="M9 8h6v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V8z" />
    <path d="M12 12v3.5" />
  </svg>
);
const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);
const ItemIcon = ({ id }: { id: string }) => {
  if (id === 'iron-key')
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="8" cy="8" r="4.2" />
        <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
        <path d="M11 11l9 9M17 17l2.5-2.5M14.5 19.5L17 17" />
      </svg>
    );
  if (id === 'locket')
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M7 3c2 0 3.5 1.5 5 1.5S15 3 17 3" />
        <ellipse cx="12" cy="13" rx="6.5" ry="7.5" />
        <path d="M12 9.5c1.2-1.4 3.4-.5 3.4 1.2 0 1.9-3.4 4-3.4 4s-3.4-2.1-3.4-4c0-1.7 2.2-2.6 3.4-1.2z" fill="currentColor" stroke="none" />
      </svg>
    );
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 4.5l2 5.2 5.5.3-4.2 3.5 1.4 5.4L12 15.6l-4.7 3.3 1.4-5.4-4.2-3.5 5.5-.3z" strokeLinejoin="round" />
    </svg>
  );
};

const DPadBtn = ({ label, code, onKey }: { label: string; code: string; onKey: (c: string, d: boolean) => void }) => (
  <button
    onPointerDown={(e) => { e.preventDefault(); onKey(code, true); }}
    onPointerUp={() => onKey(code, false)}
    onPointerLeave={() => onKey(code, false)}
    onPointerCancel={() => onKey(code, false)}
    className="flex h-13 w-13 items-center justify-center border border-[#e8e0cf]/25 bg-black/60 text-lg text-[#e8e0cf]/80 active:border-[#c1121f] active:bg-[#c1121f]/25"
    style={{ width: 52, height: 52 }}
    aria-label={label}
  >
    {label}
  </button>
);

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [consent, setConsent] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sanity, setSanity] = useState(100);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [chased, setChased] = useState(false);
  const [sealProgress, setSealProgress] = useState(0);
  const [scareKey, setScareKey] = useState(0);
  const [scareCount, setScareCount] = useState(0);
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);
  const [diff, setDiff] = useState<Difficulty>('lantern');
  const [deathCause, setDeathCause] = useState<DeathCause>('sanity');
  const [runId, setRunId] = useState(0);
  const [stamina, setStamina] = useState(100);
  const [battery, setBattery] = useState(100);
  const [emf, setEmf] = useState(0);
  const [best, setBest] = useState<number | null>(readBest);
  /* Decided at the instant of escape. escaped() fires before the new `best` is
     committed, so the screen cannot tell a record from a tie by comparing them. */
  const [record, setRecord] = useState(false);
  const [inv, setInv] = useState<string[]>([]);
  const [candlesLit, setCandlesLit] = useState(0);
  const [souls, setSouls] = useState(() => 13000 + Math.floor(Math.random() * 900));
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(true);
  const [introIdx, setIntroIdx] = useState(0);
  const [storyMsg, setStoryMsg] = useState<{ id: number; title: string; line: string } | null>(null);
  const [flashKey, setFlashKey] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<HorrorEngine | null>(null);
  const pausedRef = useRef(false);
  const diffRef = useRef<Difficulty>('lantern');
  const lastScareRef = useRef(0);
  const elapsedRef = useRef(0);
  const bestRef = useRef<number | null>(null);

  const isTouch = useMemo(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0, []);

  const pushLog = useCallback((text: string) => setLog((l) => [...l.slice(-5), { id: uid++, text }]), []);
  const flashMsg = useCallback((text: string) => setMsg({ id: uid++, text }), []);

  /* One place flips the pause flag. The P/esc listener, the touch pause button
     and the three overlay buttons all go through here, so React state, the ref
     and the engine can never disagree about whether the night is frozen. */
  const applyPause = useCallback((p: boolean) => {
    pausedRef.current = p;
    setPaused(p);
    engineRef.current?.setPaused(p);
  }, []);
  const togglePause = useCallback(() => applyPause(!pausedRef.current), [applyPause]);
  const onToggleTorch = useCallback(() => engineRef.current?.toggleLight(), []);

  /* fatal runtime errors surface visibly instead of a dead preview */
  useEffect(() => {
    const h = (e: ErrorEvent) => setError(e.message || 'The house rejected this browser.');
    window.addEventListener('error', h);
    return () => window.removeEventListener('error', h);
  }, []);

  /* escaped() has to see the previous best before React commits the new one */
  useEffect(() => {
    bestRef.current = best;
  }, [best]);

  /* engine lifecycle */
  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    const mini = miniRef.current;
    if (!canvas || !mini) return;
    const ev: WorldEvents = {
      scare: () => {
        // belt-and-braces: a scare can never retrigger while one is playing
        const now = performance.now();
        if (now - lastScareRef.current < 1100) return;
        lastScareRef.current = now;
        setScareKey((k) => k + 1);
        setScareCount((c) => c + 1);
      },
      died: (cause) => {
        setDeathCause(cause);
        setScareKey(0);
        setScreen('dead');
      },
      escaped: () => {
        const t = elapsedRef.current;
        const prev = bestRef.current;
        const beat = prev === null || t < prev;
        bestRef.current = beat ? t : prev;
        setBest(bestRef.current);
        setRecord(beat);
        try { localStorage.setItem('hollow-best', String(bestRef.current)); } catch { /* private mode */ }
        setScreen('escaped');
      },
      log: (t) => pushLog(t),
      toast: (t) => flashMsg(t),
      candlesChanged: (n) => setCandlesLit(n),
      invChanged: (items) => setInv(items),
      story: (title, line) => setStoryMsg({ id: uid++, title, line }),
      flash: () => setFlashKey((k) => k + 1),
    };
    const eng = new HorrorEngine(canvas, mini, ev, viewRef.current ?? undefined);
    eng.setDifficulty(diffRef.current);
    engineRef.current = eng;
    eng.start();
    const iv = window.setInterval(() => {
      const s = eng.stats();
      setSanity(s.sanity);
      setPrompt(s.prompt);
      setChased(s.chased);
      setSealProgress(s.sealProgress);
      setStamina(s.stamina);
      setBattery(s.battery);
      setEmf(s.emf);
    }, 120);
    setHint(true);
    const ht = window.setTimeout(() => setHint(false), 7000);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(ht);
      eng.destroy();
      engineRef.current = null;
    };
  }, [screen, runId, pushLog, flashMsg]);

  /* clock */
  useEffect(() => {
    if (screen !== 'game' || paused) return;
    /* The ref drives and the state mirrors it. Writing the ref inside a state
       updater left it holding the previous run's clock after a restart — and
       escaped() reads it to decide the best-time record. */
    const iv = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [screen, paused]);

  /* heartbeat follows sanity */
  useEffect(() => {
    if (screen !== 'game') {
      horror.setHeartbeat(100, false);
      return;
    }
    horror.setHeartbeat(sanity, true);
    return () => horror.setHeartbeat(100, false);
  }, [screen, sanity]);



  /* pause key */
  useEffect(() => {
    if (screen !== 'game') return;
    const h = (e: KeyboardEvent) => {
      if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [screen, togglePause]);

  /* toast auto-hide */
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 4200);
    return () => window.clearTimeout(t);
  }, [msg]);

  /* title souls ticker */
  useEffect(() => {
    if (screen !== 'title') return;
    const iv = window.setInterval(() => setSouls((s) => s + (Math.random() < 0.45 ? 1 : 0)), 6000);
    return () => window.clearInterval(iv);
  }, [screen]);

  const startGame = useCallback(() => {
    horror.initAudio();
    horror.startAmbient();
    diffRef.current = diff;
    setRunId((r) => r + 1);
    setScreen('game');
    applyPause(false);
    elapsedRef.current = 0;
    setElapsed(0);
    setRecord(false);
    setSanity(100);
    setScareCount(0);
    setInv([]);
    setCandlesLit(0);
    setLog([]);
    setChased(false);
    setSealProgress(0);
    pushLog('You wake on the hall floor. The front door is sealed behind you.');
    window.setTimeout(() => flashMsg('Seven rites free the door. She is already in the house with you.'), 900);
  }, [pushLog, flashMsg, diff, applyPause]);

  /* story cards: click / E / space advances; last card starts the night */
  useEffect(() => {
    if (screen !== 'intro') return;
    const advance = () => {
      horror.initAudio();
      if (introIdx >= INTRO_CARDS.length - 1) {
        startGame();
      } else {
        horror.tick();
        setIntroIdx((i) => i + 1);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, introIdx, startGame]);

  /* chapter cards fade out on their own */
  useEffect(() => {
    if (!storyMsg) return;
    const t = window.setTimeout(() => setStoryMsg(null), 6200);
    return () => window.clearTimeout(t);
  }, [storyMsg]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      horror.setMuted(!m);
      return !m;
    });
  }, []);

  const onKey = useCallback((code: string, down: boolean) => engineRef.current?.setVirtualKey(code, down), []);
  const onTapInteract = useCallback(() => engineRef.current?.interact(), []);

  const missions = useMemo(() => {
    const done = [
      inv.includes('matches'),
      inv.includes('iron-key'),
      candlesLit >= 3,
      inv.includes('locket'),
      inv.includes('salt'),
      inv.includes('sigil'),
      screen === 'escaped',
    ];
    return MISSIONS.map((m, i) => ({ ...m, done: done[i] }));
  }, [inv, candlesLit, screen]);
  const doneCount = missions.filter((m) => m.done).length;
  const inGame = screen === 'game';
  const sanityColor = sanity > 55 ? 'bg-[#7a8b6f]' : sanity > 25 ? 'bg-[#d9822b]' : 'bg-[#c1121f] animate-pulse';

  return (
    <div
      ref={rootRef}
      className={`relative h-screen w-screen select-none overflow-hidden bg-[#050506] text-[#e8e0cf] ${inGame && !isTouch ? 'cursor-crosshair' : ''}`}
    >
      {/* ================= TITLE ================= */}
      {screen === 'title' && (
        <div className="relative h-screen w-full select-none overflow-y-auto no-scrollbar bg-[#050506]">
          {/* Atmospheric Environmental Backdrop */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
            <img
              src={IMG.hallway}
              alt=""
              draggable={false}
              onError={hideOnError}
              className="kenburns absolute inset-0 h-full w-full object-cover opacity-28 grayscale-[25%]"
            />
            {/* Cinematic Gradient Masks */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#050506] via-[#050506]/92 to-[#050506]/55" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050506] via-transparent to-[#050506]/85" />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 25% 40%, rgba(193,18,31,0.08) 0%, transparent 65%)' }}
            />
            <div className="fog fog-a" />
            <div className="fog fog-b" />
            <div className="grain absolute inset-0 pointer-events-none" />
            <div className="vignette absolute inset-0 pointer-events-none" />
          </div>

          {/* Top Archival Header Bar */}
          <header className="relative z-10 w-full border-b border-[#e8e0cf]/10 bg-[#050506]/80 backdrop-blur-md px-4 sm:px-8 py-2.5">
            <div className="max-w-7xl mx-auto flex items-center justify-between text-[10px] sm:text-[11px] font-mono tracking-[0.25em] text-[#e8e0cf]/50 uppercase">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c1121f] animate-pulse" />
                <span className="text-[#c1121f] font-semibold">CASE ARCHIVE // 1889-HH</span>
                <span className="hidden md:inline text-[#e8e0cf]/25">|</span>
                <span className="hidden md:inline">BLACK RIVER PARISH CORONER</span>
              </div>
              <div className="flex items-center gap-4 text-[9px] sm:text-[10px] text-[#e8e0cf]/40">
                <span className="hidden sm:inline">CONDEMNED STRUCTURE</span>
                <span className="text-[#c1121f]/90 border border-[#c1121f]/40 px-1.5 py-0.5 bg-[#c1121f]/10">LEVEL IV HAZARD</span>
              </div>
            </div>
          </header>

          {/* Main Stage: Controlled Asymmetric Grid */}
          <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-10 lg:py-14 pb-24 sm:pb-28">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 xl:gap-16 items-start lg:items-center">

              {/* ================= LEFT / PRIMARY DOSSIER COLUMN ================= */}
              <div className="lg:col-span-7 xl:col-span-7 w-full max-w-xl mx-auto lg:mx-0 flex flex-col fade-up">
                
                {/* 1. Evidence Header */}
                <div className="flex items-center gap-2.5 text-[10px] sm:text-[11px] uppercase tracking-[0.35em] text-[#c1121f] font-mono mb-2">
                  <GhostIcon size={13} />
                  <span>COUNTY EVIDENCE DOSSIER</span>
                  <span className="text-[#e8e0cf]/30">/</span>
                  <span className="text-[#e8e0cf]/60">ENTRY PROHIBITED</span>
                </div>

                {/* 2. Hero Title: The Hollow House */}
                <h1
                  className="font-display title-flicker text-5xl sm:text-6xl md:text-7xl xl:text-[5.4rem] leading-[0.92] text-[#c1121f] tracking-wide my-1"
                  style={{
                    textShadow: '0 0 35px rgba(193,18,31,0.55), 0 4px 14px rgba(0,0,0,0.95), 0 0 85px rgba(193,18,31,0.25)',
                  }}
                >
                  The Hollow<br />House
                </h1>

                {/* 3. Subtitle & Atmospheric Logline */}
                <div className="mt-2 sm:mt-3 space-y-2">
                  <p className="text-[11px] sm:text-xs uppercase tracking-[0.25em] text-[#e8e0cf]/65 font-mono">
                    A FIRST-PERSON PSYCHOLOGICAL HORROR EXPERIENCE
                  </p>
                  <p className="text-xs sm:text-sm leading-relaxed text-[#e8e0cf]/75 font-body">
                    Walk the abandoned halls yourself. Seven rites stand between you and the front door, and <span className="text-[#c1121f] font-semibold not-italic">she</span> stands between you and everything else. She wanders. She stalks. She lunges.
                  </p>
                </div>

                {/* 4. Warning / Inquest Notice Panel (Consistent Column Width) */}
                <div className="mt-5 w-full border border-[#c1121f]/35 bg-[#08080c]/90 backdrop-blur-sm p-4 relative shadow-[0_8px_30px_rgba(0,0,0,0.7)]">
                  <div className="absolute top-0 right-0 px-2 py-0.5 bg-[#c1121f]/20 border-b border-l border-[#c1121f]/40 text-[8px] uppercase tracking-[0.2em] text-[#c1121f] font-mono">
                    ADVISORY
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-[#c1121f] font-mono font-semibold mb-2.5 flex items-center gap-1.5">
                    <span>WARNINGS POSTED BY ORDER OF THE COUNTY</span>
                  </p>
                  <ul className="space-y-1.5 text-[11px] sm:text-xs text-[#e8e0cf]/70 font-body">
                    <li className="flex items-start gap-2.5">
                      <span className="text-[#c1121f] font-bold text-[13px] leading-none select-none">†</span>
                      <span>Sudden, loud, synthesized horror audio (headphones required).</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="text-[#c1121f] font-bold text-[13px] leading-none select-none">†</span>
                      <span>Full-screen jumpscares with an unrelenting, adaptive apparition.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="text-[#c1121f] font-bold text-[13px] leading-none select-none">†</span>
                      <span>Flashing light phenomena — recommended in complete darkness.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="text-[#c1121f] font-bold text-[13px] leading-none select-none">†</span>
                      <span>The minimap shows her presence. Watching it will not stop her.</span>
                    </li>
                  </ul>
                </div>

                {/* 5. Player Acknowledgement (Consistent Column Width) */}
                <label className="mt-4 w-full flex cursor-pointer items-start gap-3 text-xs leading-snug text-[#e8e0cf]/75 hover:text-[#e8e0cf] transition-colors group">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer appearance-none border border-[#c1121f]/70 bg-black transition-colors checked:bg-[#c1121f] group-hover:border-[#c1121f]"
                  />
                  <span className="select-none font-body">
                    I understand that whatever hears me tonight may follow me home, and that my heart is my own responsibility.
                  </span>
                </label>

                {/* 6. Light Selection (Consistent Column Width & Uniform Cards) */}
                <div className="mt-5 w-full">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#e8e0cf]/50 font-mono">
                      CHOOSE YOUR LIGHT
                    </p>
                    <span className="text-[9px] uppercase tracking-[0.15em] text-[#c1121f]/90 font-mono">
                      {diff === 'lantern' ? '• INTENDED CHALLENGE' : diff === 'candle' ? '• MERCIFUL PASSAGE' : '• TOTAL NIGHTMARE'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 w-full">
                    {(Object.keys(DIFFS) as Difficulty[]).map((d) => {
                      const active = diff === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDiff(d)}
                          className={`group relative flex flex-col justify-between p-2.5 sm:p-3 text-left border transition-all duration-200 cursor-pointer min-h-[78px] sm:min-h-[86px] ${
                            active
                              ? 'border-[#c1121f] bg-[#c1121f]/15 shadow-[0_0_20px_rgba(193,18,31,0.25)] ring-1 ring-[#c1121f]/60'
                              : 'border-[#e8e0cf]/15 bg-black/60 hover:border-[#e8e0cf]/35 hover:bg-black/80'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className={`flex items-center gap-1.5 text-[10px] sm:text-[11px] uppercase tracking-[0.15em] font-mono font-bold ${active ? 'text-[#e8e0cf]' : 'text-[#e8e0cf]/65'}`}>
                                <CandleIcon lit={active} />
                                {DIFFS[d].label}
                              </span>
                              {d === 'lantern' && (
                                <span className={`text-[7px] uppercase tracking-wider px-1 py-0.2 border ${active ? 'border-[#c1121f] text-[#ff9e4a]' : 'border-white/10 text-white/40'}`}>
                                  STD
                                </span>
                              )}
                            </div>
                            <span className="block text-[9px] sm:text-[10px] leading-tight text-[#e8e0cf]/50 font-body">
                              {DIFFS[d].blurb}
                            </span>
                          </div>
                          {active && (
                            <div className="w-full h-0.5 bg-[#c1121f] mt-2 shadow-[0_0_8px_rgba(193,18,31,0.8)]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 7. Primary Action: ENTER THE HOUSE */}
                <div className="mt-5 w-full space-y-2">
                  <button
                    onClick={() => {
                      horror.initAudio();
                      horror.whisper();
                      setIntroIdx(0);
                      setScreen('intro');
                    }}
                    disabled={!consent}
                    className={`group relative w-full flex items-center justify-center gap-3 border-2 py-3.5 sm:py-4 px-6 text-xs sm:text-sm uppercase tracking-[0.3em] font-mono transition-all duration-300 ${
                      consent
                        ? 'border-[#c1121f] bg-[#c1121f]/15 text-[#e8e0cf] shadow-[0_0_30px_rgba(193,18,31,0.3)] hover:bg-[#c1121f] hover:text-[#050506] hover:shadow-[0_0_55px_rgba(193,18,31,0.7)] active:scale-[0.99] cursor-pointer'
                        : 'cursor-not-allowed border-[#e8e0cf]/15 bg-black/40 text-[#e8e0cf]/30'
                    }`}
                  >
                    <CandleIcon lit={consent} />
                    <span className="font-bold">ENTER THE HOUSE</span>
                    <span className="transition-transform duration-300 group-hover:translate-x-1.5">→</span>
                  </button>

                  <div className="flex items-center justify-between text-[9px] sm:text-[10px] tracking-[0.15em] text-[#e8e0cf]/45 font-mono px-1">
                    <span>
                      <span className="tabular-nums text-[#c1121f] font-semibold">{souls.toLocaleString()}</span> SOULS ENTERED
                    </span>
                    <span>·</span>
                    <span className="text-[#e8e0cf]/65">1 ESCAPED</span>
                    {best !== null && (
                      <>
                        <span>·</span>
                        <span>RECORD: <span className="tabular-nums text-[#7a8b6f] font-semibold">{fmt(best)}</span></span>
                      </>
                    )}
                  </div>

                  <div className="pt-2 text-center text-[10px] font-mono tracking-[0.22em] text-[#e8e0cf]/35 uppercase">
                    <a
                      href="https://abhiishek.is-a.dev/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#e8e0cf] hover:underline underline-offset-4 transition-colors cursor-pointer"
                      title="Abhishek's Portfolio"
                    >
                      Built by Abhishek
                    </a>
                    &nbsp;·&nbsp;
                    <span className="text-[#c1121f]/80">blame him.</span>
                  </div>
                </div>

              </div>

              {/* ================= RIGHT / COHESIVE EVIDENCE BOARD ================= */}
              <div className="lg:col-span-5 xl:col-span-5 w-full max-w-xl mx-auto lg:mx-0">
                {/* Board Container */}
                <div className="relative border border-[#c1121f]/20 bg-[#08080c]/70 backdrop-blur-sm p-4 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.85)]">
                  {/* Decorative Corner Brackets */}
                  <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-[#c1121f]/60" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-[#c1121f]/60" />
                  <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-[#c1121f]/60" />
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-[#c1121f]/60" />

                  {/* Evidence Board Header */}
                  <div className="flex items-center justify-between border-b border-[#e8e0cf]/10 pb-3 mb-5 text-[10px] font-mono uppercase tracking-[0.2em]">
                    <span className="text-[#e8e0cf]/60 flex items-center gap-1.5">
                      <span className="text-[#c1121f]">■</span> EXHIBIT RECOVERY BOARD
                    </span>
                    <span className="text-[#c1121f] border border-[#c1121f]/40 px-1.5 py-0.5 text-[8px] tracking-widest bg-[#c1121f]/10">
                      FORENSIC LOG
                    </span>
                  </div>

                  {/* Intentional Evidence Photographs Composition */}
                  <div className="relative space-y-4 sm:space-y-5">
                    {/* Primary Hero Photograph */}
                    <figure className="relative bg-[#e8e0cf] p-2.5 pb-8 shadow-[0_16px_35px_rgba(0,0,0,0.85)] border border-[#d6cebe] transition-all duration-300 hover:scale-[1.02] hover:z-20 hover:shadow-[0_20px_45px_rgba(193,18,31,0.25)] -rotate-[1deg]">
                      {/* Red Evidence Pin */}
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#c1121f] border-2 border-black/80 shadow-[0_3px_6px_rgba(0,0,0,0.9)] z-10 flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-white/70" />
                      </div>
                      <div className="relative overflow-hidden aspect-[16/9] w-full bg-[#121215]">
                        <img
                          src={IMG.nursery}
                          alt="The Nursery"
                          draggable={false}
                          onError={hideCardOnError}
                          className="h-full w-full object-cover grayscale-[30%] contrast-[110%]"
                        />
                        <div className="absolute top-2 right-2 bg-black/75 px-1.5 py-0.5 border border-[#c1121f]/50 text-[8px] font-mono uppercase tracking-widest text-[#e8e0cf]">
                          EX-01 · NURSERY
                        </div>
                      </div>
                      <figcaption className="absolute bottom-1.5 left-2.5 right-2.5 truncate font-display text-[13px] sm:text-[14px] text-[#2c1414] tracking-wide">
                        the nursery — do not touch the doll
                      </figcaption>
                    </figure>

                    {/* Dual Supporting Photographs with Controlled Offset */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-1">
                      {/* Secondary Photo: Chapel */}
                      <figure className="relative bg-[#e8e0cf] p-2 pb-7 shadow-[0_12px_30px_rgba(0,0,0,0.8)] border border-[#d6cebe] transition-all duration-300 hover:scale-[1.03] hover:rotate-0 hover:z-20 hover:shadow-[0_18px_40px_rgba(193,18,31,0.2)] rotate-[1.5deg]">
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#c1121f] border-2 border-black/80 shadow-[0_2px_5px_rgba(0,0,0,0.9)] z-10 flex items-center justify-center">
                          <div className="w-0.5 h-0.5 rounded-full bg-white/70" />
                        </div>
                        <div className="relative overflow-hidden aspect-[4/3] w-full bg-[#121215]">
                          <img
                            src={IMG.chapel}
                            alt="The Chapel"
                            draggable={false}
                            onError={hideCardOnError}
                            className="h-full w-full object-cover grayscale-[35%]"
                          />
                          <div className="absolute bottom-1.5 left-1.5 bg-black/80 px-1 py-0.2 text-[7px] font-mono text-[#e8e0cf]">
                            EX-02
                          </div>
                        </div>
                        <figcaption className="absolute bottom-1 left-2 right-2 truncate font-display text-[11px] sm:text-[12px] text-[#2c1414]">
                          her altar. candles are hers
                        </figcaption>
                      </figure>

                      {/* Tertiary Photo: Basement */}
                      <figure className="relative bg-[#e8e0cf] p-2 pb-7 shadow-[0_12px_30px_rgba(0,0,0,0.8)] border border-[#d6cebe] transition-all duration-300 hover:scale-[1.03] hover:rotate-0 hover:z-20 hover:shadow-[0_18px_40px_rgba(193,18,31,0.2)] -rotate-[2deg]">
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#c1121f] border-2 border-black/80 shadow-[0_2px_5px_rgba(0,0,0,0.9)] z-10 flex items-center justify-center">
                          <div className="w-0.5 h-0.5 rounded-full bg-white/70" />
                        </div>
                        <div className="relative overflow-hidden aspect-[4/3] w-full bg-[#121215]">
                          <img
                            src={IMG.basement}
                            alt="The Cellar"
                            draggable={false}
                            onError={hideCardOnError}
                            className="h-full w-full object-cover grayscale-[35%]"
                          />
                          <div className="absolute bottom-1.5 left-1.5 bg-black/80 px-1 py-0.2 text-[7px] font-mono text-[#e8e0cf]">
                            EX-03
                          </div>
                        </div>
                        <figcaption className="absolute bottom-1 left-2 right-2 truncate font-display text-[11px] sm:text-[12px] text-[#2c1414]">
                          where they put him. he knocks
                        </figcaption>
                      </figure>
                    </div>
                  </div>

                  {/* Forensic Document Sub-note */}
                  <div className="mt-4 pt-3 border-t border-[#e8e0cf]/10 flex items-center justify-between text-[9px] font-mono text-[#e8e0cf]/40">
                    <span>RECOVERED FROM CELLAR HATCH</span>
                    <span className="text-[#c1121f]">CORONER CERTIFIED</span>
                  </div>
                </div>
              </div>

            </div>
          </main>

          {/* Bottom Horror Status Ticker (Fixed, Non-colliding, Responsive) */}
          <footer className="fixed bottom-0 left-0 right-0 z-20 overflow-hidden border-t border-[#c1121f]/25 bg-[#050506]/92 backdrop-blur-md py-2 select-none">
            <div className="marquee whitespace-nowrap text-[10px] sm:text-[11px] tracking-[0.35em] text-[#c1121f]/80 font-mono">
              <span>{TICKER}</span>
              <span>{TICKER}</span>
            </div>
          </footer>
        </div>
      )}

      {/* ================= INTRO STORY ================= */}
      {screen === 'intro' && (
        <div
          className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#050506] px-6"
          onClick={() => {
            if (introIdx >= INTRO_CARDS.length - 1) startGame();
            else {
              horror.tick();
              setIntroIdx((i) => i + 1);
            }
          }}
        >
          <div className="fog fog-a" />
          <div className="fog fog-b" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'radial-gradient(circle, rgba(193,18,31,0.07), transparent 60%)' }} />

          <p className="mb-6 text-[10px] uppercase tracking-[0.5em] text-[#c1121f]">
            Case file 1889-HH &nbsp;·&nbsp; card {introIdx + 1} of {INTRO_CARDS.length}
          </p>

          <div key={introIdx} className="fade-up relative max-w-2xl">
            <div className="absolute -left-4 -top-4 h-8 w-8 border-l-2 border-t-2 border-[#c1121f]/50" />
            <div className="absolute -bottom-4 -right-4 h-8 w-8 border-b-2 border-r-2 border-[#c1121f]/50" />
            <div className="border border-[#e8e0cf]/10 bg-black/60 px-8 py-10 sm:px-12">
              <p className="font-display text-2xl text-[#c1121f] sm:text-4xl" style={{ textShadow: '0 0 24px rgba(193,18,31,0.4)' }}>
                {INTRO_CARDS[introIdx].kicker}
              </p>
              <p className="mt-5 text-sm leading-relaxed text-[#e8e0cf]/80 sm:text-base">{INTRO_CARDS[introIdx].body}</p>
            </div>
          </div>

          <div className="mt-10 flex items-center gap-2">
            {INTRO_CARDS.map((_, i) => (
              <span key={i} className={`h-1.5 w-6 transition-colors duration-300 ${i <= introIdx ? 'bg-[#c1121f]' : 'bg-[#e8e0cf]/15'}`} />
            ))}
          </div>

          <p className="blink-soft mt-6 text-[11px] uppercase tracking-[0.35em] text-[#e8e0cf]/50">
            {introIdx >= INTRO_CARDS.length - 1 ? 'click to step inside' : 'click — or press E — to continue'}
          </p>

          <button
            onClick={(e) => {
              e.stopPropagation();
              startGame();
            }}
            className="absolute bottom-6 right-6 border border-[#e8e0cf]/20 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-[#e8e0cf]/50 transition-colors hover:border-[#c1121f] hover:text-[#e8e0cf]"
          >
            Skip the tale
          </button>
        </div>
      )}

      {/* ================= GAME ================= */}
      {inGame && (
        <>
          <canvas ref={canvasRef} className="pixelated absolute inset-0 h-full w-full" />
          {/* crisp full-res flashlight viewmodel + volumetric beam */}
          <canvas ref={viewRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" />

          {/* low-sanity blood vignette */}
          {sanity <= 35 && <div className="blood-vignette pointer-events-none absolute inset-0 z-20" />}

          {/* chased banner */}
          {chased && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 text-center">
              <p className="font-display blink-soft text-3xl text-[#c1121f] sm:text-5xl" style={{ textShadow: '0 0 30px rgba(193,18,31,0.9)' }}>
                SHE IS COMING
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.4em] text-[#e8e0cf]/70">run to the front door</p>
            </div>
          )}

          {/* seal burn bar */}
          {sealProgress > 0 && sealProgress < 1 && (
            <div className="pointer-events-none absolute bottom-[30%] left-1/2 z-30 w-64 -translate-x-1/2">
              <p className="mb-1 text-center text-[10px] uppercase tracking-[0.35em] text-[#ff9e4a]">the seal burns</p>
              <div className="h-1.5 border border-[#ff9e4a]/50 bg-black/70">
                <div className="h-full bg-[#ff9e4a]" style={{ width: `${Math.round(sealProgress * 100)}%` }} />
              </div>
            </div>
          )}

          {/* crosshair */}
          <svg className={`pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 transition-all duration-150 ${prompt ? 'scale-150 opacity-100' : 'opacity-70'}`} width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M9 1v5M9 12v5M1 9h5M12 9h5" stroke={prompt ? '#c1121f' : '#e8e0cf'} strokeWidth="1" />
            <circle cx="9" cy="9" r="1" fill="#c1121f" />
          </svg>

          {/* interact prompt */}
          {prompt && !paused && (
            <div className="pointer-events-none absolute bottom-[20%] left-1/2 z-30 -translate-x-1/2">
              <div className="border border-[#c1121f]/50 bg-black/80 px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#e8e0cf] shadow-[0_0_24px_rgba(193,18,31,0.3)] sm:text-sm">
                {prompt}
              </div>
            </div>
          )}

          {/* chapter letterbox */}
          {storyMsg && !paused && (
            <div key={storyMsg.id} className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
              <div className="story-bar border-t border-[#c1121f]/30 bg-black/90 px-6 py-4 text-center">
                <p className="font-display text-lg tracking-wide text-[#c1121f] sm:text-2xl" style={{ textShadow: '0 0 20px rgba(193,18,31,0.45)' }}>
                  {storyMsg.title}
                </p>
                <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-[#e8e0cf]/85 sm:text-sm">{storyMsg.line}</p>
              </div>
            </div>
          )}

          {/* first hint */}
          {hint && !paused && (
            <div className="pointer-events-none absolute left-1/2 top-[62%] z-30 -translate-x-1/2 text-center text-[11px] uppercase tracking-[0.3em] text-[#e8e0cf]/55">
              {isTouch ? 'drag to look — use the pad to move' : 'hold mouse / wasd — walk · click / e — interact · f — flashlight · shift — run'}
            </div>
          )}

          {/* top-left: identity + sanity + candles */}
          <div className="pointer-events-none absolute left-4 top-4 z-30">
            <p className="text-[9px] uppercase tracking-[0.4em] text-[#c1121f]">Now haunting</p>
            <h2 className="font-display text-2xl leading-none text-[#e8e0cf] sm:text-3xl" style={{ textShadow: '0 0 22px rgba(193,18,31,0.45)' }}>
              Hollow House
            </h2>
            <div className="mt-2 w-40 sm:w-48">
              <div className="flex justify-between text-[9px] uppercase tracking-[0.25em] text-[#e8e0cf]/60">
                <span>Sanity</span>
                <span className={sanity <= 25 ? 'text-[#c1121f] blink-soft' : ''}>{sanity}</span>
              </div>
              <div className="mt-0.5 h-1.5 border border-[#e8e0cf]/25 bg-black/60">
                <div className={`h-full transition-all duration-500 ${sanityColor}`} style={{ width: `${sanity}%` }} />
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[#e8e0cf]/50">
              {[0, 1, 2].map((i) => <CandleIcon key={i} lit={i < candlesLit} />)}
              <span className="ml-1 text-[9px] uppercase tracking-[0.25em]">{candlesLit}/3 candles</span>
            </div>

            {/* stamina + battery */}
            <div className="mt-2 w-40 space-y-1.5 sm:w-48">
              <div>
                <div className="flex justify-between text-[8px] uppercase tracking-[0.25em] text-[#e8e0cf]/45">
                  <span>Stamina</span>
                  <span>{stamina}</span>
                </div>
                <div className="mt-0.5 h-1 border border-[#e8e0cf]/20 bg-black/60">
                  <div className={`h-full transition-all duration-300 ${stamina > 30 ? 'bg-[#7a8b6f]' : 'bg-[#d9822b]'}`} style={{ width: `${stamina}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[8px] uppercase tracking-[0.25em] text-[#e8e0cf]/45">
                  <span>Flashlight</span>
                  <span className={battery <= 15 ? 'text-[#c1121f] blink-soft' : ''}>{battery}%</span>
                </div>
                <div className="mt-0.5 h-1 border border-[#e8e0cf]/20 bg-black/60">
                  <div className={`h-full transition-all duration-300 ${battery > 40 ? 'bg-[#d9c26a]' : battery > 15 ? 'bg-[#d9822b]' : 'bg-[#c1121f]'}`} style={{ width: `${battery}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* EMF reader */}
          <div className="pointer-events-none absolute bottom-24 right-4 z-30 flex flex-col items-end gap-1.5 sm:bottom-20">
            <span className="text-[8px] uppercase tracking-[0.3em] text-[#e8e0cf]/45">EMF</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((lvl) => {
                const on = emf >= lvl - 0.35;
                const col = lvl <= 2 ? '#7a8b6f' : lvl === 3 ? '#d9c26a' : '#c1121f';
                return (
                  <span
                    key={lvl}
                    className="h-4 w-2 border border-[#e8e0cf]/20 transition-all duration-200"
                    style={{ background: on ? col : 'rgba(0,0,0,0.55)', boxShadow: on ? `0 0 8px ${col}` : 'none' }}
                  />
                );
              })}
            </div>
          </div>

          {/* top-right: timer / mute / rites */}
          <div className="pointer-events-auto absolute right-4 top-4 z-40 flex items-center gap-2">
            <div className="border border-[#e8e0cf]/20 bg-black/60 px-2.5 py-1.5 text-sm tabular-nums text-[#e8e0cf]/80">{fmt(elapsed)}</div>
            {isTouch && (
              <button onClick={() => applyPause(true)} className="border border-[#e8e0cf]/20 bg-black/60 p-2 text-[#e8e0cf]/80 transition-colors hover:border-[#c1121f] hover:text-[#c1121f]" title="Pause" aria-label="Pause">
                <PauseIcon />
              </button>
            )}
            <button onClick={toggleMute} className="border border-[#e8e0cf]/20 bg-black/60 p-2 text-[#e8e0cf]/80 transition-colors hover:border-[#c1121f] hover:text-[#c1121f]" title="Mute">
              <SpeakerIcon muted={muted} />
            </button>
          </div>

          {/* rites ledger */}
          <div className="pointer-events-none absolute right-0 top-[70px] z-30 w-[290px] max-w-[86vw] border-b border-l border-t border-[#c1121f]/30 bg-black/85 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg text-[#c1121f]">The Seven Rites</h3>
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-[#e8e0cf]/50">
                <SkullIcon /> {doneCount}/{MISSIONS.length}
              </span>
            </div>
            <ol className="space-y-2.5">
              {missions.map((m, i) => {
                const current = i === missions.findIndex((x) => !x.done);
                return (
                  <li key={m.id} className="flex gap-2.5 text-[11.5px] leading-snug">
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border text-[9px] ${m.done ? 'border-[#7a8b6f] text-[#7a8b6f]' : current ? 'border-[#c1121f] text-[#c1121f]' : 'border-[#e8e0cf]/25 text-[#e8e0cf]/30'}`}>
                      {m.done ? '✓' : i + 1}
                    </span>
                    <span className={m.done ? 'text-[#e8e0cf]/35 line-through' : current ? 'text-[#e8e0cf]' : 'text-[#e8e0cf]/45'}>{m.text}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* whisper log */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-30 max-w-md space-y-1.5 pr-4">
            {log.slice(-4).map((l, i, arr) => (
              <p key={l.id} className="text-[11px] leading-snug sm:text-xs" style={{ opacity: 0.3 + 0.7 * ((i + 1) / arr.length) }}>
                <span className="text-[#c1121f]">»&nbsp;</span>
                <span className="text-[#e8e0cf]/85">{l.text}</span>
              </p>
            ))}
          </div>

          {/* bottom-right: minimap + inventory */}
          <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2">
            <div className="border border-[#e8e0cf]/20 bg-black/70 p-1">
              {/* 288 backing store — the engine draws it at 2x and the inline
                  style scales it back down, so the map stays crisp on any display */}
              <canvas ref={miniRef} width={288} height={288} className="block" style={{ width: isTouch ? 100 : 144, height: isTouch ? 100 : 144 }} />
              <p className="mt-0.5 text-center text-[8px] uppercase tracking-[0.3em] text-[#e8e0cf]/40">the house</p>
            </div>
            <div className="flex gap-2">
              {(['iron-key', 'locket', 'sigil'] as const).map((id) => {
                const has = inv.includes(id);
                return (
                  <div
                    key={id}
                    title={has ? `${ITEMS[id].name} — ${ITEMS[id].desc}` : 'Empty pocket'}
                    className={`flex h-11 w-11 items-center justify-center border transition-all duration-300 ${has ? 'border-[#c1121f]/70 bg-[#c1121f]/10 text-[#e8e0cf] shadow-[0_0_18px_rgba(193,18,31,0.35)]' : 'border-dashed border-[#e8e0cf]/20 bg-black/50 text-[#e8e0cf]/20'}`}
                  >
                    <ItemIcon id={id} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* touch controls */}
          {isTouch && (
            <div className="absolute bottom-6 left-4 z-40">
              <div className="grid w-[168px] grid-cols-3 gap-1.5">
                <div />
                <DPadBtn label="▲" code="KeyW" onKey={onKey} />
                <div />
                <DPadBtn label="◀" code="KeyA" onKey={onKey} />
                <DPadBtn label="▼" code="KeyS" onKey={onKey} />
                <DPadBtn label="▶" code="KeyD" onKey={onKey} />
              </div>
            </div>
          )}
          {isTouch && (
            <>
              <button
                onPointerDown={(e) => { e.preventDefault(); onTapInteract(); }}
                className="absolute bottom-[190px] right-5 z-40 h-16 w-16 rounded-full border-2 border-[#c1121f] bg-[#c1121f]/20 font-display text-2xl text-[#e8e0cf] active:bg-[#c1121f]"
                aria-label="Interact"
              >
                E
              </button>
              <button
                onPointerDown={(e) => { e.preventDefault(); onKey('ShiftLeft', true); }}
                onPointerUp={() => onKey('ShiftLeft', false)}
                onPointerLeave={() => onKey('ShiftLeft', false)}
                onPointerCancel={() => onKey('ShiftLeft', false)}
                className="absolute bottom-[196px] right-[86px] z-40 flex h-14 w-14 items-center justify-center rounded-full border border-[#e8e0cf]/25 bg-black/60 text-[9px] uppercase tracking-[0.15em] text-[#e8e0cf]/80 active:border-[#c1121f] active:bg-[#c1121f]/25"
                aria-label="Hold to sprint"
              >
                Run
              </button>
              <button
                onPointerDown={(e) => { e.preventDefault(); onToggleTorch(); }}
                className="absolute bottom-[262px] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-[#e8e0cf]/25 bg-black/60 text-[#e8e0cf]/80 active:border-[#ff9e4a] active:bg-[#ff9e4a]/25"
                aria-label="Toggle flashlight"
              >
                <TorchIcon />
              </button>
            </>
          )}

          {/* pause overlay */}
          {paused && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85">
              <div className="fade-up max-w-md px-6 text-center">
                <h2 className="font-display text-5xl text-[#c1121f]" style={{ textShadow: '0 0 40px rgba(193,18,31,0.6)' }}>The house waits</h2>
                <p className="mt-3 text-xs leading-relaxed text-[#e8e0cf]/60">
                  She does not. Pausing does not move her farther away.
                </p>
                <div className="mx-auto mt-6 max-w-xs space-y-1.5 text-left text-[11px] uppercase tracking-[0.2em] text-[#e8e0cf]/50">
                  <p>W A S D — walk&nbsp;&nbsp;·&nbsp;&nbsp;hold mouse — walk</p>
                  <p>mouse — look&nbsp;&nbsp;·&nbsp;&nbsp;E / click — interact</p>
                  <p>shift — run&nbsp;&nbsp;·&nbsp;&nbsp;arrows — turn&nbsp;&nbsp;·&nbsp;&nbsp;P / esc — pause</p>
                  {isTouch && <p className="text-[#e8e0cf]/40">on glass — pad to walk&nbsp;&nbsp;·&nbsp;&nbsp;drag to look&nbsp;&nbsp;·&nbsp;&nbsp;run / torch / E to act</p>}
                </div>
                <div className="mt-7 flex justify-center gap-3">
                  <button
                    onClick={() => applyPause(false)}
                    className="border-2 border-[#c1121f] bg-[#c1121f]/10 px-6 py-3 text-xs uppercase tracking-[0.3em] text-[#e8e0cf] transition-colors hover:bg-[#c1121f] hover:text-[#050506]"
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => startGame()}
                    className="border border-[#ff9e4a]/50 bg-[#ff9e4a]/10 px-6 py-3 text-xs uppercase tracking-[0.3em] text-[#e8e0cf]/85 transition-colors hover:bg-[#ff9e4a]/25"
                  >
                    Restart night
                  </button>
                  <button
                    onClick={() => { applyPause(false); setScreen('title'); }}
                    className="border border-[#e8e0cf]/20 px-6 py-3 text-xs uppercase tracking-[0.3em] text-[#e8e0cf]/60 transition-colors hover:border-[#e8e0cf]/50 hover:text-[#e8e0cf]"
                  >
                    Flee
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================= DEAD ================= */}
      {screen === 'dead' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-[#050506]">
          <img src={IMG.scare} alt="" draggable={false} onError={hideOnError} className="die-zoom absolute inset-0 h-full w-full object-cover opacity-20" />
          <div className="blood-vignette pointer-events-none absolute inset-0" />
          <div className="fade-up relative z-10 max-w-xl px-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.4em] text-[#e8e0cf]/50">
              {deathCause === 'caught' ? 'She caught you' : 'Sanity extinguished'} — {fmt(elapsed)} inside the house · {DIFFS[diff].label}
            </p>
            <h1 className="font-display mt-4 text-7xl leading-none text-[#c1121f] sm:text-8xl" style={{ textShadow: '0 0 50px rgba(193,18,31,0.7)' }}>
              {deathCause === 'caught' ? 'She has you' : 'Your mind gave out'}
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-[#e8e0cf]/70">
              {deathCause === 'caught'
                ? 'Her hands are colder than the key. The last thing you hear is the front door, locking itself from the inside — for the next visitor.'
                : 'They will find your body in the morning, seated in the nursery. Your eyes will be open. The doll will be holding your hand.'}
            </p>
            <div className="mx-auto mt-7 grid max-w-md grid-cols-3 gap-3 text-center">
              {[
                { k: 'Time survived', v: fmt(elapsed) },
                { k: 'Jumpscares endured', v: String(scareCount) },
                { k: 'Rites completed', v: `${doneCount}/${MISSIONS.length}` },
              ].map((s) => (
                <div key={s.k} className="border border-[#e8e0cf]/15 bg-black/50 px-2 py-3">
                  <div className="font-display text-2xl text-[#e8e0cf]">{s.v}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-[#e8e0cf]/45">{s.k}</div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button onClick={startGame} className="border-2 border-[#c1121f] bg-[#c1121f]/10 px-7 py-3 text-xs uppercase tracking-[0.3em] text-[#e8e0cf] transition-colors hover:bg-[#c1121f] hover:text-[#050506]">
                ↻ Restart
              </button>
              <button onClick={() => setScreen('title')} className="border border-[#e8e0cf]/20 px-7 py-3 text-xs uppercase tracking-[0.3em] text-[#e8e0cf]/60 transition-colors hover:border-[#e8e0cf]/50 hover:text-[#e8e0cf]">
                Main menu
              </button>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.25em] text-[#e8e0cf]/35">She is already resetting the house for you</p>
          </div>
        </div>
      )}

      {/* ================= ESCAPED ================= */}
      {screen === 'escaped' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-[#07080d]">
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#07080d] to-black" />
          <div className="fog fog-a" />
          <div className="fade-up relative z-10 max-w-xl px-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.4em] text-[#7a8b6f]">Dawn — the seal is broken</p>
            <h1 className="font-display mt-4 text-7xl leading-none text-[#e8e0cf] sm:text-8xl" style={{ textShadow: '0 0 50px rgba(232,224,207,0.25)' }}>
              You escaped
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-[#e8e0cf]/65">
              The door bursts open onto cold night air and you do not stop running until the house is a silhouette.
              You are out. But she looked at your face for a long time tonight — <span className="text-[#c1121f]">and she remembers it.</span>
            </p>
            <div className="mx-auto mt-7 grid max-w-lg grid-cols-2 gap-3 text-center sm:grid-cols-4">
              {[
                { k: 'Time inside', v: fmt(elapsed) },
                { k: 'Jumpscares survived', v: String(scareCount) },
                { k: 'Sanity remaining', v: `${sanity}%` },
                { k: record ? 'Fastest escape — new record' : 'Fastest escape', v: best !== null ? fmt(best) : '—' },
              ].map((s) => (
                <div key={s.k} className="border border-[#e8e0cf]/15 bg-black/40 px-2 py-3">
                  <div className="font-display text-2xl text-[#e8e0cf]">{s.v}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-[#e8e0cf]/45">{s.k}</div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button onClick={startGame} className="border-2 border-[#c1121f] bg-[#c1121f]/10 px-7 py-3 text-xs uppercase tracking-[0.3em] text-[#e8e0cf] transition-colors hover:bg-[#c1121f] hover:text-[#050506]">
                ↻ Play again
              </button>
              <button onClick={() => setScreen('title')} className="border border-[#e8e0cf]/20 px-7 py-3 text-xs uppercase tracking-[0.3em] text-[#e8e0cf]/60 transition-colors hover:border-[#e8e0cf]/50 hover:text-[#e8e0cf]">
                Main menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* runtime error surfacing */}
      {error && (
        <div className="absolute left-1/2 top-1/2 z-[80] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 border-2 border-[#c1121f] bg-black/95 p-5 text-center">
          <p className="font-display text-2xl text-[#c1121f]">The house broke</p>
          <p className="mt-2 break-words text-xs text-[#e8e0cf]/70">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 border border-[#e8e0cf]/30 px-5 py-2 text-[10px] uppercase tracking-[0.3em] text-[#e8e0cf] hover:border-[#c1121f]">
            Rebuild it
          </button>
        </div>
      )}

      {/* toast */}
      {msg && (
        <div key={msg.id} className="toast-in pointer-events-none absolute left-1/2 top-16 z-[70] w-[92vw] max-w-xl -translate-x-1/2 sm:top-20">
          <div className="border border-[#c1121f]/40 bg-black/90 px-5 py-3 text-center text-xs leading-relaxed text-[#e8e0cf]/90 shadow-[0_0_40px_rgba(193,18,31,0.25)] sm:text-sm">
            {msg.text}
          </div>
        </div>
      )}

      {/* atmosphere */}
      <div className="scanlines pointer-events-none absolute inset-0 z-[60]" />
      <div className="grain pointer-events-none absolute inset-0 z-[60]" />
      <div className="vignette pointer-events-none absolute inset-0 z-[60]" />
      {flashKey > 0 && (
        <div key={`hf-${flashKey}`} className="hit-flash pointer-events-none absolute inset-0 z-[80]" style={{ background: 'radial-gradient(circle at 50% 45%, rgba(255,240,230,0.75), rgba(255,60,40,0.4) 55%, rgba(120,10,10,0.6))' }} />
      )}

      <Jumpscare scareKey={screen === 'dead' ? 0 : scareKey} onDone={() => setScareKey(0)} />
    </div>
  );
}
