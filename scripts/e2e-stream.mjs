/**
 * Streaming-UX and smoke checks.
 *
 * The buffered readout is only worth anything if it reflects real network
 * state, so the audio here is served through an intercepted request and the
 * test reads what the player reports back. The smoke checks measure the
 * canvas directly: a ground layer should travel sideways and stay put
 * vertically, which is exactly what a brightness profile can tell us.
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3000';
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);

const STUB = 'https://stub.invalid/tone.wav';

/** 20s of quiet tone — long enough that buffering is a real, observable state. */
function tone({ seconds = 20, sr = 22050 } = {}) {
  const n = sr * seconds;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / sr) * 8000), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const WAV = tone();

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.route(STUB, (route) =>
  route.fulfill({ status: 200, headers: { 'Content-Type': 'audio/wav' }, body: WAV })
);

/* A track whose audio we control end to end. */
const api = await page.request;
const created = await api.post(`${BASE}/api/tracks`, {
  data: { theme: 'focus', title: 'Buffer Probe', artist: 'Test', source: 'url', previewUrl: STUB, duration: 20 },
});
const trackId = (await created.json()).track?.id;
check('probe track created', created.status() === 201 && !!trackId, `status ${created.status()}`);

await page.goto(BASE, { waitUntil: 'networkidle' });

/* ------------------------------------------------------ buffered readout */

// The synth deck needs no network, so it should report fully loaded at once.
await page.getByRole('button', { name: /start the set/i }).click();
await page.waitForTimeout(2000);
await page.evaluate(() => document.getElementById('deck').scrollIntoView());
await page.waitForTimeout(600);

const loadedLabel = () => page.locator('text=/% loaded|Buffering/').first().textContent().catch(() => '');
check('synth deck reports fully loaded', /100% loaded/.test(await loadedLabel()), await loadedLabel());

/* Now the streamed track. */
await page.evaluate(() => document.getElementById('stage').scrollIntoView());
await page.waitForTimeout(400);
await page.getByRole('button', { name: /category/i }).first().click();
await page.waitForTimeout(300);
await page.getByRole('option', { name: /Focus/i }).click();
await page.waitForTimeout(1800);

await page.evaluate(() => document.getElementById('deck').scrollIntoView());
await page.waitForTimeout(500);
const row = page.getByRole('button', { name: /Buffer Probe/i }).first();
await row.click().catch(() => {});
await page.waitForTimeout(2500);

const seekVars = () =>
  page.evaluate(() => {
    const el = document.querySelector('input[aria-label="Seek"]');
    if (!el) return null;
    const st = el.style;
    return { pct: st.getPropertyValue('--pct'), buf: st.getPropertyValue('--buf') };
  });
const vars = await seekVars();
const num = (v) => parseFloat(String(v || '0'));
check(
  'seek slider carries a buffered band',
  vars && num(vars.buf) > num(vars.pct),
  vars ? `played ${vars.pct}, loaded ${vars.buf}` : 'no seek slider'
);

const label = await loadedLabel();
const pctLoaded = parseInt(label, 10);
check('loaded percentage is reported', /% loaded/.test(label) && pctLoaded > 0, label);

const barBuf = await page.evaluate(() => {
  const bar = document.querySelector('.fixed.bottom-0 .bg-white\\/25');
  return bar ? bar.style.width : null;
});
check('transport bar draws the loaded band', barBuf && parseFloat(barBuf) > 0, String(barBuf));

/* ------------------------------------------------------------- smoke flow */

await page.evaluate(() => document.getElementById('desk').scrollIntoView());
await page.waitForTimeout(500);

const setRange = (label, value) =>
  page.evaluate(
    ([label, value]) => {
      const el = [...document.querySelectorAll('input[type=range]')].find(
        (i) => (i.getAttribute('aria-label') || '').toLowerCase() === label.toLowerCase()
      );
      if (!el) throw new Error('no control ' + label);
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [label, value]
  );

// Back to a theme that actually patches the smoke machine in — Focus does not,
// and measuring an empty floor would pass every check below for the wrong
// reason. Blackout then leaves the smoke as the only thing lighting the deck.
await page.evaluate(() => document.getElementById('stage').scrollIntoView());
await page.waitForTimeout(400);
await page.getByRole('button', { name: /category/i }).first().click();
await page.waitForTimeout(300);
await page.getByRole('option', { name: /DJ Night/i }).click();
await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('desk').scrollIntoView());
await page.waitForTimeout(600);

