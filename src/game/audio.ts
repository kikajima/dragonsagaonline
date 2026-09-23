// Chiptune audio engine: WebAudio SFX + original BGM loops
type Wave = OscillatorType;

class Chip {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  enabled = true;
  currentSong: string | null = null;
  musicTimer: number | null = null;

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.45;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  // Generic beep
  tone(freq: number, dur: number, wave: Wave = 'square', vol = 0.3, when = 0, slideTo?: number) {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  noise(dur: number, vol = 0.25, when = 0, freq = 1000) {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
  }

  // ---------- SFX ----------
  sfx(name: string) {
    this.init();
    if (!this.enabled) return;
    switch (name) {
      case 'menu': this.tone(880, 0.06, 'square', 0.18); break;
      case 'confirm': this.tone(660, 0.06, 'square', 0.2); this.tone(990, 0.08, 'square', 0.2, 0.06); break;
      case 'cancel': this.tone(440, 0.06, 'square', 0.2); this.tone(294, 0.09, 'square', 0.2, 0.05); break;
      case 'hit': this.noise(0.12, 0.3, 0, 2400); this.tone(180, 0.1, 'square', 0.22, 0, 80); break;
      case 'crit': this.noise(0.18, 0.35, 0, 3200); this.tone(240, 0.14, 'sawtooth', 0.25, 0, 60); this.tone(660, 0.1, 'square', 0.2, 0.05, 1100); break;
      case 'ki': this.tone(520, 0.25, 'sawtooth', 0.16, 0, 1400); this.tone(780, 0.22, 'square', 0.1, 0.02, 1800); break;
      case 'beam': this.tone(300, 0.5, 'sawtooth', 0.2, 0, 1200); this.noise(0.5, 0.18, 0.05, 2000); break;
      case 'heal': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.22, i * 0.07)); break;
      case 'levelup': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.13, 'square', 0.22, i * 0.09)); break;
      case 'coin': this.tone(988, 0.07, 'square', 0.2); this.tone(1319, 0.14, 'square', 0.2, 0.07); break;
      case 'item': this.tone(784, 0.08, 'triangle', 0.25); this.tone(1175, 0.12, 'triangle', 0.22, 0.08); break;
      case 'flee': [700, 500, 350, 250].forEach((f, i) => this.tone(f, 0.07, 'square', 0.18, i * 0.06)); break;
      case 'dead': [400, 300, 200, 120].forEach((f, i) => this.tone(f, 0.16, 'sawtooth', 0.2, i * 0.1)); break;
      case 'transform': this.tone(200, 0.6, 'sawtooth', 0.25, 0, 900); this.noise(0.6, 0.2, 0.1, 3000); this.tone(1200, 0.3, 'square', 0.15, 0.4, 1800); break;
      case 'dragon': this.tone(80, 1.2, 'sawtooth', 0.3, 0, 300); this.tone(120, 1.0, 'square', 0.15, 0.2, 500); this.noise(1.0, 0.15, 0.3, 800); break;
      case 'battlestart': this.tone(392, 0.1, 'square', 0.25); this.tone(392, 0.1, 'square', 0.25, 0.12); this.tone(523, 0.2, 'square', 0.28, 0.24); break;
      case 'talk': this.tone(587, 0.04, 'square', 0.12); break;
    }
  }

  // ---------- BGM (original loops) ----------
  playSong(name: string) {
    this.init();
    if (this.currentSong === name) return;
    this.stopSong();
    this.currentSong = name;
    const songs: Record<string, { tempo: number; lead: (string | null)[]; bass: (string | null)[] }> = {
      title: { tempo: 120, lead: SONG_TITLE, bass: SONG_TITLE_B },
      town: { tempo: 108, lead: SONG_TOWN, bass: SONG_TOWN_B },
      field: { tempo: 132, lead: SONG_FIELD, bass: SONG_FIELD_B },
      battle: { tempo: 152, lead: SONG_BATTLE, bass: SONG_BATTLE_B },
      boss: { tempo: 160, lead: SONG_BOSS, bass: SONG_BOSS_B },
      dragon: { tempo: 84, lead: SONG_DRAGON, bass: SONG_DRAGON_B },
    };
    const song = songs[name];
    if (!song) return;
    this.scheduleSong(song, name);
  }

  private scheduleSong(song: { tempo: number; lead: (string | null)[]; bass: (string | null)[] }, name: string) {
    if (!this.ctx || !this.musicGain) return;
    const beat = 60 / song.tempo / 2; // 8th notes
    const total = song.lead.length;
    let t = this.ctx.currentTime + 0.1;
    const notes: [number, number, Wave, number][] = [];
    for (let i = 0; i < total; i++) {
      const L = song.lead[i] ? NOTE_FREQ[song.lead[i] as string] : null;
      if (L) notes.push([t, L, 'square', 0.16]);
      const B = song.bass[i] ? NOTE_FREQ[song.bass[i] as string] : null;
      if (B) notes.push([t, B, 'triangle', 0.22]);
      t += beat;
    }
    // schedule all
    for (const [when, freq, wave, vol] of notes) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = wave;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, when);
      g.gain.setValueAtTime(vol, when + beat * 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, when + beat * 0.95);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(when);
      o.stop(when + beat);
    }
    const songDur = total * beat;
    this.musicTimer = window.setTimeout(() => {
      if (this.currentSong === name) this.scheduleSong(song, name);
    }, Math.max(200, (songDur - 0.15) * 1000));
  }

  stopSong() {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.musicGain) {
      // cut: quick re-create gain to silence pending notes
      const old = this.musicGain;
      old.gain.setValueAtTime(0, this.ctx.currentTime);
      const ng = this.ctx.createGain();
      ng.gain.value = 0.45;
      ng.connect(this.master!);
      this.musicGain = ng;
    }
    this.currentSong = null;
  }
}

