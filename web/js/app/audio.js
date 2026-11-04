// Звук кодом: шум и генераторы WebAudio, ни одного файла. Без AudioContext (или до первого
// щелчка) всё молча ничего не делает.
const MAT_TONE = { glass: 'glass', metal: 'metal', paint_red: 'metal', paint_blue: 'metal', paint_yellow: 'metal', paint_white: 'metal', paint_green: 'metal' };

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.played = 0;
    this.lastImpact = 0;
    this.laser = null;
  }

  // браузер разрешает звук только после действия пользователя
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  // шум через фильтр с огибающей
  burst({ freq = 800, q = 1, type = 'lowpass', dur = 0.3, gain = 0.5, attack = 0.005, at = 0, pan = 0 }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    src.connect(f).connect(g);
    out.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    this.played++;
  }

  tone({ freq = 220, to = null, dur = 0.2, gain = 0.3, type = 'sine', at = 0 }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
    this.played++;
  }

  // события симуляции -> звуки; listener - где игрок (громкость по расстоянию)
  events(list, listener, matName) {
    if (!this.ctx) return;
    for (const e of list) {
      const d = e.x != null ? Math.hypot(e.x - listener[0], e.y - listener[1], e.z - listener[2]) : 0;
      const near = Math.max(0.05, Math.min(1, 40 / (d + 20)));
      switch (e.type) {
        case 'explosion':
          this.burst({ freq: 260, dur: 1.6, gain: 0.9 * near, attack: 0.004 });
          this.burst({ freq: 1800, dur: 0.35, gain: 0.5 * near });
          this.tone({ freq: 70, to: 30, dur: 0.9, gain: 0.7 * near });
          break;
        case 'hit': {
          if (!e.removed) { this.tone({ freq: 900, dur: 0.06, gain: 0.08 * near, type: 'square' }); break; }
          const tone = MAT_TONE[matName(e.mat)] || 'thud';
          if (tone === 'glass') { this.burst({ freq: 5200, type: 'highpass', dur: 0.45, gain: 0.35 * near }); this.tone({ freq: 2400, to: 1800, dur: 0.2, gain: 0.08 * near, type: 'triangle' }); }
          else if (tone === 'metal') { this.tone({ freq: 520, to: 480, dur: 0.5, gain: 0.18 * near, type: 'triangle' }); this.burst({ freq: 3000, dur: 0.12, gain: 0.2 * near, type: 'bandpass', q: 3 }); }
          else this.burst({ freq: 500 + Math.random() * 300, dur: 0.22 + Math.min(0.5, e.removed / 200), gain: Math.min(0.6, 0.2 + e.removed / 100) * near });
          break;
        }
        case 'swing': this.burst({ freq: 900, type: 'bandpass', q: 2, dur: 0.16, gain: 0.12 }); break;
        case 'shot': this.burst({ freq: 2200, dur: 0.28, gain: 0.7 }); this.tone({ freq: 140, to: 60, dur: 0.2, gain: 0.4 }); break;
        case 'launch': this.burst({ freq: 700, type: 'bandpass', q: 0.7, dur: 0.8, gain: 0.4, attack: 0.05 }); break;
        case 'place': this.tone({ freq: 300, dur: 0.08, gain: 0.15, type: 'square' }); break;
        case 'ram': this.burst({ freq: 400, dur: 0.4, gain: Math.min(0.8, 0.2 + e.speed / 60) * near }); this.tone({ freq: 90, to: 50, dur: 0.3, gain: 0.3 * near }); break;
        case 'push': case 'throw': this.burst({ freq: 300, dur: 0.12, gain: 0.15 }); break;
        case 'empty': case 'grab-fail': this.tone({ freq: 180, dur: 0.08, gain: 0.1, type: 'square' }); break;
        case 'tool': this.tone({ freq: 640, dur: 0.05, gain: 0.06, type: 'triangle' }); break;
        case 'enter': case 'spawn': this.tone({ freq: 110, to: 160, dur: 0.5, gain: 0.25, type: 'sawtooth' }); break;
        case 'dust': if (Math.random() < 0.3) this.burst({ freq: 900, dur: 0.15, gain: 0.05 * near }); break;
        default: break;
      }
    }
  }

  impacts(list, listener) {
    if (!this.ctx || !list.length) return;
    const now = this.ctx.currentTime;
    if (now - this.lastImpact < 0.05) return;
    const e = list.reduce((a, b) => (a.speed > b.speed ? a : b));
    const d = Math.hypot(e.x - listener[0], e.y - listener[1], e.z - listener[2]);
    this.burst({ freq: 350, dur: 0.18, gain: Math.min(0.4, e.speed / 60) * Math.max(0.05, Math.min(1, 30 / (d + 15))) });
    this.lastImpact = now;
  }

  // лазер гудит, пока включён
  setLaser(on) {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.laser) {
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 110; o2.type = 'sine'; o2.frequency.value = 1760;
      g.gain.value = 0.06;
      o.connect(g); o2.connect(g); g.connect(this.master);
      o.start(); o2.start();
      this.laser = { o, o2, g };
    } else if (!on && this.laser) {
      this.laser.o.stop(); this.laser.o2.stop(); this.laser.g.disconnect();
      this.laser = null;
    }
  }
}
