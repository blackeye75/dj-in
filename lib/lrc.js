/** LRC helpers — `[mm:ss.xx] line` in, `{ t, text }[]` out, and back again. */

const TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(text) {
  const out = [];
  String(text || '')
    .split(/\r?\n/)
    .forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const stamps = [...line.matchAll(TAG)];
      const body = line.replace(TAG, '').trim();
      if (!stamps.length) {
        // Plain line with no timing yet — keep it, time it later.
        out.push({ t: null, text: body || line });
        return;
      }
      stamps.forEach((m) => {
        const frac = m[3] ? Number(`0.${m[3]}`) : 0;
        out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text: body });
      });
    });

  // Space out any untimed lines so they still scroll in order.
  let last = 0;
  return out
    .map((l) => {
      if (l.t == null) {
        last += 4;
        return { t: last, text: l.text };
      }
      last = l.t;
      return l;
    })
    .sort((a, b) => a.t - b.t);
}

export function formatLrc(lines) {
  return (lines || [])
    .slice()
    .sort((a, b) => a.t - b.t)
    .map(({ t, text }) => {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const cs = Math.round((t - Math.floor(t)) * 100);
      return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}] ${text}`;
    })
    .join('\n');
}
