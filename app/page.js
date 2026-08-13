'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ShowProvider, useShow } from './show-context';
import LightStage from '@/components/LightStage';
import ControlDesk from '@/components/ControlDesk';
import PlayerDeck from '@/components/PlayerDeck';
import QueuePanel from '@/components/QueuePanel';
import SearchPanel from '@/components/SearchPanel';
import LyricsPanel from '@/components/LyricsPanel';
import ShowStats from '@/components/ShowStats';
import ThemeSelect from '@/components/ThemeSelect';
import TransportBar from '@/components/TransportBar';

const SECTIONS = [
  { id: 'stage', label: 'Stage' },
  { id: 'desk', label: 'Light desk' },
  { id: 'deck', label: 'Music' },
  { id: 'lyrics', label: 'Lyrics & show' },
];

export default function Page() {
  return (
    <ShowProvider>
      <Show />
    </ShowProvider>
  );
}

function Show() {
  const { theme, toast } = useShow();
  const rootRef = useRef(null);
  const [active, setActive] = useState('stage');

  // Drive the accent colour of every control from the active category.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-soft', `${theme.accent}28`);
  }, [theme]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => e.isIntersecting && setActive(e.target.id));
      },
      { root, threshold: 0.5 }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {/* The rig lives behind the whole page — one canvas, always running. */}
      <div className="fixed inset-0 z-0">
        <LightStage />
      </div>

      <SideNav active={active} />

      <main ref={rootRef} className="snap-root relative z-10">
        <StageSection />
        <DeskSection />
        <DeckSection />
        <LyricsSection />
      </main>

      <TransportBar />

      {toast ? (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 panel px-4 py-2 text-sm text-white/80">{toast}</div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ nav */

function SideNav({ active }) {
  return (
    <nav className="hidden lg:flex fixed right-5 top-1/2 -translate-y-1/2 z-30 flex-col gap-3">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          title={s.label}
          className="group flex items-center gap-2 justify-end"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <span className="text-[10px] tracking-widest uppercase text-white/0 group-hover:text-white/50 transition">
            {s.label}
          </span>
          <span
            className="w-2.5 h-2.5 rounded-full border transition"
            style={{
              background: active === s.id ? 'var(--accent)' : 'transparent',
              borderColor: active === s.id ? 'var(--accent)' : 'rgba(255,255,255,0.25)',
              boxShadow: active === s.id ? '0 0 12px var(--accent)' : 'none',
            }}
          />
        </a>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------- sections */

function StageSection() {
  const { theme, toggle, playerState, current, meta } = useShow();
  return (
    <section id="stage" className="snap-section relative flex flex-col">
      <header className="flex items-start justify-between gap-4 p-5 md:p-7">
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-none">
            DJ <span style={{ color: theme.accent }}>RAMP</span>
          </h1>
          <p className="text-[11px] md:text-xs text-white/45 mt-1 tracking-[0.18em] uppercase">
            Deluxe salon lighting desk · made by Priyanshu Raj
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-[10px] text-white/35 tracking-[0.18em] uppercase">
            {meta.visitors.toLocaleString()} visitors
          </span>
          <Link href="/admin" className="btn !text-[11px]">
            Control panel
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-end md:items-center">
        <div className="p-5 md:p-7 w-full max-w-md">
          <ThemeSelect />
          <p className="mt-3 text-sm text-white/50 leading-relaxed">{theme.tagline}</p>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="btn btn-accent !px-5 !py-3 !text-sm flex items-center gap-2 whitespace-nowrap"
              style={{ boxShadow: `0 0 30px -6px ${theme.accent}` }}
            >
              {playerState.playing ? 'Pause the set' : 'Start the set'}
            </button>
            <div className="min-w-0">
              <p className="text-[11px] text-white/35 uppercase tracking-[0.18em]">Now on the deck</p>
              <p className="text-sm truncate">{current ? `${current.title} — ${current.artist}` : 'Nothing loaded yet'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-7 pt-5 pb-20 text-[10px] tracking-[0.24em] uppercase text-white/30">
        Scroll for the light desk ↓
      </div>
    </section>
  );
}

function DeskSection() {
  return (
    <section id="desk" className="snap-section relative bg-black/55 backdrop-blur-sm flex flex-col">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-7 pt-6 pb-24 lg:h-dvh flex flex-col">
        <SectionHead
          kicker="Lighting control box"
          title="Patch it, move it, blind them"
          note="Every fader is DMX-ish: it changes the rig behind this panel in real time."
        />
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin -mx-1 px-1">
          <ControlDesk />
        </div>
      </div>
    </section>
  );
}

function DeckSection() {
  return (
    <section id="deck" className="snap-section relative bg-black/60 backdrop-blur-sm flex flex-col">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-7 pt-6 pb-24 lg:h-dvh flex flex-col">
        <SectionHead
          kicker="Music system"
          title="Deck, queue and search"
          note="Drag the queue to re-order it. Search adds anything you find to the same queue."
        />
        <div className="grid gap-4 lg:grid-cols-3 flex-1 min-h-0 max-lg:auto-rows-[minmax(320px,auto)]">
          <PlayerDeck />
          <QueuePanel />
          <SearchPanel />
        </div>
      </div>
    </section>
  );
}

function LyricsSection() {
  const { theme } = useShow();
  return (
    <section id="lyrics" className="snap-section relative bg-black/65 backdrop-blur-sm flex flex-col">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-7 pt-6 pb-4 lg:h-dvh flex flex-col">
        <SectionHead kicker="Sing along" title="Lyrics, timed to the track" note="Tap any line to jump the playhead there." />
        <div className="grid gap-4 lg:grid-cols-3 flex-1 min-h-0 max-lg:auto-rows-[minmax(320px,auto)]">
          <div className="lg:col-span-2 min-h-[280px]">
            <LyricsPanel />
          </div>
          <ShowStats />
        </div>

        <footer className="mt-4 mb-16 border-t border-white/10 pt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/35">
          <span>
            Made by <span style={{ color: theme.accent }}>Priyanshu Raj</span> · DJ Ramp light desk
          </span>
          <span className="flex items-center gap-4">
            <Link href="/admin" className="hover:text-white/70 transition">
              Control panel
            </Link>
            <span>Next.js · MongoDB Atlas · Web Audio</span>
          </span>
        </footer>
      </div>
    </section>
  );
}

function SectionHead({ kicker, title, note }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] tracking-[0.24em] uppercase text-white/35">{kicker}</p>
      <h2 className="text-xl md:text-2xl font-bold mt-1">{title}</h2>
      {note ? <p className="text-[12px] text-white/40 mt-1">{note}</p> : null}
    </div>
  );
}
