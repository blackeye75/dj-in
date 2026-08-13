import { listTracks, createTrack, storageMode } from '@/lib/store';
import { THEME_IDS } from '@/lib/themes';
import { isAdmin, denied } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const theme = new URL(request.url).searchParams.get('theme') || '';
  try {
    const tracks = await listTracks(theme);
    return Response.json({ tracks, storage: storageMode() });
  } catch (err) {
    return Response.json({ error: err.message, tracks: [] }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isAdmin(request)) return denied();
  try {
    const body = await request.json();
    if (!body.title || !THEME_IDS.includes(body.theme)) {
      return Response.json({ error: 'title and a valid theme are required' }, { status: 400 });
    }
    const track = await createTrack(body);
    return Response.json({ track }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
