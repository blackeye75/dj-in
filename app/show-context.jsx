'use client';

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlayerEngine, inAppBrowser, restrictedWebView } from '@/lib/player';
import { defaultSceneFor, getTheme, THEMES } from '@/lib/themes';

const ShowContext = createContext(null);

export const useShow = () => {
  const ctx = useContext(ShowContext);
  if (!ctx) throw new Error('useShow must be used inside <ShowProvider>');
  return ctx;
};

let uid = 0;
const withUid = (t) => ({ ...t, uid: `q${++uid}` });

export function ShowProvider({ children }) {
  const [themeId, setThemeIdState] = useState('dj-night');
  const [scene, setScene] = useState(() => defaultSceneFor('dj-night'));
  const [tracks, setTracks] = useState([]);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('all'); // 'off' | 'all' | 'one'
  const [playerState, setPlayerState] = useState({ playing: false, mode: null, volume: 0.8, analysable: false });
  const [meta, setMeta] = useState({ visitors: 0, crowdSize: 320, showName: '', storage: 'memory', providers: { itunes: true } });
  const [toast, setToast] = useState('');

  const engineRef = useRef(null);
  const rigRef = useRef(null);
  const sceneRef = useRef(scene);
  const queueRef = useRef({ queue, currentIndex, repeat, shuffle });

  sceneRef.current = scene;
  queueRef.current = { queue, currentIndex, repeat, shuffle };

  const theme = useMemo(() => getTheme(themeId), [themeId]);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? '' : t)), 4200);
  }, []);

  /**
   * Queue writes go through the ref first, then state. The transport reads the
   * ref synchronously (playAt runs in the same tick), so both must agree before
   * React has re-rendered.
   */
  const commitQueue = useCallback((nextQ, nextIndex) => {
    queueRef.current.queue = nextQ;
    setQueue(nextQ);
    if (nextIndex !== undefined) {
      queueRef.current.currentIndex = nextIndex;
      setCurrentIndex(nextIndex);
    }
  }, []);

  /* ------------------------------------------------------------- engine */

  useEffect(() => {
    const engine = new PlayerEngine({
      onState: (s) => setPlayerState((prev) => ({ ...prev, ...s })),
      onEnded: () => advance(1, true),
      onError: (msg) => notify(msg),
      // The embedded player failed anywhere else (blocked, embed disabled,
      // offline). Substitute an audio preview rather than sitting silent.
      onYouTubeUnavailable: async (track) => {
        const alt = track ? await previewFallback(track) : null;
        if (alt) {
          notify('That video can’t play here — using a 30-second preview instead.');
          engine.load(alt);
        } else {
          notify('That video cannot be played in this browser.');
        }
      },
    });
    engineRef.current = engine;

    // Catch-all: the very first touch anywhere primes audio, so even a tap we
    // don't own (scrolling, opening the dropdown) buys the permission.
    const prime = () => engine.unlock();
    const opts = { once: true, capture: true, passive: true };
    window.addEventListener('pointerdown', prime, opts);
    window.addEventListener('touchend', prime, opts);
    window.addEventListener('keydown', prime, opts);

    return () => {
      window.removeEventListener('pointerdown', prime, opts);
      window.removeEventListener('touchend', prime, opts);
      window.removeEventListener('keydown', prime, opts);
      engine.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------------------------------------- data */

  const loadTracks = useCallback(
    async (id, { intoQueue = true } = {}) => {
      setLoadingTracks(true);
      try {
        const res = await fetch(`/api/tracks?theme=${encodeURIComponent(id)}`, { cache: 'no-store' });
        const data = await res.json();
        const rows = data.tracks || [];
        setTracks(rows);
        if (intoQueue) commitQueue(rows.map(withUid), rows.length ? 0 : -1);
        return rows;
      } catch (err) {
        notify('Could not load the playlist.');
        return [];
      } finally {
        setLoadingTracks(false);
      }
    },
    [notify, commitQueue]
  );

  useEffect(() => {
    loadTracks(themeId);
  }, [themeId, loadTracks]);

  // Build the YouTube player before it is needed, so the tap that starts a
  // video isn't spent waiting for a script to download. Pointless in an in-app
  // browser, where we substitute audio anyway.
  useEffect(() => {
    if (restrictedWebView()) return;
    if (queue.some((t) => t.source === 'youtube')) engineRef.current?.warmYouTube();
  }, [queue]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const seen = typeof window !== 'undefined' && sessionStorage.getItem('dj-in-visit');
        const res = await fetch('/api/meta', { method: seen ? 'GET' : 'POST', cache: 'no-store' });
        const data = await res.json();
        if (!seen && typeof window !== 'undefined') sessionStorage.setItem('dj-in-visit', '1');
        if (!cancelled) setMeta((m) => ({ ...m, ...data }));
        if (seen) return;
        const info = await fetch('/api/meta', { cache: 'no-store' }).then((r) => r.json());
        if (!cancelled) setMeta((m) => ({ ...m, ...info }));
      } catch {
        /* the counter is decorative — never block the show on it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------ theming */

  const setThemeId = useCallback((id) => {
    setThemeIdState(id);
    setScene(defaultSceneFor(id));
  }, []);

  const updateScene = useCallback((patch) => setScene((s) => ({ ...s, ...patch })), []);
  const toggleFixture = useCallback(
    (key) => setScene((s) => ({ ...s, fixtures: { ...s.fixtures, [key]: !s.fixtures[key] } })),
    []
  );
  const resetScene = useCallback(() => setScene(defaultSceneFor(themeId)), [themeId]);

  /**
   * Momentary blinder. Patches the fixture in if the current theme had it out,
   * otherwise the button would be a dead control with nothing to show for it.
   */
  const pulseBlinder = useCallback(() => {
    let patchedIn = false;
    setScene((s) => {
      if (s.fixtures.blinder) return s;
      patchedIn = true;
      return { ...s, fixtures: { ...s.fixtures, blinder: true } };
    });
    rigRef.current?.pulseBlinder(true);
    if (patchedIn) notify('Blinders were patched out — switched them on for you.');
  }, [notify]);

  const releaseBlinder = useCallback(() => rigRef.current?.releaseBlinder(), []);

  /* ------------------------------------------------------------- queue */

  const resolveIfNeeded = useCallback(async (track) => {
    if (track.source !== 'itunes' || track.previewUrl) return track;
    try {
      const res = await fetch('/api/tracks/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: track.id, query: track.query || `${track.title} ${track.artist}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'not found');
      const merged = { ...track, ...data.resolved };
      setTracks((rows) => rows.map((r) => (r.id === track.id ? { ...r, ...data.resolved } : r)));
      setQueue((q) => q.map((r) => (r.id === track.id ? { ...r, ...data.resolved } : r)));
      return merged;
    } catch (err) {
      notify(`No preview available for “${track.title}”.`);
      return track;
    }
  }, [notify]);

  /**
   * Find a playable audio preview for a track the YouTube player can't handle.
   * In-app browsers run a WebView that blocks the embedded player, so the
   * 30-second preview is the difference between sound and silence there.
   */
  const previewFallback = useCallback(
    async (track) => {
      const query = `${track.title || ''} ${track.artist || ''}`.trim();
      if (!query) return null;
      try {
        const res = await fetch('/api/tracks/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        const data = await res.json();
        if (!res.ok || !data.resolved?.previewUrl) return null;
        return { ...track, ...data.resolved, source: 'itunes' };
      } catch {
        return null;
      }
    },
    []
  );

  const playAt = useCallback(
    async (index, { autoplay = true } = {}) => {
      const q = queueRef.current.queue;
      if (index < 0 || index >= q.length) return;
      // Claim the user gesture before anything async: resolving a track hits
      // the network, and by the time that returns the activation is gone on
      // iOS and in in-app browsers.
      engineRef.current?.unlock();
      setCurrentIndex(index);
      let track = await resolveIfNeeded(q[index]);

      // Don't even attempt the embedded player inside a WebView: it accepts
      // playVideo() and silently ignores it. Go straight to an audio preview.
      if (track.source === 'youtube' && restrictedWebView()) {
        const alt = await previewFallback(track);
        if (alt) {
          const app = inAppBrowser();
          notify(
            `${app ? `${app}'s browser` : 'This in-app browser'} can't run the YouTube player — playing a 30-second preview.`
          );
          track = alt;
        }
      }

      await engineRef.current?.load(track, { autoplay });
    },
    [resolveIfNeeded, previewFallback, notify]
  );

  const advance = useCallback(
    (delta, auto = false) => {
      const { queue: q, currentIndex: idx, repeat: rep, shuffle: sh } = queueRef.current;
      if (!q.length) return;
      if (auto && rep === 'one') {
        playAt(idx);
        return;
      }
      let next;
      if (sh && q.length > 1) {
        do {
          next = Math.floor(Math.random() * q.length);
        } while (next === idx);
      } else {
        next = idx + delta;
      }
      if (next >= q.length) {
        if (rep === 'off' && auto) return;
        next = 0;
      }
      if (next < 0) next = q.length - 1;
      playAt(next);
    },
    [playAt]
  );

  const playTrack = useCallback(
    (track) => {
      const { queue: q } = queueRef.current;
      const at = q.findIndex((t) => (track.uid ? t.uid === track.uid : t.id && t.id === track.id));
      if (at >= 0) return playAt(at);
      const nextQ = [...q, withUid(track)];
      commitQueue(nextQ);
      return playAt(nextQ.length - 1);
    },
    [playAt, commitQueue]
  );

  const enqueue = useCallback(
    (track, { next = false } = {}) => {
      const { queue: q, currentIndex: idx } = queueRef.current;
      const item = withUid(track);
      const nextQ = next && idx >= 0 ? [...q.slice(0, idx + 1), item, ...q.slice(idx + 1)] : [...q, item];
      commitQueue(nextQ);
      notify(`Added “${track.title}” to the queue.`);
    },
    [commitQueue, notify]
  );

  const removeFromQueue = useCallback(
    (uidToRemove) => {
      const { queue: q, currentIndex: idx } = queueRef.current;
      const at = q.findIndex((t) => t.uid === uidToRemove);
      if (at < 0) return;
      const nextQ = q.filter((t) => t.uid !== uidToRemove);
      let nextIdx = idx;
      if (at < idx) nextIdx = idx - 1;
      else if (at === idx) nextIdx = Math.min(idx, nextQ.length - 1);
      commitQueue(nextQ, nextIdx);
    },
    [commitQueue]
  );

  const moveInQueue = useCallback(
    (from, to) => {
      const { queue: q, currentIndex: idx } = queueRef.current;
      if (from === to || from < 0 || to < 0 || from >= q.length || to >= q.length) return;
      const nextQ = [...q];
      const [item] = nextQ.splice(from, 1);
      nextQ.splice(to, 0, item);
      let nextIdx = idx;
      if (idx === from) nextIdx = to;
      else if (from < idx && to >= idx) nextIdx = idx - 1;
      else if (from > idx && to <= idx) nextIdx = idx + 1;
      commitQueue(nextQ, nextIdx);
    },
    [commitQueue]
  );

  const clearQueue = useCallback(() => {
    commitQueue([], -1);
    engineRef.current?.load(null);
  }, [commitQueue]);

  const restoreThemeQueue = useCallback(() => {
    commitQueue(tracks.map(withUid), tracks.length ? 0 : -1);
  }, [tracks, commitQueue]);

  /* ---------------------------------------------------------- transport */

  const toggle = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.unlock();
    if (!engine.track && queueRef.current.queue.length) {
      await playAt(Math.max(0, queueRef.current.currentIndex));
      return;
    }
    await engine.resume();
    engine.toggle();
  }, [playAt]);

  const seek = useCallback((sec) => engineRef.current?.seek(sec), []);
  const setVolume = useCallback((v) => engineRef.current?.setVolume(v), []);
  const cycleRepeat = useCallback(
    () => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
    []
  );

  const current = currentIndex >= 0 ? queue[currentIndex] : null;

  const value = {
    THEMES,
    themeId,
    setThemeId,
    theme,
    scene,
    sceneRef,
    updateScene,
    toggleFixture,
    resetScene,
    pulseBlinder,
    releaseBlinder,
    rigRef,
    engineRef,
    tracks,
    loadingTracks,
    reloadTracks: loadTracks,
    queue,
    currentIndex,
    current,
    playTrack,
    playAt,
    enqueue,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    restoreThemeQueue,
    next: () => advance(1),
    prev: () => advance(-1),
    toggle,
    seek,
    setVolume,
    playerState,
    shuffle,
    setShuffle,
    repeat,
    cycleRepeat,
    meta,
    setMeta,
    toast,
    notify,
  };

  return <ShowContext.Provider value={value}>{children}</ShowContext.Provider>;
}
