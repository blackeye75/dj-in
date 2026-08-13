# DJ Ramp — Deluxe Salon Light Desk

A single-page DJ ramp for a bus-salon build: a live lighting rig you can actually
operate, six themed categories with their own scenes and playlists, and a music
system with queue, search and timed lyrics.

**Made by Priyanshu Raj.**

---

## What's in it

### The rig (`lib/lightEngine.js`)

A 2D canvas rig running on `requestAnimationFrame`, additive-blended with a
quarter-resolution blur pass for glow. Fixtures are modelled separately, the way
a real patch would be:

| Fixture | Behaviour |
| --- | --- |
| Moving head · **Spot** | Hard-edged cone, gobo dots rotating on the floor pool |
| Moving head · **Wash** | Wide, soft cone spreading colour over the crowd |
| Moving head · **Beam** | Narrow blade with a hot white core cutting the haze |
| **LED PARs** | 11 cans on the ramp arch plus five chasing LED tubes |
| **Classic PARs** | Four floor cans, warm tungsten, slow breathing |
| **Strobes** | Full-frame flashes, 1.6–18 Hz off the strobe fader |
| **Lasers** | Two emitters fanning 3–26 beams over the crowd, sweeping |
| **Blinders** | Two 4-cell bars — automatic on the bar, or the momentary `Blind!` button |
| **Fog** | Drifting haze; beam visibility is scaled by fog density, so beams fade when the haze is off |

Movement patterns (figure 8, sweep, circle, wave, breathe, locked), direction
(CW / CCW / ping-pong), colour mode (theme / rainbow / mono / warm), master
intensity, contrast, speed, beam width and blackout all live on the control desk
and change the render on the next frame.

**Beat clock.** When the built-in House Deck is playing, the rig runs off real
FFT analysis (bass drives the kick envelope). Streamed previews and YouTube
can't be analysed in the browser — those hosts don't send CORS headers, and
routing them through Web Audio would mute them — so the rig falls back to a
free-running clock at the theme's BPM. The desk tells you which mode is active.

### Categories

`dj-night`, `party`, `relax`, `focus`, `sleep`, `priyanshu-list`. Each one owns a
palette, a background, a BPM, a full lighting scene and its own playlist. Picking
one from the dropdown reloads the scene, the accent colour of every control, and
the queue.

### Music system

- **Deck** — artwork, seek, prev/play/next, shuffle, repeat (off / all / one), volume.
- **Queue** — drag-and-drop reordering, click to jump, remove, reload the category list.
- **Search** — iTunes by default (no key, 30-second previews); YouTube and Spotify
  switch on when their credentials are present. Results go straight to the queue.
- **Lyrics** — `{ t, text }` lines, auto-scrolled and highlighted against the
  playhead; click a line to seek there.
- **House Deck** — original tracks generated in the browser by a step-sequenced
  Web Audio synth (`lib/synth.js`), one per category. They always play, need no
  network, and are what feeds the analyser.

### Control panel (`/admin`)

Manage the pre-injected playlist of each category: search-and-inject, add
manually, reorder, delete, resolve previews, and edit timed lyrics with a
stamp-as-you-listen tool (paste `.lrc` or plain lines — plain lines get spaced
out automatically). Also sets the show name and the guest count.

### Show numbers

Visitors are counted once per browser session. The guest/customer count is set in
the panel and drives how dense the crowd looks on stage.

---

## Running it

```bash
npm install
cp .env.example .env.local   # optional — it runs without any of it
npm run dev                  # http://localhost:3000
```

Production:

```bash
npm run build && npm start
```

End-to-end checks (needs a server on `$BASE`, default `http://localhost:3213`):

```bash
BASE=http://localhost:3000 npm run e2e
```

### Environment

| Variable | Effect |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string. Without it, an in-memory store seeded with the same catalogue is used — every screen works, nothing survives a restart. |
| `MONGODB_DB` | Database name (default `dj_in`). |
| `ADMIN_KEY` | Locks `/admin` writes. Unset means the panel is open — fine locally, not for a deployed show. |
| `YOUTUBE_API_KEY` | Enables YouTube search and full-length playback through the IFrame player. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Enables Spotify metadata search; playable only where a `preview_url` still exists. |

The `tracks` collection is seeded automatically on first read.

### A note on the seeded catalogue

Seed entries for real songs are stored as **search queries**, not as fixed
audio URLs. The first time one is played (or when you hit *Resolve* in the
panel) it is looked up through the iTunes Search API and the resolved preview is
cached back onto the document. That keeps the repository free of hardcoded media
links, and it means the catalogue needs outbound network access to become
playable. The House Deck tracks never need it.

Spotify's Web Playback SDK is deliberately not used: it requires user OAuth and
a Premium account, which doesn't fit a kiosk-style show page.

---

## Layout

Four full-viewport sections with scroll snapping — stage, light desk, music,
lyrics + show numbers — over one persistent canvas, with a transport bar pinned
to the bottom. Below 900px the sections stack and snapping is turned off.

## Structure

```
app/
  page.js              landing page — the four sections
  show-context.jsx     themes, scene, queue, transport, meta
  admin/page.js        control panel
  api/                 tracks, search, resolve, reorder, meta
components/            stage canvas, control desk, deck, queue, search, lyrics, stats
lib/
  lightEngine.js       the rig
  synth.js             built-in Web Audio deck
  player.js            one transport over synth / audio element / YouTube
  themes.js            categories and their scenes
  store.js             MongoDB Atlas with in-memory fallback
  musicSources.js      iTunes / YouTube / Spotify
  lrc.js               lyric parsing and formatting
```
