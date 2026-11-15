import { PARTS } from "../data/parts.js";
import { massProperties, stepVessel, predictApsis, EARTH } from "./physics.js";

let uid = 1;

function clonePart(id) {
  const def = PARTS[id];
  if (!def) throw new Error("unknown part " + id);
  return {
    uid: "p" + (uid += 1),
    defId: def.id,
    name: def.name,
    kind: def.kind,
    dry: def.dry,
    fuel: def.fuel,
    maxFuel: def.fuel,
    fuelType: def.fuelType || "",
    w: def.w,
    h: def.h,
    area: def.area,
    cd: def.cd,
    cn: def.cn,
    strength: def.strength,
    heatMax: def.heatMax,
    cost: def.cost,
    tech: def.tech,
    localX: 0,
    localY: 0,
    stage: 0,
    engine: def.engine ? { ...def.engine } : null,
    engineOn: false,
    chute: !!def.chute,
    chuteOpen: false,
    legs: !!def.legs,
    shield: !!def.shield,
    solar: def.solar || 0,
    battery: def.battery || 0,
    antenna: !!def.antenna,
    payload: def.payload || "",
    crew: def.crew || 0,
    decoupler: !!def.decoupler,
    wheelTorque: def.wheelTorque || 0,
    broken: false,
    heat: 0,
    fuelSource: null
  };
}

function layout(node, x, y, stage, list) {
  const part = clonePart(node.part);
  part.localX = x;
  part.localY = y;
  part.stage = stage;
  list.push(part);
  let cursor = y - part.h / 2;
  (node.children || []).forEach((child) => {
    const def = PARTS[child.part];
    const radial = child.radial || 0;
    const nextStage = part.decoupler ? stage + 1 : stage;
    if (radial) {
      const sign = radial > 0 ? 1 : -1;
      layout(child, x + sign * (part.w / 2 + def.w / 2 + 0.15), y - part.h * 0.25, nextStage, list);
    } else {
      layout(child, x, cursor - def.h / 2, nextStage, list);
      cursor -= def.h;
    }
  });
  return part;
}

function linkFuel(parts) {
  parts.forEach((part) => {
    if (!part.engine || part.engine.solid || part.maxFuel > 0) return;
    let best = null;
    let dist = 1e12;
    parts.forEach((other) => {
      if (other.stage !== part.stage || other.maxFuel <= 0) return;
      if (part.fuelType && other.fuelType && part.fuelType !== other.fuelType) return;
      const d = Math.hypot(other.localX - part.localX, other.localY - part.localY);
      if (d < dist) {
        dist = d;
        best = other;
      }
    });
    part.fuelSource = best;
  });
}

export function compileDesign(design) {
  uid = 1;
  const parts = [];
  layout(design.root, 0, 0, 0, parts);
  linkFuel(parts);
  const stages = [...new Set(parts.map((part) => part.stage))].sort((a, b) => b - a);
  const props = massProperties(parts);
  const planetR = EARTH.radius;
  const bottom = parts.reduce((max, part) => Math.max(max, props.cy - (part.localY - part.h / 2)), 0);
  const vessel = {
    name: design.name,
    color: design.color || "#ff8fc2",
    accent: design.accent || "#ffd27a",
    x: 0,
    y: planetR + bottom,
    vx: 0,
    vy: 0,
    phi: Math.PI / 2,
    omega: 0,
    parts,
    stage: stages[0] ?? 0,
    stages,
    onPad: true,
    countdown: 5,
    alive: true,
    controlled: true,
    holdPhi: Math.PI / 2,
    comX: props.cx,
    comY: props.cy
  };
  ignite(vessel, vessel.stage);
  return vessel;
}

export function ignite(vessel, stage) {
  vessel.parts.forEach((part) => {
    if (part.broken || !part.engine || part.stage !== stage) return;
    const fuel = part.fuelSource ? part.fuelSource.fuel : part.fuel;
    if (fuel > 0.2) part.engineOn = true;
  });
}

function basis(phi) {
  return {
    nx: Math.cos(phi),
    ny: Math.sin(phi),
    ex: Math.sin(phi),
    ey: -Math.cos(phi)
  };
}

