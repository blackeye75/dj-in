/**
 * Built-in Web Audio deck.
 *
 * Generates the "House Deck" tracks that ship with every category. It exists so
 * the rig always has a real signal to react to — no API key, no network, no
 * CORS restrictions on the analyser — and so the lyrics/queue/transport can be
 * demonstrated end to end offline.
 *
 * Presets are step sequences: 16 steps per bar, scheduled ~100ms ahead of the
 * audio clock so timing does not depend on the main thread staying free.
 */

const NOTE = (semi) => 55 * Math.pow(2, semi / 12); // A1 = 0

const PRESETS = {
  ignition: {
    bpm: 128,
    bars: 24,
    kick: '1...1...1...1...',
    snare: '....1.......1...',
    hat: '..1...1...1...1.',
    bass: [0, 0, 7, 5],
    chords: [
      [12, 15, 19],
      [10, 13, 17],
      [8, 12, 15],
      [7, 10, 14],
    ],
    lead: true,
    cutoff: 2200,
    drive: 0.9,
  },
  bounce: {
    bpm: 112,
    bars: 22,
    kick: '1...1..11...1...',
    snare: '....1.......1..1',
    hat: '..1.1.1...1.1.1.',
    bass: [0, 3, 5, 3],
    chords: [
      [12, 16, 19],
      [9, 12, 16],
      [14, 17, 21],
      [7, 11, 14],
    ],
    lead: true,
    cutoff: 1800,
    drive: 0.8,
  },
  drive: {
    bpm: 84,
    bars: 16,
    kick: '1.......1.......',
    snare: '................',
    hat: '....1.......1...',
    bass: [0, 0, 5, 7],
    chords: [
      [12, 15, 19, 22],
      [8, 12, 15, 19],
      [10, 14, 17, 21],
      [7, 10, 14, 17],
    ],
    lead: false,
    pad: true,
    cutoff: 900,
    drive: 0.45,
  },
  steady: {
    bpm: 96,
    bars: 18,
    kick: '1.......1.......',
    snare: '................',
    hat: '..1...1...1...1.',
    bass: [0, 0, 0, 0],
    chords: [
      [12, 16, 19],
      [12, 16, 19],
      [10, 14, 17],
      [10, 14, 17],
    ],
    lead: false,
    pad: true,
    cutoff: 1100,
    drive: 0.4,
  },
  amber: {
    bpm: 60,
    bars: 12,
    kick: '................',
    snare: '................',
    hat: '................',
    bass: [0, 0, 3, 3],
    chords: [
      [12, 15, 19],
      [10, 14, 17],
      [8, 12, 15],
      [10, 14, 17],
    ],
    lead: false,
    pad: true,
    cutoff: 620,
    drive: 0.28,
  },
  anthem: {
    bpm: 120,
    bars: 25,
    kick: '1...1...1...1..1',
    snare: '....1.......1...',
    hat: '..1.1.1.1.1.1.1.',
    bass: [0, 7, 5, 3],
    chords: [
      [12, 16, 19, 24],
      [10, 14, 17, 22],
      [8, 12, 15, 20],
      [5, 9, 12, 17],
    ],
    lead: true,
    cutoff: 2600,
    drive: 1,
  },
};

export function synthPreset(id) {
  return PRESETS[id] || PRESETS.ignition;
}

export function synthDuration(id) {
  const p = synthPreset(id);
  return (p.bars * 4 * 60) / p.bpm;
}

