import { searchProvider, availableProviders } from '@/lib/musicSources';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') || '').trim();
  const provider = params.get('provider') || 'itunes';
  const providers = availableProviders();

  if (!q) return Response.json({ results: [], providers });
  if (!providers[provider]) {
    return Response.json({ error: `${provider} is not configured on this deployment`, results: [], providers }, { status: 400 });
  }

  try {
    const results = await searchProvider(provider, q, 14);
    return Response.json({ results, providers });
  } catch (err) {
    return Response.json({ error: `Search failed: ${err.message}`, results: [], providers }, { status: 502 });
  }
}
