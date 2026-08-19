'use client';

/**
 * Two-deck DJ mixer, built on Web Audio.
 *
 * The show's main transport is a jukebox: one track at a time, three possible
 * engines, no processing. This is the other thing — an actual mixer, where both
 * decks run at once through a real signal path:
 *
 *   source → trim → EQ (low/mid/high) → filter → [PFL tap] → fader → crossfader
 *                                                                       ↓
 *                                                                    master → out
 *
 * The tap for headphone cue sits before the fader, which is what "pre-fader
 * listening" means on hardware: you hear the deck whether or not it is live.
 *
 * Two source kinds are mixable, and the difference is not cosmetic:
 *
 *   buffer — the whole file decoded into an AudioBuffer and played from an
 *            AudioBufferSourceNode. Everything a DJ expects works here, because
 *            we own the sample clock: seamless loops, jog nudge, tempo, and
 *            offline BPM analysis.
 *   synth  — the built-in SynthDeck, which is already Web Audio and reports its
 *            own exact tempo. Mixes and EQs, but has no sample buffer to loop
 *            or scrub through.
 *
 * YouTube is deliberately not here. Its audio lives inside a cross-origin
 * iframe that hands out no samples, so it cannot be routed, analysed, filtered
 * or beat-matched. A deck loaded from a YouTube track uses its audio preview.
 */

import { SynthDeck, synthDuration, synthPreset } from './synth';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* -------------------------------------------------------------- analysis */

/**
 * Estimate tempo from a decoded buffer.
 *
 * Envelope → onset flux → autocorrelation. It is deliberately narrow: it looks
 * for a steady periodic pulse between 70 and 180 BPM, which is what this app
 * plays. On material with no steady beat it will still return its best guess,
 * so the caller gets `confidence` too and can decide whether to trust it.
 */
export function detectTempo(buffer) {
  const sr = buffer.sampleRate;
  const ch = buffer.getChannelData(0);
  const hop = Math.floor(sr / 100); // ~10 ms resolution
  const frames = Math.floor(ch.length / hop);
  if (frames < 64) return { bpm: 0, confidence: 0, offset: 0 };

  // Energy envelope.
  const env = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const start = i * hop;
    for (let j = 0; j < hop; j++) {
      const s = ch[start + j];
      sum += s * s;
    }
    env[i] = Math.sqrt(sum / hop);
  }

  // Onset strength: rectified first difference, which spikes on transients.
  const flux = new Float32Array(frames);
  for (let i = 1; i < frames; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);

  let mean = 0;
  for (let i = 0; i < frames; i++) mean += flux[i];
  mean /= frames;
  for (let i = 0; i < frames; i++) flux[i] = Math.max(0, flux[i] - mean);

  // Autocorrelate over the lags that correspond to plausible tempi.
  const fps = sr / hop;
  const minLag = Math.floor((60 / 180) * fps);
  const maxLag = Math.ceil((60 / 70) * fps);
  let best = 0;
  let bestScore = 0;
  let total = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let i = 0; i + lag < frames; i++) score += flux[i] * flux[i + lag];
    score /= frames - lag;
    total += score;
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  if (!best) return { bpm: 0, confidence: 0, offset: 0 };

  let bpm = (60 * fps) / best;
  // Fold into the range DJs actually read off a deck.
  while (bpm < 85) bpm *= 2;
  while (bpm > 175) bpm /= 2;

  // First strong onset ≈ the first downbeat; good enough to hang a grid on.
  let peak = 0;
  let offset = 0;
  const limit = Math.min(frames, Math.floor(fps * 12));
  for (let i = 0; i < limit; i++) {
    if (flux[i] > peak) {
      peak = flux[i];
      offset = i / fps;
    }
  }

  const avg = total / (maxLag - minLag + 1);
  const confidence = avg > 0 ? clamp((bestScore / avg - 1) / 2, 0, 1) : 0;
  return { bpm: Math.round(bpm * 10) / 10, confidence, offset };
}

