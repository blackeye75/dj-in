/**
 * Admin gate for the catalogue panel.
 *
 * Set ADMIN_KEY in the environment to lock down writes; the admin UI sends it
 * as `x-admin-key`. With no ADMIN_KEY configured the panel stays open, which is
 * what you want for a local demo but not for a deployed show.
 */

export function adminRequired() {
  return Boolean(process.env.ADMIN_KEY);
}

export function isAdmin(request) {
  const key = process.env.ADMIN_KEY;
  if (!key) return true;
  return request.headers.get('x-admin-key') === key;
}

export function denied() {
  return Response.json({ error: 'Admin key required' }, { status: 401 });
}
