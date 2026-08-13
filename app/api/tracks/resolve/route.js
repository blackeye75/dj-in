import { updateTrack } from '@/lib/store';
import { resolveTrackQuery } from '@/lib/musicSources';

export const dynamic = 'force-dynamic';

/**
 * Turns a catalogue entry that only carries a search query into a playable
 * one, then caches the resolved preview back onto the document so the next
 * listener gets it instantly.
 */
export async function POST(request) {
  try {
    const { id, query } = await request.json();
    if (!query) return Response.json({ error: 'query required' }, { status: 400 });

    const hit = await resolveTrackQuery(query);
    if (!hit) return Response.json({ error: 'No preview found for this track' }, { status: 404 });

    const patch = {
      source: 'itunes',
      sourceId: hit.sourceId,
      previewUrl: hit.previewUrl,
      artworkUrl: hit.artworkUrl,
      duration: hit.duration,
      album: hit.album,
    };
    if (id) {
      try {
        await updateTrack(id, patch);
      } catch {
        /* cache write is best effort — playback still works from the response */
      }
    }
    return Response.json({ resolved: patch });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
