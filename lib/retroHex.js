/**
 * 7-LED retro hexagonal stage par.
 *
 * The fixture that's everywhere on mobile-DJ backdrops right now: seven
 * hexagons in a honeycomb cluster, each one carrying two independent light
 * sources —
 *
 *   • a warm tungsten-look COB filament in the core, for the vintage halogen
 *     wash that reads as an old concert bowl, and
 *   • an outer ring of individually addressable RGB pixels for chases and
 *     strobe work.
 *
 * The DMX channel mode is modelled too, because it changes the look more than
 * anything else: in a low channel count every hexagon and every pixel is fed
 * the same value, so the whole unit moves as one lamp. Only the high channel
 * count addresses pixels individually and lets patterns travel across the
 * cluster.
 */

import { hslToRgb, pickColor, rgba } from './palette';

const TAU = Math.PI * 2;

export const RETRO_MODES = [
  { id: 'sound', label: 'Sound' },
  { id: 'chase', label: 'Chase' },
  { id: 'strobe', label: 'Strobe' },
  { id: 'warm', label: 'Warm' },
  { id: 'pixel', label: 'Pixel Map' },
];

export const RETRO_RIGS = [
  { id: 'single', label: 'Single' },
  { id: 'pair', label: 'Pair' },
];

/** 4-channel drives all seven as one lamp; 42-channel addresses each pixel. */
export const DMX_MODES = [
  { id: 'ch4', label: '4 ch' },
  { id: 'ch42', label: '42 ch' },
];

const PIXELS = 12; // RGB pixels around each hexagon
const TUNGSTEN = [255, 176, 74];

/** Cluster geometry: one hexagon in the middle, six packed around it. */
function cluster(r) {
  const cells = [{ dx: 0, dy: 0, i: 0 }];
  const step = r * Math.sqrt(3);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    cells.push({ dx: Math.cos(a) * step, dy: Math.sin(a) * step, i: i + 1 });
  }
  return cells;
}

function hexPath(r) {
  const p = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    i ? p.lineTo(x, y) : p.moveTo(x, y);
  }
  p.closePath();
  return p;
}

function glow(ctx, x, y, r, colour, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(colour, alpha));
  g.addColorStop(0.4, rgba(colour, alpha * 0.35));
  g.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/**
 * Level of one cell (0..1) for the ring, given the programme.
 * `unison` collapses the cluster to a single lamp, as low DMX modes do.
 */
function cellLevel(mode, cellIndex, t, kick, speed, strobeRate, unison) {
  const idx = unison ? 0 : cellIndex;
  switch (mode) {
    case 'chase':
      return 0.15 + 0.85 * Math.pow(Math.max(0, Math.sin(t * speed * 2.4 - idx * 0.9)), 3);
    case 'strobe': {
      const rate = 2 + (strobeRate / 100) * 16;
      const period = 1 / rate;
      const on = (t % period) / period < 0.35;
      return on ? 1 : 0.04;
    }
    case 'warm':
      return 0.25 + 0.2 * Math.sin(t * 0.7 + idx * 0.4);
    case 'pixel':
      return 0.7 + 0.3 * Math.sin(t * speed * 1.6 - idx * 0.8);
    case 'sound':
    default:
      return 0.22 + 0.78 * kick * (unison ? 1 : 1 - idx * 0.06);
  }
}

/**
 * @param {object} unit  { x, y, r } placement of the cluster centre
 */
