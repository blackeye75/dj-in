/**
 * Music providers.
 *
 * iTunes Search  — default. No API key, returns 30 second preview MP3s plus
 *                  artwork, so search-and-play works out of the box.
 * YouTube        — enabled when YOUTUBE_API_KEY is set. Search returns video
 *                  ids; playback happens in the IFrame player on the client.
 * Spotify        — enabled when SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are
 *                  set. Metadata search; playable only when Spotify still
 *                  exposes a preview_url for the track.
 */

const TIMEOUT = 9000;

async function getJson(url, init = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(to);
  }
}

const big = (url, size = 300) => (url ? url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`) : '');

/* ---------------------------------------------------------------- iTunes */

export async function searchItunes(term, limit = 12) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}`;
  const data = await getJson(url);
  return (data.results || [])
    .filter((r) => r.previewUrl)
    .map((r) => ({
      source: 'itunes',
      sourceId: String(r.trackId),
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName || '',
      previewUrl: r.previewUrl,
      artworkUrl: big(r.artworkUrl100),
      duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 30,
      previewOnly: true,
    }));
}

/* --------------------------------------------------------------- YouTube */

export function youtubeEnabled() {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

export async function searchYouTube(term, limit = 12) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10` +
    `&maxResults=${limit}&q=${encodeURIComponent(term)}&key=${key}`;
  const data = await getJson(url);
  const ids = (data.items || []).map((i) => i.id?.videoId).filter(Boolean);
  let durations = {};
  if (ids.length) {
    try {
      const det = await getJson(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(',')}&key=${key}`
      );
      (det.items || []).forEach((i) => {
        durations[i.id] = iso8601ToSeconds(i.contentDetails?.duration);
      });
    } catch {
      /* durations are optional */
    }
  }
  return (data.items || [])
    .filter((i) => i.id?.videoId)
    .map((i) => ({
      source: 'youtube',
      sourceId: i.id.videoId,
      title: decodeEntities(i.snippet.title),
      artist: decodeEntities(i.snippet.channelTitle),
      album: '',
      previewUrl: '',
      artworkUrl: i.snippet.thumbnails?.high?.url || i.snippet.thumbnails?.default?.url || '',
      duration: durations[i.id.videoId] || 0,
      previewOnly: false,
    }));
}

function iso8601ToSeconds(d) {
  if (!d) return 0;
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

function decodeEntities(s = '') {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/* --------------------------------------------------------------- Spotify */

let spotifyToken = { value: '', expires: 0 };

export function spotifyEnabled() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function spotifyAccessToken() {
  if (spotifyToken.value && Date.now() < spotifyToken.expires) return spotifyToken.value;
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');
  const data = await getJson('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  spotifyToken = { value: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return spotifyToken.value;
}

export async function searchSpotify(term, limit = 12) {
  if (!spotifyEnabled()) return [];
  const token = await spotifyAccessToken();
  const data = await getJson(
    `https://api.spotify.com/v1/search?type=track&limit=${limit}&q=${encodeURIComponent(term)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return (data.tracks?.items || []).map((t) => ({
    source: 'spotify',
    sourceId: t.id,
    title: t.name,
    artist: (t.artists || []).map((a) => a.name).join(', '),
    album: t.album?.name || '',
    previewUrl: t.preview_url || '',
    artworkUrl: t.album?.images?.[0]?.url || '',
    duration: Math.round((t.duration_ms || 0) / 1000),
    previewOnly: true,
    unplayable: !t.preview_url,
  }));
}

/* ----------------------------------------------------------------- facade */

export function availableProviders() {
  return {
    itunes: true,
    youtube: youtubeEnabled(),
    spotify: spotifyEnabled(),
  };
}

export async function searchProvider(provider, term, limit = 12) {
  switch (provider) {
    case 'youtube':
      return searchYouTube(term, limit);
    case 'spotify':
      return searchSpotify(term, limit);
    case 'itunes':
    default:
      return searchItunes(term, limit);
  }
}

/** Resolve a stored catalogue entry (query string) into something playable. */
export async function resolveTrackQuery(query) {
  const results = await searchItunes(query, 1);
  return results[0] || null;
}
