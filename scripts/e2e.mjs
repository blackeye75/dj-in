import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3213';
const OUT = '/tmp/claude-0/-home-user-dj-in/98be2b26-7e9f-53ce-8601-d9f82fbeb63f/scratchpad';
const results = [];
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /start the set/i }).click();
await page.waitForTimeout(1800);

// 1. Transport is actually running.
const t1 = await page.evaluate(() => document.body.innerText.match(/0:0\d \/ 0:45/)?.[0] || '');
check('playback advances', /0:0[1-9]/.test(t1), t1);

// 2. Queue drag-and-drop reorder (HTML5 DnD via manual events).
await page.evaluate(() => document.getElementById('deck').scrollIntoView());
await page.waitForTimeout(700);
const titles = () => page.$$eval('.queue-item', (els) => els.map((e) => e.innerText.split('\n').find((l) => /[A-Za-z]{3}/.test(l)) || ''));
const before = await titles();
await page.evaluate(() => {
  const items = document.querySelectorAll('.queue-item');
  const dt = new DataTransfer();
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, dataTransfer: dt }));
  dt.setData('text/plain', '3');
  fire(items[3], 'dragstart');
  fire(items[0], 'dragover');
  fire(items[0], 'drop');
  fire(items[3], 'dragend');
});
await page.waitForTimeout(400);
const after = await titles();
check('queue drag reorder', after[0] === before[3] && after.length === before.length, `${before[3]} -> slot 1`);

// 3. Clicking a queue row loads that track.
await page.locator('.queue-item').nth(2).getByRole('button').first().click();
await page.waitForTimeout(1200);
const nowPlaying = await page.locator('h2').first().innerText();
check('queue row loads track', nowPlaying.length > 0, nowPlaying);

// 4. Blackout kills the rig output.
await page.evaluate(() => document.getElementById('desk').scrollIntoView());
await page.waitForTimeout(600);
const sample = () =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(c.width * 0.5, c.height * 0.35, 40, 40).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum / (d.length / 4);
  });
const litBefore = await sample();
await page.getByRole('button', { name: 'Blackout', exact: true }).click();
await page.waitForTimeout(800);
const litAfter = await sample();
check('blackout darkens the rig', litAfter < litBefore * 0.6, `${litBefore.toFixed(0)} -> ${litAfter.toFixed(0)}`);
await page.getByRole('button', { name: 'Blackout', exact: true }).click();

// 5. Fixture patch toggles change the render.
await page.getByRole('switch', { name: /Lasers/i }).click();
await page.waitForTimeout(500);
const lasersOff = await page.getByRole('switch', { name: /Lasers/i }).getAttribute('aria-checked');
check('fixture switch toggles', lasersOff === 'false');
await page.getByRole('switch', { name: /Lasers/i }).click();

// 6. Lyrics: clicking a line seeks.
await page.evaluate(() => document.getElementById('deck').scrollIntoView());
await page.waitForTimeout(500);
await page.locator('.queue-item').filter({ hasText: 'Ramp Ignition' }).getByRole('button').first().click();
await page.waitForTimeout(1200);
await page.evaluate(() => document.getElementById('lyrics').scrollIntoView());
await page.waitForTimeout(800);
const lyricButtons = page.locator('.lyric-line');
const lyricCount = await lyricButtons.count();
if (lyricCount > 3) {
  await lyricButtons.nth(3).click();
  await page.waitForTimeout(600);
  const pos = await page.evaluate(() => document.body.innerText.match(/(\d:\d\d) \/ 0:\d\d/)?.[1] || '');
  check('lyric line seeks playhead', pos !== '0:00', pos);
} else {
  check('lyric line seeks playhead', false, `only ${lyricCount} lines`);
}

// 7. Theme switch swaps scene + playlist.
await page.evaluate(() => document.getElementById('stage').scrollIntoView());
await page.waitForTimeout(500);
await page.getByRole('button', { name: /category/i }).first().click();
await page.waitForTimeout(300);
await page.getByRole('option', { name: /Sleep/i }).click();
await page.waitForTimeout(1500);
const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
check('theme switch repaints accent', accent === '#ff9d5c', accent);
await page.screenshot({ path: `${OUT}/07-sleep.png` });

// 8. Admin: create, then delete a track.
const api = await page.request;
const created = await api.post(`${BASE}/api/tracks`, {
  data: { theme: 'focus', title: 'E2E Probe', artist: 'Test', source: 'synth', sourceId: 'steady' },
});
const createdBody = await created.json();
check('admin creates a track', created.status() === 201 && createdBody.track?.id, `status ${created.status()}`);

const listed = await (await api.get(`${BASE}/api/tracks?theme=focus`)).json();
check('created track is listed', listed.tracks.some((t) => t.title === 'E2E Probe'));

const del = await api.delete(`${BASE}/api/tracks/${createdBody.track.id}`);
check('admin deletes a track', del.ok());

// 9. Meta counter.
const meta = await (await api.get(`${BASE}/api/meta`)).json();
check('visitor counter increments', meta.visitors >= 1, `visitors=${meta.visitors}`);

// 10. Reorder endpoint.
const fresh = await (await api.get(`${BASE}/api/tracks?theme=focus`)).json();
const ids = fresh.tracks.map((t) => t.id).reverse();
const re = await api.post(`${BASE}/api/tracks/reorder`, { data: { ids } });
const after2 = await (await api.get(`${BASE}/api/tracks?theme=focus`)).json();
check('reorder persists', re.ok() && after2.tracks[0].id === ids[0]);

console.log(results.join('\n'));
console.log('\nPAGE ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
