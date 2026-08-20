'use client';

import { SynthDeck, synthDuration } from './synth';

/**
 * One transport, three engines.
 *
 *  synth   — SynthDeck, routed through the analyser, so the rig gets real
 *            frequency data.
 *  audio   — <audio> element for preview MP3s (iTunes/Spotify/custom URL).
 *            Those hosts don't send CORS headers, so the element is NOT routed
 *            through Web Audio (that would mute it); the rig falls back to the
 *            BPM beat clock while these play.
 *  youtube — IFrame player, same story on analysis.
 */

const YT_SRC = 'https://www.youtube.com/iframe_api';

/**
 * 0.05s of silence. Playing this on the <audio> element inside a real user
 * gesture marks the element as user-activated; after that the browser lets us
 * swap `src` and call play() from async code.
 *
 * Without it, in-app browsers (Instagram, Facebook, Messenger — WKWebView on
 * iOS) refuse playback, because our tap handler awaits a network resolve
 * before reaching play() and the activation has expired by then. Desktop
 * Chrome allows it anyway via its media-engagement heuristic, which is why
 * this only shows up on phones.
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=';

/**
 * True for embedded WebViews generally, including ones whose user agent
 * carries no app name. On iOS every real browser reports Safari, CriOS,
 * FxiOS or EdgiOS; a WebKit UA with none of those is an embedded view.
 */
export function restrictedWebView() {
  if (typeof navigator === 'undefined') return false;
  if (inAppBrowser()) return true;
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua);
  const realBrowser = /Safari|CriOS|FxiOS|EdgiOS/.test(ua);
  return ios && /AppleWebKit/.test(ua) && !realBrowser;
}

/** In-app browsers with restrictive media policies and no address bar. */
export function inAppBrowser() {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent || '';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/Messenger/i.test(ua)) return 'Messenger';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  if (/Line\//i.test(ua)) return 'LINE';
  if (/Twitter/i.test(ua)) return 'X';
  if (/LinkedInApp/i.test(ua)) return 'LinkedIn';
  return '';
}

let ytApiPromise = null;
function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = YT_SRC;
    s.async = true;
    s.onerror = () => reject(new Error('YouTube player failed to load'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('YouTube player timed out')), 12000);
  });
  return ytApiPromise;
}