export class SynthDeck {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(destination);
    this.noise = null;
    this.timer = null;
    this.playing = false;
    this.preset = PRESETS.ignition;
    this.step = 0;
    this.nextTime = 0;
    this.startCtx = 0;
    this.startOffset = 0;
    this.onended = null;
    this._volume = 1;
  }

  #noiseBuffer() {
    if (!this.noise) {
      const len = this.ctx.sampleRate * 0.4;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  load(id) {
    this.preset = synthPreset(id);
    this.duration = synthDuration(id);
    this.step = 0;
  }

  set volume(v) {
    this._volume = v;
    this.out.gain.setTargetAtTime(0.9 * v, this.ctx.currentTime, 0.02);
  }

  get volume() {
    return this._volume;
  }

  get currentTime() {
    if (!this.playing) return this.startOffset;
    return Math.min(this.duration, this.ctx.currentTime - this.startCtx + this.startOffset);
  }

  play(offset = this.startOffset) {
    this.stopTimer();
    const stepDur = 60 / this.preset.bpm / 4;
    this.startOffset = Math.max(0, Math.min(offset, this.duration - 0.05));
    this.startCtx = this.ctx.currentTime;
    this.step = Math.floor(this.startOffset / stepDur);
    this.nextTime = this.startCtx + ((this.step + 1) * stepDur - this.startOffset);
    this.playing = true;
    this.timer = setInterval(() => this.#schedule(), 25);
    this.#schedule();
  }

  pause() {
    if (!this.playing) return;
    this.startOffset = this.currentTime;
    this.playing = false;
    this.stopTimer();
  }

  seek(sec) {
    const was = this.playing;
    this.pause();
    this.startOffset = Math.max(0, Math.min(sec, this.duration));
    if (was) this.play(this.startOffset);
  }

  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  dispose() {
    this.stopTimer();
    this.playing = false;
    try {
      this.out.disconnect();
    } catch {}
  }

  #schedule() {
    if (!this.playing) return;
    const p = this.preset;
    const stepDur = 60 / p.bpm / 4;
    const ahead = this.ctx.currentTime + 0.12;
    while (this.nextTime < ahead) {
      const pos = this.step * stepDur;
      if (pos >= this.duration) {
        this.playing = false;
        this.stopTimer();
        this.startOffset = this.duration;
        if (this.onended) this.onended();
        return;
      }
      this.#playStep(this.step, this.nextTime);
      this.step += 1;
      this.nextTime += stepDur;
    }
  }

  #playStep(step, when) {
    const p = this.preset;
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const chord = p.chords[bar % p.chords.length];

    if (p.kick[s16] === '1') this.#kick(when, p.drive);
    if (p.snare[s16] === '1') this.#snare(when, p.drive);
    if (p.hat[s16] === '1') this.#hat(when, p.drive * 0.5);

    // Bass on every beat.
    if (s16 % 4 === 0) {
      const semi = p.bass[(s16 / 4) % p.bass.length] + (bar % 2 === 1 ? -0 : 0);
      this.#bass(when, NOTE(semi + 12), stepLen(p) * 3.4, p.cutoff, p.drive);
    }

    // Chord stab / pad at the head of each bar (pads sustain the whole bar).
    if (s16 === 0) {
      const dur = p.pad ? (stepLen(p) * 16) : stepLen(p) * 6;
      chord.forEach((semi, i) => this.#tone(when, NOTE(semi + 24), dur, p.pad ? 0.055 : 0.05, p.cutoff, p.pad, i));
    }

    if (p.lead && (s16 === 6 || s16 === 14)) {
      const semi = chord[(step + s16) % chord.length] + 36;
      this.#tone(when, NOTE(semi), stepLen(p) * 2, 0.05, p.cutoff * 1.6, false, 0, 'triangle');
    }
  }

  /* ------------------------------------------------------------- voices */

  #kick(when, drive) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, when);
    o.frequency.exponentialRampToValueAtTime(44, when + 0.12);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.95 * drive, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.42);
    o.connect(g).connect(this.out);
    o.start(when);
    o.stop(when + 0.45);
  }

  #snare(when, drive) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * drive, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.19);
    src.connect(bp).connect(g).connect(this.out);
    src.start(when);
    src.stop(when + 0.2);
  }

  #hat(when, drive) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.26 * drive, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    src.connect(hp).connect(g).connect(this.out);
    src.start(when);
    src.stop(when + 0.07);
  }

  #bass(when, freq, dur, cutoff, drive) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(cutoff, 900), when);
    lp.frequency.exponentialRampToValueAtTime(180, when + dur);
    lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.32 * drive, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(lp).connect(g).connect(this.out);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  #tone(when, freq, dur, level, cutoff, pad, idx = 0, type = 'sawtooth') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = (idx % 2 === 0 ? 1 : -1) * 6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    const attack = pad ? Math.min(1.2, dur * 0.35) : 0.008;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(lp).connect(g).connect(this.out);
    o.start(when);
    o.stop(when + dur + 0.05);
  }
}

function stepLen(p) {
  return 60 / p.bpm / 4;
}
