import { CONFIG } from "./config.js";
import { TECH } from "../data/parts.js";
import { DESIGNS } from "../data/designs.js";

export const MISSIONS = [
  { id: "up", name: "اولین پرواز", text: "از سکو بلند شو و سالم به ارتفاع ۵ کیلومتر برس.", reward: 25000, science: 8, check: (r) => r.maxAlt > 5000 && !r.crashed },
  { id: "space", name: "مرز فضا", text: "به ۱۰۰ کیلومتر برس.", reward: 50000, science: 15, check: (r) => r.maxAlt > 100000 },
  { id: "orbit", name: "اولین مدار", text: "حضیض را بالاتر از جو ببر.", reward: 150000, science: 30, check: (r) => r.orbit },
  { id: "sat", name: "اولین ماهواره", text: "یک ماهواره را در مدار رها کن.", reward: 100000, science: 20, check: (r) => r.deployed },
  { id: "crew", name: "بازگشت آرام", text: "با چتر، آرام به زمین برگرد.", reward: 80000, science: 18, check: (r) => r.landed },
  { id: "geo", name: "مدار دور", text: "اوج را به بالای ۲۰ هزار کیلومتر برسان.", reward: 200000, science: 25, check: (r) => r.ap > 20000000 }
];

export function freshGame() {
  return {
    name: CONFIG.companyName,
    emblem: "🚀",
    color: "#ff8fc2",
    mode: "career",
    money: 450000,
    science: 80,
    rep: 0,
    tech: ["start", "orbit", "upper", "sat", "land"],
    pad: 1,
    vab: 1,
    lab: 1,
    control: 1,
    crew: [
      { id: "n", role: "مهندس", name: "نیایش", skill: 2 },
      { id: "e", role: "تکنسین", name: "ستاره", skill: 1 }
    ],
    designs: DESIGNS.map((item, index) => ({ ...structuredClone(item), version: 1, flights: 0, wins: 0, created: index })),
    fleet: [],
    history: [],
    done: [],
    rockets: 0,
    lastTick: Date.now(),
    sound: false,
    faDigits: true,
    quality: "auto",
    planet: "earth",
    seenTutorial: false
  };
}

export function padLimit(level) {
  return [0, 30000, 120000, 400000][level] || 30000;
}

export function catchUp(game) {
  const now = Date.now();
  const hours = Math.max(0, Math.min(24 * 14, (now - (game.lastTick || now)) / 3600000));
  let income = 0;
  game.fleet.forEach((sat) => {
    const ageYears = (now - sat.born) / (365.25 * 24 * 3600000);
    if (ageYears > sat.life) return;
    income += sat.rate * hours;
    if (sat.pe < 180000) sat.pe = Math.max(100000, sat.pe - hours * 40);
  });
  game.money += Math.round(income);
  game.lastTick = now;
  return income;
}

export function applyReport(game, report) {
  const unlocked = [];
  MISSIONS.forEach((mission) => {
    if (game.done.includes(mission.id) || !mission.check(report)) return;
    game.done.push(mission.id);
    if (game.mode === "career") {
      game.money += mission.reward;
      game.science += mission.science;
    }
    game.rep += 1;
    unlocked.push(mission);
  });
  game.history.unshift({
    t: Date.now(),
    name: report.name,
    ok: !report.crashed && (report.orbit || report.landed || report.maxAlt > 1000),
    maxAlt: report.maxAlt,
    note: report.note
  });
  game.history = game.history.slice(0, 40);
  const design = game.designs.find((item) => item.id === report.designId);
  if (design) {
    design.flights = (design.flights || 0) + 1;
    if (!report.crashed) design.wins = (design.wins || 0) + 1;
  }
  return unlocked;
}

export function research(game, id) {
  const node = TECH.find((item) => item.id === id);
  if (!node || game.tech.includes(id)) return false;
  if (node.needs.some((need) => !game.tech.includes(need))) return false;
  if (game.mode === "career" && game.science < node.cost) return false;
  if (game.mode === "career") game.science -= node.cost;
  game.tech.push(id);
  return true;
}

export function hire(game) {
  const cost = 30000 + game.crew.length * 10000;
  if (game.mode === "career" && game.money < cost) return null;
  if (game.mode === "career") game.money -= cost;
  const person = { id: "c" + Date.now(), role: "مهندس", name: "همکار تازه", skill: 1 };
  game.crew.push(person);
  return person;
}

export function upgrade(game, key) {
  const level = game[key] || 1;
  if (level >= 3) return false;
  const cost = level * 80000;
  if (game.mode === "career" && game.money < cost) return false;
  if (game.mode === "career") game.money -= cost;
  game[key] = level + 1;
  return true;
}

export function failFactor(game) {
  const skill = game.crew.reduce((sum, person) => sum + (person.skill || 1), 0);
  return Math.max(0.35, 1 - skill * 0.06);
}
