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

---

## Setting up the environment file

**None of this is required to run the app.** With no env file at all it boots on
an in-memory store seeded with the full catalogue, the House Deck plays, and
iTunes search works — because it needs no key. Add variables only for the
features you want.

### 1. Create the file

In the project root (next to `package.json`):

```bash
cp .env.example .env.local
```

On Windows PowerShell: `Copy-Item .env.example .env.local`

Note the leading dot — `.env.example` is a hidden file, so enable "show hidden
files" if your file manager doesn't list it. If it's missing entirely, just
create `.env.local` by hand and paste the block from step 5.

Next.js loads `.env.local` automatically. **It is gitignored, so your keys never
get committed** — that's why the file isn't in the repo to begin with. Restart
the dev server after every change; env vars are read at boot, not per request.

### 2. MongoDB Atlas — `MONGODB_URI`

Only needed if you want tracks, lyrics and show numbers to survive a restart.

1. Sign in at [cloud.mongodb.com](https://cloud.mongodb.com) and create a free
   **M0** cluster.
2. **Database Access → Add New Database User.** Pick a username and password
   (avoid `@ : / ?` in the password, or you'll have to URL-encode them).
3. **Network Access → Add IP Address.** Your own IP for local work; for a
   deployed show, allow your host's egress range. `0.0.0.0/0` works for testing
   but leaves the cluster open to the internet.
4. **Clusters → Connect → Drivers → Node.js**, and copy the string.
5. Replace `<password>` with the real password and put the database name before
   the `?`:

```
MONGODB_URI="mongodb+srv://djuser:YourPassword@cluster0.ab1cd.mongodb.net/dj_in?retryWrites=true&w=majority"
MONGODB_DB=dj_in
```

The `tracks` collection is created and seeded automatically on the first read —
there is no migration or seed command to run. To confirm it took, open the site
and check the **Storage** row in *Show numbers*: it reads `MongoDB Atlas` when
connected, `In-memory` when not.

### 3. Admin lock — `ADMIN_KEY`

Leave it empty and `/admin` is open to anyone who finds the URL. Set it before
deploying:

```
ADMIN_KEY=some-long-random-string
```

The panel then shows a key field; what you type is kept in `localStorage` and
sent as the `x-admin-key` header on every write. Generate one with
`openssl rand -hex 24`.

### 4. Music providers — optional

**YouTube** (full-length playback, not 30-second previews):

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project.
2. **APIs & Services → Library → YouTube Data API v3 → Enable.**
3. **Credentials → Create credentials → API key**, then restrict it to that API.

```
YOUTUBE_API_KEY=AIza...
```

**Spotify** (metadata search only — see the note at the end of this file):

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) →
   **Create app**. Any redirect URI will do; this app uses client-credentials
   auth, not user login.
2. Copy the Client ID and Client Secret.

```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```

A provider only appears in the search dropdown once its credentials are present.

### 5. A complete file

```bash
# Database — omit both lines to run in memory
MONGODB_URI="mongodb+srv://djuser:YourPassword@cluster0.ab1cd.mongodb.net/dj_in?retryWrites=true&w=majority"
MONGODB_DB=dj_in

# Admin panel lock — leave empty for an open local demo
ADMIN_KEY=

# Music providers — iTunes always works without a key
YOUTUBE_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

### 6. Deploying

Do **not** upload `.env.local`. On Vercel, add each variable under
**Project → Settings → Environment Variables** and redeploy — the build only
picks up new values on a fresh deploy. Same idea on any other host: set them as
real environment variables in the platform's dashboard.

### Variable reference

| Variable | Effect |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string. Without it, an in-memory store seeded with the same catalogue is used — every screen works, nothing survives a restart. |
| `MONGODB_DB` | Database name (default `dj_in`). |
| `ADMIN_KEY` | Locks `/admin` writes. Unset means the panel is open — fine locally, not for a deployed show. |
| `YOUTUBE_API_KEY` | Enables YouTube search and full-length playback through the IFrame player. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Enables Spotify metadata search; playable only where a `preview_url` still exists. |

### If something doesn't take

- **Still says "In-memory"** — the URI is wrong, the password wasn't substituted,
  or your IP isn't allowed in Network Access. The server log prints the driver's
  connection error.
- **Changes ignored** — the file is named `.env` instead of `.env.local`, sits
  outside the project root, or the dev server wasn't restarted.
- **Password has `@`, `:`, `/` or `?`** — URL-encode it (`@` → `%40`), or reset
  it to something alphanumeric.
- **Admin writes return 401** — `ADMIN_KEY` is set on the server but the key
  typed into the panel doesn't match.

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
