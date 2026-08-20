'use client';

import { useEffect, useState } from 'react';
import { useShow } from '@/app/show-context';

/**
 * Playhead sampled on rAF. Kept out of context state so a moving playhead
 * doesn't re-render the whole page — only the components that ask for it.
 */
export function usePlayhead(fps = 20) {
  const { engineRef, playerState, current } = useShow();
  const [state, setState] = useState({ position: 0, duration: 0, buffered: 0 });

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const interval = 1000 / fps;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < interval) return;
      last = now;
      const engine = engineRef.current;
      if (!engine) return;
      const position = engine.position || 0;
      const duration = engine.duration || 0;
      const buffered = engine.buffered || 0;
      setState((prev) =>
        Math.abs(prev.position - position) > 0.02 ||
        prev.duration !== duration ||
        Math.abs(prev.buffered - buffered) > 0.05
          ? { position, duration, buffered }
          : prev
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engineRef, fps, playerState.mode, current?.uid]);

  return state;
}
