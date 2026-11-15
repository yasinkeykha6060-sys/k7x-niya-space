import { EARTH, EARTH_GAME, G0, mulberry32, verletOrbit, orbitalElements, predictApsis } from "./physics.js";
import { makeWorld, stepWorld, focused, dropStage } from "./vehicle.js";
import { gravityTurn } from "./guidance.js";
import { drawCraft, nozzleWorld } from "./rocketart.js";

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
    if (vessel.parts.some((part) => part.engineOn && (part.engine && part.engine.solid || input.throttle > 0.05))) {
      vessel.parts.forEach((part) => {
        if (!part.engineOn || part.broken) return;
        const tip = nozzleWorld(vessel, part);
        const noseX = Math.cos(vessel.phi);
        const noseY = Math.sin(vessel.phi);
        const eastX = Math.sin(vessel.phi);
        const eastY = -Math.cos(vessel.phi);
        const back = vessel.onPad ? 8 + Math.random() * 10 : 22 + Math.random() * 16;
        const side = (Math.random() - 0.5) * (vessel.onPad ? 36 : 8);
        smoke.push({
          x: tip.x,
          y: tip.y,
          vx: -noseX * back + eastX * side,
          vy: -noseY * back + eastY * side,
          life: 1,
          r: (vessel.onPad ? 1.4 : 0.7) + Math.random()
        });
      });
      const cap = options.quality === "low" ? 50 : 160;
      while (smoke.length > cap) smoke.shift();
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
    if (result.crashed && options.audio) options.audio.boom();
    if (options.onReport) options.onReport(result);
  }

  function bounds(vessel) {
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    vessel.parts.forEach((part) => {
      if (part.broken) return;
      minY = Math.min(minY, part.localY - part.h / 2);
      maxY = Math.max(maxY, part.localY + part.h / 2);
      minX = Math.min(minX, part.localX - part.w / 2);
      maxX = Math.max(maxX, part.localX + part.w / 2);
    });
    if (!Number.isFinite(minY)) return { h: 8, w: 2, midY: 0 };
    return { h: Math.max(4, maxY - minY), w: Math.max(1.2, maxX - minX), midY: (minY + maxY) / 2 };
  }

  function drawSky(w, h, alt) {
    const t = Math.max(0, Math.min(1, (alt - 8000) / 70000));
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    if (t < 0.05) {
      sky.addColorStop(0, "#2f86d8");
      sky.addColorStop(0.45, "#79c0f5");
      sky.addColorStop(1, "#d7f1ff");
    } else {
      sky.addColorStop(0, mix("#050814", "#1c4f86", 1 - t));
      sky.addColorStop(1, mix("#9ec9ef", "#16324f", t));
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    if (t > 0.45) {
      ctx.fillStyle = "#fff6e8";
      for (let i = 0; i < 70; i += 1) {
        ctx.fillRect((i * 97) % w, (i * 53) % h, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      for (let i = 0; i < 5; i += 1) {
        const x = (i * 180 + 40) % w;
        const y = 30 + (i * 37) % (h * 0.35);
        ctx.beginPath();
        ctx.ellipse(x, y, 46, 16, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 30, y + 4, 28, 12, 0, 0, Math.PI * 2);
        ctx.fill();
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
    const size = bounds(vessel);
    drawSky(w, h, alt);
    let scale = Math.min((h * 0.52) / size.h, (w * 0.34) / size.w);
    if (map) scale = (Math.min(w, h) * 0.33) / planet.radius;
    else if (alt > 2500) scale = Math.min(scale, Math.max(110 / size.h, (h * 0.4) / (size.h + (alt - 2000) * 0.018)));
    if (alt > 30000 && !map) scale = Math.min(scale, (h * 0.18) / (planet.radius * 0.012 + alt));
    const noseX = Math.cos(vessel.phi);
    const noseY = Math.sin(vessel.phi);
    const bias = alt < 500 ? -size.h * 0.28 : 0;
    const lookX = map ? 0 : vessel.x + (size.midY - vessel.comY + bias) * noseX;
    const lookY = map ? 0 : vessel.y + (size.midY - vessel.comY + bias) * noseY;
    const project = (x, y) => ({ x: w / 2 + (x - lookX) * scale, y: h * 0.46 - (y - lookY) * scale });
    drawTerrain(project, vessel, scale, w, h, alt);
    if (map && vessel.alive) {
      const el = orbitalElements(planet, vessel.x, vessel.y, vessel.vx, vessel.vy);
      if (el.e < 0.99 && Number.isFinite(el.a)) drawEllipse(project, el, vessel);
    }
    smoke.forEach((puff) => {
      puff.life -= 0.012;
      puff.x += (puff.vx || 0) * 0.016;
      puff.y += (puff.vy || 0) * 0.016;
      puff.r += 0.03;
      const p = project(puff.x, puff.y);
      ctx.globalAlpha = Math.max(0, puff.life) * 0.28;
      ctx.fillStyle = "#d5dbe0";
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(4, puff.r * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    world.vessels.forEach((body) => {
      if (!body.alive && body !== vessel) return;
      const b = project(body.x, body.y);
      if (scale < 0.01) {
        ctx.fillStyle = "#fff6e4";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.save();
      ctx.translate(b.x, b.y);
      drawCraft(ctx, body, scale, body === vessel ? input.throttle : 0, world.time);
      ctx.restore();
    });
    if (alt < 400 && !map) drawTower(project, scale, size.h);
    if (vessel.countdown > 0 && vessel.onPad) {
      ctx.fillStyle = "#102033";
      ctx.font = "64px Vazirmatn, Tahoma";
      ctx.textAlign = "center";
      ctx.fillText(String(Math.ceil(vessel.countdown)), w / 2, h * 0.16);
    }
  }

  function drawTerrain(project, vessel, scale, w, h, alt) {
    const ang = Math.atan2(vessel.y, vessel.x);
    const span = Math.max(w / Math.max(scale, 0.00001), 400);
    ctx.beginPath();
    for (let i = 0; i <= 48; i += 1) {
      const a = ang + (i / 48 - 0.5) * span / planet.radius;
      const p = project(Math.cos(a) * planet.radius, Math.sin(a) * planet.radius);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(w + 40, h + 40);
    ctx.lineTo(-40, h + 40);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, h * 0.45, 0, h);
    g.addColorStop(0, alt > 40000 ? "#1d4d86" : "#67a35a");
    g.addColorStop(0.25, alt > 40000 ? "#16355c" : "#3f7d45");
    g.addColorStop(1, "#243224");
    ctx.fillStyle = g;
    ctx.fill();
    if (alt < 2500 && !map) {
      const pad = project(0, planet.radius);
      ctx.fillStyle = "#b7b1a4";
      ctx.fillRect(pad.x - 16 * scale, pad.y - 0.4 * scale, 32 * scale, 0.5 * scale);
      ctx.fillStyle = "#8d887e";
      ctx.fillRect(pad.x - 7 * scale, pad.y - 0.15 * scale, 14 * scale, 0.2 * scale);
    }
    if (alt < 8000 && scale > 0.4) {
      ctx.strokeStyle = "rgba(180,220,255,0.35)";
      ctx.lineWidth = Math.max(6, 8000 * scale);
      ctx.beginPath();
      for (let i = 0; i <= 24; i += 1) {
        const a = ang + (i / 24 - 0.5) * span / planet.radius;
        const r = planet.radius + 12000;
        const p = project(Math.cos(a) * r, Math.sin(a) * r);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  function drawTower(project, scale, rocketH) {
    const base = project(0, planet.radius);
    const top = project(0, planet.radius + rocketH * 0.92);
    const x = base.x + 4.2 * scale;
    ctx.strokeStyle = "#4d565f";
    ctx.lineWidth = Math.max(2, 0.18 * scale);
    ctx.beginPath();
    ctx.moveTo(x, base.y);
    ctx.lineTo(x, top.y);
    ctx.moveTo(x + 1.4 * scale, base.y);
    ctx.lineTo(x + 1.4 * scale, top.y);
    for (let i = 0; i < 8; i += 1) {
      const y = base.y + (top.y - base.y) * (i / 8);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1.4 * scale, y + (top.y - base.y) / 8);
    }
    ctx.stroke();
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
      const burning = vessel && vessel.parts.some((part) => part.engineOn && !part.broken);
      const solid = vessel && vessel.parts.some((part) => part.engineOn && part.engine && part.engine.solid);
      options.audio.engine(burning ? (solid ? 1 : input.throttle) : 0);
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
      stages: stageRows(vessel),
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

function stageRows(vessel) {
  const rows = new Map();
  const seen = new Set();
  vessel.parts.forEach((part) => {
    if (!rows.has(part.stage)) rows.set(part.stage, { stage: part.stage, fuel: 0, max: 0, on: false, name: "سازه" });
    const row = rows.get(part.stage);
    if (part.engine) {
      row.on = row.on || !!part.engineOn;
      row.name = part.name;
    }
    if (part.maxFuel > 0 && !seen.has(part.uid)) {
      seen.add(part.uid);
      row.fuel += part.fuel;
      row.max += part.maxFuel;
    }
  });
  return [...rows.values()].sort((a, b) => b.stage - a.stage);
}

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return "rgb(" + c.join(",") + ")";
}

export { G0, dropStage };
