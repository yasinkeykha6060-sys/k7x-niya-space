import { CONFIG } from "./config.js";
import { createAudio } from "./audio.js";
import { PARTS, TECH } from "../data/parts.js";
import { HANDBOOK } from "../data/handbook.js";
import { freshGame, catchUp, applyReport, research, hire, upgrade, padLimit, MISSIONS, failFactor } from "./company.js";
import { loadSave, writeSave } from "./storage.js";
import { preflight, compileDesign } from "./vehicle.js";
import { createFlight } from "./flight.js";
import { drawCraft } from "./rocketart.js";
import { stamp, addChild, removeNode, walk } from "./builder.js";

const audio = createAudio();
const welcome = document.querySelector("#welcome");
const app = document.querySelector("#app");
const screen = document.querySelector("#screen");
const nav = document.querySelector("#nav");
const view = document.querySelector("#view");
const canvas = document.querySelector("#sky");
const hud = document.querySelector("#hud");
let game = freshGame();
let page = "home";
let flight = null;
let editing = null;
let selected = null;

document.querySelector("#hello").textContent = CONFIG.welcome;
document.querySelector("#hello-text").textContent = CONFIG.welcomeText;

function esc(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}
function num(value, digits = 0) {
  if (!Number.isFinite(value)) return "—";
  const text = value.toFixed(digits);
  if (!game.faDigits) return text;
  return text.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}
function km(meters) {
  const abs = Math.abs(meters);
  if (abs >= 1000) return num(meters / 1000, abs >= 100000 ? 0 : 1) + " km";
  return num(meters, 0) + " m";
}
async function save() {
  try { await writeSave(game); }
  catch { toast("ذخیره روی این گوشی انجام نشد. خروجی پشتیبان را بردار."); }
}
function toast(text) {
  const box = document.createElement("div");
  box.className = "modal";
  box.innerHTML = '<div class="card"><p></p><button class="btn" type="button">باشه</button></div>';
  box.querySelector("p").textContent = text;
  box.querySelector("button").onclick = () => box.remove();
  document.body.appendChild(box);
}
function modal(title, body, buttons) {
  const box = document.createElement("div");
  box.className = "modal";
  box.innerHTML = '<div class="card"><h2></h2><div class="body"></div><div class="row"></div></div>';
  box.querySelector("h2").textContent = title;
  box.querySelector(".body").append(body);
  buttons.forEach((item) => {
    const button = document.createElement("button");
    button.className = "btn" + (item.ghost ? " ghost" : "");
    button.type = "button";
    button.textContent = item.label;
    button.onclick = () => { box.remove(); item.run(); };
    box.querySelector(".row").append(button);
  });
  document.body.appendChild(box);
}

