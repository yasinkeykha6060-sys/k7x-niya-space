import { EARTH, EARTH_GAME, G0, mulberry32, verletOrbit, orbitalElements, predictApsis } from "./physics.js";
import { makeWorld, stepWorld, focused, dropStage } from "./vehicle.js";
import { gravityTurn } from "./guidance.js";

const DT = 1 / 120;

function planetOf(id) {
  return id === "small" ? EARTH_GAME : EARTH;
}

export function createFlight(canvas, design, options) {
  const planet = planetOf(options.planet || "earth");
  const world = makeWorld(design, planet, options.seed || 1);
  const rng = mulberry32(options.seed || 1);
  if (options.failFactor) {
    focused(world).parts.forEach((part) => {
      if (part.engine) part.engine.failRate *= options.failFactor;
    });
  }
  const input = { throttle: 0, stick: 0, sas: "hold", stage: false, chute: false, released: true };
  const smoke = [];
  let running = false;
  let paused = false;
  let warp = 1;
  let map = false;
  let auto = false;
  let last = 0;
  let acc = 0;
  let maxAlt = 0;
  let result = null;
  let raf = 0;
  let stageLatch = false;
  const samples = [];
  const ctx = canvas.getContext("2d");

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, options.quality === "low" ? 1 : 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function coasting(vessel) {
    const engines = vessel.parts.some((part) => part.engineOn);
    return vessel.alive && !vessel.onPad && !engines && input.throttle <= 0.01 && vessel.altitude > planet.atmoTop;
  }

  function step(dt) {
    const vessel = focused(world);
    if (!vessel || !vessel.alive || result) return;
    if (auto) {
      const cmd = gravityTurn(vessel, planet);
      vessel.holdPhi = cmd.phi;
      input.throttle = cmd.throttle;
      input.sas = "hold";
      input.stage = cmd.stage && !stageLatch;
      stageLatch = !!cmd.stage;
    }
    const events = stepWorld(world, input, dt, rng);
    input.stage = false;
    maxAlt = Math.max(maxAlt, vessel.altitude || 0);
    events.forEach((event) => {
      if (event.vessel !== world.focus) return;
      const pod = vessel.parts.some((part) => (part.kind === "command" || part.kind === "payload") && !part.broken);
      if (event.type === "crash" || event.type === "land" || !pod) finish(event);
    });
    if (Math.floor(world.time * 2) !== Math.floor((world.time - dt) * 2)) {
      samples.push({ t: world.time, alt: vessel.altitude, phi: vessel.phi, broken: vessel.parts.filter((part) => part.broken).map((part) => part.uid) });
      if (samples.length > 240) samples.shift();
    }
    if (input.throttle > 0.2 && vessel.parts.some((part) => part.engineOn)) {
      smoke.push({ x: vessel.x, y: vessel.y, life: 1, phi: vessel.phi });
      if (smoke.length > (options.quality === "low" ? 40 : 120)) smoke.shift();
    }
  }

  function finish(event) {
    const vessel = focused(world);
    const el = vessel ? predictApsis(planet, vessel) : null;
    const pe = el ? el.rp - planet.radius : 0;
    const ap = el && Number.isFinite(el.ra) ? el.ra - planet.radius : 0;
    const orbit = el && el.e < 1 && pe > planet.karman;
    let note = "پرواز تمام شد.";
    if (event.type === "land") note = "آرام نشستی.";
    else if (event.type === "crash") note = "برخورد با زمین سخت بود. چتر یا سوخت فرود کمک می‌کند.";
    else if (event.type === "struct") note = (event.name || "قطعه") + " از فشار هوا جدا شد. آرام‌تر کج شو یا سازه را قوی‌تر کن.";
    else if (event.type === "heat") note = (event.name || "قطعه") + " در بازگشت داغ شد. سپر گرما لازم است.";
    else if (event.type === "rud") note = (event.name || "موتور") + " از کار افتاد.";
    result = {
      designId: design.id,
      name: design.name,
      maxAlt,
      crashed: event.type === "crash" || event.type === "struct" || event.type === "heat" || event.type === "rud",
      landed: event.type === "land",
      orbit,
      pe,
      ap,
      deployed: !!world.deployed,
      note,
      event
    };
    if (options.onReport) options.onReport(result);
  }

  function drawSky(w, h, alt) {
    const t = Math.max(0, Math.min(1, alt / 80000));
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, mix("#1a1240", "#7ec8ff", 1 - t));
    sky.addColorStop(1, mix("#ff8fc2", "#16324f", t));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    if (t > 0.35) {
      ctx.fillStyle = "rgba(255,244,230,0.85)";
      for (let i = 0; i < 40; i += 1) {
        const x = (i * 97 + alt * 0.01) % w;
        const y = (i * 53) % (h * 0.7);
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const vessel = focused(world);
    if (!vessel) return;
    const alt = Math.max(0, vessel.altitude || 0);
    drawSky(w, h, alt);
    let scale = 7;
    if (map) scale = (Math.min(w, h) * 0.28) / planet.radius;
    else if (alt > 1500) scale = Math.min(7, 900 / Math.max(400, alt));
    if (alt > 60000 && !map) scale = Math.min(scale, (h * 0.22) / (planet.radius + alt));
    const camX = map ? 0 : vessel.x;
    const camY = map ? 0 : vessel.y;
    const project = (x, y) => ({ x: w / 2 + (x - camX) * scale, y: h / 2 - (y - camY) * scale });
    const ground = project(0, 0);
    ctx.beginPath();
    ctx.arc(ground.x, ground.y, planet.radius * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#6f8f6a";
    ctx.fill();
    ctx.strokeStyle = "rgba(126,200,255,0.35)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(ground.x, ground.y, (planet.radius + planet.karman * 0.4) * scale, 0, Math.PI * 2);
    ctx.stroke();
    if (map && vessel.alive) {
      const el = orbitalElements(planet, vessel.x, vessel.y, vessel.vx, vessel.vy);
      if (el.e < 0.99 && Number.isFinite(el.a)) drawEllipse(project, el, vessel);
    }
    smoke.forEach((puff) => {
      puff.life -= 0.01;
      const p = project(puff.x, puff.y);
      ctx.globalAlpha = Math.max(0, puff.life) * 0.35;
      ctx.fillStyle = "#ffd7ea";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + (1 - puff.life) * 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    world.vessels.forEach((body) => {
      if (!body.alive && body !== vessel) return;
      drawVessel(project, body, body === vessel, scale);
    });
    if (vessel.countdown > 0 && vessel.onPad) {
      ctx.fillStyle = "#fff4e6";
      ctx.font = "48px Vazirmatn, Tahoma";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.ceil(vessel.countdown)), w / 2, h * 0.28);
    }
  }

  function drawEllipse(project, el, vessel) {
    ctx.strokeStyle = "rgba(255,210,122,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = 80;
    for (let i = 0; i <= steps; i += 1) {
      const nu = (i / steps) * Math.PI * 2;
      const r = (el.a * (1 - el.e * el.e)) / (1 + el.e * Math.cos(nu));
      const ang = Math.atan2(vessel.y, vessel.x) + nu - el.nu;
      const p = project(Math.cos(ang) * r, Math.sin(ang) * r);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  function drawVessel(project, vessel, main, worldScale) {
    const b = project(vessel.x, vessel.y);
    if (worldScale < 0.01) {
      ctx.fillStyle = "#fff4e6";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(-vessel.phi + Math.PI / 2);
    vessel.parts.forEach((part) => {
      if (part.broken) return;
      const x = (part.localX - vessel.comX) * worldScale;
      const y = -(part.localY - vessel.comY) * worldScale;
      ctx.fillStyle = part.broken ? "#e84a7f" : part.engineOn ? "#ffd27a" : (main ? (options.color || vessel.color) : "#c9a7ff");
      ctx.strokeStyle = options.accent || vessel.accent || "#fff4e6";
      ctx.lineWidth = 2;
      const pw = Math.max(3, part.w * worldScale);
      const ph = Math.max(3, part.h * worldScale);
      roundRect(ctx, x - pw / 2, y - ph / 2, pw, ph, 4);
      ctx.fill();
      ctx.stroke();
      if (part.engineOn && input.throttle > 0.05 && !map) {
        ctx.fillStyle = "rgba(255,143,194,0.9)";
        ctx.beginPath();
        ctx.moveTo(x - pw * 0.3, y + ph / 2);
        ctx.lineTo(x, y + ph / 2 + 16 * input.throttle);
        ctx.lineTo(x + pw * 0.3, y + ph / 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  function frame(now) {
    if (!last) last = now;
    const elapsed = Math.min(0.05, (now - last) / 1000);
    last = now;
    const vessel = focused(world);
    const flying = vessel && vessel.alive && !result && !paused;
    if (flying) {
      const engines = vessel.parts.some((part) => part.engineOn) && input.throttle > 0.05;
      const useWarp = engines ? Math.min(warp, 4) : warp;
      if (coasting(vessel) && useWarp >= 5) {
        const jump = Math.min(120, useWarp * elapsed);
        const steps = Math.max(1, Math.min(80, Math.ceil(jump)));
        const jumped = verletOrbit(planet, vessel, jump / steps, steps);
        vessel.x = jumped.x;
        vessel.y = jumped.y;
        vessel.vx = jumped.vx;
        vessel.vy = jumped.vy;
        world.time += jump;
        const el = predictApsis(planet, vessel);
        if (el.r < planet.radius + planet.atmoTop) warp = 1;
      } else {
        acc += elapsed * useWarp;
        let guard = 0;
        while (acc >= DT && guard < 40) {
          step(DT);
          acc -= DT;
          guard += 1;
        }
      }
    }
    draw();
    if (options.onHud) options.onHud(hud());
    if (options.audio) {
      const burn = vessel && vessel.parts.some((part) => part.engineOn) ? input.throttle : 0;
      options.audio.engine(burn);
    }
    if (running) raf = requestAnimationFrame(frame);
  }

  function hud() {
    const vessel = focused(world);
    if (!vessel) return null;
    const el = predictApsis(planet, vessel);
    const radial = (vessel.vx * vessel.x + vessel.vy * vessel.y) / Math.max(1, el.r);
    const horizontal = Math.sqrt(Math.max(0, el.v2 - radial * radial));
    return {
      alt: vessel.altitude || 0,
      radial,
      horizontal,
      g: vessel.gLoad || 0,
      twr: vessel.twr || 0,
      q: vessel.q || 0,
      wind: vessel.wind || 0,
      throttle: input.throttle,
      warp,
      paused,
      map,
      auto,
      sas: input.sas,
      time: world.time,
      countdown: vessel.countdown || 0,
      ap: Number.isFinite(el.ra) ? el.ra - planet.radius : null,
      pe: el.rp - planet.radius,
      fuel: vessel.parts.reduce((sum, part) => sum + part.fuel, 0),
      orbit: el.e < 1 && el.rp - planet.radius > planet.karman,
      result
    };
  }

  function deploy() {
    const vessel = focused(world);
    const el = predictApsis(planet, vessel);
    const pe = el.rp - planet.radius;
    const payload = vessel.parts.find((part) => part.payload && !part.broken);
    if (!payload || !(el.e < 1) || pe < planet.karman) return null;
    payload.broken = true;
    world.deployed = true;
    if (result) result.deployed = true;
    return {
      id: "sat" + Date.now(),
      name: payload.name,
      kind: payload.payload,
      ap: el.ra - planet.radius,
      pe,
      born: Date.now(),
      life: payload.payload === "com" ? 8 : 5,
      rate: payload.payload === "com" ? 1800 : payload.payload === "cam" ? 1400 : 900
    };
  }

  return {
    resize,
    start() {
      running = true;
      last = 0;
      resize();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      if (options.audio) options.audio.engine(0);
    },
    setThrottle(value) { input.throttle = Math.max(0, Math.min(1, value)); auto = false; },
    setStick(value) { input.stick = value; if (value) auto = false; },
    nudge(dir) {
      const vessel = focused(world);
      if (!vessel) return;
      auto = false;
      input.sas = "hold";
      vessel.holdPhi = (vessel.holdPhi ?? vessel.phi) + dir * 0.08;
    },
    stage() {
      input.stage = true;
      if (options.audio) options.audio.blip(520);
    },
    togglePause() { paused = !paused; },
    cycleWarp() {
      const vessel = focused(world);
      const engines = vessel && vessel.parts.some((part) => part.engineOn) && input.throttle > 0.05;
      const steps = engines ? [1, 2, 4] : [1, 5, 25, 100, 1000, 10000];
      warp = steps[(steps.indexOf(warp) + 1) % steps.length];
    },
    cycleSas() {
      const modes = ["off", "hold", "prograde", "retrograde", "up"];
      input.sas = modes[(modes.indexOf(input.sas) + 1) % modes.length];
      const vessel = focused(world);
      if (vessel) vessel.holdPhi = vessel.phi;
    },
    toggleMap() { map = !map; },
    toggleAuto() { auto = !auto; },
    chute() { input.chute = true; },
    end() {
      if (result) return result;
      finish({ type: "done" });
      return result;
    },
    deploy,
    hud,
    get result() { return result; }
  };
}

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return "rgb(" + c.join(",") + ")";
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { G0, dropStage };