/* ------------------------------------------------------------------ deck */

export class DjDeck {
  constructor(ctx, { id, master, cueBus, onState }) {
    this.ctx = ctx;
    this.id = id;
    this.onState = onState || (() => {});

    this.trim = ctx.createGain();
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 120;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.9;
    this.high = ctx.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 6000;

    // One knob, two filters: left of centre sweeps a lowpass down, right of
    // centre sweeps a highpass up. Centre is out of the way at both extremes.
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 22050;
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 10;

    this.fader = ctx.createGain();
    this.xf = ctx.createGain();
    this.cue = ctx.createGain();
    this.cue.gain.value = 0;

    this.trim.connect(this.low).connect(this.mid).connect(this.high).connect(this.lp).connect(this.hp);
    this.hp.connect(this.fader).connect(this.xf).connect(master);
    this.hp.connect(this.cue).connect(cueBus); // pre-fader listen

    this.mode = null; // 'buffer' | 'synth'
    this.track = null;
    this.buffer = null;
    this.source = null;
    this.synth = null;

    this.playing = false;
    this.offset = 0; // buffer position at the moment playback started
    this.startedAt = 0; // ctx time when it started
    this.pitch = 1; // tempo slider, 1 = as recorded
    this.nudge = 1; // transient jog multiplier
    this.cuePoint = 0;
    this.hotCues = [null, null, null, null, null, null, null, null];
    this.loop = null; // { start, end, beats }
    this.bpm = 0;
    this.gridOffset = 0;
    this.confidence = 0;
    this.loading = false;
    this.error = '';
  }

  /* -------------------------------------------------------------- load */

  async loadBuffer(track, url) {
    this.unload();
    this.loading = true;
    this.error = '';
    this.track = track;
    this.emit();
    try {
      const res = await fetch(`/api/audio?url=${encodeURIComponent(url)}`, { cache: 'force-cache' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `relay returned ${res.status}`);
      }
      const bytes = await res.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(bytes);
      this.mode = 'buffer';

      // Prefer a tempo the track already carries; analyse only when it doesn't.
      if (track?.bpm) {
        this.bpm = track.bpm;
        this.confidence = 1;
        const det = detectTempo(this.buffer);
        this.gridOffset = det.offset;
      } else {
        const det = detectTempo(this.buffer);
        this.bpm = det.bpm;
        this.confidence = det.confidence;
        this.gridOffset = det.offset;
      }
      this.cuePoint = 0;
      this.offset = 0;
    } catch (err) {
      this.error = err.message || 'could not load that track';
      this.mode = null;
    } finally {
      this.loading = false;
      this.emit();
    }
  }

  /**
   * Load a file off the user's own device. No relay, no CORS, no network —
   * and the same buffer path as everything else, so loops, tempo and analysis
   * all work on it.
   */
  async loadFile(file) {
    this.unload();
    this.loading = true;
    this.error = '';
    this.track = { title: file.name.replace(/\.[^.]+$/, ''), artist: 'Local file', source: 'file' };
    this.emit();
    try {
      const bytes = await file.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(bytes);
      this.mode = 'buffer';
      const det = detectTempo(this.buffer);
      this.bpm = det.bpm;
      this.confidence = det.confidence;
      this.gridOffset = det.offset;
      this.cuePoint = 0;
      this.offset = 0;
    } catch (err) {
      this.error = 'that file could not be decoded';
      this.mode = null;
    } finally {
      this.loading = false;
      this.emit();
    }
  }

  loadSynth(track) {
    this.unload();
    this.track = track;
    this.synth = new SynthDeck(this.ctx, this.trim);
    this.synth.onended = () => {
      this.playing = false;
      this.emit();
    };
    this.synth.load(track.sourceId || 'ignition');
    this.mode = 'synth';
    const preset = synthPreset(track.sourceId || 'ignition');
    this.bpm = preset?.bpm || track.bpm || 0;
    this.confidence = 1;
    this.gridOffset = 0;
    this.cuePoint = 0;
    this.emit();
  }

