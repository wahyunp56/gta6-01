// WebAudio synth for NEON HARBOR: every sound is generated, no audio files.
// Engine hum follows speed, the siren wails two tones while wanted, and the
// pickup blip, gunshot and mission arpeggio are short oscillator envelopes.
export function createAudio() {
  const audio = {
    ctx: null, muted: false, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, sirenTimer: 0, sirenHigh: false,
    started: false,
  };

  // Create the context on first user gesture; browsers block it before that.
  audio.ensure = function ensure() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 420;
      audio.engineOsc.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.ctx.destination);
      audio.engineOsc.start();
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'sine';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.ctx.destination);
      audio.sirenOsc.start();
      audio.started = true;
    } catch (e) {
      audio.ctx = null;
    }
  };

  // Short beep: a single oscillator note with a fast decay envelope.
  audio.blip = function blip(freq, dur, type, vol) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.12));
    osc.connect(gain); gain.connect(audio.ctx.destination);
    osc.start(t); osc.stop(t + (dur || 0.12) + 0.02);
  };

  // Gunshot: a burst of filtered noise, louder and harsher than a blip.
  audio.shot = function shot() {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const len = Math.floor(audio.ctx.sampleRate * 0.14);
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 900;
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter); filter.connect(gain); gain.connect(audio.ctx.destination);
    src.start(t);
    audio.blip(180, 0.08, 'square', 0.18);
  };

  // Two-note pickup chime, rising.
  audio.pickup = function pickup() {
    audio.blip(660, 0.1, 'sine', 0.16);
    setTimeout(() => audio.blip(990, 0.16, 'sine', 0.16), 90);
  };

  // Mission-complete arpeggio: four rising notes, the game's little fanfare.
  audio.fanfare = function fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => audio.blip(n, 0.22, 'triangle', 0.2), i * 130));
  };

  // Busted / wasted sting: two falling notes.
  audio.sting = function sting() {
    audio.blip(392, 0.3, 'sawtooth', 0.16);
    setTimeout(() => audio.blip(262, 0.5, 'sawtooth', 0.16), 220);
  };

  // Called every frame: engine pitch follows speed, siren wails while wanted.
  audio.update = function update(speedKmh, wanted, dt) {
    if (!audio.ctx || audio.muted) {
      if (audio.engineGain) audio.engineGain.gain.value = 0;
      if (audio.sirenGain) audio.sirenGain.gain.value = 0;
      return;
    }
    const target = Math.min(0.09, Math.abs(speedKmh) / 900);
    audio.engineGain.gain.value += (target - audio.engineGain.gain.value) * 0.2;
    audio.engineOsc.frequency.value = 48 + Math.abs(speedKmh) * 1.1;
    if (wanted > 0) {
      audio.sirenTimer -= dt;
      if (audio.sirenTimer <= 0) {
        audio.sirenTimer = 0.55;
        audio.sirenHigh = !audio.sirenHigh;
        audio.sirenOsc.frequency.value = audio.sirenHigh ? 880 : 620;
      }
      audio.sirenGain.gain.value = 0.045;
    } else if (audio.sirenGain) {
      audio.sirenGain.gain.value = 0;
    }
  };

  audio.toggleMute = function toggleMute() {
    audio.muted = !audio.muted;
    return audio.muted;
  };

  return audio;
}
