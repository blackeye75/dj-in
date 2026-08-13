'use client';

import { useEffect, useRef, useState } from 'react';
import { useShow } from '@/app/show-context';

/** Category dropdown — each one loads its own scene and its own playlist. */
export default function ThemeSelect({ compact = false }) {
  const { THEMES, themeId, setThemeId, theme } = useShow();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="panel flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-white/5 transition"
      >
        <span className="text-xl leading-none">{theme.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] tracking-[0.24em] uppercase text-white/40">Category</span>
          <span className="block text-sm font-semibold truncate" style={{ color: theme.accent }}>
            {theme.label}
          </span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-white/40 transition ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute z-40 mt-2 w-full min-w-[260px] panel p-1.5 max-h-[62vh] overflow-y-auto scroll-thin"
        >
          {THEMES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={t.id === themeId}
                onClick={() => {
                  setThemeId(t.id);
                  setOpen(false);
                }}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                  t.id === themeId ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <span className="text-lg leading-none mt-0.5">{t.icon}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: t.accent }}>
                      {t.label}
                    </span>
                    <span className="text-[10px] text-white/30">{t.bpm} BPM</span>
                  </span>
                  {!compact ? <span className="block text-[11px] text-white/40 leading-snug">{t.tagline}</span> : null}
                </span>
                <span className="ml-auto flex gap-1 pt-1">
                  {t.palette.slice(0, 4).map((c) => (
                    <span key={c} className="w-2 h-2 rounded-full" style={{ background: c }} />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
