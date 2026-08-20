'use client';

import { useShow } from '@/app/show-context';
import { usePlayhead } from './usePlayhead';
import { formatTime } from './ui';

/** Always-on transport, so the set stays controllable from any section. */
export default function TransportBar() {
  const { current, playerState, toggle, next, prev, theme, seek } = useShow();
  const { position, duration, buffered } = usePlayhead(10);
  const pct = duration > 0 ? (position / duration) * 100 : 0;
  const bufPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-black/70 backdrop-blur-xl">
      <div
        className="h-[3px] bg-white/5 cursor-pointer"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          if (duration > 0) seek(((e.clientX - box.left) / box.width) * duration);
        }}
        title="Seek"
      >
        {/* Downloaded behind, played in front — the streaming-player idiom. */}
        <div className="relative h-full">
          <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${bufPct}%` }} />
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-150"
            style={{ width: `${pct}%`, background: theme.accent }}
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-md overflow-hidden flex-none border border-white/10 bg-white/5 grid place-items-center text-sm">
          {current?.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.artworkUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            theme.icon
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[12px] truncate">{current?.title || 'Nothing loaded'}</p>
          <p className="text-[10px] text-white/40 truncate">
            {playerState.buffering ? (
              <span className="text-amber-300/80">Buffering…</span>
            ) : (
              current?.artist || theme.label
            )}
          </p>
        </div>

        <span className="hidden sm:block text-[10px] text-white/35 tabular-nums">
          {formatTime(position)} / {formatTime(duration)}
        </span>

        <div className="flex items-center gap-1">
          <Ctl label="Previous" onClick={prev}>
            <path d="M19 20L9 12l10-8v16zM5 4v16" />
          </Ctl>
          <button
            type="button"
            onClick={toggle}
            aria-label={playerState.playing ? 'Pause' : 'Play'}
            className="w-10 h-10 rounded-full grid place-items-center text-black"
            style={{ background: theme.accent }}
          >
            {playerState.playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5l12 7-12 7V5z" />
              </svg>
            )}
          </button>
          <Ctl label="Next" onClick={next}>
            <path d="M5 4l10 8-10 8V4zM19 4v16" />
          </Ctl>
        </div>
      </div>
    </div>
  );
}

function Ctl({ children, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-9 h-9 rounded-full grid place-items-center text-white/60 hover:text-white hover:bg-white/5 transition"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
