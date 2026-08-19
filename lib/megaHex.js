/**
 * Single-head retro hex par.
 *
 * The big brother of the 7-head: one large hexagon packed with concentric
 * rings of LEDs around a high-output centre, stood on a riser or a scissor
 * yoke behind the booth and aimed *up and out*. That upward throw is the whole
 * point of the fixture — it frames the DJ in a geometric glow without firing
 * into their eyes, and separates the silhouette from the background.
 *
 * The controls mirror the physical unit's back-panel menu rather than an
 * abstract idea of a light: sound-active with adjustable mic sensitivity, an
 * auto-fade show mode, and the static / strobe / blackout triggers you'd hit
 * from the IR remote.
 */

import { hslToRgb, pickColor, rgba } from './palette';

const TAU = Math.PI * 2;

export const SINGLE_MODES = [
  { id: 'sound', label: 'Sound' },
  { id: 'fade', label: 'Auto Fade' },
  { id: 'chase', label: 'Chase' },
  { id: 'strobe', label: 'Strobe' },
  { id: 'static', label: 'Static' },
];

/** Concentric rings of pixels: 1 + 6 + 12 + 18. */
function pixels(r) {
  const out = [{ x: 0, y: 0, ring: 0, i: 0 }];
  [1, 2, 3].forEach((ring) => {
    const count = ring * 6;
    const rad = (ring / 3.35) * r;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + ring * 0.18;
      out.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad, ring, i });
    }
  });
  return out;
}

function hexPath(r) {
  const p = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    i ? p.lineTo(Math.cos(a) * r, Math.sin(a) * r) : p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  p.closePath();
  return p;
}

function glow(ctx, x, y, r, colour, alpha) {
  if (alpha <= 0.004 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(colour, alpha));
  g.addColorStop(0.45, rgba(colour, alpha * 0.32));
  g.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Programme level for one pixel, 0..1. */
function pixelLevel(mode, px, t, kick, speed, strobeRate, mic, unison) {
  const ring = unison ? 0 : px.ring;
  switch (mode) {
    case 'fade':
      // Slow morph: the whole head breathes as one, ideal for lounge sets.
      return 0.55 + 0.45 * Math.sin(t * speed * 0.5 - ring * 0.5);
    case 'chase':
      return 0.1 + 0.9 * Math.pow(Math.max(0, Math.sin(t * speed * 2 - ring * 1.1 - px.i * 0.25)), 2);
    case 'strobe': {
      const rate = 2 + (strobeRate / 100) * 16;
      return (t % (1 / rate)) * rate < 0.3 ? 1 : 0.02;
    }
    case 'static':
      return 0.85;
    case 'sound':
    default:
      // Mic sensitivity decides how much of the level the kick actually drives.
      return Math.min(1, 0.12 + kick * mic * (1 - ring * 0.08));
  }
}

function drawUnit(ctx, u, theme, scene, t, kick, bar, cache) {
  const mode = scene.singleMode || 'sound';
  const unison = (scene.singleDmx || 'ch42') === 'ch4';
  const master = scene.blackout ? 0 : scene.intensity / 100;
  const level = (scene.singleIntensity ?? 90) / 100;
  const mic = 0.3 + ((scene.singleMic ?? 65) / 100) * 1.9;
  const halo = (scene.singleHalo ?? 70) / 100;
  const speed = 0.3 + (scene.singleFade ?? 50) / 100 * 2.2;
  const out = master * level;
  if (out <= 0.01) return;

  // Housing.
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.fillStyle = 'rgba(6,8,13,0.95)';
  ctx.fill(cache.body);
  ctx.strokeStyle = 'rgba(150,162,184,0.28)';
  ctx.lineWidth = Math.max(1.5, u.r * 0.045);
  ctx.stroke(cache.body);
  ctx.restore();

  const baseColour = () =>
    mode === 'fade' ? hslToRgb(t * 26, 92, 58) : pickColor(theme, scene.colorMode, 0, t, bar);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // The halo: a wide upward throw that frames whoever stands in front of it.
  if (halo > 0.02 && mode !== 'strobe') {
    const c = baseColour();
    const reach = u.r * (7 + halo * 9);
    const g = ctx.createLinearGradient(u.x, u.y, u.x, u.y - reach);
    g.addColorStop(0, rgba(c, out * halo * 0.4));
    g.addColorStop(0.45, rgba(c, out * halo * 0.14));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(u.x - u.r * 1.1, u.y);
    ctx.lineTo(u.x - u.r * (2.2 + halo * 3.4), u.y - reach);
    ctx.lineTo(u.x + u.r * (2.2 + halo * 3.4), u.y - reach);
    ctx.lineTo(u.x + u.r * 1.1, u.y);
    ctx.closePath();
    ctx.fill();
  }

  cache.px.forEach((px) => {
    const lv = Math.max(0, pixelLevel(mode, px, t, kick, speed, scene.strobeRate, mic, unison));
    if (lv <= 0.02) return;

    let colour;
    if (unison || mode === 'static' || mode === 'fade') colour = baseColour();
    else if (mode === 'strobe') colour = [255, 252, 240];
    else colour = pickColor(theme, scene.colorMode, px.ring * 2 + px.i, t, bar);

    const x = u.x + px.x;
    const y = u.y + px.y;
    const dotR = px.ring === 0 ? u.r * 0.17 : u.r * 0.062;
    const a = out * lv;

    glow(ctx, x, y, dotR * 5, colour, a * 0.5);
    ctx.fillStyle = rgba(colour, Math.min(1, a * 1.5));
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, TAU);
    ctx.fill();
  });

  // Overall bloom so a high-output head reads as genuinely bright.
  glow(ctx, u.x, u.y, u.r * 4.5, baseColour(), out * 0.16 * (0.5 + kick * 0.5));
  ctx.restore();
}

export function drawSingleHexPars(ctx, L, theme, scene, t, kick, bar) {
  const r = Math.max(16, L.s * 0.085);
  if (!L._mega || L._megaR !== r) {
    L._mega = { px: pixels(r * 0.86), body: hexPath(r) };
    L._megaR = r;
  }

  const rig = scene.singleRig || 'single';

  // Both this and the 7-head cluster want upstage centre. When the cluster is
  // also standing single it owns the floor line, so the big head goes up the
  // riser behind it instead of disappearing inside it.
  const stacked =
    rig === 'single' && scene.fixtures?.retroHex && (scene.retroRig || 'single') === 'single';

  // Stood on the riser line, aimed up — hence sitting low in the frame.
  const y = L.wallBottom - r * (stacked ? 3.1 : 0.55);
  const units =
    rig === 'pair'
      ? [
          { x: L.w * 0.12, y, r },
          { x: L.w * 0.88, y, r },
        ]
      : [{ x: L.w * 0.5, y, r }];

  units.forEach((u) => drawUnit(ctx, u, theme, scene, t, kick, bar, L._mega));
}
