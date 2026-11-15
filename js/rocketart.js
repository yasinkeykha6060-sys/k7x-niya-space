export function drawCraft(ctx, vessel, scale, throttle, time) {
  const parts = vessel.parts.filter((part) => !part.broken);
  if (!parts.length) return;
  ctx.save();
  ctx.rotate(-vessel.phi + Math.PI / 2);
  const fins = parts.filter((part) => part.kind === "fin");
  const body = parts.filter((part) => part.kind !== "fin");
  fins.forEach((part) => drawPart(ctx, vessel, part, scale));
  body.forEach((part) => drawPart(ctx, vessel, part, scale));
  if (!throttle) throttle = 0;
  parts.forEach((part) => {
    if (!part.engineOn || !part.engine) return;
    const power = part.engine.solid ? 1 : throttle;
    if (power < 0.04) return;
    const box = boxOf(vessel, part, scale);
    drawFlame(ctx, box, part, power, time || 0);
  });
  ctx.restore();
}

function boxOf(vessel, part, scale) {
  const x = (part.localX - vessel.comX) * scale;
  const y = -(part.localY - vessel.comY) * scale;
  const w = Math.max(4, part.w * scale);
  const h = Math.max(4, part.h * scale);
  return { x, y, w, h, top: y - h / 2, left: x - w / 2 };
}

function drawPart(ctx, vessel, part, scale) {
  const box = boxOf(vessel, part, scale);
  ctx.save();
  if (part.kind === "command" || part.kind === "payload") drawNose(ctx, box, part);
  else if (part.kind === "fairing") drawNose(ctx, box, part);
  else if (part.kind === "engine") drawEngine(ctx, box, part);
  else if (part.kind === "fin") drawFin(ctx, box, part);
  else if (part.kind === "decoupler") drawRing(ctx, box);
  else drawTank(ctx, box, part);
  ctx.restore();
}

function metal(ctx, left, top, width, height, dark) {
  const g = ctx.createLinearGradient(left, top, left + width, top);
  g.addColorStop(0, dark ? "#4e463f" : "#9aa6b1");
  g.addColorStop(0.2, dark ? "#b7aea4" : "#fbfcfd");
  g.addColorStop(0.55, dark ? "#8a8178" : "#e4eaef");
  g.addColorStop(1, dark ? "#2c2824" : "#66717b");
  return g;
}

function drawTank(ctx, box) {
  const { left, top, w, h } = box;
  ctx.fillStyle = metal(ctx, left, top, w, h, false);
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = "rgba(20,28,36,0.55)";
  ctx.fillRect(left, top, Math.max(1, w * 0.06), h);
  ctx.fillRect(left + w * 0.94, top, Math.max(1, w * 0.06), h);
  ctx.strokeStyle = "rgba(30,40,50,0.55)";
  ctx.lineWidth = Math.max(1, w * 0.03);
  ctx.beginPath();
  const seams = Math.max(2, Math.round(h / Math.max(8, w * 0.7)));
  for (let i = 1; i < seams; i += 1) {
    const y = top + (h * i) / seams;
    ctx.moveTo(left, y);
    ctx.lineTo(left + w, y);
  }
  ctx.moveTo(left + w * 0.5, top);
  ctx.lineTo(left + w * 0.5, top + h);
  ctx.stroke();
}

