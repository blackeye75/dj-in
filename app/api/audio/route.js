/**
 * Same-origin audio relay.
 *
 * The DJ console has to run its decks through Web Audio — EQ, filters, a real
 * crossfader, beat-accurate loops. That means `decodeAudioData` on the bytes,
 * and the preview CDNs send no `Access-Control-Allow-Origin`, so the browser
 * refuses to hand them over. Fetching through our own origin removes the
 * cross-origin question entirely.
 *
 * This is a relay, not an open proxy: the target host must be on the allowlist
 * below, so nobody can point it at an internal address or use the deployment as
 * free bandwidth for arbitrary files.
 */

export const dynamic = 'force-dynamic';

/** Preview CDNs we are willing to relay. Suffix match on the hostname. */
const ALLOWED_HOSTS = [
  'audio-ssl.itunes.apple.com',
  'audio-ssl.mzstatic.com',
  '.mzstatic.com',
  'p.scdn.co', // Spotify 30s previews
];

const MAX_BYTES = 12 * 1024 * 1024; // a 30s preview is ~0.5 MB; this is slack

function allowed(url) {
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h));
}

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) return Response.json({ error: 'url is required' }, { status: 400 });

  let target;
  try {
    target = new URL(raw);
  } catch {
    return Response.json({ error: 'url is not valid' }, { status: 400 });
  }
  if (!allowed(target)) {
    return Response.json({ error: 'that host is not relayable' }, { status: 403 });
  }

  // Pass Range straight through, so the <audio> fallback can still seek and the
  // browser can start playing before the whole file has landed.
  const range = request.headers.get('range');
  const headers = range ? { Range: range } : {};

  let upstream;
  try {
    upstream = await fetch(target.toString(), { headers, cache: 'no-store' });
  } catch {
    return Response.json({ error: 'could not reach the audio host' }, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return Response.json({ error: `audio host returned ${upstream.status}` }, { status: 502 });
  }

  const length = Number(upstream.headers.get('content-length') || 0);
  if (length > MAX_BYTES) {
    return Response.json({ error: 'that file is too large to relay' }, { status: 413 });
  }

  const out = new Headers();
  out.set('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
  out.set('Accept-Ranges', 'bytes');
  out.set('Cache-Control', 'public, max-age=3600');
  for (const h of ['content-length', 'content-range']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}
