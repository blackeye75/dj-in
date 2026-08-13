'use client';

import { useState } from 'react';
import { useShow } from '@/app/show-context';
import { usePlayhead } from './usePlayhead';
import { formatTime, Panel } from './ui';

const SOURCE_BADGE = {
  synth: 'House Deck',
  itunes: 'Preview',
  spotify: 'Spotify',
  youtube: 'YouTube',
  url: 'Direct',
};

export default function PlayerDeck() {
  const { current, playerState, toggle, next, prev, seek, setVolume, shuffle, setShuffle, repeat, cycleRepeat, theme } =
    useShow();
  const { position, duration } = usePlayhead();
  const [scrub, setScrub] = useState(null);

  const shown = scrub != null ? scrub : position;
  const pct = duration > 0 ? (shown / duration) * 100 : 0;

  return (
    <Panel className="h-full flex flex-col" title="Deck">
      <div className="flex gap-4">
        <div
          className="relative w-24 h-24 md:w-28 md:h-28 rounded-xl overflow-hidden flex-none border border-white/10"
          style={{ boxShadow: `0 0 30px -8px ${theme.accent}` }}
        >
          {current?.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.artworkUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full grid place-items-center text-3xl"
              style={{ background: `linear-gradient(135deg, ${theme.palette[0]}44, ${theme.palette[1] || theme.palette[0]}22)` }}
            >
              {theme.icon}
            </div>
          )}
          {playerState.playing ? (
            <span className="absolute bottom-1 left-1 flex items-end gap-[2px] h-4">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-[3px] bg-white/90 rounded-sm"
                  style={{
                    height: `${6 + i * 4}px`,
                    animation: `marquee ${0.6 + i * 0.2}s ease-in-out infinite alternate`,
                    transformOrigin: 'bottom',
                  }}
                />
              ))}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border border-white/10 text-white/50">
              {SOURCE_BADGE[current?.source] || 'Idle'}
            </span>
            {playerState.analysable ? (
              <span className="text-[9px] tracking-[0.2em] uppercase text-emerald-300/70">Audio reactive</span>
            ) : null}
          </div>
          <h2 className="text-lg md:text-xl font-semibold truncate">{current?.title || 'Nothing loaded'}</h2>
          <p className="text-sm text-white/45 truncate">{current?.artist || 'Pick a category and hit play'}</p>
          {current?.source === 'itunes' ? (
            <p className="text-[10px] text-white/30 mt-1">30-second preview from the iTunes catalogue</p>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------- seek */}
      <div className="mt-5">
        <input
          type="range"
          className="fader"
          style={{ '--pct': `${pct}%` }}
          min={0}
          max={Math.max(1, duration)}
          step={0.1}
          value={shown}
          aria-label="Seek"
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={() => {
            if (scrub != null) seek(scrub);
            setScrub(null);
          }}
          onKeyUp={() => {
            if (scrub != null) seek(scrub);
            setScrub(null);
          }}
        />
        <div className="flex justify-between text-[11px] text-white/40 -mt-1 tabular-nums">
          <span>{formatTime(shown)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* -------------------------------------------------- transport */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <IconButton label="Shuffle" active={shuffle} onClick={() => setShuffle(!shuffle)}>
          <path d="M16 3h5v5M4 20l16-16M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </IconButton>
        <IconButton label="Previous" onClick={prev}>
          <path d="M19 20L9 12l10-8v16zM5 4v16" />
        </IconButton>
        <button
          type="button"
          onClick={toggle}
          aria-label={playerState.playing ? 'Pause' : 'Play'}
          className="w-14 h-14 rounded-full grid place-items-center text-black transition hover:scale-105 active:scale-95"
          style={{ background: theme.accent, boxShadow: `0 0 26px -4px ${theme.accent}` }}
        >
          {playerState.playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5l12 7-12 7V5z" />
            </svg>
          )}
        </button>
        <IconButton label="Next" onClick={next}>
          <path d="M5 4l10 8-10 8V4zM19 4v16" />
        </IconButton>
        <IconButton label={`Repeat: ${repeat}`} active={repeat !== 'off'} onClick={cycleRepeat}>
          {repeat === 'one' ? (
            <>
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4" />
              <path d="M21 13v1a4 4 0 01-4 4H3" />
              <path d="M11 12h2v4" />
            </>
          ) : (
            <>
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4" />
              <path d="M21 13v1a4 4 0 01-4 4H3" />
            </>
          )}
        </IconButton>
      </div>

      {/* ----------------------------------------------------- volume */}
      <div className="mt-4 flex items-center gap-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-white/40 flex-none">
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 010 7" />
        </svg>
        <input
          type="range"
          className="fader"
          style={{ '--pct': `${playerState.volume * 100}%` }}
          min={0}
          max={1}
          step={0.01}
          value={playerState.volume}
          aria-label="Volume"
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </Panel>
  );
}

function IconButton({ children, label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-10 h-10 rounded-full grid place-items-center border transition ${
        active ? 'border-white/30 text-white bg-white/10' : 'border-white/10 text-white/60 hover:text-white hover:bg-white/5'
      }`}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