function render() {
  document.querySelector("#title").textContent = game.name;
  nav.innerHTML = "";
  [["home", "خانه"], ["hangar", "آشیانه"], ["build", "ساخت"], ["company", "شرکت"], ["book", "راهنما"]].forEach(([id, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = page === id ? "on" : "";
    button.onclick = () => { page = id; render(); };
    nav.append(button);
  });
  screen.innerHTML = "";
  if (page === "home") home();
  if (page === "hangar") hangar();
  if (page === "build") build();
  if (page === "company") company();
  if (page === "book") book();
}

function home() {
  const income = catchUp(game);
  save();
  const fact = CONFIG.facts[Math.floor(Date.now() / 8000) % CONFIG.facts.length];
  screen.innerHTML = `
    <article class="card tile"><b>پول</b><div class="num">${esc(num(game.money, 0))}</div></article>
    <article class="card tile"><b>تحقیق</b><div class="num">${esc(num(game.science, 0))}</div></article>
    <p class="note">${esc(fact)}</p>
    <p class="note">${income > 1 ? "ماهواره‌ها در نبودنت " + esc(num(income, 0)) + " واحد درآمد داشتند." : "از آشیانه یک موشک آماده را پرتاب کن."}</p>
    <div class="row">
      <button class="btn" id="letter" type="button">نامه</button>
      <button class="btn ghost" id="help" type="button">آموزش</button>
    </div>`;
  const tiles = document.createElement("div");
  tiles.className = "grid";
  [...screen.querySelectorAll(".tile")].forEach((tile) => tiles.append(tile));
  screen.prepend(tiles);
  screen.querySelector("#letter").onclick = () => toast(CONFIG.loveNote);
  screen.querySelector("#help").onclick = tutorial;
}

function stats(design) {
  const pack = preflight(design);
  return { ...pack.info, notes: pack.notes, success: pack.success };
}

function hangar() {
  screen.append(button("موشک تازه", () => {
    const design = { id: "d" + Date.now(), name: "موشک تازه", color: "#ffd6ea", accent: "#ffd27a", root: { part: "capsule", children: [] }, flights: 0, wins: 0 };
    game.designs.unshift(design);
    editing = design;
    selected = null;
    page = "build";
    save();
    render();
  }));
  game.designs.forEach((design) => {
    const info = stats(design);
    const card = document.createElement("article");
    card.className = "card tile";
    card.innerHTML = `<b></b><p class="num"></p><div class="row"></div>`;
    card.querySelector("b").textContent = design.name;
    card.querySelector("p").textContent = "طول " + km(info.height) + " · " + num(info.totalDv, 0) + " m/s · TWR " + num(info.twr, 2);
    const fly = button("پرتاب", () => launch(design));
    const edit = button("ویرایش", () => { editing = design; selected = design.root.id; page = "build"; render(); });
    card.querySelector(".row").append(fly, edit, button("کپی", () => copyDesign(design)));
    screen.append(card);
  });
}

function button(label, run, ghost) {
  const el = document.createElement("button");
  el.className = "btn" + (ghost ? " ghost" : "");
  el.type = "button";
  el.textContent = label;
  el.onclick = run;
  return el;
}

function launch(design) {
  const info = stats(design);
  if (game.mode === "career" && info.mass > padLimit(game.pad)) {
    toast("سکوی فعلی این جرم را بلند نمی‌کند. سکو را ارتقا بده یا موشک را سبک کن.");
    return;
  }
  if (game.mode === "career" && game.money < info.cost) {
    toast("پول قطعات این پرتاب کم است.");
    return;
  }
  const bad = info.notes.filter((note) => note.level === "bad");
  const go = () => {
    if (game.mode === "career") game.money -= Math.round(info.cost);
    save();
    startFlight(design);
  };
  if (bad.length) modal("بررسی پیش از پرتاب", notes(info), [{ label: "برگردم درستش کنم", ghost: true, run() {} }, { label: "با همین پرتاب شود", run: go }]);
  else go();
}

function notes(info) {
  const box = document.createElement("div");
  info.notes.forEach((note) => {
    const p = document.createElement("p");
    p.className = "note " + (note.level === "bad" ? "bad" : note.level === "warn" ? "warn" : "ok");
    p.textContent = note.text;
    box.append(p);
  });
  return box;
}

function startFlight(design) {
  view.classList.add("on");
  app.hidden = true;
  flight = createFlight(canvas, design, {
    planet: game.planet,
    seed: (Date.now() % 99991) + 1,
    failFactor: failFactor(game),
    quality: game.quality,
    color: design.color || "#ffd0e4",
    accent: design.accent || "#ffd27a",
    audio,
    onHud: paintHud,
    onReport: (report) => {
      const won = applyReport(game, report);
      save();
      const lines = [report.note, "بیشینه ارتفاع " + km(report.maxAlt)];
      if (report.orbit) lines.push("مدار ساخته شد. حضیض " + km(report.pe) + " و اوج " + km(report.ap));
      if (report.crashed) lines.push(CONFIG.starLine);
      won.forEach((mission) => lines.push("ماموریت «" + mission.name + "» انجام شد."));
      modal("گزارش پرواز", textBlock(lines.join("\n")), [{ label: "برگشت", run: closeFlight }]);
    }
  });
  flight.resize();
  flight.start();
}

function textBlock(text) {
  const p = document.createElement("p");
  p.style.whiteSpace = "pre-wrap";
  p.textContent = text;
  return p;
}
function paintHud(data) {
  if (!data) return;
  const bits = [
    ["ارتفاع", km(data.alt)],
    ["بالا", num(data.radial, 0) + " m/s"],
    ["افق", num(data.horizontal, 0) + " m/s"],
    ["g", num(data.g, 1)],
    ["TWR", num(data.twr, 2)],
    ["Q", num(data.q / 1000, 1)]
  ];
  if (data.alt > 20000) {
    bits.push(["اوج", data.ap == null ? "—" : km(data.ap)]);
    bits.push(["حضیض", km(data.pe)]);
  }
  hud.innerHTML = bits.map(([label, value]) => esc(label) + " <span class='num'>" + esc(value) + "</span>").map((html) => "<b>" + html + "</b>").join("");
  const side = document.querySelector("#stages");
  side.innerHTML = (data.stages || []).map((row) => {
    const pct = row.max > 0 ? Math.max(0, Math.min(100, row.fuel / row.max * 100)) : 0;
    return "<div class='stage-card'>" + esc(row.name) + "<i><b style='width:" + pct.toFixed(0) + "%'></b></i></div>";
  }).join("");
}
function closeFlight() {
  if (flight) flight.stop();
  flight = null;
  view.classList.remove("on");
  app.hidden = false;
  page = "home";
  render();
}

function build() {
  if (!editing) editing = structuredClone(game.designs[0]);
  stamp(editing.root);
  if (!selected) selected = editing.root.id;
  const info = stats(editing);
  const head = document.createElement("div");
  head.className = "row";
  const name = document.createElement("input");
  name.value = editing.name;
  name.oninput = () => { editing.name = name.value; };
  head.append(name, button("ذخیره", saveDesign), button("پرتاب", () => launch(editing)));
  const yard = document.createElement("canvas");
  yard.id = "yard";
  screen.append(head, yard, notes(info));
  requestAnimationFrame(() => paintYard(yard, editing));
  const tree = document.createElement("div");
  tree.className = "card tile tree";
  walk(editing.root, (node, depth) => {
    const part = PARTS[node.part];
    const row = document.createElement("button");
    row.type = "button";
    row.className = "btn ghost" + (node.id === selected ? " on" : "");
    row.style.marginRight = (depth * 16) + "px";
    row.textContent = (part ? part.name : node.part) + (node.radial ? " · کنار" : "");
    row.onclick = () => { selected = node.id; render(); };
    tree.append(row);
  });
  screen.append(tree);
  const tools = document.createElement("div");
  tools.className = "row";
  tools.append(
    button("زیرش", () => attach(0), true),
    button("راست", () => attach(1), true),
    button("چپ", () => attach(-1), true),
    button("حذف", () => { if (removeNode(editing, selected)) { selected = editing.root.id; render(); } }, true)
  );
  screen.append(tools);
  const catalog = document.createElement("div");
  catalog.className = "grid";
  Object.values(PARTS).forEach((part) => {
    if (game.mode === "career" && part.tech && !game.tech.includes(part.tech)) return;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card tile";
    card.dataset.part = part.id;
    card.innerHTML = "<b></b><span class='num'></span>";
    card.querySelector("b").textContent = part.name;
    card.querySelector("span").textContent = num(part.cost, 0);
    card.onclick = () => { catalog.querySelectorAll("button").forEach((el) => el.classList.remove("on")); card.classList.add("on"); catalog.dataset.pick = part.id; };
    catalog.append(card);
  });
  screen.append(catalog);
  function attach(radial) {
    const pick = catalog.dataset.pick;
    if (!pick || !selected) { toast("اول قطعه و جای وصل را انتخاب کن."); return; }
    addChild(editing, selected, pick, radial);
    render();
  }
}

function paintYard(canvas, design) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width;
  const h = rect.height;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#7eb7ea");
  sky.addColorStop(0.62, "#d5ecff");
  sky.addColorStop(1, "#67a356");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#8d887e";
  ctx.fillRect(w * 0.28, h * 0.86, w * 0.44, 8);
  try {
    const vessel = compileDesign(design);
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    vessel.parts.forEach((part) => {
      minY = Math.min(minY, part.localY - part.h / 2);
      maxY = Math.max(maxY, part.localY + part.h / 2);
      minX = Math.min(minX, part.localX - part.w);
      maxX = Math.max(maxX, part.localX + part.w);
    });
    const rh = Math.max(4, maxY - minY);
    const rw = Math.max(2, maxX - minX);
    const scale = Math.min((h * 0.7) / rh, (w * 0.5) / rw);
    const midY = (minY + maxY) / 2;
    ctx.save();
    ctx.translate(w / 2, h * 0.48);
    vessel.phi = Math.PI / 2;
    vessel.comY = midY;
    drawCraft(ctx, vessel, scale, 0, 0);
    ctx.restore();
  } catch (error) {
    ctx.fillStyle = "#102033";
    ctx.font = "18px Vazirmatn, Tahoma";
    ctx.fillText("این طرح هنوز کامل نیست", 24, 40);
  }
}

