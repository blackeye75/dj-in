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
    }

    this.yt = null;
    this.ytReady = false;
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
          this.yt.loadVideoById(track.sourceId);
          this.yt.setVolume(Math.round(this.volume * 100));
          if (autoplay) {
            this.yt.playVideo();
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
        this.mode = 'youtube';
        this.yt.loadVideoById(track.sourceId);
        this.yt.setVolume(Math.round(this.volume * 100));
        this.ready = true;
        if (autoplay) {
          this.play();
          this.#watchYouTubeStart(track);
        } else {
          this.yt.pauseVideo();
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
    if (!this.yt) return;
    const before = this.yt.getCurrentTime ? this.yt.getCurrentTime() || 0 : 0;
    this.ytWatch = setTimeout(() => {
      if (this.mode !== 'youtube' || this.track !== track) return;
      const now = this.yt?.getCurrentTime ? this.yt.getCurrentTime() || 0 : 0;
      const state = this.yt?.getPlayerState ? this.yt.getPlayerState() : -1;
      const progressed = now > before + 0.15;
      const playing = state === 1; // YT.PlayerState.PLAYING
      if (!progressed && !playing) {
        try {
          this.yt.stopVideo();
        } catch {}
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

  async #ensureYouTube() {
    if (this.yt && this.ytReady) return;
    const YT = await loadYouTubeApi();
    let host = document.getElementById('yt-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'yt-host';
      host.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;bottom:0;left:0;';
      document.body.appendChild(host);
    }
    await new Promise((resolve, reject) => {
      this.yt = new YT.Player(host, {
        height: '1',
        width: '1',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1 },
        events: {
          onReady: () => {
            this.ytReady = true;
            resolve();
          },
          onError: () => this.onYouTubeUnavailable(this.track, 'player error'),
          onStateChange: (e) => {
            if (e.data === 0) this.#ended();
            if (e.data === 1) {
              clearTimeout(this.ytWatch);
              this.playing = true;
              this.#emit();
            }
            if (e.data === 2) {
              this.playing = false;
              this.#emit();
            }
          },
        },
      });
      setTimeout(() => (this.ytReady ? resolve() : reject(new Error('YouTube player timed out'))), 12000);
    });
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
    } else if (this.mode === 'youtube' && this.yt) {
      this.yt.playVideo();
      this.playing = true;
      this.#watchYouTubeStart(this.track);
    }
    this.#emit();
  }

  pause() {
    clearTimeout(this.ytWatch);
    if (this.mode === 'synth' && this.synth) this.synth.pause();
    else if (this.mode === 'audio') this.audio.pause();
    else if (this.mode === 'youtube' && this.yt) this.yt.pauseVideo();
    this.playing = false;
    this.#emit();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  seek(sec) {
    if (this.mode === 'synth' && this.synth) this.synth.seek(sec);
    else if (this.mode === 'audio') this.audio.currentTime = sec;
    else if (this.mode === 'youtube' && this.yt) this.yt.seekTo(sec, true);
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
      try {
        this.yt.stopVideo();
      } catch {}
    }
    this.playing = false;
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
