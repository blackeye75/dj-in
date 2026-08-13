'use client';

import { useEffect, useRef } from 'react';
import { Rig } from '@/lib/lightEngine';
import { useShow } from '@/app/show-context';

/**
 * Canvas host for the rig. Everything inside the animation loop reads refs, so
 * moving a fader never re-renders React — only the next frame changes.
 */
export default function LightStage({ className = '' }) {
  const { sceneRef, theme, rigRef, engineRef, meta } = useShow();
  const canvasRef = useRef(null);
  const themeRef = useRef(theme);
  const crowdRef = useRef(meta.crowdSize);

  themeRef.current = theme;
  crowdRef.current = meta.crowdSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rig = new Rig(canvas);
    rigRef.current = rig;

    const resize = () => {
      const box = canvas.parentElement.getBoundingClientRect();
      rig.resize(Math.max(320, box.width), Math.max(240, box.height));
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    let raf = 0;
    let last = performance.now();
    let visible = true;
    const onVisibility = () => {
      visible = !document.hidden;
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      const analysis = engineRef.current?.analysis() || null;
      const scene = sceneRef.current;
      rig.frame(
        dt,
        { ...scene, crowdFraction: Math.max(0.12, Math.min(1, (crowdRef.current || 320) / 420)) },
        themeRef.current,
        analysis
      );
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      rigRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className={`block w-full h-full ${className}`} aria-label="DJ light rig visualiser" />;
}
