export const G0 = 9.80665;

export const EARTH = {
  id: "earth",
  name: "زمین واقعی",
  radius: 6371000,
  mu: 3.986004418e14,
  rho0: 1.225,
  scaleHeight: 8500,
  karman: 100000,
  atmoTop: 140000
};

export const EARTH_GAME = {
  id: "small",
  name: "زمین کوچک بازی",
  radius: 637100,
  mu: 9.80665 * 637100 * 637100,
  rho0: 1.225,
  scaleHeight: 8500,
  karman: 80000,
  atmoTop: 110000
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rocketDeltaV(isp, massFull, massEmpty) {
  if (!(isp > 0) || !(massFull > massEmpty) || !(massEmpty > 0)) return 0;
  return isp * G0 * Math.log(massFull / massEmpty);
}

export function gravityAt(planet, x, y) {
  const r2 = x * x + y * y;
  const r = Math.sqrt(r2) || 1;
  const scale = -planet.mu / (r2 * r);
  return { ax: x * scale, ay: y * scale, r, g: planet.mu / r2 };
}

export function density(planet, altitude) {
  if (altitude >= planet.atmoTop) return 0;
  const h = Math.max(0, altitude);
  return planet.rho0 * Math.exp(-h / planet.scaleHeight);
}

export function windSpeed(altitude) {
  const jet = Math.exp(-Math.pow((altitude - 11000) / 4500, 2));
  return 16 * jet + 2.5;
}

export function orbitalSpeed(planet, radius) {
  return Math.sqrt(planet.mu / radius);
}

export function orbitalElements(planet, x, y, vx, vy) {
  const r = Math.hypot(x, y) || 1;
  const v2 = vx * vx + vy * vy;
  const energy = v2 / 2 - planet.mu / r;
  const h = x * vy - y * vx;
  const eVecX = (vy * h) / planet.mu - x / r;
  const eVecY = (-vx * h) / planet.mu - y / r;
  const e = Math.hypot(eVecX, eVecY);
  let a = Infinity;
  if (Math.abs(energy) > 1e-8) a = -planet.mu / (2 * energy);
  const rp = Number.isFinite(a) ? a * (1 - e) : r;
  const ra = e < 1 && Number.isFinite(a) ? a * (1 + e) : Infinity;
  const nu = Math.atan2(x * eVecY - y * eVecX, x * eVecX + y * eVecY);
  return { r, v2, energy, h, e, a, rp, ra, nu, altitude: r - planet.radius };
}

export function keplerAdvance(planet, el, x, y, vx, vy, dt) {
  if (!(el.e < 1) || !Number.isFinite(el.a) || el.a <= 0) return null;
  const a = el.a;
  const e = Math.min(0.999, el.e);
  const n = Math.sqrt(planet.mu / (a * a * a));
  const cosNu = Math.cos(el.nu);
  const sinNu = Math.sin(el.nu);
  const ecos = e * cosNu;
  const E = Math.atan2(Math.sqrt(1 - e * e) * sinNu, ecos + e);
  let M = E - e * Math.sin(E) + n * dt;
  M = ((M + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  let E2 = M;
  for (let i = 0; i < 8; i += 1) {
    const f = E2 - e * Math.sin(E2) - M;
    const fp = 1 - e * Math.cos(E2);
    E2 -= f / fp;
  }
  const cosE = Math.cos(E2);
  const sinE = Math.sin(E2);
  const rx = a * (cosE - e);
  const ry = a * Math.sqrt(1 - e * e) * sinE;
  const edot = n / (1 - e * cosE);
  const vx2 = -a * sinE * edot;
  const vy2 = a * Math.sqrt(1 - e * e) * cosE * edot;
  const arg = Math.atan2(el.h >= 0 ? y : -y, x);
  const nu = el.nu;
  const rot = Math.atan2(y, x) - Math.atan2(ry, rx);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    x: rx * c - ry * s,
    y: rx * s + ry * c,
    vx: vx2 * c - vy2 * s,
    vy: vx2 * s + vy2 * c,
    unused: { arg, nu, vx, vy }
  };
}

export function verletOrbit(planet, state, dt, steps) {
  let { x, y, vx, vy } = state;
  let g = gravityAt(planet, x, y);
  for (let i = 0; i < steps; i += 1) {
    vx += g.ax * dt * 0.5;
    vy += g.ay * dt * 0.5;
    x += vx * dt;
    y += vy * dt;
    g = gravityAt(planet, x, y);
    vx += g.ax * dt * 0.5;
    vy += g.ay * dt * 0.5;
  }
  return { x, y, vx, vy };
}

export function massProperties(parts) {
  let mass = 0;
  let mx = 0;
  let my = 0;
  parts.forEach((part) => {
    if (part.broken) return;
    const m = part.dry + part.fuel;
    mass += m;
    mx += m * part.localX;
    my += m * part.localY;
  });
  if (mass <= 0) return { mass: 0, cx: 0, cy: 0, inertia: 1 };
  const cx = mx / mass;
  const cy = my / mass;
  let inertia = 0;
  parts.forEach((part) => {
    if (part.broken) return;
    const m = part.dry + part.fuel;
    const dx = part.localX - cx;
    const dy = part.localY - cy;
    inertia += m * (dx * dx + dy * dy + (part.w * part.w + part.h * part.h) / 12);
  });
  return { mass, cx, cy, inertia: Math.max(1, inertia) };
}

export function aeroCenter(parts) {
  let area = 0;
  let ax = 0;
  let ay = 0;
  parts.forEach((part) => {
    if (part.broken) return;
    const a = Math.max(0.05, part.area) * (0.35 + (part.cn || 0));
    area += a;
    ax += a * part.localX;
    ay += a * part.localY;
  });
  if (area <= 0) return { area: 0, x: 0, y: 0 };
  return { area, x: ax / area, y: ay / area };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function atmosphereFactor(planet, altitude) {
  const rho = density(planet, altitude);
  return rho / planet.rho0;
}

export function engineThrust(engine, throttle, atmo) {
  const vac = engine.thrustVac;
  const sl = engine.thrustSL;
  const thrust = (sl + (vac - sl) * (1 - clamp(atmo, 0, 1))) * throttle;
  const isp = engine.ispSL + (engine.ispVac - engine.ispSL) * (1 - clamp(atmo, 0, 1));
  const mdot = isp > 1 ? thrust / (isp * G0) : 0;
  return { thrust, isp, mdot };
}

export function stepVessel(vessel, planet, input, dt, rng) {
  const events = [];
  if (!vessel.alive) return events;
  const props = massProperties(vessel.parts);
  if (props.mass <= 0) {
    vessel.alive = false;
    events.push({ type: "gone" });
    return events;
  }
  vessel.mass = props.mass;
  vessel.comX = props.cx;
  vessel.comY = props.cy;
  const cop = aeroCenter(vessel.parts);
  vessel.copX = cop.x;
  vessel.copY = cop.y;
  const g = gravityAt(planet, vessel.x, vessel.y);
  const altitude = g.r - planet.radius;
  vessel.altitude = altitude;
  const noseX = Math.cos(vessel.phi);
  const noseY = Math.sin(vessel.phi);
  const eastX = Math.sin(vessel.phi);
  const eastY = -Math.cos(vessel.phi);
  const bottom = lowestOffset(vessel.parts, props);
  const bottomAlt = altitude - bottom;
  vessel.bottomAlt = bottomAlt;
  const atmo = atmosphereFactor(planet, Math.max(0, altitude));
  const rho = density(planet, Math.max(0, altitude));
  const wind = windSpeed(Math.max(0, altitude));
  const airX = vessel.vx - wind;
  const airY = vessel.vy;
  const airSpeed = Math.hypot(airX, airY);
  const q = 0.5 * rho * airSpeed * airSpeed;
  vessel.q = q;
  vessel.wind = wind;

  let forceX = props.mass * g.ax;
  let forceY = props.mass * g.ay;
  let torque = 0;
  let twrThrust = 0;

  const throttle = vessel.controlled ? clamp(input.throttle ?? 0, 0, 1) : 0;
  const stick = vessel.controlled ? clamp(input.stick ?? 0, -1, 1) : 0;
  const sas = vessel.controlled ? input.sas || "off" : "off";

  let targetPhi = vessel.phi;
  const velAngle = Math.atan2(vessel.vy, vessel.vx);
  if (sas === "prograde" && airSpeed > 8) targetPhi = velAngle;
  else if (sas === "retrograde" && airSpeed > 8) targetPhi = velAngle + Math.PI;
  else if (sas === "up") targetPhi = Math.atan2(vessel.y, vessel.x);
  else if (sas === "hold") targetPhi = vessel.holdPhi ?? vessel.phi;
  else targetPhi = vessel.phi;
  if (sas === "hold" && vessel.controlled) vessel.holdPhi = (vessel.holdPhi ?? vessel.phi) - stick * 0.9 * dt;
  if (sas === "hold") targetPhi = vessel.holdPhi;
  const angleError = Math.atan2(Math.sin(targetPhi - vessel.phi), Math.cos(targetPhi - vessel.phi));

  vessel.parts.forEach((part) => {
    if (part.broken || !part.engine || !part.engineOn) return;
    const eng = part.engine;
    let usedThrottle = eng.solid ? 1 : throttle;
    if (eng.solid) usedThrottle = 1;
    if (usedThrottle <= 0) return;
    const powered = engineThrust(eng, usedThrottle, atmo);
    if (powered.thrust <= 0) return;
    let gimbal = 0;
    if (eng.gimbal && vessel.controlled) {
      const cmd = sas === "off" ? stick : clamp(-angleError * 1.6 - vessel.omega * 0.45, -1, 1);
      gimbal = cmd * eng.gimbal;
    }
    const dir = vessel.phi + gimbal;
    const fx = Math.cos(dir) * powered.thrust;
    const fy = Math.sin(dir) * powered.thrust;
    forceX += fx;
    forceY += fy;
    const rx = part.localX - props.cx;
    const ry = part.localY - props.cy;
    const worldRx = rx * eastX + ry * noseX;
    const worldRy = rx * eastY + ry * noseY;
    torque += worldRx * fy - worldRy * fx;
    twrThrust += powered.thrust;
    const take = Math.min(part.fuelSource ? part.fuelSource.fuel : part.fuel, powered.mdot * dt);
    if (part.fuelSource) part.fuelSource.fuel -= take;
    else part.fuel -= take;
    if ((part.fuelSource ? part.fuelSource.fuel : part.fuel) <= 0.05) {
      part.engineOn = false;
      events.push({ type: "flameout", part: part.uid });
    }
    if (rng && eng.failRate > 0 && vessel.controlled) {
      const stress = 1 + q / 40000 + (part.heat || 0) / 800;
      if (rng() < eng.failRate * stress * dt) {
        const roll = rng();
        part.engineOn = false;
        if (roll < 0.25) {
          part.broken = true;
          events.push({ type: "rud", part: part.uid, name: part.name });
        } else if (roll < 0.6) {
          eng.thrustVac *= 0.45;
          eng.thrustSL *= 0.45;
          events.push({ type: "underthrust", part: part.uid, name: part.name });
        } else {
          events.push({ type: "shutdown", part: part.uid, name: part.name });
        }
      }
    }
  });

  let wheel = 0;
  vessel.parts.forEach((part) => {
    if (!part.broken && part.wheelTorque) wheel += part.wheelTorque;
  });
  if (vessel.controlled && wheel > 0 && sas !== "off") {
    const cmd = clamp(angleError * 2.2 - vessel.omega * 1.1, -1, 1);
    torque += cmd * wheel;
  } else if (vessel.controlled && wheel > 0 && sas === "off") {
    torque += -stick * wheel;
  }

  if (rho > 1e-5 && airSpeed > 0.5) {
    const vhatX = airX / airSpeed;
    const vhatY = airY / airSpeed;
    const aoa = Math.atan2(noseX * vhatY - noseY * vhatX, noseX * vhatX + noseY * vhatY);
    vessel.aoa = aoa;
    let area = 0;
    let cd = 0;
    let cn = 0;
    vessel.parts.forEach((part) => {
      if (part.broken) return;
      area += part.area;
      cd += part.cd * part.area;
      cn += (part.cn || 0) * part.area;
    });
    cd = area > 0 ? cd / area : 0.4;
    cn = area > 0 ? cn / area : 0;
    const chute = vessel.parts.some((part) => part.chuteOpen);
    const dragCd = chute ? 18 : cd + 1.1 * aoa * aoa;
    const drag = q * dragCd * Math.max(area, 0.02);
    const lift = q * cn * Math.sin(aoa) * Math.max(area, 0.02);
    const liftX = -vhatY;
    const liftY = vhatX;
    const side = liftX * noseX + liftY * noseY;
    const liftSign = side >= 0 ? 1 : -1;
    const fx = -vhatX * drag + liftX * liftSign * lift;
    const fy = -vhatY * drag + liftY * liftSign * lift;
    forceX += fx;
    forceY += fy;
    const rx = cop.x - props.cx;
    const ry = cop.y - props.cy;
    const worldRx = rx * eastX + ry * noseX;
    const worldRy = rx * eastY + ry * noseY;
    torque += worldRx * fy - worldRy * fx;
    torque -= vessel.omega * q * Math.max(area, 0.2) * 2.4;
    vessel.parts.forEach((part) => {
      if (part.broken) return;
      const bend = 1 + Math.abs(aoa) * 3.2;
      const load = q * part.area * bend;
      part.load = load;
      if (load > part.strength) {
        part.broken = true;
        events.push({ type: "struct", part: part.uid, name: part.name, load, strength: part.strength });
      }
      if (!chute && airSpeed > 900 && rho > 1e-4) {
        const heatRate = rho * airSpeed * airSpeed * airSpeed * 1e-8 * (part.shield ? 0.15 : 1);
        part.heat = (part.heat || 0) + heatRate * dt;
        if (part.heat > part.heatMax) {
          part.broken = true;
          events.push({ type: "heat", part: part.uid, name: part.name });
        }
      } else {
        part.heat = Math.max(0, (part.heat || 0) - dt * 8);
      }
    });
  } else {
    vessel.aoa = 0;
  }

  if (vessel.onPad) {
    const twr = twrThrust / (props.mass * g.g);
    vessel.twr = twr;
    if ((input.released || throttle > 0.2) && twr > 1 && (!vessel.countdown || vessel.countdown <= 0)) {
      vessel.onPad = false;
      events.push({ type: "liftoff" });
    } else {
      vessel.vx = 0;
      vessel.vy = 0;
      vessel.omega = 0;
      const place = planet.radius + bottom;
      const dirX = vessel.x / g.r;
      const dirY = vessel.y / g.r;
      vessel.x = dirX * place;
      vessel.y = dirY * place;
      vessel.phi = Math.atan2(dirY, dirX);
      return events;
    }
  }

  const ax = forceX / props.mass;
  const ay = forceY / props.mass;
  vessel.vx += ax * dt;
  vessel.vy += ay * dt;
  vessel.x += vessel.vx * dt;
  vessel.y += vessel.vy * dt;
  const alpha = torque / props.inertia;
  vessel.omega += alpha * dt;
  vessel.phi += vessel.omega * dt;
  vessel.accel = Math.hypot(ax - g.ax, ay - g.ay);
  vessel.twr = twrThrust / (props.mass * Math.max(0.1, g.g));
  vessel.gLoad = vessel.accel / G0;

  const after = gravityAt(planet, vessel.x, vessel.y);
  vessel.altitude = after.r - planet.radius;
  vessel.bottomAlt = vessel.altitude - bottom;
  if (vessel.bottomAlt <= 0 && !vessel.onPad) {
    const vr = (vessel.vx * vessel.x + vessel.vy * vessel.y) / after.r;
    vessel.x *= planet.radius / after.r;
    vessel.y *= planet.radius / after.r;
    const impact = Math.max(0, -vr);
    vessel.alive = false;
    vessel.impact = impact;
    const soft = vessel.parts.some((part) => part.chuteOpen) ? 9 : vessel.parts.some((part) => part.legs) ? 7 : 14;
    events.push({ type: impact <= soft ? "land" : "crash", speed: impact, soft });
  }

  if (vessel.parts.every((part) => part.broken || (part.engine && !part.fuel && !(part.fuelSource && part.fuelSource.fuel > 0)))) {
    vessel.parts.forEach((part) => {
      if (part.engine) part.engineOn = false;
    });
  }
  return events;
}

function lowestOffset(parts, props) {
  let low = 0;
  parts.forEach((part) => {
    if (part.broken) return;
    const tip = props.cy - (part.localY - part.h / 2);
    if (tip > low) low = tip;
  });
  return low;
}

export function predictApsis(planet, vessel) {
  return orbitalElements(planet, vessel.x, vessel.y, vessel.vx, vessel.vy);
}