function saveDesign() {
  const found = game.designs.find((item) => item.id === editing.id);
  if (found) Object.assign(found, structuredClone(editing));
  else game.designs.unshift(structuredClone(editing));
  save();
  toast("ذخیره شد.");
}
function copyDesign(design) {
  const copy = structuredClone(design);
  copy.id = "d" + Date.now();
  copy.name = design.name + " نسخه";
  copy.flights = 0;
  copy.wins = 0;
  game.designs.unshift(copy);
  save();
  render();
}

function company() {
  const wrap = document.createElement("div");
  wrap.className = "grid";
  [["pad", "سکو"], ["vab", "سالن ساخت"], ["lab", "آزمایشگاه"], ["control", "کنترل"]].forEach(([key, label]) => {
    const card = document.createElement("article");
    card.className = "card tile";
    card.innerHTML = "<b></b><p></p>";
    card.querySelector("b").textContent = label;
    card.querySelector("p").textContent = "سطح " + num(game[key], 0);
    card.append(button("ارتقا", () => { if (!upgrade(game, key)) toast("پول یا سقف سطح کافی نیست."); save(); render(); }));
    wrap.append(card);
  });
  screen.append(wrap);
  const tech = document.createElement("div");
  tech.className = "grid";
  TECH.forEach((node) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card tile";
    card.disabled = game.tech.includes(node.id);
    card.textContent = node.name + " · " + num(node.cost, 0);
    card.onclick = () => { if (!research(game, node.id)) toast("پیش‌نیاز یا امتیاز تحقیق کم است."); save(); render(); };
    tech.append(card);
  });
  screen.append(tech);
  const people = document.createElement("div");
  game.crew.forEach((person) => {
    const row = document.createElement("label");
    row.className = "note";
    row.textContent = person.role + " ";
    const input = document.createElement("input");
    input.value = person.name;
    input.oninput = () => { person.name = input.value; save(); };
    row.append(input);
    people.append(row);
  });
  people.append(button("استخدام", () => { if (!hire(game)) toast("پول استخدام کم است."); save(); render(); }));
  screen.append(people);
  MISSIONS.forEach((mission) => {
    const p = document.createElement("p");
    p.className = "note" + (game.done.includes(mission.id) ? " ok" : "");
    p.textContent = mission.name + " — " + mission.text;
    screen.append(p);
  });
  const mode = button(game.mode === "career" ? "حالت شرکت" : "حالت آزاد", () => {
    game.mode = game.mode === "career" ? "free" : "career";
    save();
    render();
  }, true);
  const planet = button(game.planet === "earth" ? "زمین واقعی" : "زمین کوچک", () => {
    game.planet = game.planet === "earth" ? "small" : "earth";
    save();
    render();
  }, true);
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "application/json";
  file.hidden = true;
  file.onchange = async () => {
    try {
      game = JSON.parse(await file.files[0].text());
      await save();
      render();
    } catch { toast("این پرونده خوانده نشد."); }
  };
  screen.append(mode, planet, button("پشتیبان", () => download(), true), button("بازگردانی", () => file.click(), true), file);
}

