'use client';

import { useEffect, useState } from 'react';
import { useShow } from '@/app/show-context';
import { Panel } from './ui';

/** Counts the people the show has pulled: live visitors and booked guests. */
export default function ShowStats() {
  const { meta, theme } = useShow();
  const visitors = useCountUp(meta.visitors || 0);
  const crowd = useCountUp(meta.crowdSize || 0);

  return (
    <Panel title="Show numbers" className="h-full">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Visitors" value={visitors} hint="Unique sessions on this page" accent={theme.accent} />
        <Stat label="Guests at the show" value={crowd} hint="Head count for the run — drives crowd density on stage" accent={theme.palette[1] || theme.accent} />
      </div>
      <div className="mt-4 space-y-1.5 text-[11px] text-white/40">
        <Row label="Show" value={meta.showName || '—'} />
        <Row label="Storage" value={meta.storage === 'atlas' ? 'MongoDB Atlas' : 'In-memory (no MONGODB_URI)'} />
        <Row
          label="Providers"
          value={Object.entries(meta.providers || {})
            .filter(([, on]) => on)
            .map(([k]) => k)
            .join(', ')}
        />
      </div>
    </Panel>
  );
}

function Stat({ label, value, hint, accent }) {
  return (
    <div className="panel-tight p-3">
      <div className="label">{label}</div>
      <div className="text-3xl font-semibold tabular-nums mt-1" style={{ color: accent, textShadow: `0 0 24px ${accent}44` }}>
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] text-white/30 mt-1 leading-snug">{hint}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/30">{label}</span>
      <span className="text-white/60 truncate">{value}</span>
    </div>
  );
}

function useCountUp(target) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const dur = 900;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return n;
}
