/**
 * Back-wall visual engine.
 *
 * Everything here paints the wall *behind* the rig — the LED surface a real
 * stage puts up as a backdrop — so it draws before the truss, the beams and
 * the crowd, and is clipped to the wall area. Patterns are additive and take
 * their colour from the active theme and the desk's colour mode, so the
 * backdrop always belongs to the same scene as the fixtures.
 */

import { pickColor, rgba } from './palette';

const TAU = Math.PI * 2;

export const BACKDROPS = [
  { id: 'off', label: 'Off' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'ribbon', label: 'Ribbon' },
  { id: 'particles', label: 'Particles' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'moire', label: 'Moiré' },
  { id: 'grid', label: 'Wave Grid' },
  { id: 'rings', label: 'Rings' },
  { id: 'prism', label: 'Prism' },
  { id: 'liquid', label: 'Liquid' },
];

export const HEX_MODES = [
  { id: 'pulse', label: 'Pulse' },
  { id: 'chase', label: 'Chase' },
  { id: 'ripple', label: 'Ripple' },
  { id: 'sparkle', label: 'Sparkle' },
];

/* ------------------------------------------------------------------ hex */

/** Honeycomb of panels, the flat-top hex wall you see behind most DJ booths. */
function hexGrid(w, wallBottom, size) {
  const cells = [];
  const dx = size * 1.5;
  const dy = size * Math.sqrt(3);
  const cols = Math.ceil(w / dx) + 2;
  const rows = Math.ceil(wallBottom / dy) + 2;
  for (let c = -1; c < cols; c++) {
    for (let r = -1; r < rows; r++) {
      const cx = c * dx;
      const cy = r * dy + (c % 2 ? dy / 2 : 0);
      if (cy > wallBottom + size) continue;
      cells.push({ cx, cy, c, r });
    }
  }
  return cells;
}

/** One hexagon at the origin, reused for every cell via translate. */
function hexPath(r) {
  const path = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    i ? path.lineTo(px, py) : path.moveTo(px, py);
  }
  path.closePath();
  return path;
}

export function drawHexWall(ctx, L, theme, scene, t, kick, bar) {
  const size = Math.max(18, L.s * 0.075);
  if (!L._hex || L._hexSize !== size) {
    L._hex = hexGrid(L.w, L.wallBottom, size);
    L._hexPath = hexPath(size * 0.92);
    L._hexSize = size;
  }

  const master = (scene.intensity / 100) * (scene.blackout ? 0 : 1);
  if (master <= 0) return;
  const speed = 0.4 + (scene.speed / 100) * 1.6;
  const cx = L.w / 2;
  const cy = L.wallBottom * 0.55;
  const mode = scene.hexMode || 'pulse';

  const lw = Math.max(1, size * 0.05);
  ctx.save();
  ctx.lineWidth = lw;
  L._hex.forEach((cell, i) => {
    const dist = Math.hypot(cell.cx - cx, cell.cy - cy) / L.w;
    let level;
    switch (mode) {
      case 'chase':
        level = 0.5 + 0.5 * Math.sin(cell.c * 0.6 - t * speed * 2.2);
        break;
      case 'ripple':
        level = 0.5 + 0.5 * Math.sin(dist * 16 - t * speed * 3);
        break;
      case 'sparkle': {
        const seed = Math.sin(i * 12.9898 + Math.floor(t * speed * 2) * 78.233) * 43758.5453;
        level = seed - Math.floor(seed) > 0.86 ? 1 : 0.05;
        break;
      }
      case 'pulse':
      default:
        level = 0.35 + 0.65 * kick * (1 - dist * 0.7);
        break;
    }
    if (level <= 0.04) return;

    const c = pickColor(theme, scene.colorMode, cell.c + cell.r, t, bar);
    const a = master * level * 0.18;

    // translate + a cached Path2D, so the hexagon geometry is built once.
    ctx.translate(cell.cx, cell.cy);
    ctx.fillStyle = rgba(c, a * 0.5);
    ctx.fill(L._hexPath);
    ctx.strokeStyle = rgba(c, a * 1.6);
    ctx.stroke(L._hexPath);
    ctx.translate(-cell.cx, -cell.cy);
  });
  ctx.restore();
}

/* -------------------------------------------------------------- patterns */