function download() {
  const blob = new Blob([JSON.stringify(game)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "niyayesh-space.json";
  link.click();
  toast("این پرونده فقط روی همین دستگاه معنی دارد. جایی بگذار که گم نشود.");
}

function book() {
  HANDBOOK.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card tile";
    card.innerHTML = "<b></b><p></p>";
    card.querySelector("b").textContent = item.title;
    card.querySelector("p").textContent = item.body;
    screen.append(card);
  });
  game.history.forEach((item) => {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = item.name + " · " + km(item.maxAlt) + " · " + item.note;
    screen.append(p);
  });
}

function tutorial() {
  const steps = [
    "از آشیانه، موشک «آموزشی» را پرتاب کن. اهرم پایین صفحه گاز است.",
    "دکمه‌ی هدایت، گرانش‌چرخش را برایت انجام می‌دهد تا ببینی مسیر درست چه شکلی است.",
    "برای مدار، موشک «مدارگرد» را با هدایت آموزشی بفرست. وقتی حضیض بالای جو ماند، مدار ساخته شده.",
    "ماهواره را فقط بعد از مدار پایدار رها کن. درآمدش حتی وقتی بازی بسته است می‌ماند."
  ];
  let index = 0;
  const body = document.createElement("p");
  const box = document.createElement("div");
  box.className = "modal";
  box.innerHTML = '<div class="card"><h2>آموزش کوتاه</h2><div class="body"></div><div class="row"></div></div>';
  box.querySelector(".body").append(body);
  body.textContent = steps[0];
  const next = button("بعدی", () => {});
  next.onclick = () => {
    index += 1;
    if (index >= steps.length) { game.seenTutorial = true; save(); box.remove(); return; }
    body.textContent = steps[index];
  };
  box.querySelector(".row").append(next, button("رد شدن", () => { game.seenTutorial = true; save(); box.remove(); }, true));
  document.body.append(box);
}