  unload() {
    this.stopSource();
    if (this.synth) {
      this.synth.dispose();
      this.synth = null;
    }
    this.buffer = null;
    this.mode = null;
    this.track = null;
    this.playing = false;
    this.offset = 0;
    this.loop = null;
    this.bpm = 0;
    this.hotCues = this.hotCues.map(() => null);
  }

  /* --------------------------------------------------------- transport */

  get duration() {
    if (this.mode === 'buffer' && this.buffer) return this.buffer.duration;
    if (this.mode === 'synth' && this.track) return synthDuration(this.track.sourceId);
    return 0;
  }

  get position() {
    if (this.mode === 'synth' && this.synth) return this.synth.currentTime;
    if (this.mode !== 'buffer') return 0;
    if (!this.playing) return this.offset;
    const elapsed = (this.ctx.currentTime - this.startedAt) * this.rate;
    let pos = this.offset + elapsed;
    if (this.loop && pos > this.loop.end) {
      const span = this.loop.end - this.loop.start;
      pos = this.loop.start + ((pos - this.loop.start) % span);
    }
    return clamp(pos, 0, this.duration);
  }

  get rate() {
    return this.pitch * this.nudge;
  }

  stopSource() {
    if (!this.source) return;
    try {
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
    } catch {
      /* already stopped */
    }
    this.source = null;
  }

  play() {
    if (this.mode === 'synth' && this.synth) {
      this.synth.play(this.synth.currentTime >= this.duration ? 0 : this.synth.currentTime);
      this.playing = true;
      this.emit();
      return;
    }
    if (this.mode !== 'buffer' || !this.buffer || this.playing) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.rate;
    if (this.loop) {
      src.loop = true;
      src.loopStart = this.loop.start;
      src.loopEnd = this.loop.end;
    }
    src.connect(this.trim);
    src.onended = () => {
      // Only a natural end should stop the deck; stopSource clears the handler.
      if (this.source !== src) return;
      this.playing = false;
      this.offset = 0;
      this.source = null;
      this.emit();
    };
    src.start(0, clamp(this.offset, 0, this.buffer.duration - 0.01));
    this.source = src;
    this.startedAt = this.ctx.currentTime;
    this.playing = true;
    this.emit();
  }

