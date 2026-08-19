/** Colour helpers shared by the rig and the backdrop engine. */

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
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

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp01(a)})`;

/** One fixture's colour, following the desk's colour mode. */
export function pickColor(theme, mode, i, t, bar) {
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
      // Fixture indices can be negative (the hex wall counts columns from off
      // the left edge), and JS `%` keeps the sign — so wrap it by hand.
      const raw = Math.floor(i) + Math.floor(bar / 2);
      const idx = Number.isFinite(raw) ? ((raw % pal.length) + pal.length) % pal.length : 0;
      return hexToRgb(pal[idx]);
    }
  }
}
