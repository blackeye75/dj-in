import { chromium } from 'playwright';

/**
 * Touch-device checks. The desktop suite can't cover these: HTML5 drag doesn't
 * exist on touch, and several controls only render below the lg breakpoint.
 */
const BASE = process.env.BASE || 'http://localhost:3000';
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// No horizontal scroll anywhere on the page.
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no horizontal overflow', overflow === 0, `${overflow}px`);

// Touch targets on the controls people actually drag.
const faderHeight = await page.evaluate(() => {
  const f = document.querySelector('.fader');
  return f ? Math.round(f.getBoundingClientRect().height) : 0;
});
check('faders are touch-sized', faderHeight >= 40, `${faderHeight}px`);

// Queue reordering without drag-and-drop.
await page.evaluate(() => document.getElementById('deck').scrollIntoView());
await page.waitForTimeout(700);
const titles = () =>
  page.$$eval('.queue-item', (els) => els.map((e) => e.innerText.split('\n').find((l) => /[A-Za-z]{3}/.test(l)) || ''));
const before = await titles();
await page.locator('.queue-item').nth(1).getByRole('button', { name: /Move .* up/i }).tap();
await page.waitForTimeout(400);
const after = await titles();
check('queue move buttons reorder', after[0] === before[1], `${before[1]} -> slot 1`);

// The remove control must be reachable without hover.
const removeVisible = await page.evaluate(() => {
  const btn = document.querySelector('.queue-item button[aria-label^="Remove"]');
  return btn ? Number(getComputedStyle(btn).opacity) : 0;
});
check('remove button visible without hover', removeVisible > 0.5, `opacity ${removeVisible}`);

// Panels must not trap scrolling in a nested region on touch.
const trapped = await page.evaluate(() =>
  [...document.querySelectorAll('#deck ol, #deck ul')].some((el) => {
    const s = getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4;
  })
);
check('no nested scroll traps in the queue', !trapped);

// Blinder still fires from a tap.
await page.evaluate(() => document.getElementById('desk').scrollIntoView());
await page.waitForTimeout(600);
const sample = () =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    const d = c.getContext('2d').getImageData(c.width * 0.25, c.height * 0.4, 200, 100).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s / (d.length / 4);
  });
const idle = await sample();
const blind = page.getByRole('button', { name: 'Blind!' });
await blind.hover();
await page.mouse.down();
await page.waitForTimeout(250);
const lit = await sample();
await page.mouse.up();
check('blinder fires on touch', lit > idle * 1.25, `${idle.toFixed(0)} -> ${lit.toFixed(0)}`);

// Admin panel fits too.
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const adminOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('admin has no horizontal overflow', adminOverflow === 0, `${adminOverflow}px`);

console.log(results.join('\n'));
console.log('\nPAGE ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