function worldPoint(vessel, lx, ly) {
  const b = basis(vessel.phi);
  const dx = lx - vessel.comX;
  const dy = ly - vessel.comY;
  return {
    x: vessel.x + dx * b.ex + dy * b.nx,
    y: vessel.y + dx * b.ey + dy * b.ny
  };
}

function retarget(vessel) {
  const props = massProperties(vessel.parts);
  if (props.mass <= 0) return;
  const point = worldPoint(vessel, props.cx, props.cy);
  vessel.x = point.x;
  vessel.y = point.y;
  vessel.comX = props.cx;
  vessel.comY = props.cy;
}

export function dropStage(vessel) {
  const dropping = vessel.parts.filter((part) => part.stage === vessel.stage && !part.broken);
  const keep = vessel.parts.filter((part) => part.stage !== vessel.stage);
  if (!dropping.length) {
    if (vessel.stage > 0) {
      vessel.stage -= 1;
      ignite(vessel, vessel.stage);
    }
    return null;
  }
  dropping.forEach((part) => { part.engineOn = false; });
  const debris = {
    name: "مرحله",
    color: "#c9a7ff",
    accent: "#fff4e6",
    x: vessel.x,
    y: vessel.y,
    vx: vessel.vx,
    vy: vessel.vy,
    phi: vessel.phi,
    omega: vessel.omega,
    parts: dropping,
    stage: -1,
    stages: [],
    onPad: false,
    countdown: 0,
    alive: true,
    controlled: false,
    holdPhi: vessel.phi,
    comX: vessel.comX,
    comY: vessel.comY
  };
  retarget(debris);
  const b = basis(vessel.phi);
  debris.vx -= b.nx * 3;
  debris.vy -= b.ny * 3;
  vessel.parts = keep;
  retarget(vessel);
  vessel.stage = Math.max(0, vessel.stage - 1);
  ignite(vessel, vessel.stage);
  return debris;
}

export function makeWorld(design, planet, seed) {
  const vessel = compileDesign(design);
  const bottom = vessel.y - planet.radius;
  vessel.y = planet.radius + (bottom > 0 ? bottom : 0);
  return {
    planet,
    vessels: [vessel],
    focus: 0,
    time: 0,
    seed,
    log: []
  };
}

export function focused(world) {
  return world.vessels[world.focus];
}

export function stepWorld(world, input, dt, rng) {
  const events = [];
  const vessel = focused(world);
  if (vessel && vessel.countdown > 0 && vessel.onPad) {
    vessel.countdown -= dt;
    if (vessel.countdown < 0) vessel.countdown = 0;
  }
  if (input.stage) {
    const debris = dropStage(vessel);
    if (debris) world.vessels.push(debris);
    events.push({ type: "stage" });
    input.stage = false;
  }
  if (input.chute && vessel) {
    vessel.parts.forEach((part) => {
      if (part.chute && vessel.altitude < 12000) part.chuteOpen = true;
    });
  }
  for (let i = world.vessels.length - 1; i >= 0; i -= 1) {
    const body = world.vessels[i];
    if (!body.alive) continue;
    const localInput = body.controlled ? input : { throttle: 0, stick: 0, sas: "off" };
    const got = stepVessel(body, world.planet, localInput, dt, body.controlled ? rng : null);
    got.forEach((event) => {
      event.vessel = i;
      events.push(event);
      if ((event.type === "crash" || event.type === "land" || event.type === "rud") && body.controlled) {
        world.log.push(event);
      }
      if (event.type === "struct" || event.type === "heat" || event.type === "shutdown" || event.type === "underthrust") {
        world.log.push(event);
      }
    });
  }
  world.time += dt;
  return events;
}

export function stats(design) {
  const vessel = compileDesign(design);
  const planet = EARTH;
  return stageStats(vessel, planet);
}

