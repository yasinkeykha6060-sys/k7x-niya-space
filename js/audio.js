export function createAudio() {
  let ctx = null;
  let on = false;
  let engine = null;
  let engineGain = null;

  function ensure() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    return ctx;
  }

  function noise(seconds) {
    const context = ensure();
    if (!context) return null;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  return {
    unlock() { ensure(); },
    setOn(value) {
      on = !!value;
      if (!on) this.engine(0);
    },
    get on() { return on; },
    engine(amount) {
      const context = ensure();
      if (!context || !on) return;
      if (amount <= 0.02) {
        if (engineGain) engineGain.gain.setTargetAtTime(0.0001, context.currentTime, 0.05);
        return;
      }
      if (!engine) {
        engine = context.createBufferSource();
        engine.buffer = noise(1);
        engine.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 420;
        engineGain = context.createGain();
        engineGain.gain.value = 0.0001;
        engine.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(context.destination);
        engine.start();
      }
      engineGain.gain.setTargetAtTime(0.03 * amount, context.currentTime, 0.05);
    },
    blip(freq) {
      const context = ensure();
      if (!context || !on) return;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.04, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + 0.3);
    },
    boom() {
      const context = ensure();
      if (!context || !on) return;
      const src = context.createBufferSource();
      src.buffer = noise(0.4);
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 180;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      src.start();
    },
    resume() {
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    }
  };
}
