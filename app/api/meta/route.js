import { getMeta, bumpVisitors, setMeta, storageMode } from '@/lib/store';
import { availableProviders } from '@/lib/musicSources';
import { isAdmin, denied, adminRequired } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const meta = await getMeta();
  return Response.json({
    ...meta,
    storage: storageMode(),
    providers: availableProviders(),
    adminRequired: adminRequired(),
  });
}

/** Counts one visitor for the show. */
export async function POST() {
  try {
    const meta = await bumpVisitors();
    return Response.json(meta);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isAdmin(request)) return denied();
  try {
    const body = await request.json();
    const meta = await setMeta(body);
    return Response.json(meta);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
