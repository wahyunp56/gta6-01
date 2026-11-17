// audio.js — every sound in NEON HARBOR is synthesized with WebAudio.
// No audio files, no network: oscillators and filtered noise, built lazily
// on the first user gesture (browsers block audio before that).

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    engine: null, // { osc, sub, gain, filter }
    sirenNodes: null, // { osc, gain, phase }
    noiseBuf: null,
    engineOn: false,
    sirenOn: false,

    /** Create the context. Call from a user gesture (Start button / key). */
    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      // One shared noise buffer for gunshots, thuds and skids.
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    },

    setMuted(muted) {
      this.muted = muted;
      if (this.master) this.master.gain.value = muted ? 0 : 0.9;
    },

    /** Start/stop the engine hum (a low saw + sub oscillator). */
    engineNote(on) {
      if (!this.ctx) return;
      if (on && !this.engine) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 55;
        const sub = this.ctx.createOscillator();
        sub.type = 'square';
        sub.frequency.value = 28;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.0;
        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        osc.start();
        sub.start();
        this.engine = { osc, sub, gain, filter };
      } else if (!on && this.engine) {
        const e = this.engine;
        e.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        const osc = e.osc;
        const sub = e.sub;
        window.setTimeout(() => { try { osc.stop(); sub.stop(); } catch (_) { /* already stopped */ } }, 300);
        this.engine = null;
      }
      this.engineOn = on;
    },

    /** Siren: one oscillator whose pitch flips between two tones. */
    siren(on) {
      if (!this.ctx) {
        this.sirenOn = on;
        return;
      }
      if (on && !this.sirenNodes) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 720;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.035;
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        this.sirenNodes = { osc, gain, phase: 0 };
      } else if (!on && this.sirenNodes) {
        const s = this.sirenNodes;
        s.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        const osc = s.osc;
        window.setTimeout(() => { try { osc.stop(); } catch (_) { /* already stopped */ } }, 300);
        this.sirenNodes = null;
      }
      this.sirenOn = on;
    },

    /** Per-frame: engine pitch follows speed, siren flips its tone. */
    update(S, dt) {
      if (!this.ctx) return;
      if (this.engine && S.player.car) {
        const norm = Math.min(1, Math.abs(S.player.speed || 0) / 27);
        this.engine.osc.frequency.value = 52 + norm * 165;
        this.engine.sub.frequency.value = 26 + norm * 82;
        this.engine.gain.gain.value = 0.045 + norm * 0.05;
        this.engine.filter.frequency.value = 380 + norm * 900;
      } else if (this.engine) {
        this.engine.gain.gain.value = 0.02;
      }
      if (this.sirenNodes) {
        this.sirenNodes.phase += dt;
        const high = Math.floor(this.sirenNodes.phase * 1.6) % 2 === 0;
        this.sirenNodes.osc.frequency.value = high ? 880 : 660;
      }
    },

    /** Short noise burst through a bandpass: the pistol crack. */
    shot() {
      if (!this.ctx || !this.noiseBuf) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1700;
      filter.Q.value = 0.8;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t, Math.random() * 0.2, 0.18);
    },

    /** A rival's shot: same crack, quieter and duller (farther away). */
    enemyShot() {
      if (!this.ctx || !this.noiseBuf) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t, Math.random() * 0.2, 0.15);
    },

    /** A low thud for crashes, rams and bodies hitting the ground. */
    thud() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.22);
    },

    /** One UI blip at a given pitch (pickups, spawns, prompts). */
    blip(freq) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq || 660, t);
      osc.frequency.exponentialRampToValueAtTime((freq || 660) * 1.5, t + 0.1);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.15);
    },

    /** Two-note chime for grabbing the package. */
    pickup() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [880, 1318].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = this.ctx.createGain();
        const start = t + i * 0.09;
        gain.gain.setValueAtTime(0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(start);
        osc.stop(start + 0.24);
      });
    },

    /** Tiny click for empty mags and reloads. */
    click() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 1200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.06);
    },

    /** Short descending buzz when a bullet lands on a rival. */
    hit() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.11);
    },

    /** Mission-complete arpeggio, four notes climbing. */
    fanfare() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = this.ctx.createGain();
        const start = t + i * 0.11;
        gain.gain.setValueAtTime(0.28, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(start);
        osc.stop(start + 0.34);
      });
    },
  };
  return audio;
}
