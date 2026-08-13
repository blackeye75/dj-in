import { reorderTracks } from '@/lib/store';
import { isAdmin, denied } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!isAdmin(request)) return denied();
  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids)) return Response.json({ error: 'ids[] required' }, { status: 400 });
    await reorderTracks(ids);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
