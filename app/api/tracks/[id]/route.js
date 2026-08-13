import { updateTrack, deleteTrack } from '@/lib/store';
import { isAdmin, denied } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  if (!isAdmin(request)) return denied();
  const { id } = await params;
  try {
    const patch = await request.json();
    const track = await updateTrack(id, patch);
    if (!track) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ track });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  if (!isAdmin(request)) return denied();
  const { id } = await params;
  try {
    const ok = await deleteTrack(id);
    return Response.json({ ok }, { status: ok ? 200 : 404 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