export class PlayerEngine {
  constructor({ onState, onEnded, onError, onYouTubeUnavailable } = {}) {
    this.onState = onState || (() => {});
    this.onEnded = onEnded || (() => {});
    this.onError = onError || (() => {});
    /** Called when the YouTube player can't run, so callers can substitute audio. */
    this.onYouTubeUnavailable = onYouTubeUnavailable || (() => {});

    this.mode = null; // 'synth' | 'audio' | 'youtube'
    this.track = null;
    this.playing = false;
    this.volume = 0.8;
    this.ready = false;

    this.ctx = null;
    this.analyser = null;
    this.freq = null;
    this.synth = null;

    this.audio = typeof Audio !== 'undefined' ? new Audio() : null;
    if (this.audio) {
      this.audio.preload = 'auto';
      this.audio.volume = this.volume;
      this.audio.addEventListener('ended', () => this.#ended());
      this.audio.addEventListener('error', () => {
        if (this.mode === 'audio' && this.track) this.onError('This preview could not be played.');
      });
      this.audio.addEventListener('loadedmetadata', () => this.#emit());
      // Buffering is a real state a listener can see, so surface it rather
      // than leaving the UI looking frozen while the network catches up.
      //
      // Every one of these is gated on the element actually being the current
      // source: clearing its `src` on a track change fires `stalled`, and
      // without the guard that flag would follow us onto the synth deck and
      // sit there claiming to buffer a track that is generated locally.
      const buffer = (on) => () => {
        if (this.mode === 'audio') this.#setBuffering(on);
      };
      this.audio.addEventListener('waiting', buffer(true));
      this.audio.addEventListener('stalled', buffer(true));
      this.audio.addEventListener('playing', buffer(false));
      this.audio.addEventListener('canplay', buffer(false));
      this.audio.addEventListener('canplaythrough', buffer(false));
    }

    this.yt = null;
    this.ytReady = false;
    this.loadToken = 0;
    this.buffering = false;

    /** Hidden element that pulls the next track's bytes down early. */
    this.prefetch = typeof Audio !== 'undefined' ? new Audio() : null;
    if (this.prefetch) {
      this.prefetch.preload = 'auto';
      this.prefetch.muted = true;
    }
    this.prefetched = '';
  }

  /* --------------------------------------------------------- web audio */

  #ensureContext() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.72;
    this.analyser.connect(this.ctx.destination);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    return this.ctx;
  }

  /** The shared AudioContext, created on demand. The DJ console mixes into it. */
  audioContext() {
    return this.#ensureContext();
  }

  async resume() {
    const ctx = this.#ensureContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* browser will retry on the next gesture */
      }
    }
  }

  /**
   * Must be called synchronously from a user gesture, before any await.
   * Primes the audio element and the AudioContext so later programmatic
   * playback is permitted. Safe to call repeatedly; it only runs once.
   */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;

    const ctx = this.#ensureContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});

    const a = this.audio;
    if (!a || a.src) return; // never interrupt a track that is already loaded
    try {
      a.muted = true;
      a.src = SILENT_WAV;
      const p = a.play();
      const settle = () => {
        try {
          a.pause();
          a.removeAttribute('src');
          a.load();
        } catch {}
        a.muted = false;
      };
      if (p && p.then) p.then(settle, settle);
      else settle();
    } catch {
      this.unlocked = false; // let the next gesture try again
    }
  }

  #setBuffering(on) {
    if (this.buffering === on) return;
    this.buffering = on;
    this.#emit();
  }

  /**
   * How much of the track is downloaded, in seconds from zero.
   *
   * Sampled rather than pushed: it changes continuously while a track loads,
   * and putting that in React state would re-render the page on every chunk.
   */
  get buffered() {
    if (this.mode === 'synth') return this.duration; // generated locally
    if (this.mode === 'audio' && this.audio) {
      const r = this.audio.buffered;
      const at = this.audio.currentTime || 0;
      for (let i = 0; i < r.length; i++) {
        if (at >= r.start(i) - 0.5 && at <= r.end(i)) return r.end(i);
      }
      return r.length ? r.end(r.length - 1) : 0;
    }
    if (this.mode === 'youtube') {
      const f = this.#ytCall('getVideoLoadedFraction');
      return typeof f === 'number' ? f * this.duration : 0;
    }
    return 0;
  }

  /**
   * Pull the next track's audio down while the current one plays, the way a
   * streaming app does — so pressing Next doesn't start from a cold cache.
   * Only preview URLs can be warmed; the YouTube player owns its own network.
   */
  preload(track) {
    if (!this.prefetch || !track) return;
    const url = track.previewUrl;
    if (!url || url === this.prefetched) return;
    this.prefetched = url;
    try {
      this.prefetch.src = url;
      this.prefetch.load();
    } catch {
      this.prefetched = '';
    }
  }

  /** Live analysis, or null when the current source can't be analysed. */
  analysis() {
    if (this.mode !== 'synth' || !this.analyser || !this.playing) return null;
    this.analyser.getByteFrequencyData(this.freq);
    const bins = this.freq.length;
    const avg = (from, to) => {
      let s = 0;
      const a = Math.floor(bins * from);
      const b = Math.floor(bins * to);
      for (let i = a; i < b; i++) s += this.freq[i];
      return s / Math.max(1, b - a) / 255;
    };
    const bass = avg(0, 0.06);
    const mid = avg(0.06, 0.28);
    const treble = avg(0.28, 0.7);
    return { bass, mid, treble, level: (bass + mid + treble) / 3 };
  }

  /* ------------------------------------------------------------- source */

  async load(track, { autoplay = true } = {}) {
    // Loads are cancellable: a slower one must not apply after a newer one.
    const token = ++this.loadToken;
    const stale = () => token !== this.loadToken;

    this.#stopAll();
    this.track = track;
    this.ready = false;
    if (!track) {
      this.mode = null;
      this.#emit();
      return;
    }

    if (track.source === 'synth') {
      const ctx = this.#ensureContext();
      if (!ctx) {
        this.onError('Web Audio is not available in this browser.');
        return;
      }
      await this.resume();
      if (stale()) return;
      if (!this.synth) {
        this.synth = new SynthDeck(ctx, this.analyser);
        this.synth.onended = () => this.#ended();
      }
      this.synth.load(track.sourceId || 'ignition');
      this.synth.volume = this.volume;
      this.mode = 'synth';
      this.ready = true;
      if (autoplay) this.play();
      else this.#emit();
      return;
    }

    if (track.source === 'youtube') {
      // Warm player: start it inside the caller's gesture, with nothing awaited
      // in between. Building the player first (script fetch + onReady) pushes
      // playVideo() outside the activation window, which iOS then refuses.
      if (this.yt && this.ytReady) {
        this.mode = 'youtube';
        this.ready = true;
        try {
          this.#ytCall('loadVideoById', { videoId: track.sourceId, suggestedQuality: 'small' });
          this.#ytCall('setVolume', Math.round(this.volume * 100));
          if (autoplay) {
            this.#ytCall('playVideo');
            this.playing = true;
            this.#watchYouTubeStart(track);
          }
          this.#emit();
        } catch {
          this.onYouTubeUnavailable(track);
        }
        return;
      }

      try {
        await this.#ensureYouTube();
        if (stale()) return;
        this.mode = 'youtube';
        this.#ytCall('loadVideoById', { videoId: track.sourceId, suggestedQuality: 'small' });
        this.#ytCall('setVolume', Math.round(this.volume * 100));
        this.ready = true;
        if (autoplay) {
          this.play();
          this.#watchYouTubeStart(track);
        } else {
          this.#ytCall('pauseVideo');
          this.#emit();
        }
      } catch (err) {
        this.onYouTubeUnavailable(track, err.message);
      }
      return;
    }

    // Preview MP3 / direct URL.
    if (!track.previewUrl) {
      this.onError('No playable audio on this track yet.');
      this.#emit();
      return;
    }
    this.mode = 'audio';
    this.audio.src = track.previewUrl;
    this.audio.volume = this.volume;
    this.ready = true;
    if (autoplay) this.play();
    else this.#emit();
  }

  /**
   * Confirm the video actually started.
   *
   * A WebView that refuses embedded playback throws nothing: onReady fires,
   * playVideo() is accepted and silently ignored, and no error event follows.
   * The only reliable signal is that the clock never moves — so check it, and
   * treat a stuck clock as the player being unavailable.
   */
  #watchYouTubeStart(track) {
    clearTimeout(this.ytWatch);
    if (!this.yt || !this.ytReady) return;
    const before = this.#ytCall('getCurrentTime') || 0;
    this.ytWatch = setTimeout(() => {
      if (this.mode !== 'youtube' || this.track !== track) return;
      const now = this.#ytCall('getCurrentTime') || 0;
      const state = this.#ytCall('getPlayerState') ?? -1;
      const progressed = now > before + 0.15;
      const playing = state === 1; // YT.PlayerState.PLAYING
      if (!progressed && !playing) {
        this.#ytCall('stopVideo');
        this.playing = false;
        this.#emit();
        this.onYouTubeUnavailable(track, 'playback never started');
      }
    }, 2600);
  }

  /**
   * Build the YouTube player ahead of time so the eventual tap can call
   * playVideo() immediately. Safe to call repeatedly.
   */
  warmYouTube() {
    if (this.ytReady || this.ytWarming) return;
    this.ytWarming = true;
    this.#ensureYouTube().catch(() => {
      this.ytWarming = false;
    });
  }

  /**
   * Call a player method defensively.
   *
   * `new YT.Player()` returns an object whose API methods only exist once
   * onReady has fired, so anything that reaches the player early throws
   * "playVideo is not a function". Everything goes through here instead.
   */
  #ytCall(name, ...args) {
    const p = this.yt;
    if (!p || !this.ytReady || typeof p[name] !== 'function') return undefined;
    try {
      return p[name](...args);
    } catch {
      return undefined;
    }
  }

  /**
   * Build the player once. Re-entry returns the in-flight promise: without
   * that, a second call while the first is still constructing built another
   * player over the same host and overwrote this.yt, leaving the ready flag
   * describing a player we no longer held. Tapping Next a few times during
   * startup did it every time.
   */
  #ensureYouTube() {
    if (this.yt && this.ytReady) return Promise.resolve();
    if (this.ytPromise) return this.ytPromise;

    this.ytPromise = (async () => {
      const YT = await loadYouTubeApi();
      let host = document.getElementById('yt-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'yt-host';
        // Offscreen rather than 1x1: a pixel-sized player reads as "nobody is
        // watching", and the quality ladder behaves accordingly.
        host.style.cssText =
          'position:fixed;width:256px;height:144px;opacity:0.01;pointer-events:none;bottom:0;left:-9999px;';
        document.body.appendChild(host);
      }

      await new Promise((resolve, reject) => {
        let settled = false;
        // Held locally until ready, so this.yt is never a half-built player.
        const player = new YT.Player(host, {
          height: '144',
          width: '256',
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1 },
          events: {
            onReady: () => {
              if (settled) return;
              settled = true;
              this.yt = player;
              this.ytReady = true;
              resolve();
            },
            onError: () => this.onYouTubeUnavailable(this.track, 'player error'),
            onStateChange: (e) => {
              if (e.data === 0) this.#ended();
              if (e.data === 1) {
                clearTimeout(this.ytWatch);
                this.playing = true;
                this.buffering = false;
                this.#emit();
              }
              if (e.data === 2) {
                this.playing = false;
                this.buffering = false;
                this.#emit();
              }
              if (e.data === 3) this.#setBuffering(true);
            },
          },
        });
        setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('YouTube player timed out'));
        }, 12000);
      });
    })().catch((err) => {
      this.ytPromise = null; // let a later attempt retry from scratch
      this.ytWarming = false;
      throw err;
    });

    return this.ytPromise;
  }

  /* ---------------------------------------------------------- transport */

  play() {
    if (!this.mode) return;
    if (this.mode === 'synth') {
      this.resume();
      this.synth.play(this.synth.currentTime >= this.synth.duration ? 0 : this.synth.currentTime);
      this.playing = true;
    } else if (this.mode === 'audio') {
      const p = this.audio.play();
      if (p && p.catch) {
        p.catch((err) => {
          this.playing = false;
          this.#emit();
          const app = inAppBrowser();
          if (err && err.name === 'NotAllowedError' && app) {
            this.onError(`${app}'s built-in browser blocked playback. Open this page in Chrome or Safari for sound.`);
          } else if (err && err.name === 'NotAllowedError') {
            this.onError('Tap play once more — the browser blocked autoplay.');
          } else {
            this.onError('This preview could not be played.');
          }
        });
      }
      this.playing = true;
    } else if (this.mode === 'youtube') {
      if (this.ytReady) {
        this.#ytCall('playVideo');
        this.playing = true;
        this.#watchYouTubeStart(this.track);
      } else if (this.track) {
        // Player still building: re-enter load(), which waits for it properly.
        this.load(this.track, { autoplay: true });
        return;
      }
    }
    this.#emit();
  }

  pause() {
    clearTimeout(this.ytWatch);
    if (this.mode === 'synth' && this.synth) this.synth.pause();
    else if (this.mode === 'audio') this.audio.pause();
    else if (this.mode === 'youtube') this.#ytCall('pauseVideo');
    this.playing = false;
    this.#emit();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  seek(sec) {
    if (this.mode === 'synth' && this.synth) this.synth.seek(sec);
    else if (this.mode === 'audio') this.audio.currentTime = sec;
    else if (this.mode === 'youtube') this.#ytCall('seekTo', sec, true);
    this.#emit();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.audio) this.audio.volume = this.volume;
    if (this.synth) this.synth.volume = this.volume;
    if (this.yt && this.ytReady) this.yt.setVolume(Math.round(this.volume * 100));
    this.#emit();
  }

  get position() {
    if (this.mode === 'synth' && this.synth) return this.synth.currentTime;
    if (this.mode === 'audio') return this.audio.currentTime || 0;
    if (this.mode === 'youtube' && this.yt && this.ytReady && this.yt.getCurrentTime) return this.yt.getCurrentTime() || 0;
    return 0;
  }

  get duration() {
    if (this.mode === 'synth') return this.track ? synthDuration(this.track.sourceId) : 0;
    if (this.mode === 'audio') return Number.isFinite(this.audio.duration) ? this.audio.duration : this.track?.duration || 30;
    if (this.mode === 'youtube' && this.yt && this.ytReady && this.yt.getDuration) return this.yt.getDuration() || this.track?.duration || 0;
    return 0;
  }

  #stopAll() {
    clearTimeout(this.ytWatch);
    if (this.synth) this.synth.pause();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
    }
    if (this.yt && this.ytReady) {
      this.#ytCall('stopVideo');
    }
    this.playing = false;
    this.buffering = false;
  }

  #ended() {
    this.playing = false;
    this.#emit();
    this.onEnded();
  }

  #emit() {
    this.onState({
      playing: this.playing,
      mode: this.mode,
      volume: this.volume,
      ready: this.ready,
      buffering: this.buffering,
      analysable: this.mode === 'synth',
    });
  }

  destroy() {
    this.#stopAll();
    if (this.synth) this.synth.dispose();
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
    }
  }
}
