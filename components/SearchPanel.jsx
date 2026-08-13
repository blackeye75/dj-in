'use client';

import { useEffect, useRef, useState } from 'react';
import { useShow } from '@/app/show-context';
import { Panel } from './ui';

const PROVIDER_LABEL = { itunes: 'iTunes', youtube: 'YouTube', spotify: 'Spotify' };

/** Search any provider and push results straight into the queue. */
export default function SearchPanel() {
  const { meta, enqueue, playTrack, notify } = useShow();
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('itunes');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const debounce = useRef(null);

  const providers = Object.entries(meta.providers || { itunes: true })
    .filter(([, on]) => on)
    .map(([id]) => id);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setError('');
      return;
    }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&provider=${provider}`, { cache: 'no-store' });
        const data = await res.json();
        setResults(data.results || []);
        if (data.error) setError(data.error);
        else if (!data.results?.length) setError('Nothing found for that search.');
      } catch {
        setError('Search is unavailable right now.');
      } finally {
        setBusy(false);
      }
    }, 420);
    return () => clearTimeout(debounce.current);
  }, [q, provider]);

  const asTrack = (r) => ({
    id: `${r.source}:${r.sourceId}`,
    title: r.title,
    artist: r.artist,
    album: r.album,
    source: r.source,
    sourceId: r.sourceId,
    previewUrl: r.previewUrl,
    artworkUrl: r.artworkUrl,
    duration: r.duration,
    lyrics: [],
  });

  return (
    <Panel className="h-full flex flex-col min-h-0" title="Search music">
      <div className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search songs, artists…"
          aria-label="Search music"
          className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-white/25 placeholder:text-white/25"
        />
        {providers.length > 1 ? (
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            aria-label="Search provider"
            className="bg-black/40 border border-white/10 rounded-xl px-2 text-xs outline-none"
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p] || p}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {busy ? <p className="text-[11px] text-white/40 mb-2">Searching…</p> : null}
      {error && !busy ? <p className="text-[11px] text-amber-300/70 mb-2">{error}</p> : null}

      <ul className="flex-1 min-h-0 overflow-y-auto scroll-thin -mx-2 px-2 space-y-1">
        {results.map((r) => (
          <li key={`${r.source}-${r.sourceId}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5 transition">
            <span className="w-9 h-9 rounded-md overflow-hidden flex-none bg-white/5 border border-white/10">
              {r.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.artworkUrl} alt="" className="w-full h-full object-cover" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] truncate">{r.title}</span>
              <span className="block text-[11px] text-white/40 truncate">{r.artist}</span>
            </span>
            {r.unplayable ? (
              <span className="text-[10px] text-white/30">no preview</span>
            ) : (
              <>
                <button type="button" className="btn !py-1 !px-2 !text-[10px]" onClick={() => enqueue(asTrack(r))}>
                  Queue
                </button>
                <button
                  type="button"
                  className="btn btn-accent !py-1 !px-2 !text-[10px]"
                  onClick={() => playTrack(asTrack(r))}
                >
                  Play
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-white/30 mt-2">
        {provider === 'itunes'
          ? 'iTunes returns 30-second previews — no key needed.'
          : provider === 'youtube'
          ? 'Full tracks play through the YouTube player.'
          : 'Spotify results play only when a preview URL is available.'}
      </p>
    </Panel>
  );
}
