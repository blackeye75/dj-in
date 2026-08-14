'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { THEMES } from '@/lib/themes';
import { formatLrc, parseLrc } from '@/lib/lrc';

/**
 * Control panel: manage the pre-injected playlist of every category, time the
 * lyrics, and set the show numbers. Writes are gated by ADMIN_KEY when the
 * deployment sets one.
 */
export default function AdminPage() {
  const [themeId, setThemeId] = useState('dj-night');
  const [tracks, setTracks] = useState([]);
  const [meta, setMeta] = useState({ providers: { itunes: true }, adminRequired: false, storage: 'memory' });
  const [adminKey, setAdminKey] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAdminKey(localStorage.getItem('dj-in-admin-key') || '');
  }, []);

  const authHeaders = useCallback(
    () => ({ 'Content-Type': 'application/json', ...(adminKey ? { 'x-admin-key': adminKey } : {}) }),
    [adminKey]
  );

  const say = useCallback((msg) => {
    setStatus(msg);
    setTimeout(() => setStatus((s) => (s === msg ? '' : s)), 3500);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tracks?theme=${themeId}`, { cache: 'no-store' });
    const data = await res.json();
    setTracks(data.tracks || []);
  }, [themeId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/meta', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);

  const call = useCallback(
    async (url, options = {}) => {
      setBusy(true);
      try {
        const res = await fetch(url, { ...options, headers: authHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
      } finally {
        setBusy(false);
      }
    },
    [authHeaders]
  );

  const addTrack = async (payload) => {
    try {
      await call('/api/tracks', { method: 'POST', body: JSON.stringify({ ...payload, theme: themeId }) });
      say('Track added.');
      load();
    } catch (err) {
      say(err.message);
    }
  };

  const patchTrack = async (id, patch) => {
    try {
      await call(`/api/tracks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      say('Saved.');
      load();
    } catch (err) {
      say(err.message);
    }
  };

  const removeTrack = async (id, title) => {
    if (!confirm(`Remove “${title}” from this category?`)) return;
    try {
      await call(`/api/tracks/${id}`, { method: 'DELETE' });
      say('Removed.');
      load();
    } catch (err) {
      say(err.message);
    }
  };

  const move = async (from, to) => {
    if (to < 0 || to >= tracks.length) return;
    const next = [...tracks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setTracks(next);
    try {
      await call('/api/tracks/reorder', { method: 'POST', body: JSON.stringify({ ids: next.map((t) => t.id) }) });
    } catch (err) {
      say(err.message);
      load();
    }
  };

  return (
    <div className="min-h-dvh bg-ink overflow-x-hidden">
      <header className="border-b border-white/10 px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-lg font-bold">
            Control panel <span className="text-white/30 font-normal text-sm">· pre-injected music & lyrics</span>
          </h1>
          <p className="text-[11px] text-white/35 mt-0.5">
            Storage: {meta.storage === 'atlas' ? 'MongoDB Atlas' : 'in-memory (set MONGODB_URI to persist)'} · made by
            Priyanshu Raj
          </p>
        </div>
        <div className="flex items-center gap-2">
          {meta.adminRequired ? (
            <input
              type="password"
              value={adminKey}
              placeholder="Admin key"
              onChange={(e) => {
                setAdminKey(e.target.value);
                localStorage.setItem('dj-in-admin-key', e.target.value);
              }}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none"
            />
          ) : null}
          <Link href="/" className="btn !text-[11px]">
            Back to the stage
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 sm:p-5 space-y-5">
        {status ? <div className="panel px-4 py-2 text-sm text-white/80">{status}</div> : null}

        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setThemeId(t.id)}
              className={`btn !text-[12px] ${t.id === themeId ? 'btn-accent' : ''}`}
              style={t.id === themeId ? { background: t.accent } : undefined}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2 min-w-0">
          <TrackList
            tracks={tracks}
            busy={busy}
            onMove={move}
            onRemove={removeTrack}
            onEdit={setEditing}
            onResolve={async (t) => {
              try {
                await call('/api/tracks/resolve', {
                  method: 'POST',
                  body: JSON.stringify({ id: t.id, query: t.query || `${t.title} ${t.artist}` }),
                });
                say('Preview resolved and cached.');
                load();
              } catch (err) {
                say(err.message);
              }
            }}
          />

          <div className="space-y-5 min-w-0">
            <SearchAdd providers={meta.providers} onAdd={addTrack} />
            <ManualAdd onAdd={addTrack} />
            <ShowSettings meta={meta} onSave={async (patch) => {
              try {
                const data = await call('/api/meta', { method: 'PATCH', body: JSON.stringify(patch) });
                setMeta((m) => ({ ...m, ...data }));
                say('Show details updated.');
              } catch (err) {
                say(err.message);
              }
            }} />
          </div>
        </div>
      </div>

      {editing ? (
        <LyricsEditor
          track={editing}
          onClose={() => setEditing(null)}
          onSave={async (lyrics) => {
            await patchTrack(editing.id, { lyrics });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- lists */

function TrackList({ tracks, onMove, onRemove, onEdit, onResolve, busy }) {
  return (
    <section className="panel p-4 min-w-0">
      <h2 className="text-[11px] tracking-[0.2em] uppercase text-white/45 mb-3">Playlist · {tracks.length} tracks</h2>
      <ol className="space-y-1.5">
        {tracks.map((t, i) => (
          <li key={t.id} className="panel-tight p-2.5 flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
            <span className="flex flex-col">
              <button type="button" className="text-white/40 hover:text-white leading-none" onClick={() => onMove(i, i - 1)} aria-label="Move up">
                ▲
              </button>
              <button type="button" className="text-white/40 hover:text-white leading-none" onClick={() => onMove(i, i + 1)} aria-label="Move down">
                ▼
              </button>
            </span>
            <span className="w-9 h-9 rounded-md overflow-hidden flex-none bg-white/5 border border-white/10 grid place-items-center text-[10px]">
              {t.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.artworkUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                i + 1
              )}
            </span>
            <span className="min-w-0 flex-1 basis-40">
              <span className="block text-sm truncate">{t.title}</span>
              <span className="block text-[11px] text-white/40 truncate">
                {t.artist} · {t.source}
                {t.lyrics?.length ? ` · ${t.lyrics.length} lyric lines` : ''}
                {t.source === 'itunes' && !t.previewUrl ? ' · not resolved' : ''}
              </span>
            </span>
            {t.source === 'itunes' && !t.previewUrl ? (
              <button type="button" className="btn !py-1 !px-2 !text-[10px]" disabled={busy} onClick={() => onResolve(t)}>
                Resolve
              </button>
            ) : null}
            <button type="button" className="btn !py-1 !px-2 !text-[10px]" onClick={() => onEdit(t)}>
              Lyrics
            </button>
            <button type="button" className="btn !py-1 !px-2 !text-[10px]" onClick={() => onRemove(t.id, t.title)}>
              ✕
            </button>
          </li>
        ))}
        {!tracks.length ? <li className="text-sm text-white/35 py-6 text-center">No tracks in this category yet.</li> : null}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------- add forms */

function SearchAdd({ providers, onAdd }) {
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('itunes');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const enabled = Object.entries(providers || {}).filter(([, on]) => on).map(([id]) => id);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) return setResults([]);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&provider=${provider}`, { cache: 'no-store' });
        const data = await res.json();
        setResults(data.results || []);
      } finally {
        setBusy(false);
      }
    }, 400);
    return () => clearTimeout(timer.current);
  }, [q, provider]);

  return (
    <section className="panel p-4 min-w-0">
      <h2 className="text-[11px] tracking-[0.2em] uppercase text-white/45 mb-3">Add from search</h2>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a song to inject…"
          className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
        />
        {enabled.length > 1 ? (
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-lg px-2 text-xs"
          >
            {enabled.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {busy ? <p className="text-[11px] text-white/40 mt-2">Searching…</p> : null}
      <ul className="mt-2 max-h-64 overflow-y-auto scroll-thin space-y-1">
        {results.map((r) => (
          <li key={`${r.source}-${r.sourceId}`} className="flex items-center gap-2 px-1 py-1.5 hover:bg-white/5 rounded-lg">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] truncate">{r.title}</span>
              <span className="block text-[11px] text-white/40 truncate">{r.artist}</span>
            </span>
            <button
              type="button"
              className="btn !py-1 !px-2 !text-[10px]"
              onClick={() =>
                onAdd({
                  title: r.title,
                  artist: r.artist,
                  album: r.album,
                  source: r.source,
                  sourceId: r.sourceId,
                  previewUrl: r.previewUrl,
                  artworkUrl: r.artworkUrl,
                  duration: r.duration,
                  query: `${r.title} ${r.artist}`,
                })
              }
            >
              Inject
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ManualAdd({ onAdd }) {
  const [form, setForm] = useState({ title: '', artist: '', source: 'itunes', sourceId: '', previewUrl: '', query: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="panel p-4 min-w-0">
      <h2 className="text-[11px] tracking-[0.2em] uppercase text-white/45 mb-3">Add manually</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input label="Title" value={form.title} onChange={set('title')} />
        <Input label="Artist" value={form.artist} onChange={set('artist')} />
        <label className="text-[11px] text-white/45">
          Source
          <select value={form.source} onChange={set('source')} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-sm">
            <option value="itunes">iTunes preview (resolve by search)</option>
            <option value="youtube">YouTube video id</option>
            <option value="url">Direct audio URL</option>
            <option value="synth">Built-in house deck</option>
          </select>
        </label>
        {form.source === 'youtube' || form.source === 'synth' ? (
          <Input label={form.source === 'synth' ? 'Deck preset (ignition, bounce, drive, steady, amber, anthem)' : 'Video id'} value={form.sourceId} onChange={set('sourceId')} />
        ) : (
          <Input label={form.source === 'url' ? 'Audio URL' : 'Search query'} value={form.source === 'url' ? form.previewUrl : form.query} onChange={form.source === 'url' ? set('previewUrl') : set('query')} />
        )}
      </div>
      <button
        type="button"
        className="btn btn-accent mt-3 w-full !text-[12px]"
        disabled={!form.title}
        onClick={() => {
          onAdd(form);
          setForm({ title: '', artist: '', source: 'itunes', sourceId: '', previewUrl: '', query: '' });
        }}
      >
        Inject into this category
      </button>
    </section>
  );
}

function ShowSettings({ meta, onSave }) {
  const [crowdSize, setCrowd] = useState(meta.crowdSize ?? 320);
  const [showName, setShowName] = useState(meta.showName ?? '');

  useEffect(() => {
    setCrowd(meta.crowdSize ?? 320);
    setShowName(meta.showName ?? '');
  }, [meta.crowdSize, meta.showName]);

  return (
    <section className="panel p-4 min-w-0">
      <h2 className="text-[11px] tracking-[0.2em] uppercase text-white/45 mb-3">Show details</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input label="Show name" value={showName} onChange={(e) => setShowName(e.target.value)} />
        <Input label="Guests / customers" type="number" value={crowdSize} onChange={(e) => setCrowd(e.target.value)} />
      </div>
      <p className="text-[10px] text-white/30 mt-2">
        Visitors so far: {(meta.visitors ?? 0).toLocaleString()} — counted once per browser session. The guest number
        also sets how dense the crowd looks on stage.
      </p>
      <button type="button" className="btn btn-accent mt-3 w-full !text-[12px]" onClick={() => onSave({ crowdSize: Number(crowdSize), showName })}>
        Save show details
      </button>
    </section>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="text-[11px] text-white/45">
      {label}
      <input {...props} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/25" />
    </label>
  );
}

/* --------------------------------------------------------- lyrics editor */

function LyricsEditor({ track, onClose, onSave }) {
  const [text, setText] = useState(() => formatLrc(track.lyrics || []));
  const audioRef = useRef(null);
  const taRef = useRef(null);
  const [now, setNow] = useState(0);

  const parsed = useMemo(() => parseLrc(text), [text]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const t = setInterval(() => setNow(el.currentTime || 0), 200);
    return () => clearInterval(t);
  }, []);

  /** Stamps the preview's current time onto the line the cursor sits in. */
  const stamp = () => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const lines = text.split('\n');
    let count = 0;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      count += lines[i].length + 1;
      if (pos < count) {
        idx = i;
        break;
      }
      idx = i;
    }
    const body = lines[idx].replace(/^\[[^\]]*\]\s*/, '');
    const m = Math.floor(now / 60);
    const s = Math.floor(now % 60);
    const cs = Math.round((now - Math.floor(now)) * 100);
    lines[idx] = `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}] ${body}`;
    const next = lines.join('\n');
    setText(next);
    // Park the cursor on the following line so stamping can continue.
    requestAnimationFrame(() => {
      const upto = lines.slice(0, idx + 1).join('\n').length + 1;
      ta.focus();
      ta.setSelectionRange(upto, upto);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="panel w-full max-w-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="font-semibold">{track.title}</h3>
            <p className="text-[11px] text-white/40">{track.artist} · timed lyrics</p>
          </div>
          <button type="button" className="btn !text-[11px]" onClick={onClose}>
            Close
          </button>
        </header>

        {track.previewUrl ? (
          <div className="flex items-center gap-3 mb-3">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio ref={audioRef} src={track.previewUrl} controls className="w-full h-9" />
            <button type="button" className="btn btn-accent !text-[11px] whitespace-nowrap" onClick={stamp}>
              Stamp {now.toFixed(1)}s
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-amber-300/60 mb-3">
            No preview URL on this track, so timings must be typed by hand (resolve it first to get the stamp tool).
          </p>
        )}

        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          spellCheck={false}
          placeholder={'[00:12.40] first line\n[00:18.10] second line\n\nPlain lines work too — they get spaced 4s apart.'}
          className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm font-mono outline-none focus:border-white/25 scroll-thin"
        />

        <div className="flex items-center justify-between mt-3">
          <p className="text-[11px] text-white/35">{parsed.length} lines parsed</p>
          <button type="button" className="btn btn-accent !text-[12px]" onClick={() => onSave(parsed)}>
            Save lyrics
          </button>
        </div>
      </div>
    </div>
  );
}
