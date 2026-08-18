/**
 * Turn YouTube metadata into something a music catalogue will actually match.
 *
 * A YouTube result carries a video title and a channel name, not a song and an
 * artist: "Billie Eilish - bury a friend (Official Music Video)" by
 * "BillieEilishVEVO". Searching iTunes for that verbatim returns nothing, which
 * is why the preview fallback appeared to be broken — it was finding no match
 * rather than failing to run.
 */

const NOISE = [
  /\((?:[^)]*\b(?:official|lyrics?|audio|video|music|visuali[sz]er|hd|4k|remaster(?:ed)?|explicit|mv)\b[^)]*)\)/gi,
  /\[(?:[^\]]*\b(?:official|lyrics?|audio|video|music|visuali[sz]er|hd|4k|remaster(?:ed)?|explicit|mv)\b[^\]]*)\]/gi,
  /\b(?:official\s+(?:music\s+)?video|official\s+audio|lyrics?\s+video|full\s+(?:song|video|audio)|visuali[sz]er)\b/gi,
];

/** Strip channel-flavoured suffixes: "…VEVO", "… - Topic", "Foo Records". */
export function cleanArtist(artist = '') {
  return artist
    .replace(/\s*-\s*topic\s*$/i, '')
    .replace(/vevo\s*$/i, '')
    .replace(/\s*(?:official|music|records|entertainment)\s*$/i, '')
    .trim();
}

export function cleanTitle(title = '') {
  let t = title;
  NOISE.forEach((re) => {
    t = t.replace(re, ' ');
  });
  // Everything after the first pipe is packaging — album, label, channel.
  return t
    .split(/\s*[|｜]\s*/)[0]
    .replace(/["“”]/g, '')
    .replace(/\s*[-–—]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Ordered list of queries to try, best guess first, de-duplicated.
 * A YouTube title usually already reads "Artist - Song", so it stands alone;
 * the narrower variants are there for when the full string finds nothing.
 */
export function previewQueries(track = {}) {
  const title = cleanTitle(track.title || '');
  const artist = cleanArtist(track.artist || '');
  const out = [];

  if (title) out.push(title);
  if (title && artist && !title.toLowerCase().includes(artist.toLowerCase())) {
    out.push(`${title} ${artist}`);
  }

  // "Artist - Song" → try each side, in case the dash split is the useful part.
  const dash = title.split(/\s+[-–—]\s+/);
  if (dash.length >= 2) {
    const [left, ...rest] = dash;
    const right = rest.join(' - ').trim();
    if (right) out.push(`${right} ${left}`.trim());
    if (right) out.push(right);
  }

  return [...new Set(out.filter(Boolean))].slice(0, 3);
}