export const NOTE_FREQ: Record<string, number> = {
  'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.0, 'A3': 220.0, 'B3': 246.94,
  'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.0, 'A4': 440.0, 'B4': 493.88,
  'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.0, 'B5': 987.77,
  'C6': 1046.5, 'D6': 1174.7, 'E6': 1318.5,
};

// ---------- Original melodies (8th-note sequences) ----------
const SONG_FIELD = [
  'C5', 'E5', 'G5', 'E5', 'F5', 'A5', 'G5', null,
  'E5', 'G5', 'C6', 'G5', 'A5', null, 'F5', null,
  'D5', 'F5', 'A5', 'F5', 'G5', 'B5', 'A5', null,
  'F5', 'A5', 'D6', 'A5', 'G5', null, 'E5', null,
  'C5', 'E5', 'G5', 'E5', 'F5', 'A5', 'G5', null,
  'E5', 'G5', 'C6', 'G5', 'A5', null, 'F5', null,
  'D5', 'F5', 'A5', 'F5', 'G5', 'E5', 'F5', 'D5',
  'C5', null, 'G4', null, 'C5', null, null, null,
];
const SONG_FIELD_B = [
  'C3', null, 'G3', null, 'F3', null, 'C3', null,
  'C3', null, 'E3', null, 'F3', null, 'F3', null,
  'D3', null, 'A3', null, 'G3', null, 'D3', null,
  'D3', null, 'F3', null, 'C3', null, 'C3', null,
  'C3', null, 'G3', null, 'F3', null, 'C3', null,
  'C3', null, 'E3', null, 'F3', null, 'F3', null,
  'D3', null, 'A3', null, 'G3', null, 'B3', null,
  'C3', null, 'G3', null, 'C3', null, null, null,
];

const SONG_TOWN = [
  'E5', null, 'G5', 'A5', 'G5', null, 'E5', null,
  'C5', null, 'E5', 'G5', 'F5', null, null, null,
  'D5', null, 'F5', 'G5', 'F5', null, 'D5', null,
  'B4', null, 'D5', 'F5', 'E5', null, null, null,
  'E5', null, 'G5', 'A5', 'G5', null, 'E5', null,
  'C5', null, 'E5', 'G5', 'A5', null, null, null,
  'G5', null, 'F5', 'E5', 'D5', null, 'F5', null,
  'E5', null, 'C5', null, 'C5', null, null, null,
];
const SONG_TOWN_B = [
  'C3', null, null, null, 'G3', null, null, null,
  'C3', null, null, null, 'F3', null, null, null,
  'D3', null, null, null, 'G3', null, null, null,
  'G3', null, null, null, 'C3', null, null, null,
  'C3', null, null, null, 'G3', null, null, null,
  'C3', null, null, null, 'F3', null, null, null,
  'G3', null, null, null, 'G3', null, null, null,
  'C3', null, 'G3', null, 'C3', null, null, null,
];

