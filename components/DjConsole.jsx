'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useShow } from '@/app/show-context';
import { DjEngine } from '@/lib/djEngine';
import { previewQueries } from '@/lib/searchQuery';
import { formatTime } from './ui';

/* ------------------------------------------------------------- controls */

function Knob({ label, value, min, max, step = 0.1, unit = '', onChange, centre = false, disabled }) {
  return (
    <label className={`block min-w-0 ${disabled ? 'opacity-40' : ''}`}>
      <span className="flex items-baseline justify-between gap-1">
        <span className="text-[9px] tracking-[0.16em] uppercase text-white/40 truncate">{label}</span>
        <span className="text-[9px] tabular-nums text-white/55 flex-none">
          {centre && value > 0 ? '+' : ''}
          {Math.round(value * 10) / 10}
          {unit}
        </span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="fader mt-1 w-full"
      />
    </label>
  );
}

function Pad({ children, on, onClick, onPointerDown, onPointerUp, title, label, className = '', disabled }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      className={`rounded-lg text-[10px] font-semibold uppercase tracking-wide px-2 py-2 transition border min-w-0 ${
        on
          ? 'bg-white/90 text-black border-white'
          : 'bg-white/[0.04] text-white/70 border-white/10 hover:bg-white/10'
      } ${disabled ? 'opacity-35 pointer-events-none' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- deck */

function Deck({ side, state, engine, strip, setStrip, onLoad, onFile, onSync, position, queue }) {
  const deck = engine?.deck(side);
  const dur = state.duration || 0;
  const pct = dur ? Math.min(100, (position / dur) * 100) : 0;
  const accent = side === 'A' ? '#38e8ff' : '#ff3d81';

  const held = useRef(false);
  const nudge = (mult) => {
    if (!deck) return;
    deck.setNudge(mult);
    if (!held.current) {
      held.current = true;
      const release = () => {
        deck.setNudge(1);
        held.current = false;
        window.removeEventListener('pointerup', release);
      };
      window.addEventListener('pointerup', release);
    }
  };

  return (
    <div className="panel p-3 sm:p-4 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-black tracking-[0.2em]" style={{ color: accent }}>
          DECK {side}
        </span>
        <span className="text-[9px] uppercase tracking-[0.16em] text-white/35">
          {state.loading ? 'loading…' : state.mode === 'buffer' ? 'buffer' : state.mode === 'synth' ? 'synth' : 'empty'}
        </span>
      </div>

      <select
        aria-label={`Deck ${side} track`}
        className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-[12px] min-w-0"
        value=""
        onChange={(e) => e.target.value && onLoad(side, e.target.value)}
      >
        <option value="">Load a track…</option>
        {queue.map((t) => (
          <option key={t.uid} value={t.uid}>
            {t.title} — {t.artist}
          </option>
        ))}
      </select>

      <label className="block">
        <span className="sr-only">{`Deck ${side} file`}</span>
        <input
          type="file"
          accept="audio/*"
          aria-label={`Deck ${side} file`}
          onChange={(e) => e.target.files?.[0] && onFile(side, e.target.files[0])}
          className="block w-full text-[10px] text-white/45 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[10px] file:text-white/80"
        />
      </label>

      <div className="min-w-0">
        <p className="text-[12px] truncate">{state.track ? state.track.title : '—'}</p>
        <p className="text-[10px] text-white/40 truncate">{state.track ? state.track.artist : 'no track loaded'}</p>
        {state.error ? <p className="text-[10px] text-rose-300 mt-1">{state.error}</p> : null}
      </div>

      {/* Position + beat grid */}
      <div>
        <div className="h-8 rounded-md bg-black/50 border border-white/10 relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 opacity-30" style={{ width: `${pct}%`, background: accent }} />
          {state.hotCues.map((c, i) =>
            c === null ? null : (
              <span
                key={i}
                className="absolute inset-y-0 w-px bg-amber-300"
                style={{ left: `${dur ? (c / dur) * 100 : 0}%` }}
              />
            )
          )}
          {state.loop ? (
            <span
              className="absolute inset-y-0 bg-emerald-400/25 border-x border-emerald-300/70"
              style={{
                left: `${dur ? (state.loop.start / dur) * 100 : 0}%`,
                width: `${dur ? ((state.loop.end - state.loop.start) / dur) * 100 : 0}%`,
              }}
            />
          ) : null}
          <span className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[9px] tabular-nums text-white/40 mt-1">
          <span>{formatTime(position)}</span>
          <span>
            {state.bpm ? `${state.liveBpm.toFixed(1)} BPM` : 'no tempo'}
            {state.bpm && state.confidence < 0.35 ? ' ?' : ''}
          </span>
          <span>{formatTime(dur)}</span>
        </div>
      </div>

      {/* Transport */}
      <div className="grid grid-cols-4 gap-1.5">
        <Pad
          onPointerDown={() => deck?.cuePress()}
          onPointerUp={() => deck?.cueRelease()}
          title="Hold to preview from the cue point"
          disabled={!state.mode}
        >
          Cue
        </Pad>
        <Pad onClick={() => deck?.setCue()} title="Set the cue point here" disabled={!state.mode}>
          Set
        </Pad>
        <Pad label={`Deck ${side} play`} on={state.playing} onClick={() => deck?.toggle()} disabled={!state.mode} className="col-span-2">
          {state.playing ? 'Pause' : 'Play'}
        </Pad>
      </div>

      {/* Jog + sync */}
      <div className="grid grid-cols-4 gap-1.5">
        <Pad onPointerDown={() => nudge(0.94)} title="Nudge back" disabled={!state.canLoop}>
          ◀◀
        </Pad>
        <Pad onPointerDown={() => nudge(1.06)} title="Nudge forward" disabled={!state.canLoop}>
          ▶▶
        </Pad>
        <Pad label={`Deck ${side} sync`} onClick={() => onSync(side)} title="Match tempo and phase to the other deck" disabled={!state.bpm} className="col-span-2">
          Sync
        </Pad>
      </div>

      <Knob
        label={`Deck ${side} tempo`}
        value={Math.round((state.pitch - 1) * 1000) / 10}
        min={-16}
        max={16}
        step={0.1}
        unit="%"
        centre
        disabled={!state.canLoop}
        onChange={(v) => deck?.setPitch(v)}
      />

      {/* Hot cues */}
      <div>
        <p className="text-[9px] tracking-[0.16em] uppercase text-white/40 mb-1">Hot cues</p>
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <Pad
              key={i}
              label={`Deck ${side} hot cue ${i + 1}`}
              on={state.hotCues[i] !== null}
              disabled={!state.mode}
              onClick={() => (state.hotCues[i] === null ? deck?.setHotCue(i) : deck?.jumpHotCue(i))}
              title={state.hotCues[i] === null ? 'Store the playhead here' : `Jump to ${formatTime(state.hotCues[i])}`}
            >
              {i + 1}
            </Pad>
          ))}
        </div>
      </div>

      {/* Loops */}
      <div>
        <p className="text-[9px] tracking-[0.16em] uppercase text-white/40 mb-1">Loop (beats)</p>
        <div className="grid grid-cols-5 gap-1.5">
          {[1, 2, 4, 8].map((b) => (
            <Pad
              key={b}
              label={`Deck ${side} loop ${b} beats`}
              on={state.loop?.beats === b}
              disabled={!state.canLoop || !state.bpm}
              onClick={() => deck?.setLoop(b)}
            >
              {b}
            </Pad>
          ))}
          <Pad label={`Deck ${side} loop off`} disabled={!state.loop} onClick={() => deck?.clearLoop()}>
            Off
          </Pad>
        </div>
      </div>

      {/* Channel strip */}
      <div className="pt-1 border-t border-white/10 space-y-2">
        <Knob label={`Deck ${side} trim`} value={strip.trim} min={-12} max={12} step={0.5} unit="dB" centre onChange={(v) => setStrip('trim', v)} />
        <Knob label={`Deck ${side} high`} value={strip.high} min={-26} max={12} step={0.5} unit="dB" centre onChange={(v) => setStrip('high', v)} />
        <Knob label={`Deck ${side} mid`} value={strip.mid} min={-26} max={12} step={0.5} unit="dB" centre onChange={(v) => setStrip('mid', v)} />
        <Knob label={`Deck ${side} low`} value={strip.low} min={-26} max={12} step={0.5} unit="dB" centre onChange={(v) => setStrip('low', v)} />
        <Knob label={`Deck ${side} filter`} value={strip.filter} min={-1} max={1} step={0.02} centre onChange={(v) => setStrip('filter', v)} />
        <Knob label={`Deck ${side} channel`} value={strip.fader} min={0} max={1} step={0.01} onChange={(v) => setStrip('fader', v)} />
        <Pad label={`Deck ${side} headphone cue`} on={strip.cue} onClick={() => setStrip('cue', !strip.cue)} className="w-full">
          Headphone cue {strip.cue ? 'on' : 'off'}
        </Pad>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- console */

const emptyStrip = { trim: 0, low: 0, mid: 0, high: 0, filter: 0, fader: 0.85, cue: false };
const emptyDeck = {
  mode: null, track: null, playing: false, loading: false, error: '', bpm: 0, liveBpm: 0,
  confidence: 0, pitch: 1, cuePoint: 0, hotCues: [null, null, null, null], loop: null,
  duration: 0, canLoop: false,
};

export default function DjConsole({ onClose }) {
  const { engineRef, notify, queue } = useShow();
  const [engine, setEngine] = useState(null);
  const [A, setA] = useState(emptyDeck);
  const [B, setB] = useState(emptyDeck);
  const [stripA, setStripA] = useState(emptyStrip);
  const [stripB, setStripB] = useState(emptyStrip);
  const [xf, setXf] = useState(0.5);
  const [master, setMaster] = useState(0.9);
  const [cueSolo, setCueSolo] = useState(false);
  const [pos, setPos] = useState({ A: 0, B: 0 });
  const [level, setLevel] = useState(0);
  const engineRefLocal = useRef(null);

  /* Build the mixer on the show's own AudioContext, so the two never fight. */
  useEffect(() => {
    const player = engineRef.current;
    const ctx = player?.audioContext();
    if (!ctx) {
      notify('Web Audio is not available in this browser — the console needs it.');
      return;
    }
    ctx.resume?.().catch(() => {});
    const dj = new DjEngine(ctx, {
      onState: ({ deck }) => (deck.id === 'A' ? setA(deck) : setB(deck)),
    });
    dj.masterLevel = master;
    dj.setMaster(master);
    engineRefLocal.current = dj;
    setEngine(dj);
    return () => {
      dj.destroy();
      engineRefLocal.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Playhead ticker — the decks don't emit per frame, so poll them. */
  useEffect(() => {
    let raf;
    const tick = () => {
      const dj = engineRefLocal.current;
      if (dj) {
        setPos({ A: dj.A.position, B: dj.B.position });
        setLevel(dj.masterLevelNow());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* Push mixer state into the graph. */
  useEffect(() => {
    const dj = engineRefLocal.current;
    if (!dj) return;
    for (const [side, s] of [['A', stripA], ['B', stripB]]) {
      const d = dj.deck(side);
      d.setTrim(s.trim);
      d.setEq('low', s.low);
      d.setEq('mid', s.mid);
      d.setEq('high', s.high);
      d.setFilter(s.filter);
      d.setFader(s.fader);
      d.setCueEnabled(s.cue);
    }
  }, [stripA, stripB]);

  useEffect(() => {
    engineRefLocal.current?.crossfade(xf);
  }, [xf]);

  useEffect(() => {
    const dj = engineRefLocal.current;
    if (!dj) return;
    dj.masterLevel = master;
    if (!cueSolo) dj.setMaster(master);
  }, [master, cueSolo]);

  useEffect(() => {
    engineRefLocal.current?.setCueSolo(cueSolo);
  }, [cueSolo]);

  /* ------------------------------------------------------------- load */

  const loadInto = useCallback(
    async (side, uid) => {
      const dj = engineRefLocal.current;
      const track = queue.find((t) => t.uid === uid);
      if (!dj || !track) return;
      const deck = dj.deck(side);

      if (track.source === 'synth') {
        deck.loadSynth(track);
        return;
      }

      let url = track.previewUrl;
      if (!url) {
        // No preview on the record yet — resolve one. A YouTube track has no
        // mixable audio at all, so it gets matched to a preview by title.
        const queries = track.source === 'youtube' ? previewQueries(track) : [`${track.title} ${track.artist}`];
        for (const query of queries) {
          try {
            const res = await fetch('/api/tracks/resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: track.source === 'youtube' ? undefined : track.id, query }),
            });
            const data = await res.json();
            if (res.ok && data.resolved?.previewUrl) {
              url = data.resolved.previewUrl;
              break;
            }
          } catch {
            /* try the next query */
          }
        }
        if (track.source === 'youtube' && url) {
          notify('YouTube audio can’t be mixed — loaded a matching preview instead.');
        }
      }

      if (!url) {
        notify(`No mixable audio for “${track.title}”.`);
        return;
      }
      await deck.loadBuffer(track, url);
    },
    [queue, notify]
  );

  const loadFile = useCallback(async (side, file) => {
    const dj = engineRefLocal.current;
    if (!dj) return;
    await dj.deck(side).loadFile(file);
  }, []);

  const sync = useCallback(
    (side) => {
      const dj = engineRefLocal.current;
      if (!dj) return;
      const other = side === 'A' ? 'B' : 'A';
      if (!dj.sync(side, other)) notify('Both decks need a tempo before they can sync.');
    },
    [notify]
  );

  const setStrip = (side) => (key, value) =>
    (side === 'A' ? setStripA : setStripB)((s) => ({ ...s, [key]: value }));

  /* Esc closes, space plays whichever deck is louder in the mix. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/92 backdrop-blur-md overflow-y-auto scroll-thin">
      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 pb-24">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.24em] uppercase text-white/40">Performance</p>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">DJ console</h2>
            <p className="text-[11px] text-white/45 mt-1 leading-relaxed max-w-2xl">
              Two decks through a real signal path — trim, three-band EQ, filter and an equal-power crossfader.
              Tempo moves pitch with it: Web Audio has no time-stretch, so there is no key lock.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn !text-[11px] flex-none">
            Close
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] items-start">
          <Deck
            side="A"
            state={A}
            engine={engine}
            strip={stripA}
            setStrip={setStrip('A')}
            onLoad={loadInto}
            onFile={loadFile}
            onSync={sync}
            position={pos.A}
            queue={queue}
          />

          {/* Master section */}
          <div className="panel p-3 sm:p-4 space-y-4 lg:w-56 min-w-0">
            <p className="text-[11px] font-black tracking-[0.2em] text-white/70">MASTER</p>

            <div>
              <p className="text-[9px] tracking-[0.16em] uppercase text-white/40 mb-1">Crossfader</p>
              <input
                type="range"
                aria-label="Crossfader"
                min={0}
                max={1}
                step={0.01}
                value={xf}
                onChange={(e) => setXf(Number(e.target.value))}
                className="fader w-full"
              />
              <div className="flex justify-between text-[9px] text-white/40 mt-1">
                <span>A</span>
                <span>B</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                <Pad label="Crossfade to A" onClick={() => setXf(0)}>A</Pad>
                <Pad label="Crossfade centre" onClick={() => setXf(0.5)}>Mid</Pad>
                <Pad label="Crossfade to B" onClick={() => setXf(1)}>B</Pad>
              </div>
            </div>

            <Knob label="Master" value={master} min={0} max={1.2} step={0.01} onChange={setMaster} />

            <div>
              <p className="text-[9px] tracking-[0.16em] uppercase text-white/40 mb-1">Output</p>
              <div
                role="meter"
                aria-label="Master level"
                aria-valuenow={Math.round(level * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 rounded-full bg-black/60 border border-white/10 overflow-hidden"
              >
                <div
                  className="h-full transition-[width] duration-75"
                  style={{
                    width: `${Math.min(100, level * 140)}%`,
                    background: level > 0.72 ? '#ff4d4d' : level > 0.45 ? '#ffd400' : '#22ff88',
                  }}
                />
              </div>
            </div>

            <div>
              <Pad on={cueSolo} onClick={() => setCueSolo((v) => !v)} className="w-full">
                {cueSolo ? 'Monitoring cue' : 'Monitor cue bus'}
              </Pad>
              <p className="text-[9px] text-white/35 mt-1 leading-relaxed">
                One output device means proper pre-fader listening isn’t possible — this mutes the master and plays
                only the cued channels, so you can still find the drop before you bring it in.
              </p>
            </div>

            <div className="text-[9px] text-white/35 leading-relaxed border-t border-white/10 pt-3">
              <p className="mb-1">
                <span className="text-white/55">Tempo</span> is detected from the audio when the track doesn’t carry a
                BPM. A “?” next to it means the detector wasn’t confident — tap Sync anyway, or set the tempo by ear.
              </p>
              <p>
                <span className="text-white/55">YouTube</span> tracks can’t be mixed. The console swaps in a matching
                preview so the deck still has audio.
              </p>
            </div>
          </div>

          <Deck
            side="B"
            state={B}
            engine={engine}
            strip={stripB}
            setStrip={setStrip('B')}
            onLoad={loadInto}
            onFile={loadFile}
            onSync={sync}
            position={pos.B}
            queue={queue}
          />
        </div>
      </div>
    </div>
  );
}
