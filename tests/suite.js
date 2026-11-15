import { EARTH, G0, rocketDeltaV, density, orbitalSpeed, verletOrbit, orbitalElements, stepVessel, mulberry32 } from "../js/physics.js";
import { compileDesign, makeWorld, stepWorld, focused, preflight } from "../js/vehicle.js";
import { gravityTurn } from "../js/guidance.js";
import { DESIGNS } from "../data/designs.js";

function launch(design, seconds, guide) {
  const world = makeWorld(design, EARTH, 1);
  const rng = mulberry32(1);
  const input = { throttle: 0, stick: 0, sas: "hold", stage: false, chute: false, released: true };
  const dt = 1 / 120;
  let maxAlt = 0;
  let staged = false;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) {
    const vessel = focused(world);
    if (!vessel || !vessel.alive) break;
    const el = orbitalElements(EARTH, vessel.x, vessel.y, vessel.vx, vessel.vy);
    maxAlt = Math.max(maxAlt, vessel.altitude || 0);
    const cmd = guide(vessel, el, world.time);
    vessel.holdPhi = cmd.phi;
    input.throttle = cmd.throttle;
    input.sas = "hold";
    input.stage = !!cmd.stage && !staged;
    staged = !!cmd.stage;
    stepWorld(world, input, dt, rng);
  }
  const vessel = focused(world);
  const el = vessel ? orbitalElements(EARTH, vessel.x, vessel.y, vessel.vx, vessel.vy) : null;
  return { maxAlt, el, alive: !!(vessel && vessel.alive) };
}

export function runAll() {
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || "" });
  const dv = rocketDeltaV(300, 10000, 2000);
  check("معادله‌ی موشک", Math.abs(dv - 300 * G0 * Math.log(5)) < 1, dv.toFixed(1) + " m/s");
  check("چگالی سطح", Math.abs(density(EARTH, 0) - 1.225) < 1e-9);
  check("چگالی ارتفاع مقیاس", Math.abs(density(EARTH, 8500) - 1.225 / Math.E) < 1e-6);
  const rLeo = EARTH.radius + 200000;
  const vLeo = orbitalSpeed(EARTH, rLeo);
  check("سرعت مداری ۲۰۰ کیلومتر نزدیک ۷.۸", vLeo > 7700 && vLeo < 7850, (vLeo / 1000).toFixed(3) + " km/s");
  const circ = { x: rLeo, y: 0, vx: 0, vy: vLeo };
  const startEl = orbitalElements(EARTH, circ.x, circ.y, circ.vx, circ.vy);
  const end = verletOrbit(EARTH, circ, 1, Math.round(2 * Math.PI * Math.sqrt(rLeo ** 3 / EARTH.mu)));
  const endEl = orbitalElements(EARTH, end.x, end.y, end.vx, end.vy);
  const energyDrift = Math.abs(endEl.energy - startEl.energy) / Math.abs(startEl.energy);
  const h0 = circ.x * circ.vy - circ.y * circ.vx;
  const h1 = end.x * end.vy - end.y * end.vx;
  check("پایداری مدار", energyDrift < 0.0002 && Math.abs(h1 - h0) / Math.abs(h0) < 0.0002, "انرژی " + (energyDrift * 100).toFixed(4) + "%");
  const drop = {
    x: 0, y: EARTH.radius + 1000, vx: 0, vy: 0, phi: -Math.PI / 2, omega: 0, onPad: false, controlled: false, alive: true,
    parts: [{ uid: "b", name: "جعبه", dry: 10, fuel: 0, localX: 0, localY: 0, w: 0.2, h: 0.2, area: 0.01, cd: 0.2, cn: 0, strength: 1e9, heatMax: 1e9, broken: false, engine: null, engineOn: false, stage: 0 }]
  };
  for (let t = 0; t < 2; t += 1 / 120) stepVessel(drop, EARTH, {}, 1 / 120, null);
  const fallen = (EARTH.radius + 1000) - Math.hypot(drop.x, drop.y);
  check("سقوط آزاد ۲ ثانیه", fallen > 18 && fallen < 21, fallen.toFixed(2) + " m");
  const trainer = DESIGNS.find((item) => item.id === "trainer");
  const hop = launch(trainer, 260, (vessel) => ({
    throttle: vessel.onPad && vessel.countdown > 0 ? 0 : 1,
    phi: Math.atan2(vessel.y, vessel.x),
    stage: false
  }));
  check("موشک آموزشی به ۱۰۰ کیلومتر", hop.maxAlt > 100000, (hop.maxAlt / 1000).toFixed(1) + " km");
  const orb = DESIGNS.find((item) => item.id === "orbital");
  const flight = launch(orb, 900, (vessel) => gravityTurn(vessel, EARTH));
  const pe = flight.el ? (flight.el.rp - EARTH.radius) / 1000 : 0;
  const ap = flight.el ? (flight.el.ra - EARTH.radius) / 1000 : 0;
  check("مدارگرد به مدار می‌رسد", pe > 150 && ap > 160 && flight.el.e < 1, "pe " + pe.toFixed(1) + " ap " + ap.toFixed(1));
  const info = preflight(trainer);
  check("آموزشی پایدار و بلندشونده", info.info.stable === "stable" && info.info.twr > 1, info.info.stable + " TWR " + info.info.twr.toFixed(2));
  const tilted = compileDesign(trainer);
  tilted.onPad = false;
  tilted.controlled = false;
  tilted.y = EARTH.radius + 5000;
  tilted.vy = 140;
  tilted.phi = Math.PI / 2 - 0.25;
  const before = tilted.phi;
  for (let i = 0; i < 90; i += 1) stepVessel(tilted, EARTH, {}, 1 / 120, null);
  check("باد و پسا موشک پایدار را برمی‌گرداند", tilted.phi > before - 0.02 && tilted.parts.every((part) => !part.broken), "phi " + tilted.phi.toFixed(3));
  const bad = JSON.parse(JSON.stringify(trainer));
  bad.root.children[1].children[0].children = [];
  const badInfo = preflight(bad);
  check("بی‌بالچه ناپایدار است", badInfo.info.stable !== "stable", badInfo.info.stable);
  return checks;
}
