// Tiny Web Audio synth: 8-bit style SFX + a gentle looping arcade track. No audio files.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 4 bars (Am - F - C - G), 16 sixteenth notes each.
const CHORDS = [
  { bass: 45, tones: [57, 60, 64] },
  { bass: 41, tones: [53, 57, 60] },
  { bass: 48, tones: [55, 60, 64] },
  { bass: 43, tones: [55, 59, 62] },
];
const BASS_STEPS = [0, 3, 6, 8, 11, 14];
const LEAD = [ // sparse melody, one entry per bar: [step, midi]
  [[0, 76], [6, 74], [8, 72], [12, 69]],
  [[0, 72], [6, 69], [10, 72], [12, 74]],
  [[0, 76], [4, 79], [8, 76], [12, 72]],
  [[0, 74], [6, 71], [8, 74], [14, 79]],
];
const STEP = 60 / 118 / 4;

export class AudioSystem {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.lastPlay = {};
    this.timer = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.music = ctx.createGain();
      this.music.connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) ctx.suspend();
        else ctx.resume();
      });
      this.apply();
      this.startMusic();
    }
    if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
  }

  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(this.settings.sound ? 0.55 : 0, t, 0.02);
    this.music.gain.setTargetAtTime(this.settings.music ? 0.14 : 0, t, 0.1);
  }

  tone(type, f0, f1, dur, vol, delay = 0, bus = this.sfx) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol, freq = 1500, delay = 0, bus = this.sfx) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq / 6), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx || !this.settings.sound) return;
    const now = performance.now();
    const gap = { collect: 45, hit: 40, shoot: 50, eshoot: 70, select: 30, laser: 70 }[name] ?? 20;
    if (now - (this.lastPlay[name] || 0) < gap) return;
    this.lastPlay[name] = now;
    switch (name) {
      case 'shoot': this.tone('square', 1100, 380, 0.07, 0.09); break;
      case 'eshoot': this.tone('square', 320, 160, 0.09, 0.05); break;
      case 'hit': this.tone('square', 240, 120, 0.05, 0.08); break;
      case 'explode':
        this.noise(0.28, 0.3, 1600);
        this.tone('triangle', 140, 40, 0.25, 0.2);
        break;
      case 'rock': this.noise(0.2, 0.22, 700); break;
      case 'bigexplode':
        this.noise(0.9, 0.4, 2000);
        this.tone('triangle', 120, 30, 0.8, 0.3);
        this.tone('square', 90, 30, 0.6, 0.08, 0.1);
        break;
      case 'collect':
        this.tone('triangle', 1320, 1320, 0.05, 0.12);
        this.tone('triangle', 1760, 1760, 0.06, 0.1, 0.04);
        break;
      case 'repair': [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.08, 0.16, i * 0.05)); break;
      case 'hurt':
        this.tone('square', 260, 50, 0.35, 0.16);
        this.noise(0.2, 0.2, 900);
        break;
      case 'nova':
        this.tone('triangle', 180, 1400, 0.45, 0.25);
        this.noise(0.5, 0.18, 3000);
        break;
      case 'laser': this.tone('square', 1500 + Math.random() * 200, 1300, 0.05, 0.025); break;
      case 'deposit': [659, 784, 988, 1318].forEach((f, i) => this.tone('triangle', f, f, 0.08, 0.14, i * 0.06)); break;
      case 'dock': this.tone('triangle', 330, 660, 0.25, 0.15); break;
      case 'novaready': this.tone('triangle', 880, 1760, 0.12, 0.1); break;
      case 'select': this.tone('square', 660, 660, 0.03, 0.06); break;
      case 'confirm':
        this.tone('square', 523, 523, 0.05, 0.08);
        this.tone('square', 784, 784, 0.08, 0.08, 0.05);
        break;
      case 'buy': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('square', f, f, 0.07, 0.07, i * 0.045)); break;
      case 'error': this.tone('square', 150, 110, 0.18, 0.1); break;
      case 'wave': [392, 523].forEach((f, i) => this.tone('square', f, f, 0.1, 0.07, i * 0.1)); break;
      case 'boss': [110, 104, 98].forEach((f, i) => this.tone('square', f, f * 0.98, 0.25, 0.12, i * 0.28)); break;
      case 'waveclear': [523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, 0.1, 0.08, i * 0.08)); break;
      case 'gameover': [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.97, 0.3, 0.2, i * 0.25)); break;
      default: break;
    }
  }

  startMusic() {
    if (!this.ctx || this.timer) return;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      this.next = ctx.currentTime + 0.1;
      return;
    }
    while (this.next < ctx.currentTime + 0.2) {
      this.playStep(this.step, this.next - ctx.currentTime);
      this.next += STEP;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, delay) {
    if (!this.settings.music) return;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const ch = CHORDS[bar];
    if (BASS_STEPS.includes(s)) this.tone('triangle', mtof(ch.bass), mtof(ch.bass), STEP * 1.8, 0.5, delay, this.music);
    if (s % 2 === 0) {
      const n = ch.tones[(s / 2) % 3] + 12;
      this.tone('square', mtof(n), mtof(n), STEP * 0.9, 0.06, delay, this.music);
    }
    for (const [ls, m] of LEAD[bar]) {
      if (ls === s) this.tone('square', mtof(m), mtof(m), STEP * 3, 0.1, delay, this.music);
    }
    if (s % 4 === 2) this.noise(0.03, 0.12, 6000, delay, this.music);
  }
}