export function stageStats(vessel, planet) {
  const groups = new Map();
  vessel.parts.forEach((part) => {
    if (!groups.has(part.stage)) groups.set(part.stage, []);
    groups.get(part.stage).push(part);
  });
  const order = [...groups.keys()].sort((a, b) => b - a);
  const rows = [];
  let totalDv = 0;
  let stack = vessel.parts.reduce((sum, part) => sum + part.dry + part.maxFuel, 0);
  const g = planet.mu / (planet.radius * planet.radius);
  order.forEach((stage, index) => {
    const group = groups.get(stage);
    let fuel = 0;
    let thrust = 0;
    let ispSum = 0;
    group.forEach((part) => {
      fuel += part.maxFuel;
      if (!part.engine) return;
      const upper = index > 0;
      const t = upper ? part.engine.thrustVac : part.engine.thrustSL;
      const isp = upper ? part.engine.ispVac : part.engine.ispSL;
      thrust += t;
      ispSum += isp * t;
    });
    const meanIsp = thrust > 0 ? ispSum / thrust : 0;
    const before = stack;
    const after = Math.max(1, stack - fuel);
    const dv = meanIsp > 0 && before > after ? meanIsp * 9.80665 * Math.log(before / after) : 0;
    totalDv += dv;
    stack = after;
    rows.push({ stage, dv, twr: thrust / (before * g), thrust, fuel, mass: before });
  });
  const props = massProperties(vessel.parts);
  let copA = 0;
  let copY = 0;
  vessel.parts.forEach((part) => {
    const a = part.area * (0.35 + (part.cn || 0));
    copA += a;
    copY += a * part.localY;
  });
  const cop = copA ? copY / copA : 0;
  const stable = cop < props.cy - 0.15 ? "stable" : cop > props.cy + 0.15 ? "unstable" : "edge";
  const cost = vessel.parts.reduce((sum, part) => sum + part.cost, 0);
  const height = vessel.parts.reduce((max, part) => Math.max(max, part.localY + part.h / 2), 0) - vessel.parts.reduce((min, part) => Math.min(min, part.localY - part.h / 2), 0);
  return { rows, totalDv, mass: props.mass, cost, stable, com: props.cy, cop, height, twr: rows.length ? rows[0].twr : 0 };
}

export function preflight(design) {
  const vessel = compileDesign(design);
  const info = stageStats(vessel, EARTH);
  const notes = [];
  if (info.twr < 1) notes.push({ level: "bad", text: "نسبت پس‌ران به وزن کمتر از ۱ است. موشک از زمین بلند نمی‌شود." });
  else if (info.twr < 1.25) notes.push({ level: "warn", text: "پس‌ران کمی بیشتر از وزن است. آهسته بلند می‌شود." });
  if (info.stable === "unstable") notes.push({ level: "bad", text: "مرکز فشار بالاتر از مرکز جرم است. موشک در هوا برمی‌گردد." });
  else if (info.stable === "edge") notes.push({ level: "warn", text: "پایداری مرزی است. بالچه را پایین‌تر بگذار." });
  else notes.push({ level: "ok", text: "تعادل آیرودینامیکی خوب است." });
  const stages = new Set(vessel.parts.map((part) => part.stage));
  if (stages.size > 1 && !vessel.parts.some((part) => part.decoupler)) notes.push({ level: "bad", text: "چند مرحله بدون جداکننده است." });
  vessel.parts.forEach((part) => {
    if (part.engine && !part.engine.solid && !part.fuelSource && part.maxFuel <= 0) {
      notes.push({ level: "bad", text: part.name + " سوخت ندارد." });
    }
  });
  const hasPower = vessel.parts.some((part) => part.solar || part.battery);
  if (vessel.parts.some((part) => part.payload) && !hasPower) notes.push({ level: "warn", text: "ماهواره برق ندارد. پنل یا باتری اضافه کن." });
  if (info.totalDv < 9000 && stages.size > 1) notes.push({ level: "info", text: "دلتا-وی برای مدار پایین زمین معمولاً حدود ۹ کیلومتر بر ثانیه با اتلاف است." });
  const fail = vessel.parts.reduce((max, part) => Math.max(max, part.engine ? part.engine.failRate : 0), 0);
  const success = Math.max(0.5, 1 - fail * 180);
  return { notes, info, success };
}

export { predictApsis };