document.querySelector("#enter").onclick = async () => {
  audio.unlock();
  try { const saved = await loadSave(); if (saved) game = saved; }
  catch { toast("حافظه‌ی این مرورگر باز نشد. بازی بدون ذخیره ادامه پیدا می‌کند."); }
  game.sound = true;
  audio.setOn(true);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  welcome.hidden = true;
  app.hidden = false;
  render();
  if (!game.seenTutorial) tutorial();
};
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") audio.resume();
});
document.querySelector("#sound").onclick = () => {
  game.sound = !game.sound;
  audio.setOn(game.sound);
  save();
};
document.querySelector("#throttle").oninput = (event) => { if (flight) flight.setThrottle(event.target.value / 100); };
document.querySelector("#left").onclick = () => flight && flight.nudge(1);
document.querySelector("#right").onclick = () => flight && flight.nudge(-1);
document.querySelector("#stage").onclick = () => flight && flight.stage();
document.querySelector("#sas").onclick = () => flight && flight.cycleSas();
document.querySelector("#auto").onclick = () => flight && flight.toggleAuto();
document.querySelector("#warp").onclick = () => flight && flight.cycleWarp();
document.querySelector("#map").onclick = () => flight && flight.toggleMap();
document.querySelector("#chute").onclick = () => flight && flight.chute();
document.querySelector("#pause").onclick = () => flight && flight.togglePause();
document.querySelector("#deploy").onclick = () => {
  if (!flight) return;
  const sat = flight.deploy();
  if (!sat) toast("برای رها کردن، حضیض باید بالای جو باشد و ماهواره روی موشک باشد.");
  else { game.fleet.push(sat); save(); toast(sat.name + " در مدار ماند."); }
};
document.querySelector("#end").onclick = () => { if (flight) flight.end(); };
window.addEventListener("keydown", (event) => {
  if (!flight || event.repeat) return;
  if (event.code === "KeyZ") flight.setThrottle(Math.min(1, flight.hud().throttle + 0.1));
  if (event.code === "KeyX") flight.setThrottle(Math.max(0, flight.hud().throttle - 0.1));
  if (event.code === "KeyA") flight.nudge(1);
  if (event.code === "KeyD") flight.nudge(-1);
  if (event.code === "Space") { event.preventDefault(); flight.stage(); }
  if (event.code === "KeyT") flight.cycleSas();
  if (event.code === "KeyC") flight.chute();
  if (event.code === "KeyP") flight.togglePause();
  if (event.code === "KeyM") flight.toggleMap();
});
window.addEventListener("resize", () => flight && flight.resize());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