  pause() {
    if (this.mode === 'synth' && this.synth) {
      this.synth.pause();
      this.playing = false;
      this.emit();
      return;
    }
    if (!this.playing) return;
    this.offset = this.position;
    this.stopSource();
    this.playing = false;
    this.emit();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  seek(sec) {
    const to = clamp(sec, 0, Math.max(0, this.duration - 0.05));
    if (this.mode === 'synth' && this.synth) {
      this.synth.seek(to);
      this.emit();
      return;
    }
    const wasPlaying = this.playing;
    if (wasPlaying) {
      this.stopSource();
      this.playing = false;
    }
    this.offset = to;
    if (wasPlaying) this.play();
    else this.emit();
  }

  /** CDJ cue: set the point when stopped, jump back to it when running. */
  setCue() {
    this.cuePoint = this.position;
    this.emit();
  }

  cueJump() {
    this.seek(this.cuePoint);
    this.pause();
  }

  /** Hold to preview from the cue point; release returns and stops. */
  cuePress() {
    this.seek(this.cuePoint);
    this.play();
  }

  cueRelease() {
    this.pause();
    this.seek(this.cuePoint);
  }

  /* -------------------------------------------------------- performance */

  setHotCue(i, sec = null) {
    this.hotCues[i] = sec === null ? this.position : sec;
    this.emit();
  }

  clearHotCue(i) {
    this.hotCues[i] = null;
    this.emit();
  }

  jumpHotCue(i) {
    const at = this.hotCues[i];
    if (at === null || at === undefined) return;
    this.seek(at);
    if (!this.playing) this.play();
  }

  /** Loop `beats` long, starting where the playhead is. */
  setLoop(beats) {
    if (this.mode !== 'buffer' || !this.bpm) return;
    const start = this.position;
    const end = Math.min(this.duration, start + (60 / this.bpm) * beats);
    if (end - start < 0.05) return;
    this.loop = { start, end, beats };
    if (this.playing) {
      // Restart in place so the source picks up the loop points.
      this.offset = start;
      this.stopSource();
      this.playing = false;
      this.play();
    }
    this.emit();
  }

  clearLoop() {
    if (!this.loop) return;
    const at = this.position;
    this.loop = null;
    if (this.playing) {
      this.offset = at;
      this.stopSource();
      this.playing = false;
      this.play();
    }
    this.emit();
  }

  /* ------------------------------------------------------------ mixing */

  setTrim(db) {
    this.trim.gain.setTargetAtTime(Math.pow(10, db / 20), this.ctx.currentTime, 0.01);
  }

  setEq(band, db) {
    const node = band === 'low' ? this.low : band === 'mid' ? this.mid : this.high;
    node.gain.setTargetAtTime(db, this.ctx.currentTime, 0.01);
  }

  /** -1 = full lowpass sweep, 0 = bypass, +1 = full highpass sweep. */
  setFilter(v) {
    const now = this.ctx.currentTime;
    if (v < -0.02) {
      const f = 22050 * Math.pow(200 / 22050, -v);
      this.lp.frequency.setTargetAtTime(f, now, 0.02);
      this.hp.frequency.setTargetAtTime(10, now, 0.02);
    } else if (v > 0.02) {
      const f = 20 * Math.pow(8000 / 20, v);
      this.hp.frequency.setTargetAtTime(f, now, 0.02);
      this.lp.frequency.setTargetAtTime(22050, now, 0.02);
    } else {
      this.lp.frequency.setTargetAtTime(22050, now, 0.02);
      this.hp.frequency.setTargetAtTime(10, now, 0.02);
    }
  }

  setFader(v) {
    this.fader.gain.setTargetAtTime(clamp(v, 0, 1), this.ctx.currentTime, 0.008);
  }

  setCueEnabled(on) {
    this.cue.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.01);
  }

  /**
   * Tempo. On a buffer this is a true playback-rate change, so the pitch moves
   * with it — Web Audio has no time-stretch, so there is no key lock to offer.
   */
  setPitch(percent) {
    this.pitch = 1 + percent / 100;
    this.applyRate();
    this.emit(); // the tempo readout is derived from pitch, so it must refresh
  }

  setNudge(mult) {
    this.nudge = mult;
    this.applyRate();
  }

  applyRate() {
    if (this.mode !== 'buffer' || !this.source) return;
    // Freeze the position before the rate changes, or the elapsed-time maths
    // below would re-read it against the new rate and jump the playhead.
    const pos = this.position;
    this.offset = pos;
    this.startedAt = this.ctx.currentTime;
    this.source.playbackRate.setTargetAtTime(this.rate, this.ctx.currentTime, 0.02);
  }

  /** Effective tempo with the pitch slider applied. */
  get liveBpm() {
    return this.bpm ? this.bpm * this.pitch : 0;
  }

  emit() {
    this.onState(this.snapshot());
  }

  snapshot() {
    return {
      id: this.id,
      mode: this.mode,
      track: this.track,
      playing: this.playing,
      loading: this.loading,
      error: this.error,
      bpm: this.bpm,
      liveBpm: this.liveBpm,
      confidence: this.confidence,
      pitch: this.pitch,
      cuePoint: this.cuePoint,
      hotCues: [...this.hotCues],
      loop: this.loop,
      duration: this.duration,
      canLoop: this.mode === 'buffer',
    };
  }
}

/* ---------------------------------------------------------------- mixer */