function drawUnit(ctx, unit, theme, scene, t, kick, bar, paths) {
  const mode = scene.retroMode || 'sound';
  const unison = (scene.retroDmx || 'ch42') === 'ch4';
  const master = scene.blackout ? 0 : scene.intensity / 100;
  const filamentLevel = (scene.retroFilament ?? 70) / 100;
  const pixelLevel = (scene.retroPixels ?? 80) / 100;
  const speed = 0.4 + (scene.speed / 100) * 1.8;

  paths.cells.forEach((cell) => {
    const x = unit.x + cell.dx;
    const y = unit.y + cell.dy;
    const level = Math.max(0, cellLevel(mode, cell.i, t, kick, speed, scene.strobeRate, unison));

    // Housing: a dark hexagon so the fixture reads as hardware when unlit.
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(7,9,14,0.92)';
    ctx.fill(paths.body);
    ctx.strokeStyle = 'rgba(150,160,180,0.22)';
    ctx.lineWidth = Math.max(1, unit.r * 0.06);
    ctx.stroke(paths.body);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Tungsten core: warm COB with a filament hairpin, the retro half.
    if (mode !== 'strobe') {
      const warmth = mode === 'warm' ? 1.35 : 0.55;
      const fl = master * filamentLevel * warmth * (0.35 + level * 0.65);
      if (fl > 0.01) {
        glow(ctx, x, y, unit.r * 1.5, TUNGSTEN, fl * 0.5);
        ctx.strokeStyle = rgba([255, 226, 170], Math.min(1, fl * 1.5));
        ctx.lineWidth = Math.max(1, unit.r * 0.09);
        ctx.beginPath();
        for (let s = 0; s <= 10; s++) {
          const fx = x + (s / 10 - 0.5) * unit.r * 0.9;
          const fy = y + Math.sin((s / 10) * Math.PI * 3) * unit.r * 0.2;
          s ? ctx.lineTo(fx, fy) : ctx.moveTo(fx, fy);
        }
        ctx.stroke();
      }
    }

    // Outer RGB pixel ring — the addressable half.
    const pr = unit.r * 0.82;
    for (let p = 0; p < PIXELS; p++) {
      const a = (p / PIXELS) * TAU;
      const px = x + Math.cos(a) * pr;
      const py = y + Math.sin(a) * pr;

      let pixLevel = level;
      let colour;
      if (unison) {
        // Low channel mode: one colour, one level, for the whole fixture.
        colour = pickColor(theme, scene.colorMode, 0, t, bar);
      } else if (mode === 'pixel') {
        colour = hslToRgb(t * 60 + p * 26 + cell.i * 40, 100, 56);
        pixLevel = 0.45 + 0.55 * Math.sin(t * speed * 3 - p * 0.7 + cell.i);
      } else if (mode === 'chase') {
        colour = pickColor(theme, scene.colorMode, cell.i, t, bar);
        pixLevel = level * (0.45 + 0.55 * Math.max(0, Math.sin(t * speed * 4 - p * 0.6)));
      } else {
        colour = pickColor(theme, scene.colorMode, cell.i, t, bar);
      }

      // Warm is the vintage programme: filament carries it, the RGB ring drops
      // to a faint rim rather than colouring the fixture.
      const ringTrim = mode === 'warm' ? 0.12 : 1;
      const a2 = master * pixelLevel * Math.max(0, pixLevel) * 0.9 * ringTrim;
      if (a2 <= 0.02) continue;
      glow(ctx, px, py, unit.r * 0.34, colour, a2 * 0.7);
      ctx.fillStyle = rgba(colour, Math.min(1, a2 * 1.4));
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, unit.r * 0.075), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  });

  // Spill onto the wall behind, so the unit lights its surroundings.
  const spill = pickColor(theme, scene.colorMode, 0, t, bar);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, unit.x, unit.y, unit.r * 7, spill, master * 0.05 * (0.4 + kick * 0.6));
  ctx.restore();
}

export function drawRetroHexPars(ctx, L, theme, scene, t, kick, bar) {
  const r = Math.max(9, L.s * 0.042);
  if (!L._retro || L._retroR !== r) {
    L._retro = { cells: cluster(r), body: hexPath(r * 0.98) };
    L._retroR = r;
  }

  // Sits on the floor line behind the booth, the way these are stood up on a
  // kickstand or clamped to a short totem.
  const y = L.wallBottom - r * 1.1;
  const units =
    (scene.retroRig || 'single') === 'pair'
      ? [
          { x: L.w * 0.26, y, r },
          { x: L.w * 0.74, y, r },
        ]
      : [{ x: L.w * 0.5, y: y - r * 0.2, r }];

  units.forEach((u) => drawUnit(ctx, u, theme, scene, t, kick, bar, L._retro));
}
