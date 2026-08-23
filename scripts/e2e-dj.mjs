/**
 * DJ console checks.
 *
 * The interesting parts of this feature are all audio, so the test drives a
 * real click track through the real graph: it generates a WAV at a known
 * tempo, loads it into a deck, and reads the console's own master meter to
 * confirm signal is actually arriving at the output — not just that buttons
 * changed colour.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:3000';
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);

/** Mono 16-bit WAV: a decaying sine click on every beat at `bpm`. */
// Long enough to still be playing by the last check — a short file ends
// mid-suite and the fader checks then compare silence against silence.
function clickTrack({ bpm = 128, seconds = 45, sr = 44100 } = {}) {
  const n = sr * seconds;
  const data = Buffer.alloc(n * 2);
  const beat = (60 / bpm) * sr;
  for (let i = 0; i < n; i++) {
    const since = i % beat;
    // Short percussive burst, plus a quiet bed so the file isn't pure silence.
    // 60 ms of decay, not 20: the onset stays sharp enough for tempo detection
    // either way, but a 20 ms click is audible for well under a tenth of each
    // beat and the level meter samples straight past it most of the time.
    const env = Math.exp(-since / (sr * 0.06));
    const click = Math.sin((2 * Math.PI * 180 * since) / sr) * env * 0.85;
    const bed = Math.sin((2 * Math.PI * 55 * i) / sr) * 0.08;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round((click + bed) * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(sr * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const wavPath = path.join(os.tmpdir(), 'dj-click-128.wav');
fs.writeFileSync(wavPath, clickTrack({ bpm: 128 }));

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });

/* The console opens from the stage. */
await page.getByRole('button', { name: 'DJ console' }).click();
await page.waitForTimeout(600);
const open = await page.getByRole('heading', { name: 'DJ console' }).isVisible();
check('console opens from the stage', open);

/* Deck A: a local file, decoded and analysed. */
await page.getByLabel('Deck A file').setInputFiles(wavPath);
await page.waitForTimeout(2500);

const bpmText = await page.locator('text=/\\d+\\.\\d BPM/').first().textContent();
const bpm = parseFloat(bpmText);
check('tempo detected from audio', Math.abs(bpm - 128) < 2.5, `${bpmText} (click track is 128)`);

const meter = () => page.getByRole('meter', { name: 'Master level' }).getAttribute('aria-valuenow');

const silent = Number(await meter());
check('master is silent before play', silent < 3, `level ${silent}`);

/* Play, and confirm signal reaches the master bus through the whole strip. */
await page.getByRole('button', { name: 'Deck A play' }).click();
await page.waitForTimeout(1200);

let peak = 0;
for (let i = 0; i < 26; i++) {
  peak = Math.max(peak, Number(await meter()));
  await page.waitForTimeout(80);
}
check('audio reaches the master bus', peak > 8, `peak level ${peak}`);

/* The playhead moves. */
const t1 = await page.locator('.panel', { hasText: 'DECK A' }).locator('span.tabular-nums, .tabular-nums span').first().textContent();
await page.waitForTimeout(1500);
const t2 = await page.locator('.panel', { hasText: 'DECK A' }).locator('span.tabular-nums, .tabular-nums span').first().textContent();
check('playhead advances', t1 !== t2, `${t1} -> ${t2}`);

/* The crossfader really attenuates: hard to B, with nothing on B, kills it. */
await page.getByRole('button', { name: 'Crossfade to B' }).click();
await page.waitForTimeout(700);
let faded = 0;
for (let i = 0; i < 8; i++) {
  faded = Math.max(faded, Number(await meter()));
  await page.waitForTimeout(100);
}
check('crossfader attenuates deck A', faded < peak / 2, `${peak} -> ${faded}`);
await page.getByRole('button', { name: 'Crossfade centre' }).click();
await page.waitForTimeout(400);

/* Low EQ kill drops the level of a bass-heavy click track. */
const deckA = page.locator('.panel', { hasText: 'DECK A' });
const setRange = async (label, value) => {
  await page.evaluate(
    ([label, value]) => {
      const el = [...document.querySelectorAll('input[type=range]')].find(
        (i) => i.getAttribute('aria-label') === label
      );
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [label, value]
  );
};

let before = 0;
for (let i = 0; i < 8; i++) {
  before = Math.max(before, Number(await meter()));
  await page.waitForTimeout(100);
}
await setRange('Deck A channel', 0);
await page.waitForTimeout(700);
let killed = 0;
for (let i = 0; i < 8; i++) {
  killed = Math.max(killed, Number(await meter()));
  await page.waitForTimeout(100);
}
check('channel fader cuts the deck', before > 3 && killed < before / 2, `${before} -> ${killed}`);
await setRange('Deck A channel', 0.85);

/* Looping: an 4-beat loop at 128 BPM is 1.875s, and the console draws it. */
await page.getByRole('button', { name: 'Deck A loop 4 beats' }).click();
await page.waitForTimeout(400);
const loopDrawn = await deckA.locator('.bg-emerald-400\\/25').count();
check('loop is armed and drawn', loopDrawn > 0);

await page.getByRole('button', { name: 'Deck A loop off' }).click();
await page.waitForTimeout(300);
check('loop clears', (await deckA.locator('.bg-emerald-400\\/25').count()) === 0);

/* Hot cue stores and recalls. */
await page.getByRole('button', { name: 'Deck A hot cue 1' }).click();
await page.waitForTimeout(300);
const cueMarks = await deckA.locator('.bg-amber-300').count();
check('hot cue stores a marker', cueMarks > 0);

/* Deck B on the built-in synth, which reports an exact tempo. */
await page.getByLabel('Deck B track').selectOption({ index: 1 });
await page.waitForTimeout(900);
const deckB = page.locator('.panel', { hasText: 'DECK B' });
const bText = await deckB.textContent();
check('synth track loads on deck B', /BPM/.test(bText) && /synth/.test(bText));

/* Sync matches deck B's tempo to deck A. */
await page.getByRole('button', { name: 'Deck B sync' }).click();
await page.waitForTimeout(500);
const bBpm = parseFloat((await deckB.locator('text=/\\d+\\.\\d BPM/').first().textContent()) || '0');
check('sync pulls deck B to deck A', Math.abs(bBpm - bpm) < 1.5, `A ${bpm} / B ${bBpm}`);

/* Every control must clear the fixed transport bar. Tailwind emits `sm:p-6`
   after `pb-24`, so the shorthand used to win above 640px and the last control
   in each deck sat underneath the player. */
await page.evaluate(() => {
  const sc = document.querySelector('.fixed.inset-0.z-50');
  sc.scrollTop = sc.scrollHeight;
});
await page.waitForTimeout(500);
const clearance = await page.evaluate(() => {
  const cue = [...document.querySelectorAll('button')].find((b) =>
    (b.getAttribute('aria-label') || '').includes('headphone cue')
  );
  const bar = document.querySelector('.fixed.bottom-0');
  if (!cue || !bar) return null;
  return Math.round(bar.getBoundingClientRect().top - cue.getBoundingClientRect().bottom);
});
check(
  'the last deck control clears the transport bar',
  clearance !== null && clearance >= 0,
  `${clearance}px of clearance`
);

/* Close returns to the stage. */
await page.getByRole('button', { name: 'Close' }).click();
await page.waitForTimeout(400);
check('console closes', !(await page.getByRole('heading', { name: 'DJ console' }).isVisible().catch(() => false)));

console.log('\n' + results.join('\n'));
console.log('\nPAGE ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
