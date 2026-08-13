/**
 * DJ ramp light engine.
 *
 * Draws a stage rig on a 2D canvas: truss + moving heads (spot / wash / beam),
 * an LED ramp arch, PAR cans, strobes, lasers, blinders and haze — all driven
 * by a beat clock that either follows real audio analysis or free-runs at the
 * theme BPM.
 *
 * Everything is additive-blended so overlapping beams bloom the way real light
 * does in fog. A quarter-resolution blur pass at the end supplies the glow.
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------------------------------------------------------- colours */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s /= 100;
  l /= 100;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1)})`;

function pickColor(theme, mode, i, t, bar) {
  switch (mode) {
    case 'rainbow':
      return hslToRgb(t * 38 + i * 47, 100, 56);
    case 'mono':
      return hexToRgb(theme.accent);
    case 'warm':
      return hslToRgb(18 + 16 * Math.sin(t * 0.6 + i), 92, 56);
    case 'theme':
    default: {
      const pal = theme.palette;
      return hexToRgb(pal[(i + Math.floor(bar / 2)) % pal.length]);
    }
  }
}

/* ------------------------------------------------------------ pseudo noise */

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- geometry */

function buildLayout(w, h) {
  const trussY = h * 0.085;
  const wallBottom = h * 0.63;
  const heads = [];
  const xs = [0.11, 0.255, 0.4, 0.6, 0.745, 0.89];
  const roles = ['beam', 'wash', 'spot', 'spot', 'wash', 'beam'];
  xs.forEach((x, i) => {
    heads.push({ x: x * w, y: trussY + h * 0.028, role: roles[i], i });
  });

  const arch = { cx: w * 0.5, cy: wallBottom + h * 0.02, r: h * 0.5 };
  const pars = [];
  const parCount = 11;
  for (let i = 0; i < parCount; i++) {
    const a = Math.PI + (i / (parCount - 1)) * Math.PI;
    pars.push({
      x: arch.cx + Math.cos(a) * arch.r * 0.86,
      y: arch.cy + Math.sin(a) * arch.r * 0.86,
      i,
    });
  }

  const classicPars = [
    { x: w * 0.045, y: wallBottom - h * 0.01, i: 0 },
    { x: w * 0.135, y: wallBottom - h * 0.01, i: 1 },
    { x: w * 0.865, y: wallBottom - h * 0.01, i: 2 },
    { x: w * 0.955, y: wallBottom - h * 0.01, i: 3 },
  ];

  const blinders = [
    { x: w * 0.325, y: trussY + h * 0.075, i: 0 },
    { x: w * 0.675, y: trussY + h * 0.075, i: 1 },
  ];

  const strobes = [
    { x: w * 0.185, y: trussY + h * 0.075, i: 0 },
    { x: w * 0.815, y: trussY + h * 0.075, i: 1 },
  ];

  const lasers = [
    { x: w * 0.035, y: wallBottom - h * 0.06, i: 0, dir: 1 },
    { x: w * 0.965, y: wallBottom - h * 0.06, i: 1, dir: -1 },
  ];

  const rnd = mulberry(1337);
  const crowd = [];
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const count = 16 + r * 9;
    for (let i = 0; i < count; i++) {
      crowd.push({
        x: (i / (count - 1)) * w * 1.1 - w * 0.05 + (rnd() - 0.5) * w * 0.03,
        base: h * (0.83 + r * 0.062),
        scale: 0.62 + r * 0.24 + rnd() * 0.14,
        phase: rnd() * TAU,
        arms: rnd() > 0.62,
        depth: r,
      });
    }
  }

  const fog = [];
  for (let i = 0; i < 14; i++) {
    fog.push({
      x: rnd(),
      y: 0.28 + rnd() * 0.42,
      r: 0.16 + rnd() * 0.26,
      sp: 0.008 + rnd() * 0.03,
      ph: rnd() * TAU,
    });
  }

  return { w, h, trussY, wallBottom, heads, arch, pars, classicPars, blinders, strobes, lasers, crowd, fog };
}

/* ------------------------------------------------------------ beat clock */

export function createBeatClock() {
  return { phase: 0, beat: 0, bar: 0, env: 0, lastBeatAt: 0 };
}

function advanceClock(clock, dt, bpm, audio, beatSync) {
  const hz = bpm / 60;
  clock.phase += dt * hz;
  if (clock.phase >= 1) {
    clock.phase -= Math.floor(clock.phase);
    clock.beat += 1;
    clock.bar = Math.floor(clock.beat / 4);
    clock.env = 1;
  }
  // Audio-reactive kick overrides the free-running envelope when available.
  const bass = beatSync && audio ? audio.bass : 0;
  clock.env = Math.max(clock.env * Math.pow(0.0009, dt), bass);
  return clock;
}

/* ------------------------------------------------------------ beam drawing */

function drawBeam(ctx, o, angle, len, spreadSrc, spreadEnd, color, alpha, softness) {
  const dx = Math.sin(angle);
  const dy = Math.cos(angle);
  const px = -dy;
  const py = dx;
  const ex = o.x + dx * len;
  const ey = o.y + dy * len;

  const g = ctx.createLinearGradient(o.x, o.y, ex, ey);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.35, rgba(color, alpha * 0.55));
  g.addColorStop(1, rgba(color, 0));

  ctx.beginPath();
  ctx.moveTo(o.x + px * spreadSrc, o.y + py * spreadSrc);
  ctx.lineTo(ex + px * spreadEnd, ey + py * spreadEnd);
  ctx.lineTo(ex - px * spreadEnd, ey - py * spreadEnd);
  ctx.lineTo(o.x - px * spreadSrc, o.y - py * spreadSrc);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();

  // Hot core down the middle of the cone.
  if (softness < 0.7) {
    const cg = ctx.createLinearGradient(o.x, o.y, ex, ey);
    cg.addColorStop(0, rgba([255, 255, 255], alpha * (1 - softness) * 0.75));
    cg.addColorStop(1, rgba(color, 0));
    ctx.beginPath();
    ctx.moveTo(o.x + px * spreadSrc * 0.35, o.y + py * spreadSrc * 0.35);
    ctx.lineTo(ex + px * spreadEnd * 0.22, ey + py * spreadEnd * 0.22);
    ctx.lineTo(ex - px * spreadEnd * 0.22, ey - py * spreadEnd * 0.22);
    ctx.lineTo(o.x - px * spreadSrc * 0.35, o.y - py * spreadSrc * 0.35);
    ctx.closePath();
    ctx.fillStyle = cg;
    ctx.fill();
  }
  return { ex, ey };
}

function drawPool(ctx, x, y, rx, ry, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / Math.max(rx, 0.001));
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/* --------------------------------------------------------------- movement */

function panFor(pattern, direction, i, t, speed, count) {
  const w = (speed / 100) * 2.2 + 0.05;
  let phase;
  if (direction === 'ccw') phase = -t * w;
  else if (direction === 'pingpong') phase = Math.sin(t * w * 0.55) * 2.4;
  else phase = t * w;

  const spread = ((i / Math.max(count - 1, 1)) - 0.5) * 2; // -1..1 across truss
  switch (pattern) {
    case 'figure8':
      return { pan: Math.sin(phase + i * 0.9) * 0.62, tiltK: 0.5 + 0.5 * Math.sin(2 * phase + i * 0.9) };
    case 'circle':
      return { pan: Math.sin(phase + (i / count) * TAU) * 0.6, tiltK: 0.5 + 0.5 * Math.cos(phase + (i / count) * TAU) };
    case 'wave':
      return { pan: Math.sin(phase + i * 0.62) * 0.55, tiltK: 0.55 + 0.35 * Math.sin(phase * 0.5 + i * 0.62) };
    case 'breathe':
      return { pan: spread * 0.34 + Math.sin(phase * 0.4 + i) * 0.08, tiltK: 0.62 + 0.3 * Math.sin(phase * 0.5) };
    case 'lock':
      return { pan: spread * 0.42, tiltK: 0.78 };
    case 'sweep':
    default:
      return { pan: Math.sin(phase + i * 0.35) * 0.7, tiltK: 0.62 + 0.22 * Math.sin(phase * 0.7) };
  }
}

/* ------------------------------------------------------------------- rig */

export class Rig {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.layout = null;
    this.clock = createBeatClock();
    this.t = 0;
    this.blinderPulse = -10;
    this.bloom = null;
    this.bloomCtx = null;
    this.dpr = 1;
  }

  resize(cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(cssW * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssH * dpr));
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.w = cssW;
    this.h = cssH;
    this.layout = buildLayout(cssW, cssH);
    if (!this.bloom) {
      this.bloom = document.createElement('canvas');
      this.bloomCtx = this.bloom.getContext('2d');
    }
    this.bloom.width = Math.max(1, Math.floor(cssW / 4));
    this.bloom.height = Math.max(1, Math.floor(cssH / 4));
  }

  pulseBlinder() {
    this.blinderPulse = this.t;
  }

  /**
   * @param {number} dt seconds since last frame
   * @param {object} scene control-desk state
   * @param {object} theme theme record
   * @param {object} audio { level, bass, mid, treble } each 0..1
   */
  frame(dt, scene, theme, audio) {
    if (!this.layout) return;
    this.t += dt;
    const t = this.t;
    const ctx = this.ctx;
    const L = this.layout;
    const { w, h } = L;

    advanceClock(this.clock, dt, theme.bpm || 120, audio, scene.beatSync);

    const master = scene.blackout ? 0 : (scene.intensity / 100);
    const fog = scene.fixtures.fog ? scene.fogDensity / 100 : 0.06;
    const hazeGain = 0.28 + fog * 0.95; // beams need haze to be visible
    const speed = scene.speed;
    const kick = scene.beatSync ? Math.max(this.clock.env, audio ? audio.bass * 0.9 : 0) : 0.35;
    const contrast = scene.contrast / 100;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.globalCompositeOperation = 'source-over';

    this.#background(ctx, L, theme, master, contrast);
    if (fog > 0.02) this.#fog(ctx, L, t, fog, theme, master);

    ctx.globalCompositeOperation = 'lighter';
    if (scene.fixtures.ledPar) this.#ledRamp(ctx, L, theme, scene, t, master, kick);
    if (scene.fixtures.classicPar) this.#classicPars(ctx, L, theme, scene, t, master, hazeGain);
    this.#movingHeads(ctx, L, theme, scene, t, master, hazeGain, kick, speed);
    if (scene.fixtures.laser) this.#lasers(ctx, L, theme, scene, t, master, hazeGain, kick);
    if (scene.fixtures.blinder) this.#blinders(ctx, L, scene, t, master, this.clock);
    ctx.globalCompositeOperation = 'source-over';

    this.#structure(ctx, L, theme, scene, master);
    this.#crowd(ctx, L, theme, scene, t, master, kick);

    ctx.globalCompositeOperation = 'lighter';
    if (scene.fixtures.strobe && scene.strobeRate > 0) this.#strobe(ctx, L, scene, t, master);
    ctx.globalCompositeOperation = 'source-over';

    this.#vignette(ctx, L, contrast);
    ctx.restore();

    this.#bloomPass(contrast, master);
  }

  /* ------------------------------------------------------------ layers */

  #background(ctx, L, theme, master, contrast) {
    const { w, h } = L;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, theme.bg[0]);
    g.addColorStop(0.55, theme.bg[1]);
    g.addColorStop(1, theme.bg[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Floor plane, slightly lighter than the back wall.
    const fg = ctx.createLinearGradient(0, L.wallBottom, 0, h);
    fg.addColorStop(0, 'rgba(255,255,255,0.045)');
    fg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, L.wallBottom, w, h - L.wallBottom);
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + contrast * 0.05})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, L.wallBottom);
    ctx.lineTo(w, L.wallBottom);
    ctx.stroke();
  }

  #fog(ctx, L, t, fog, theme, master) {
    const { w, h } = L;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tint = hexToRgb(theme.palette[0]);
    L.fog.forEach((f, i) => {
      const x = ((f.x + t * f.sp) % 1.3 - 0.15) * w;
      const y = (f.y + Math.sin(t * 0.18 + f.ph) * 0.03) * h;
      const r = f.r * h * (0.7 + fog * 0.6);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = fog * 0.09 * (0.5 + master * 0.5);
      g.addColorStop(0, rgba([tint[0] * 0.4 + 150, tint[1] * 0.4 + 150, tint[2] * 0.4 + 160], a));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
  }

  #ledRamp(ctx, L, theme, scene, t, master, kick) {
    const { arch } = L;
    const rings = 5;
    for (let r = 0; r < rings; r++) {
      const rad = arch.r * (0.5 + r * 0.13);
      const c = pickColor(theme, scene.colorMode, r * 2, t, this.clock.bar);
      const chase = 0.5 + 0.5 * Math.sin(t * (0.6 + scene.speed / 90) - r * 0.9);
      const a = master * (0.1 + chase * 0.22) * (0.75 + kick * 0.5);
      ctx.beginPath();
      ctx.arc(arch.cx, arch.cy, rad, Math.PI, TAU);
      ctx.strokeStyle = rgba(c, a);
      ctx.lineWidth = Math.max(2, L.h * 0.006);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(arch.cx, arch.cy, rad, Math.PI, TAU);
      ctx.strokeStyle = rgba(c, a * 0.35);
      ctx.lineWidth = Math.max(6, L.h * 0.022);
      ctx.stroke();
    }

    // Individual PAR cans washing the back wall.
    L.pars.forEach((p) => {
      const c = pickColor(theme, scene.colorMode, p.i, t, this.clock.bar);
      const chase = 0.5 + 0.5 * Math.sin(t * (1 + scene.speed / 60) - p.i * 0.55);
      const a = master * (0.08 + chase * 0.3) * (0.7 + kick * 0.6);
      drawPool(ctx, p.x, p.y, L.h * 0.1, L.h * 0.1, c, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.5, L.h * 0.007), 0, TAU);
      ctx.fillStyle = rgba(c, clamp(a * 3, 0, 0.95));
      ctx.fill();
    });
  }

  #classicPars(ctx, L, theme, scene, t, master, haze) {
    L.classicPars.forEach((p) => {
      const warm = hslToRgb(28 + 6 * Math.sin(t * 0.4 + p.i), 88, 58);
      const breathe = 0.55 + 0.45 * Math.sin(t * 0.35 + p.i * 1.3);
      const a = master * (0.12 + breathe * 0.2) * haze;
      const angle = (p.x < L.w / 2 ? 1 : -1) * (0.55 + 0.1 * Math.sin(t * 0.2 + p.i));
      drawBeam(ctx, p, Math.PI - angle, L.h * 0.62, L.h * 0.012, L.h * 0.16, warm, a, 0.85);
      drawPool(ctx, p.x, p.y, L.h * 0.06, L.h * 0.03, warm, master * breathe * 0.5);
    });
  }

  #movingHeads(ctx, L, theme, scene, t, master, haze, kick, speed) {
    const count = L.heads.length;
    const widthK = scene.beamWidth / 100;
    L.heads.forEach((head) => {
      const role = head.role;
      const on =
        (role === 'spot' && scene.fixtures.spot) ||
        (role === 'wash' && scene.fixtures.wash) ||
        (role === 'beam' && scene.fixtures.beam);
      if (!on) return;

      const m = panFor(scene.pattern, scene.direction, head.i, t, speed, count);
      const angle = m.pan;
      const len = L.h * lerp(0.75, 1.25, m.tiltK);
      const c = pickColor(theme, scene.colorMode, head.i, t, this.clock.bar);

      let spreadEnd, alpha, softness;
      if (role === 'beam') {
        spreadEnd = L.h * (0.008 + widthK * 0.012);
        alpha = master * haze * (0.5 + kick * 0.5) * 0.55;
        softness = 0.1;
      } else if (role === 'spot') {
        spreadEnd = L.h * (0.03 + widthK * 0.05);
        alpha = master * haze * (0.45 + kick * 0.35) * 0.4;
        softness = 0.35;
      } else {
        spreadEnd = L.h * (0.1 + widthK * 0.16);
        alpha = master * haze * (0.4 + kick * 0.2) * 0.22;
        softness = 0.95;
      }

      // drawBeam takes the angle from straight down, so `pan` maps directly.
      const { ex, ey } = drawBeam(ctx, head, angle * 1.15, len, L.h * 0.006, spreadEnd, c, alpha, softness);

      // Floor pool where the beam lands.
      if (ey > L.wallBottom - L.h * 0.05) {
        const rx = spreadEnd * 1.7;
        drawPool(ctx, ex, Math.min(ey, L.h * 0.98), rx, rx * 0.38, c, master * (role === 'wash' ? 0.35 : 0.6));
        if (role === 'spot') this.#gobo(ctx, ex, Math.min(ey, L.h * 0.98), rx, c, master, t, head.i);
      }

      // Lens glow at the fixture head.
      drawPool(ctx, head.x, head.y, L.h * 0.035, L.h * 0.035, c, master * 0.5);
    });
  }

  #gobo(ctx, x, y, r, c, master, t, i) {
    const dots = 7;
    for (let d = 0; d < dots; d++) {
      const a = (d / dots) * TAU + t * (0.6 + i * 0.1);
      const px = x + Math.cos(a) * r * 0.55;
      const py = y + Math.sin(a) * r * 0.2;
      drawPool(ctx, px, py, r * 0.16, r * 0.07, c, master * 0.5);
    }
  }

  #lasers(ctx, L, theme, scene, t, master, haze, kick) {
    const density = Math.round(lerp(3, 26, scene.laserDensity / 100));
    if (density <= 0) return;

    // Each emitter fans a sheet of beams out over the crowd. Angles are measured
    // from the +x axis (y grows downward), then mirrored for the right emitter.
    const rate = 0.25 + scene.speed / 150;
    const sweep =
      scene.direction === 'pingpong'
        ? Math.sin(t * rate * 1.6) * 0.35
        : Math.sin(t * rate * (scene.direction === 'ccw' ? -1 : 1)) * 0.3;
    const fan = 0.7 + 0.4 * Math.sin(t * 0.8);
    const len = L.w * 0.72;

    L.lasers.forEach((em) => {
      const baseHue = scene.colorMode === 'rainbow' ? (t * 60 + em.i * 120) % 360 : null;
      const tilt = 0.5 + sweep + 0.1 * Math.sin(t * 0.9 + em.i * 1.7);

      for (let i = 0; i < density; i++) {
        const spread = (i / (density - 1 || 1) - 0.5) * fan;
        let a = tilt + spread;
        if (em.dir < 0) a = Math.PI - a; // mirror the right-hand emitter

        const ex = em.x + Math.cos(a) * len;
        const ey = em.y + Math.sin(a) * len;

        const c =
          baseHue != null
            ? hslToRgb(baseHue + i * 6, 100, 58)
            : pickColor(theme, scene.colorMode, i + em.i * 3, t, this.clock.bar);
        const alpha = master * (0.14 + kick * 0.4) * (0.3 + haze * 0.7) * 0.45;

        ctx.beginPath();
        ctx.moveTo(em.x, em.y);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = rgba(c, alpha);
        ctx.lineWidth = Math.max(2.5, L.h * 0.005);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(em.x, em.y);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = rgba([255, 255, 255], alpha * 0.45);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      drawPool(ctx, em.x, em.y, L.h * 0.05, L.h * 0.05, [255, 255, 255], master * 0.3);
    });
  }

  #blinders(ctx, L, scene, t, master, clock) {
    const auto = clock.phase < 0.12 && clock.beat % 8 === 0;
    const manual = t - this.blinderPulse;
    const env = manual < 0.55 ? Math.pow(1 - manual / 0.55, 2) : auto ? 0.55 : 0;
    if (env <= 0.001) return;
    L.blinders.forEach((b) => {
      const c = [255, 244, 214];
      drawPool(ctx, b.x, b.y + L.h * 0.05, L.w * 0.42, L.h * 0.5, c, master * env * 0.5);
      for (let cell = 0; cell < 4; cell++) {
        const cx = b.x + (cell - 1.5) * L.w * 0.018;
        drawPool(ctx, cx, b.y, L.h * 0.035, L.h * 0.035, c, master * env);
      }
    });
  }

  #strobe(ctx, L, scene, t, master) {
    const rate = lerp(1.6, 18, scene.strobeRate / 100); // flashes per second
    const period = 1 / rate;
    const phase = (t % period) / period;
    const on = phase < 0.12;
    if (!on) return;
    const a = master * 0.34 * (0.6 + scene.strobeRate / 200);
    ctx.fillStyle = rgba([255, 255, 255], a);
    ctx.fillRect(0, 0, L.w, L.h);
    L.strobes.forEach((s) => drawPool(ctx, s.x, s.y, L.h * 0.06, L.h * 0.06, [255, 255, 255], master));
  }

  /* --------------------------------------------------------- hardware */

  #structure(ctx, L, theme, scene, master) {
    const { w, h } = L;
    const barY = L.trussY;
    const th = Math.max(4, h * 0.016);

    // Truss: two chords with zig-zag bracing.
    ctx.strokeStyle = 'rgba(150,160,180,0.5)';
    ctx.fillStyle = 'rgba(18,20,28,0.9)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(w * 0.02, barY, w * 0.96, th);
    ctx.strokeRect(w * 0.02, barY, w * 0.96, th);
    ctx.beginPath();
    for (let x = w * 0.02; x < w * 0.98; x += th) {
      ctx.moveTo(x, barY);
      ctx.lineTo(x + th, barY + th);
      ctx.moveTo(x + th, barY);
      ctx.lineTo(x, barY + th);
    }
    ctx.strokeStyle = 'rgba(120,132,155,0.35)';
    ctx.stroke();

    // Vertical goal posts.
    ctx.fillStyle = 'rgba(16,18,26,0.95)';
    ctx.fillRect(w * 0.02, barY, th * 0.8, L.wallBottom - barY);
    ctx.fillRect(w * 0.98 - th * 0.8, barY, th * 0.8, L.wallBottom - barY);

    // Fixture bodies hanging off the truss.
    const bodies = [
      ...L.heads.map((p) => ({ ...p, kind: 'head' })),
      ...L.blinders.map((p) => ({ ...p, kind: 'blinder' })),
      ...L.strobes.map((p) => ({ ...p, kind: 'strobe' })),
    ];
    bodies.forEach((p) => {
      const bw = p.kind === 'blinder' ? h * 0.055 : h * 0.026;
      const bh = h * 0.03;
      ctx.fillStyle = 'rgba(10,12,18,0.95)';
      ctx.strokeStyle = 'rgba(140,150,170,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(p.x - bw / 2, p.y - bh, bw, bh, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(p.x - 1.5, barY + th, 3, p.y - bh - barY - th);
    });

    // DJ booth.
    const bx = w * 0.36;
    const bw = w * 0.28;
    const by = L.wallBottom + h * 0.06;
    const bhh = h * 0.16;
    ctx.fillStyle = 'rgba(8,10,16,0.96)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bhh, 6);
    ctx.fill();
    const bg = ctx.createLinearGradient(bx, by, bx + bw, by);
    const c0 = hexToRgb(theme.palette[0]);
    const c1 = hexToRgb(theme.palette[1 % theme.palette.length]);
    bg.addColorStop(0, rgba(c0, 0.55 * master));
    bg.addColorStop(1, rgba(c1, 0.55 * master));
    ctx.fillStyle = bg;
    ctx.fillRect(bx + 4, by + 4, bw - 8, h * 0.012);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(bx + 4, by + bhh - h * 0.02, bw - 8, h * 0.006);

    // DJ silhouette behind the booth.
    ctx.fillStyle = 'rgba(4,5,9,0.95)';
    ctx.beginPath();
    ctx.arc(w * 0.5, by - h * 0.035, h * 0.026, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(w * 0.5 - h * 0.05, by - h * 0.012, h * 0.1, h * 0.05, 6);
    ctx.fill();
  }

  #crowd(ctx, L, theme, scene, t, master, kick) {
    const rim = hexToRgb(theme.palette[0]);
    // Head count follows the show's guest number, so a bigger crowd is visible.
    const shown = Math.round(L.crowd.length * (scene.crowdFraction ?? 1));
    L.crowd.slice(0, shown).forEach((p) => {
      const bob = Math.sin(t * 3.2 + p.phase) * 3 + kick * 6;
      const y = p.base - bob;
      const s = p.scale * L.h * 0.05;
      ctx.fillStyle = `rgba(2,3,6,${0.72 + p.depth * 0.08})`;
      ctx.beginPath();
      ctx.arc(p.x, y, s * 0.32, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(p.x - s * 0.4, y + s * 0.28, s * 0.8, s * 1.5, s * 0.3);
      ctx.fill();
      if (p.arms) {
        ctx.strokeStyle = `rgba(2,3,6,${0.7 + p.depth * 0.1})`;
        ctx.lineWidth = s * 0.2;
        ctx.beginPath();
        ctx.moveTo(p.x - s * 0.35, y + s * 0.5);
        ctx.lineTo(p.x - s * 0.7, y - s * (0.5 + kick * 0.4));
        ctx.moveTo(p.x + s * 0.35, y + s * 0.5);
        ctx.lineTo(p.x + s * 0.7, y - s * (0.5 + kick * 0.4));
        ctx.stroke();
      }
      // Rim light from the rig.
      ctx.strokeStyle = rgba(rim, 0.14 * master * (0.4 + kick));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, y, s * 0.32, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    });
  }

  #vignette(ctx, L, contrast) {
    const { w, h } = L;
    const g = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.2, w / 2, h * 0.55, h * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.35 + contrast * 0.5})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  #bloomPass(contrast, master) {
    if (!this.bloomCtx || master <= 0) return;
    const bc = this.bloomCtx;
    try {
      bc.clearRect(0, 0, this.bloom.width, this.bloom.height);
      bc.drawImage(this.canvas, 0, 0, this.bloom.width, this.bloom.height);
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(0.16 + contrast * 0.3, 0, 0.5);
      ctx.filter = 'blur(6px)';
      ctx.drawImage(this.bloom, 0, 0, this.canvas.width, this.canvas.height);
      ctx.filter = 'none';
      ctx.restore();
    } catch {
      /* canvas filter unsupported — the rig simply renders without glow */
    }
  }
}
