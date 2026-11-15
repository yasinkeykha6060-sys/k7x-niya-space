import { orbitalElements } from "./physics.js";

export function readOrbit(vessel, planet) {
  return orbitalElements(planet, vessel.x, vessel.y, vessel.vx, vessel.vy);
}

export function gravityTurn(vessel, planet) {
  const alt = Math.max(0, vessel.altitude || 0);
  const el = readOrbit(vessel, planet);
  const up = Math.atan2(vessel.y, vessel.x);
  const speed = Math.hypot(vessel.vx, vessel.vy);
  let pitch = 0;
  if (alt > 400 && speed > 120) pitch = Math.min(1.15, Math.max(0, (speed - 180) / 1600) * 1.15);
  const ap = (Number.isFinite(el.ra) ? el.ra : el.r) - planet.radius;
  const pe = (Number.isFinite(el.rp) ? el.rp : 0) - planet.radius;
  const radial = (vessel.vx * vessel.x + vessel.vy * vessel.y) / Math.max(1, el.r);
  let throttle = vessel.onPad && vessel.countdown > 0 ? 0 : 1;
  let phi = up - pitch;
  const wantAp = planet.karman + 80000;
  const wantPe = planet.karman + 60000;
  if (ap > wantAp && pe < wantPe) {
    const nearAp = radial < 80 && alt > Math.min(ap, wantAp) - 20000;
    throttle = nearAp ? 1 : 0;
    phi = speed > 20 ? Math.atan2(vessel.vy, vessel.vx) : up;
  }
  if (pe > wantPe && ap < planet.karman + 800000) throttle = 0;
  const stageFuel = vessel.parts.some((part) => part.stage === vessel.stage && part.engine && ((part.fuelSource ? part.fuelSource.fuel : part.fuel) > 1));
  const stage = !vessel.onPad && vessel.stage > 0 && !stageFuel;
  return { throttle, phi, stage, ap, pe, radial };
}