const SONG_BATTLE = [
  'A4', 'A4', 'C5', 'A4', 'E5', null, 'D5', 'C5',
  'B4', 'B4', 'D5', 'B4', 'F5', null, 'E5', 'D5',
  'C5', 'C5', 'E5', 'C5', 'A5', null, 'G5', 'E5',
  'F5', 'E5', 'D5', 'C5', 'B4', null, 'E5', null,
  'A4', 'A4', 'C5', 'A4', 'E5', null, 'D5', 'C5',
  'B4', 'B4', 'D5', 'B4', 'F5', null, 'E5', 'D5',
  'C5', 'E5', 'A5', 'E5', 'F5', 'E5', 'D5', 'B4',
  'A4', null, 'E5', null, 'A4', null, null, null,
];
const SONG_BATTLE_B = [
  'A3', null, 'A3', null, 'A3', null, 'A3', null,
  'G3', null, 'G3', null, 'G3', null, 'G3', null,
  'F3', null, 'F3', null, 'F3', null, 'F3', null,
  'E3', null, 'E3', null, 'E3', null, 'E3', null,
  'A3', null, 'A3', null, 'A3', null, 'A3', null,
  'G3', null, 'G3', null, 'G3', null, 'G3', null,
  'F3', null, 'F3', null, 'D3', null, 'E3', null,
  'A3', null, 'E3', null, 'A3', null, null, null,
];

const SONG_BOSS = [
  'D5', 'D5', 'F5', 'D5', 'A5', null, null, null,
  'G5', 'G5', 'A5', 'G5', 'D6', null, null, null,
  'F5', 'F5', 'G5', 'F5', 'C6', null, 'A5', null,
  'G5', 'F5', 'E5', 'D5', 'C#5', null, 'D5', null,
  'D5', 'D5', 'F5', 'D5', 'A5', null, null, null,
  'G5', 'G5', 'A5', 'G5', 'D6', null, null, null,
  'F5', 'E5', 'D5', 'C#5', 'D5', 'E5', 'F5', 'G5',
  'A5', null, 'A4', null, 'D5', null, null, null,
];
const SONG_BOSS_B = [
  'D3', null, 'D3', null, 'D3', null, 'D3', null,
  'C3', null, 'C3', null, 'C3', null, 'C3', null,
  'A3', null, 'A3', null, 'A3', null, 'A3', null,
  'E3', null, 'E3', null, 'A3', null, 'A3', null,
  'D3', null, 'D3', null, 'D3', null, 'D3', null,
  'C3', null, 'C3', null, 'C3', null, 'C3', null,
  'A3', null, 'A3', null, 'D3', null, 'E3', null,
  'D3', null, 'A3', null, 'D3', null, null, null,
];

const SONG_TITLE = [
  'C5', null, 'G5', null, 'A5', null, 'G5', null,
  'F5', null, 'E5', null, 'D5', null, 'C5', null,
  'E5', null, 'A5', null, 'C6', null, 'B5', null,
  'A5', null, 'G5', null, 'E5', null, null, null,
  'C5', null, 'G5', null, 'A5', null, 'G5', null,
  'F5', null, 'E5', null, 'D5', null, 'C5', null,
  'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6',
  'E6', null, 'G5', null, 'C5', null, null, null,
];
const SONG_TITLE_B = [
  'C3', null, 'E3', null, 'F3', null, 'E3', null,
  'F3', null, 'A3', null, 'G3', null, 'C3', null,
  'E3', null, 'A3', null, 'C4', null, 'B3', null,
  'A3', null, 'G3', null, 'C3', null, null, null,
  'C3', null, 'E3', null, 'F3', null, 'E3', null,
  'F3', null, 'A3', null, 'G3', null, 'C3', null,
  'G3', null, 'A3', null, 'B3', null, 'C4', null,
  'E3', null, 'G3', null, 'C3', null, null, null,
];

const SONG_DRAGON = [
  'C5', null, 'D5', null, 'E5', null, 'G5', null,
  'E5', null, 'D5', null, 'C5', null, null, null,
  'A4', null, 'C5', null, 'D5', null, 'F5', null,
  'D5', null, 'E5', null, 'D5', null, null, null,
  'C5', null, 'D5', null, 'E5', null, 'G5', null,
  'A5', null, 'G5', null, 'E5', null, null, null,
  'F5', null, 'E5', null, 'D5', null, 'E5', null,
  'C5', null, null, null, null, null, null, null,
];
const SONG_DRAGON_B = [
  'C3', null, null, null, 'E3', null, null, null,
  'E3', null, null, null, 'C3', null, null, null,
  'A3', null, null, null, 'D3', null, null, null,
  'D3', null, null, null, 'G3', null, null, null,
  'C3', null, null, null, 'E3', null, null, null,
  'F3', null, null, null, 'C3', null, null, null,
  'D3', null, null, null, 'G3', null, null, null,
  'C3', null, null, null, null, null, null, null,
];

export const chip = new Chip();