await page.getByRole('button', { name: 'Blackout' }).click();
await page.getByRole('switch', { name: /Fog Machine/i }).click(); // haze would blur the measurement
await page.waitForTimeout(600);

/**
 * Two measurements off the canvas:
 *
 *   profile  — brightness summed per column across the deck band. Cross-
 *              correlating it between two moments gives the layer's actual
 *              horizontal displacement in pixels, which is what "flow" means.
 *   centroid — the vertical centre of mass of the same band. A layer lying on
 *              the ground holds this still; one that bounces does not.
 */
const sample = () =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    const ctx = c.getContext('2d');
    const y0 = Math.floor(c.height * 0.6);
    const hgt = Math.floor(c.height * 0.26);
    const d = ctx.getImageData(0, y0, c.width, hgt).data;

    const step = 2;
    const profile = new Float64Array(Math.floor(c.width / step));
    let weighted = 0;
    let total = 0;
    for (let y = 0; y < hgt; y++) {
      let row = 0;
      for (let xi = 0; xi < profile.length; xi++) {
        const i = (y * c.width + xi * step) * 4;
        const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
        profile[xi] += v;
        row += v;
      }
      weighted += row * y;
      total += row;
    }
    return { profile: Array.from(profile), centroid: total > 0 ? weighted / total : 0, total, step };
  });

/**
 * How much the layer's shape changed between two profiles, as a fraction of
 * its brightness. Cross-correlation is no use here: the puffs are wide, they
 * overlap, and each drifts at its own rate, so the profile deforms rather than
 * translating rigidly and there is no sharp peak to find. How much it changed
 * is the honest question, and it answers "is it flowing" directly.
 */
function profileChange(a, b) {
  let diff = 0;
  let total = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    diff += Math.abs(a[i] - b[i]);
    total += a[i];
  }
  return total > 0 ? diff / total : 0;
}

/** Fraction of the layer that moved over `ms`, at the current drift setting. */
async function travel(ms) {
  const a = await sample();
  await page.waitForTimeout(ms);
  const b = await sample();
  return { change: profileChange(a.profile, b.profile), a, b };
}

// Confirm the smoke is what the checks below are actually measuring. Brightness
// alone is a weak signal — the lit floor and the crowd are a large static
// baseline that the smoke only adds about a tenth to. Motion is the real tell:
// with the machine patched out, nothing on the deck moves at all.
const smokeSwitch = page.getByRole('switch', { name: /Smoke Machine/i });
await smokeSwitch.click(); // off
await page.waitForTimeout(700);
const off = await travel(1600);
await smokeSwitch.click(); // on
await setRange('Smoke density', 100);
await setRange('Smoke drift', 100);
await page.waitForTimeout(700);
const on = await travel(1600);
check(
  'the deck only moves when the smoke machine is patched in',
  off.change < 0.01 && on.change > off.change * 3,
  `${(off.change * 100).toFixed(1)}% off, ${(on.change * 100).toFixed(1)}% on; ` +
    `brightness ${Math.round(off.a.total / 1000)}k -> ${Math.round(on.a.total / 1000)}k`
);

await setRange('Smoke drift', 0);
await page.waitForTimeout(1500);
const still = await travel(1600);
check('at zero drift the layer is nearly static', still.change < 0.06, `${(still.change * 100).toFixed(1)}% changed in 1.6s`);

await setRange('Smoke drift', 100);
await page.waitForTimeout(800);

// Vertical stability is measured while it is actually flowing — that is where
// the old version bounced, because it lifted the layer on every kick.
const centroids = [];
for (let i = 0; i < 8; i++) {
  centroids.push((await sample()).centroid);
  await page.waitForTimeout(200);
}
const vDrift = Math.max(...centroids) - Math.min(...centroids);
check('layer does not bounce vertically', vDrift < 2.5, `vertical centroid moves ${vDrift.toFixed(2)}px`);

const moving = await travel(1600);
check(
  'drift control sets how fast it flows',
  moving.change > still.change * 3,
  `${(still.change * 100).toFixed(1)}% at 0%, ${(moving.change * 100).toFixed(1)}% at 100%, over 1.6s`
);

/* Cleanup. */
if (trackId) await api.delete(`${BASE}/api/tracks/${trackId}`);

console.log('\n' + results.join('\n'));
console.log('\nPAGE ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