export class DjEngine {
  constructor(ctx, { onState } = {}) {
    this.ctx = ctx;
    this.onState = onState || (() => {});

    this.master = ctx.createGain();
    this.masterMeter = ctx.createAnalyser();
    this.masterMeter.fftSize = 512;
    this.master.connect(this.masterMeter).connect(ctx.destination);
    this.meterData = new Uint8Array(this.masterMeter.frequencyBinCount);

    // The cue bus is a real second mix. Without a second output device it can
    // only be monitored by muting the master, which is what `cueSolo` does.
    this.cueBus = ctx.createGain();
    this.cueBus.gain.value = 0;
    this.cueBus.connect(ctx.destination);

    const deckState = (s) => this.onState({ deck: s });
    this.A = new DjDeck(ctx, { id: 'A', master: this.master, cueBus: this.cueBus, onState: deckState });
    this.B = new DjDeck(ctx, { id: 'B', master: this.master, cueBus: this.cueBus, onState: deckState });

    this.crossfade(0.5);
  }

  deck(id) {
    return id === 'B' ? this.B : this.A;
  }

  /** Equal-power crossfade: 0 = all A, 1 = all B, 0.5 = both at full power. */
  crossfade(v) {
    const x = clamp(v, 0, 1);
    const now = this.ctx.currentTime;
    this.A.xf.gain.setTargetAtTime(Math.cos((x * Math.PI) / 2), now, 0.008);
    this.B.xf.gain.setTargetAtTime(Math.cos(((1 - x) * Math.PI) / 2), now, 0.008);
  }

  setMaster(v) {
    this.master.gain.setTargetAtTime(clamp(v, 0, 1.2), this.ctx.currentTime, 0.01);
  }

  /**
   * Monitor the cue bus. On a single output device the only honest way to
   * "hear the other deck" is to drop the master, so that is what this does.
   */
  setCueSolo(on) {
    const now = this.ctx.currentTime;
    this.cueBus.gain.setTargetAtTime(on ? 1 : 0, now, 0.01);
    this.master.gain.setTargetAtTime(on ? 0 : this.masterLevel ?? 0.9, now, 0.01);
  }

  /**
   * Beat-match `from` to `to`: match tempo with the pitch control, then line
   * the grids up by seeking. Only meaningful when both decks know their tempo.
   */
  sync(fromId, toId) {
    const from = this.deck(fromId);
    const to = this.deck(toId);
    if (!from.bpm || !to.bpm) return false;

    const targetBpm = to.liveBpm;
    from.setPitch((targetBpm / from.bpm - 1) * 100);

    // Align phase only when the reference is actually running, otherwise there
    // is no moving grid to align to.
    if (to.playing && from.playing) {
      const beat = 60 / targetBpm;
      const phaseTo = (to.position - to.gridOffset) % beat;
      const phaseFrom = (from.position - from.gridOffset) % beat;
      let delta = phaseTo - phaseFrom;
      if (delta > beat / 2) delta -= beat;
      if (delta < -beat / 2) delta += beat;
      from.seek(from.position + delta);
    }
    return true;
  }

  /**
   * Output level, 0..1.
   *
   * Time domain, not spectrum: averaging frequency bins reads almost zero on
   * percussive material, because a kick puts its energy in a handful of bins
   * and the other two hundred drag the mean down. Peak deviation from the
   * zero line is what a level meter on a mixer actually shows.
   */
  masterLevelNow() {
    this.masterMeter.getByteTimeDomainData(this.meterData);
    let peak = 0;
    for (let i = 0; i < this.meterData.length; i++) {
      const d = Math.abs(this.meterData[i] - 128);
      if (d > peak) peak = d;
    }
    return peak / 128;
  }

  destroy() {
    this.A.unload();
    this.B.unload();
    try {
      this.master.disconnect();
      this.cueBus.disconnect();
    } catch {
      /* context may already be closed */
    }
  }
}