function orbit(ctx, L, P, t, k, alpha) {
  const cx = L.w * 0.5;
  const cy = L.wallBottom * 0.52;
  for (let i = 0; i < 9; i++) {
    const r = L.s * 0.08 + i * L.s * 0.055 + Math.sin(t * 1.6 + i) * 6;
    ctx.beginPath();
    for (let s = 0; s <= 120; s++) {
      const a = (s / 120) * TAU;
      const rr = r + Math.sin(a * 5 + t + i) * (5 + k * 8);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.62;
      s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.strokeStyle = rgba(P(i), alpha * 0.9);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function ribbon(ctx, L, P, t, k, alpha) {
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    for (let x = -20; x <= L.w + 20; x += 10) {
      const y =
        L.wallBottom * 0.3 +
        i * L.wallBottom * 0.1 +
        Math.sin(x * 0.008 + t * (0.7 + i * 0.05) + i) * (30 + k * 25) +
        Math.sin(x * 0.02 - t) * 12;
      x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(P(i), alpha);
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

function particles(ctx, L, P, t, k, alpha, rnd) {
  const n = 140;
  for (let i = 0; i < n; i++) {
    const a = rnd(i) * TAU + t * 0.1;
    const r = rnd(i + 99) * L.w * 0.5;
    const x = L.w / 2 + Math.cos(a) * r;
    const y = L.wallBottom * 0.5 + Math.sin(a) * r * 0.5;
    const len = 6 + rnd(i + 7) * 22 * (0.4 + k);
    ctx.strokeStyle = rgba(P(i), alpha * 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a + 0.8) * len, y + Math.sin(a + 0.8) * len);
    ctx.stroke();
  }
}

function geometry(ctx, L, P, t, k, alpha) {
  const cx = L.w / 2;
  const cy = L.wallBottom * 0.5;
  for (let i = 0; i < 8; i++) {
    const s = L.s * 0.12 + i * L.s * 0.08 + Math.sin(t + i) * 10 * (1 + k);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.12 * (i % 2 ? -1 : 1) + i * 0.2);
    ctx.strokeStyle = rgba(P(i), alpha);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

function moire(ctx, L, P, t, k, alpha) {
  const cx = L.w * 0.5;
  const cy = L.wallBottom * 0.5;
  for (let i = 0; i < 42; i++) {
    const r = L.s * 0.02 + i * L.s * 0.022 + Math.sin(t + i * 0.2) * (6 + k * 6);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.34, Math.sin(t * 0.2 + i * 0.08), 0, TAU);
    ctx.strokeStyle = rgba(P(i), alpha * 0.8);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function grid(ctx, L, P, t, k, alpha) {
  const horizon = L.wallBottom * 0.42;
  for (let i = 0; i < 16; i++) {
    const y = horizon + Math.pow(i / 16, 1.7) * (L.wallBottom - horizon) + Math.sin(t * 2 + i) * 2 * k;
    ctx.strokeStyle = rgba(P(i), alpha * 0.75);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(L.w, y);
    ctx.stroke();
  }
  for (let i = -10; i <= 10; i++) {
    ctx.strokeStyle = rgba(P(i + 10), alpha * 0.55);
    ctx.beginPath();
    ctx.moveTo(L.w / 2 + i * L.w * 0.02, horizon);
    ctx.lineTo(L.w / 2 + i * L.w * 0.1, L.wallBottom);
    ctx.stroke();
  }
}

function rings(ctx, L, P, t, k, alpha) {
  const cx = L.w * 0.5;
  const cy = L.wallBottom * 0.5;
  for (let i = 0; i < 12; i++) {
    // Rings expand outward and recycle, so the wall keeps breathing.
    const phase = (t * 0.35 + i / 12) % 1;
    const r = phase * L.s * 0.75;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.55, 0, 0, TAU);
    ctx.strokeStyle = rgba(P(i), alpha * (1 - phase) * (0.7 + k * 0.6));
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function prism(ctx, L, P, t, k, alpha) {
  const cx = L.w * 0.5;
  const cy = L.wallBottom * 1.02;
  for (let i = 0; i < 18; i++) {
    const a = -Math.PI * 0.94 + (i / 17) * Math.PI * 0.88 + Math.sin(t + i) * 0.03;
    ctx.strokeStyle = rgba(P(i), alpha * (0.6 + k * 0.6));
    ctx.lineWidth = 1.5 + k * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * L.w, cy + Math.sin(a) * L.w);
    ctx.stroke();
  }
}

function liquid(ctx, L, P, t, k, alpha) {
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    for (let x = 0; x <= L.w; x += 8) {
      const y =
        L.wallBottom * 0.22 +
        i * L.wallBottom * 0.075 +
        Math.sin(x * 0.01 + t + i) * (22 + k * 18) +
        Math.sin(x * 0.025 - t * 1.3) * 12;
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = rgba(P(i), alpha);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

const RENDERERS = { orbit, ribbon, particles, geometry, moire, grid, rings, prism, liquid };

/* ------------------------------------------------------------------ draw */

/** Stable pseudo-random per index, so particles don't jitter every frame. */
const rnd = (i) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

export function drawBackdrop(ctx, L, theme, scene, t, kick, bar) {
  const id = scene.backdrop || 'off';
  const render = RENDERERS[id];
  if (!render) return;

  const master = scene.blackout ? 0 : scene.intensity / 100;
  const alpha = master * ((scene.backdropIntensity ?? 60) / 100) * 0.5;
  if (alpha <= 0.005) return;

  // Backdrop time runs on its own fader so the wall can drift while the heads
  // snap, or the other way round.
  const bt = t * (0.25 + ((scene.backdropSpeed ?? 50) / 100) * 1.9);
  const colour = (i) => pickColor(theme, scene.colorMode, i, bt, bar);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, L.w, L.wallBottom);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  render(ctx, L, colour, bt, kick, alpha, rnd);
  ctx.restore();
}