function drawNose(ctx, box, part) {
  const { left, top, w, h } = box;
  const tip = part.kind === "command" || part.kind === "fairing";
  ctx.beginPath();
  if (tip) {
    ctx.moveTo(left + w / 2, top);
    ctx.quadraticCurveTo(left + w, top + h * 0.42, left + w * 0.92, top + h);
    ctx.lineTo(left + w * 0.08, top + h);
    ctx.quadraticCurveTo(left, top + h * 0.42, left + w / 2, top);
  } else {
    rounded(ctx, left, top, w, h, 6);
  }
  ctx.fillStyle = metal(ctx, left, top, w, h, false);
  ctx.fill();
  ctx.strokeStyle = "rgba(30,40,50,0.4)";
  ctx.stroke();
  if (part.crew) {
    ctx.fillStyle = "#16324a";
    ctx.beginPath();
    ctx.ellipse(left + w / 2, top + h * 0.62, w * 0.16, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,0.8)";
    ctx.beginPath();
    ctx.ellipse(left + w / 2 - 1, top + h * 0.6, w * 0.07, h * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEngine(ctx, box, part) {
  const { left, top, w, h } = box;
  const bodyH = h * 0.48;
  ctx.fillStyle = metal(ctx, left, top, w, bodyH, true);
  ctx.fillRect(left + w * 0.08, top, w * 0.84, bodyH);
  ctx.beginPath();
  ctx.moveTo(left + w * 0.22, top + bodyH);
  ctx.lineTo(left - w * 0.06, top + h);
  ctx.lineTo(left + w * 1.06, top + h);
  ctx.lineTo(left + w * 0.78, top + bodyH);
  ctx.closePath();
  ctx.fillStyle = metal(ctx, left, top, w, h, true);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(left + w * 0.34, top + bodyH + 1);
  ctx.lineTo(left + w * 0.08, top + h - 1);
  ctx.lineTo(left + w * 0.92, top + h - 1);
  ctx.lineTo(left + w * 0.66, top + bodyH + 1);
  ctx.closePath();
  ctx.fillStyle = "#1a120e";
  ctx.fill();
  if (part.engine && part.engine.solid) {
    ctx.fillStyle = "#c4472d";
    ctx.fillRect(left + w * 0.16, top + 3, w * 0.1, bodyH - 6);
  }
}

function drawFin(ctx, box, part) {
  const { left, top, w, h } = box;
  const outward = part.localX >= 0 ? 1 : -1;
  ctx.beginPath();
  if (outward > 0) {
    ctx.moveTo(left, top + h * 0.15);
    ctx.lineTo(left + w, top);
    ctx.lineTo(left + w, top + h);
    ctx.lineTo(left, top + h * 0.85);
  } else {
    ctx.moveTo(left + w, top + h * 0.15);
    ctx.lineTo(left, top);
    ctx.lineTo(left, top + h);
    ctx.lineTo(left + w, top + h * 0.85);
  }
  ctx.closePath();
  ctx.fillStyle = "#d9e2ea";
  ctx.fill();
  ctx.strokeStyle = "#66707a";
  ctx.stroke();
}

function drawRing(ctx, box) {
  const { left, top, w, h } = box;
  ctx.fillStyle = "#2b333b";
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = "#f0c14a";
  ctx.fillRect(left, top + h * 0.35, w, Math.max(2, h * 0.25));
}

function drawFlame(ctx, box, part, power, time) {
  const thrust = part.engine.thrustVac || part.engine.thrustSL || 200000;
  const flick = 0.92 + Math.sin(time * 61 + part.localX) * 0.05;
  const meters = Math.min(46, (3.5 + thrust / 70000) * (0.25 + power * 0.75));
  const len = meters * (box.h / Math.max(part.h, 0.2)) * flick;
  const { x, top, w, h } = box;
  const y0 = top + h;
  const half = w * (0.42 + power * 0.15);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  ctx.moveTo(x - half * 0.55, y0);
  ctx.quadraticCurveTo(x - half * 1.15, y0 + len * 0.45, x, y0 + len);
  ctx.quadraticCurveTo(x + half * 1.15, y0 + len * 0.45, x + half * 0.55, y0);
  ctx.closePath();
  const g = ctx.createLinearGradient(x, y0, x, y0 + len);
  g.addColorStop(0, "rgba(255,252,245,0.95)");
  g.addColorStop(0.18, "rgba(255,186,70,0.9)");
  g.addColorStop(0.55, "rgba(255,78,18,0.55)");
  g.addColorStop(1, "rgba(180,30,0,0)");
  ctx.fillStyle = g;
  ctx.fill();
  const diamonds = 4;
  for (let i = 1; i <= diamonds; i += 1) {
    const t = i / (diamonds + 0.4);
    const y = y0 + len * t * 0.72;
    const rx = half * (0.18 + t * 0.25);
    ctx.fillStyle = "rgba(255,244,220," + (0.55 - t * 0.4) + ")";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function rounded(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
}

export function nozzleWorld(vessel, part) {
  const noseX = Math.cos(vessel.phi);
  const noseY = Math.sin(vessel.phi);
  const eastX = Math.sin(vessel.phi);
  const eastY = -Math.cos(vessel.phi);
  const dx = part.localX - vessel.comX;
  const dy = part.localY - part.h / 2 - vessel.comY;
  return {
    x: vessel.x + dx * eastX + dy * noseX,
    y: vessel.y + dx * eastY + dy * noseY
  };
}
