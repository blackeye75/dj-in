'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useShow } from '@/app/show-context';
import { usePlayhead } from './usePlayhead';
import { formatTime, Panel } from './ui';

/** Timed lyrics. Lines are [{ t: seconds, text }] — click one to seek there. */
export default function LyricsPanel() {
  const { current, seek, theme } = useShow();
  const { position } = usePlayhead(12);
  const listRef = useRef(null);
  const activeRef = useRef(null);

  const lines = useMemo(
    () => (Array.isArray(current?.lyrics) ? [...current.lyrics].sort((a, b) => a.t - b.t) : []),
    [current]
  );

  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (position + 0.15 >= lines[i].t) idx = i;
      else break;
    }
    return idx;
  }, [lines, position]);

  useEffect(() => {
    const el = activeRef.current;
    const box = listRef.current;
    if (!el || !box) return;
    const target = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [activeIndex]);

  return (
    <Panel className="h-full flex flex-col min-h-0" title="Lyrics">
      {lines.length === 0 ? (
        <div className="flex-1 grid place-items-center text-center px-6">
          <div>
            <p className="text-sm text-white/40">No timed lyrics on this track yet.</p>
            <p className="text-[11px] text-white/25 mt-2">
              Add them in the control panel — paste plain lines or an <code>.lrc</code> file and the timings come with it.
            </p>
          </div>
        </div>
      ) : (
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto scroll-thin py-6">
          {lines.map((line, i) => {
            const active = i === activeIndex;
            const passed = i < activeIndex;
            return (
              <button
                key={`${line.t}-${i}`}
                ref={active ? activeRef : null}
                type="button"
                onClick={() => seek(line.t)}
                title={`Jump to ${formatTime(line.t)}`}
                className="lyric-line block w-full text-center px-4 py-2 text-balance"
                style={{
                  color: active ? theme.accent : passed ? 'rgba(232,236,246,0.28)' : 'rgba(232,236,246,0.55)',
                  opacity: active ? 1 : 0.85,
                  transform: active ? 'scale(1.04)' : 'scale(1)',
                  fontSize: active ? '1.15rem' : '1rem',
                  fontWeight: active ? 600 : 400,
                  textShadow: active ? `0 0 24px ${theme.accent}55` : 'none',
                }}
              >
                {line.text}
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
