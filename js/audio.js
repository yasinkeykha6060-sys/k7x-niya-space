export function createAudio() {
  let ctx = null;
  let on = false;
  let engine = null;
  let filter = null;
  let rumble = null;
  let engineGain = null;

  function ensure() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    return ctx;
  }

  function noiseBuffer(seconds) {
    const context = ensure();
    if (!context) return null;
    const count = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, count, context.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < count; i += 1) {
      const white = Math.random() * 2 - 1;
      brown = brown * 0.98 + white * 0.02;
      data[i] = brown * 3.2 + white * 0.15;
    }
    return buffer;
  }

  return {
    unlock() { ensure(); },
    setOn(value) {
      on = !!value;
      if (!on) this.engine(0);
      else ensure();
    },
    get on() { return on; },
    engine(amount) {
      const context = ensure();
      if (!context || !on) return;
      if (!engine) {
        engine = context.createBufferSource();
        engine.buffer = noiseBuffer(2);
        engine.loop = true;
        filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 280;
        rumble = context.createOscillator();
        rumble.type = "sawtooth";
        rumble.frequency.value = 46;
        const rumbleGain = context.createGain();
        rumbleGain.gain.value = 0.35;
        engineGain = context.createGain();
        engineGain.gain.value = 0.0001;
        engine.connect(filter);
        filter.connect(engineGain);
        rumble.connect(rumbleGain);
        rumbleGain.connect(engineGain);
        engineGain.connect(context.destination);
        engine.start();
        rumble.start();
      }
      const level = Math.max(0, Math.min(1, amount));
      engineGain.gain.setTargetAtTime(level <= 0.02 ? 0.0001 : 0.22 * level, context.currentTime, 0.08);
      filter.frequency.setTargetAtTime(180 + level * 900, context.currentTime, 0.08);
      rumble.frequency.setTargetAtTime(38 + level * 42, context.currentTime, 0.08);
    },
    blip() {
      const context = ensure();
      if (!context || !on) return;
      const src = context.createBufferSource();
      src.buffer = noiseBuffer(0.12);
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1400;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.2, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
      src.connect(band);
      band.connect(gain);
      gain.connect(context.destination);
      src.start();
    },
    boom() {
      const context = ensure();
      if (!context || !on) return;
      const src = context.createBufferSource();
      src.buffer = noiseBuffer(0.7);
      const low = context.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 140;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.35, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.7);
      src.connect(low);
      low.connect(gain);
      gain.connect(context.destination);
      src.start();
    },
    resume() {
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    }
  };
}
