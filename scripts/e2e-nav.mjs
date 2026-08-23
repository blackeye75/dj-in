/**
 * Route round-trip checks.
 *
 * The player's YouTube host lives on document.body, outside React, so a
 * client-side route change (Control panel and back) does not clean it up. That
 * once left the old player alive on its iframe while the new engine attached a
 * second player to the same frame — two live players, the dead engine's
 * handlers still firing, and the previous video still playing underneath.
 *
 * The real IFrame API can't be reached from CI, so this stubs it, including the
 * behaviour that made the leak dangerous: `new YT.Player(el)` REPLACES the
 * element with an <iframe> of the same id.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3000';
const results = [];
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);
const b = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

await page.addInitScript(() => {
  window.__yt = { built: 0, destroyed: 0, loaded: [], playedOn: [] };
  const makePlayer = function (el, opts) {
    const id = ++window.__yt.built;
    const node = typeof el === 'string' ? document.getElementById(el) : el;
    // The real API swaps the div for an iframe carrying the same id.
    let frame = node;
    if (node && node.tagName !== 'IFRAME') {
      frame = document.createElement('iframe');
      frame.id = node.id;
      frame.src = 'about:blank';
      node.replaceWith(frame);
    }
    const self = {
      __id: id,
      __dead: false,
      loadVideoById(a) {
        if (self.__dead) throw new Error('player destroyed');
        window.__yt.loaded.push({ player: id, video: a && a.videoId ? a.videoId : a });
      },
      playVideo() {
        if (self.__dead) throw new Error('player destroyed');
        window.__yt.playedOn.push(id);
        self.__t = 0;
        clearInterval(self.__iv);
        self.__iv = setInterval(() => (self.__t += 0.25), 250);
        opts.events.onStateChange && opts.events.onStateChange({ data: 1 });
      },
      pauseVideo() {
        clearInterval(self.__iv);
      },
      stopVideo() {
        clearInterval(self.__iv);
      },
      seekTo() {},
      setVolume() {},
      getVolume: () => 100,
      getCurrentTime: () => self.__t || 0,
      getDuration: () => 200,
      getVideoLoadedFraction: () => 0.5,
      getPlayerState: () => (self.__iv ? 1 : 2),
      destroy() {
        self.__dead = true;
        window.__yt.destroyed++;
        clearInterval(self.__iv);
        frame && frame.remove();
      },
    };
    setTimeout(() => opts.events.onReady && opts.events.onReady({ target: self }), 30);
    return self;
  };
  window.YT = { Player: makePlayer, PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0, BUFFERING: 3 } };
});

/* A YouTube track to work with. */
const api = await page.request;
const made = await api.post(`${BASE}/api/tracks`, {
  data: { theme: 'dj-night', title: 'YT Probe', artist: 'Test', source: 'youtube', sourceId: 'abc123', duration: 200 },
});
const id = (await made.json()).track?.id;

const snap = () =>
  page.evaluate(() => ({
    ...window.__yt,
    hostTag: document.getElementById('yt-host')?.tagName || null,
    hostCount: document.querySelectorAll('#yt-host, [id^="yt-host"]').length,
  }));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

/* Play the YouTube track on the first mount. */
await page.evaluate(() => document.getElementById('deck').scrollIntoView());
await page.waitForTimeout(600);
await page.getByRole('button', { name: /YT Probe/i }).first().click();
await page.waitForTimeout(3000);
const first = await snap();
check('a player is built and playing on first mount', first.built === 1 && first.playedOn.length === 1,
  `built ${first.built}`);

/* Round trip through the control panel, changing nothing — and crucially via
   the in-app link, which is a client-side route change that does NOT tear the
   document down. That is the difference the bug hinged on. */
await page.evaluate(() => document.getElementById('stage').scrollIntoView());
await page.waitForTimeout(400);
await page.locator('#stage').getByRole('link', { name: /control panel/i }).click();
await page.waitForTimeout(2000);
const onAdmin = await snap();
check('leaving the stage destroys the player', onAdmin.destroyed === 1, `destroyed ${onAdmin.destroyed}`);
check('leaving the stage removes its host element', onAdmin.hostCount === 0, `${onAdmin.hostCount} hosts`);

await page.goBack();
await page.waitForTimeout(2500);
const back = await snap();
check('coming back leaves exactly one host', back.hostCount === 1, `${back.hostCount} hosts`);
check(
  'coming back leaves exactly one live player',
  back.built - back.destroyed === 1,
  `${back.built} built, ${back.destroyed} destroyed`
);

/* The track still plays afterwards, on the new player rather than the old. */
await page.evaluate(() => document.getElementById('deck').scrollIntoView());
await page.waitForTimeout(600);
await page.getByRole('button', { name: /YT Probe/i }).first().click();
await page.waitForTimeout(3500);
const after = await snap();
check(
  'playback resumes on the new player, not the dead one',
  after.playedOn[after.playedOn.length - 1] === back.built,
  `played on ${JSON.stringify(after.playedOn)}, newest player is ${back.built}`
);

const t1 = await page.evaluate(() =>
  [...document.querySelectorAll('.fixed.bottom-0 .tabular-nums')].map((n) => n.textContent).join()
);
await page.waitForTimeout(2500);
const t2 = await page.evaluate(() =>
  [...document.querySelectorAll('.fixed.bottom-0 .tabular-nums')].map((n) => n.textContent).join()
);
check('the transport advances after the round trip', t1 !== t2, `${t1} -> ${t2}`);

if (id) await api.delete(`${BASE}/api/tracks/${id}`);

console.log('\n' + results.join('\n'));
console.log('\nPAGE ERRORS:', errs.length ? errs.slice(0, 5) : 'none');
await b.close();
process.exit(results.some((r) => r.startsWith('FAIL')) || errs.length ? 1 : 0);
