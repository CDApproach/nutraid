// Lebensmittel laden, Suche, Mengen-Parser, Lernen aus dem Verlauf und Speicherung.
import { DEFAULT_PROFILE, PHYTO } from "./referenz.js";

const STORE_KEY = "nutraid.v1";
const OLD_STORE_KEY = "naehrwerte.v1"; // Name vor der Umbenennung in NutrAid
const FLAV_CLASSES = ["flavan3ols", "anthocyanins", "flavonols", "flavanones", "flavones"];
const PLANT_FREE = new Set(["Fleisch & Wurst", "Fisch", "Milchprodukte & Eier", "Käse", "Öle & Fette"]);

export const foods = new Map();
let usdaLoaded = null;

// ---------- Speicher ----------
export const state = load();

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) ?? localStorage.getItem(OLD_STORE_KEY)); } catch { /* leer */ }
  s = s || {};
  return {
    profile: { ...DEFAULT_PROFILE, ...(s.profile || {}) },
    log: s.log || {},
    custom: s.custom || [],
    stats: s.stats || {},
    pairs: s.pairs || {},
    setupDone: !!s.setupDone,
    lastBackup: s.lastBackup || 0,
    lastBackupAsk: s.lastBackupAsk || 0,
  };
}

export function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    localStorage.removeItem(OLD_STORE_KEY);
  } catch { /* Speicher voll/gesperrt */ }
}

export function exportData() {
  return JSON.stringify({ app: "nutraid", version: 1, ...state }, null, 1);
}

export function importData(text) {
  const d = JSON.parse(text);
  if (!d.log || !d.profile) throw new Error("Keine gültige Sicherung");
  Object.assign(state, { profile: { ...DEFAULT_PROFILE, ...d.profile }, log: d.log, custom: d.custom || [],
    stats: d.stats || {}, pairs: d.pairs || {}, setupDone: true });
  for (const c of state.custom) addFood(c);
  save();
}

// ---------- Lebensmittel ----------
function derive(f) {
  const n = f.n;
  if (n.na != null) n.salt = (n.na * 2.5) / 1000;
  if (n.epa != null || n.dha != null) n.epadha = (n.epa || 0) + (n.dha || 0);
  if (n.met != null && n.cys != null) n.metcys = n.met + n.cys;
  if (n.phe != null && n.tyr != null) n.phetyr = n.phe + n.tyr;
  if (FLAV_CLASSES.some((k) => n[k] != null)) {
    n.flavTotal = FLAV_CLASSES.reduce((s, k) => s + (n[k] || 0), 0);
  } else if (PLANT_FREE.has(f.cat)) {
    n.flavTotal = 0;
    for (const k of FLAV_CLASSES) n[k] = 0;
  }
  if (f.n.water != null) n.water = f.n.water; // g ≈ ml
  for (const p of PHYTO) if (p.mode === "grams") n[p.key] = f.tags?.includes(p.key) ? 100 : 0;
  f.search = norm([f.name, ...(f.aliases || [])].join(" "));
  f.searchName = norm(f.name);
  f.aliasNorm = (f.aliases || []).map(norm);
  return f;
}

export function addFood(f) {
  foods.set(f.id, derive(f));
}

export async function loadFoods() {
  const res = await fetch("data/lebensmittel.json");
  for (const f of await res.json()) addFood(f);
  for (const c of state.custom) addFood(c);
}

export function loadUsda() {
  if (!usdaLoaded) {
    usdaLoaded = fetch("data/usda.json").then((r) => r.json()).then((list) => {
      for (const f of list) {
        f.usda = true;
        f.portions = f.portions.map(([l, g]) => [l, g]);
        addFood(f);
      }
    });
  }
  return usdaLoaded;
}
export const usdaReady = () => !!usdaLoaded;

// ---------- Suche ----------
export function norm(s) {
  return s.toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function textScore(f, q) {
  if (!q) return 1;
  const name = f.searchName;
  if (name === q) return 120;
  if (f.aliasNorm?.includes(q)) return 110;
  if (name.startsWith(q)) return 100 - Math.min(name.length - q.length, 20) * 0.5;
  if ((" " + name).includes(" " + q)) return 85;
  const all = f.search;
  if ((" " + all).includes(" " + q)) return 75;
  if (all.includes(q)) return 60;
  // Alle Wörter der Anfrage kommen irgendwo vor
  const words = q.split(" ");
  if (words.length > 1 && words.every((w) => all.includes(w))) return 55;
  // Tippfehler-tolerant: Buchstaben in Reihenfolge
  if (q.length >= 4) {
    let i = 0;
    for (const ch of name) if (ch === q[i]) i++;
    if (i === q.length) return 30;
  }
  return 0;
}

// Wie gut passt ein Lebensmittel zu den eigenen Gewohnheiten?
export function habitScore(id, hour = new Date().getHours()) {
  const s = state.stats[id];
  if (!s) return 0;
  const days = (Date.now() - s.last) / 864e5;
  const recency = Math.max(0, 1 - days / 30);
  const hours = s.hours || [];
  const around = (hours[hour] || 0) + 0.5 * ((hours[(hour + 23) % 24] || 0) + (hours[(hour + 1) % 24] || 0));
  const timeFit = s.n ? around / s.n : 0;
  return Math.log2(1 + s.n) + 2 * recency + 3 * timeFit;
}

export function search(query, limit = 8) {
  const q = norm(query);
  const out = [];
  for (const f of foods.values()) {
    const t = textScore(f, q);
    // Englische USDA-Liste nur bei klaren Treffern, sonst wird es unübersichtlich
    if (!t || (f.usda && t < 55)) continue;
    // Kuratierte und eigene Lebensmittel vor der englischen USDA-Liste
    const base = f.usda ? t * 0.6 : f.custom ? t + 15 : t;
    out.push([base + habitScore(f.id) * 6, f]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, limit).map((x) => x[1]);
}

export function suggestions(limit = 8, hour = new Date().getHours()) {
  return Object.keys(state.stats).filter((id) => foods.has(id))
    .map((id) => [habitScore(id, hour), id])
    .sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => foods.get(x[1]));
}

// Was wird oft zusammen mit diesen Lebensmitteln gegessen?
export function companions(ids, limit = 5) {
  const score = {};
  for (const [k, c] of Object.entries(state.pairs)) {
    const [a, b] = k.split("|");
    if (ids.includes(a) && !ids.includes(b)) score[b] = (score[b] || 0) + c;
    if (ids.includes(b) && !ids.includes(a)) score[a] = (score[a] || 0) + c;
  }
  return Object.entries(score).filter(([id, c]) => c >= 2 && foods.has(id))
    .sort((x, y) => y[1] - x[1]).slice(0, limit).map(([id]) => foods.get(id));
}

// ---------- Mengen ----------
const NUMBER_WORDS = { ein: 1, eine: 1, einen: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, funf: 5, sechs: 6, halbe: 0.5, halb: 0.5 };
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3 };
const UNIT_ALIASES = {
  g: "g", gr: "g", gramm: "g", kg: "kg", ml: "ml", l: "l", liter: "l", cl: "cl",
  stk: "stück", stueck: "stück", stuck: "stück", el: "el", essloffel: "el", essloeffel: "el",
  tl: "tl", teeloffel: "tl", teeloeffel: "tl",
};

function unitKey(u) {
  return norm(u).replace(/(en|n|e|s)$/, "");
}

// Liefert {qty, unit, rest} – unit ist roh, wird erst mit dem Lebensmittel aufgelöst
const UNIT_RE = /^(g|gr|gramm|kg|ml|l|cl|liter|stk|el|tl)$|^(kapsel|tablette|tropfen|messloffel|messloeffel|brausetablette|kautablette|stueck|stuck|scheibe|tasse|glas$|glaeser|glaser|becher|handvoll|portion|prise|dose|packung|zehe|stange|kugel|riegel|tafel|flasche|schale|schuss|filet|ecke|roschen|blatt|tute|essloffel|essloeffel|teeloffel|teeloeffel)/;

export function parseInput(text) {
  let t = text.trim();
  // Menge hinten: "Haferflocken 60 g", "Brokkoli 1 Portion", "Banane 2"
  const back = t.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?|[½¼¾])\s*([^\d\s]\S*)?$/);
  if (back && !/^\d/.test(t) && (!back[3] || UNIT_RE.test(norm(back[3])))) {
    t = `${back[2]} ${back[3] || ""} ${back[1]}`.replace(/\s+/g, " ");
  } else {
    // Nur Einheit hinten: "Brokkoli Portion"
    const unitBack = t.match(/^(.*\S)\s+(\S+)$/);
    if (unitBack && !/^\d/.test(t) && UNIT_RE.test(norm(unitBack[2])) && norm(unitBack[2]).length > 2) t = `1 ${unitBack[2]} ${unitBack[1]}`;
  }
  let qty = null, unit = null;
  const m = t.match(/^(\d+(?:[.,]\d+)?|[½¼¾⅓])\s*([½¼¾])?\s*/);
  if (m) {
    qty = FRACTIONS[m[1]] ?? parseFloat(m[1].replace(",", "."));
    if (m[2]) qty += FRACTIONS[m[2]];
    t = t.slice(m[0].length);
  } else {
    const w = t.match(/^(\S+)\s+/);
    if (w && NUMBER_WORDS[norm(w[1])] != null) {
      qty = NUMBER_WORDS[norm(w[1])];
      t = t.slice(w[0].length);
    }
  }
  const u = t.match(/^(\S+)\s+(.+)$/);
  if (u) {
    const raw = norm(u[1]);
    if (UNIT_ALIASES[raw] || UNIT_RE.test(raw)) {
      unit = u[1];
      t = u[2];
    }
  }
  // Einheit hinter dem Namen: "1 Brokkoli Portion"
  if (!unit) {
    const ub = t.match(/^(.*\S)\s+(\S+)$/);
    if (ub && UNIT_RE.test(norm(ub[2])) && norm(ub[2]).length > 2) {
      unit = ub[2];
      t = ub[1];
    }
  }
  // "von"/"mit" am Anfang ignorieren: "2 Scheiben von dem Brot"
  t = t.replace(/^(von|vom|mit)\s+/i, "");
  return { qty, unit, rest: t };
}

export function isLiquid(f) {
  return !!f.liquid;
}

// Alle Einheiten eines Lebensmittels inkl. g/ml
export function unitsFor(f) {
  if (f.supplement) return [{ label: f.unit, g: 1 }];
  const list = (f.portions || []).map(([label, g]) => ({ label, g }));
  list.push({ label: "g", g: 1 });
  if (isLiquid(f)) list.push({ label: "ml", g: 1 });
  return list;
}

export function resolveUnit(f, rawUnit) {
  const units = unitsFor(f);
  if (!rawUnit) return null;
  const r = norm(rawUnit);
  const alias = UNIT_ALIASES[r];
  if (alias === "g" || alias === "ml") return units.find((u) => u.label === alias) || { label: "g", g: 1 };
  if (alias === "kg") return { label: "g", g: 1000, scale: 1000 };
  if (alias === "l") return { label: "ml", g: 1000, scale: 1000 };
  if (alias === "cl") return { label: "ml", g: 10, scale: 10 };
  const k = unitKey(alias || rawUnit);
  return units.find((u) => unitKey(u.label) === k)
    || units.find((u) => unitKey(u.label).startsWith(k) || k.startsWith(unitKey(u.label)))
    || null;
}

// Standardmenge: zuletzt verwendete, sonst erste Portion, sonst 100 g
export function defaultAmount(f) {
  if (f.supplement) return supplementDose(f);
  const s = state.stats[f.id];
  if (s?.lastUnit) {
    const u = unitsFor(f).find((x) => x.label === s.lastUnit);
    if (u) return { qty: s.lastQty, unit: u.label, grams: s.lastQty * u.g };
  }
  const p = f.portions?.[0];
  if (p) return { qty: 1, unit: p[0], grams: p[1] };
  return { qty: 100, unit: isLiquid(f) ? "ml" : "g", grams: 100 };
}

export function supplementDose(f) {
  const qty = f.dose || 1;
  return { qty, unit: f.unit, grams: qty };
}

export function amountFor(f, parsed) {
  if (parsed.qty == null && !parsed.unit) return defaultAmount(f);
  const u = resolveUnit(f, parsed.unit);
  if (u) {
    const qty = parsed.qty ?? 1;
    if (u.scale) return { qty: qty * u.scale, unit: u.label, grams: qty * u.g };
    return { qty, unit: u.label, grams: qty * u.g };
  }
  // Nur eine Zahl: kleine Zahlen = Stück/Portionen, große = Gramm
  const qty = parsed.qty;
  const p = f.portions?.[0];
  if (p && qty <= 12) return { qty, unit: p[0], grams: qty * p[1] };
  return { qty, unit: isLiquid(f) ? "ml" : "g", grams: qty };
}

const PLURAL = { Scheibe: "Scheiben", Tasse: "Tassen", Portion: "Portionen", Zehe: "Zehen", Stange: "Stangen", Kugel: "Kugeln",
  Schale: "Schalen", Flasche: "Flaschen", Ecke: "Ecken", Dose: "Dosen", Packung: "Packungen", Glas: "Gläser", Filet: "Filets",
  Tafel: "Tafeln", Blatt: "Blätter", Prise: "Prisen", Cocktailtomate: "Cocktailtomaten",
  Kapsel: "Kapseln", Tablette: "Tabletten", Brausetablette: "Brausetabletten", Kautablette: "Kautabletten" };

export function formatAmount(e, f) {
  const q = Math.round(e.qty * 100) / 100;
  const qs = String(q).replace(".", ",");
  if (e.unit === "g" || e.unit === "ml") return `${qs} ${e.unit}`;
  const unit = q > 1 && PLURAL[e.unit] ? PLURAL[e.unit] : e.unit;
  if (f?.supplement) return `${qs} ${unit}`;
  return `${qs} ${unit} · ${Math.round(e.grams)} ${f && isLiquid(f) ? "ml" : "g"}`;
}

// ---------- Tagebuch ----------
export function dayKey(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function entries(day) {
  return state.log[day] || [];
}

export function addEntry(day, food, amount, meal) {
  const e = { id: Math.random().toString(36).slice(2, 10), food: food.id, qty: amount.qty, unit: amount.unit,
    grams: amount.grams, meal, t: Date.now() };
  (state.log[day] = state.log[day] || []).push(e);
  learn(food, amount, day, meal);
  if (food.usda || food.custom) rememberFood(food);
  save();
  return e;
}

export function updateEntry(day, id, patch) {
  const e = entries(day).find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  const f = foods.get(e.food);
  if (f && patch.qty != null) {
    const s = state.stats[f.id];
    if (s) { s.lastQty = e.qty; s.lastUnit = e.unit; }
  }
  save();
}

export function removeEntry(day, id) {
  const list = entries(day);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [e] = list.splice(i, 1);
  if (!list.length) delete state.log[day];
  save();
  return e;
}

export function restoreEntry(day, e) {
  (state.log[day] = state.log[day] || []).push(e);
  save();
}

function learn(food, amount, day, meal) {
  const s = state.stats[food.id] || (state.stats[food.id] = { n: 0, hours: [] });
  s.n++;
  s.last = Date.now();
  s.lastQty = amount.qty;
  s.lastUnit = amount.unit;
  const h = new Date().getHours();
  s.hours[h] = (s.hours[h] || 0) + 1;
  // Gemeinsam gegessen: andere Einträge derselben Mahlzeit
  for (const other of entries(day)) {
    if (other.meal !== meal || other.food === food.id) continue;
    const k = [food.id, other.food].sort().join("|");
    state.pairs[k] = (state.pairs[k] || 0) + 1;
  }
}

// USDA-Einträge, die man benutzt hat, auch ohne Nachladen der großen Datei kennen
function rememberFood(food) {
  if (food.custom) return;
  if (state.custom.some((c) => c.id === food.id)) return;
  const { search, searchName, ...plain } = food;
  state.custom.push({ ...plain, n: { ...food.n }, remembered: true });
}

// ---------- Eigene Lebensmittel & Rezepte ----------
export function saveCustomFood(f) {
  f.custom = true;
  const i = state.custom.findIndex((c) => c.id === f.id);
  if (i >= 0) state.custom[i] = f; else state.custom.push(f);
  addFood(f);
  save();
}

export function deleteCustomFood(id) {
  state.custom = state.custom.filter((c) => c.id !== id);
  foods.delete(id);
  delete state.stats[id];
  save();
}

export function recipeFromEntries(name, list, servings) {
  const total = list.reduce((s, e) => s + e.grams, 0);
  const sum = {};
  for (const e of list) {
    const f = foods.get(e.food);
    if (!f) continue;
    for (const [k, v] of Object.entries(f.n)) sum[k] = (sum[k] || 0) + (v * e.grams) / 100;
  }
  const n = {};
  for (const [k, v] of Object.entries(sum)) n[k] = (v / total) * 100;
  // Pflanzenstoff-Gruppen als Grammanteil weitergeben
  return {
    id: "r" + Date.now().toString(36), name, cat: "Rezepte", custom: true, recipe: true,
    aliases: [], portions: [["Portion", Math.round(total / servings)], ["Ganzes Rezept", Math.round(total)]],
    n, items: list.map((e) => ({ food: e.food, grams: e.grams })),
    src: "Rezept aus " + list.length + " Zutaten",
  };
}

// ---------- Berechnung ----------
export function totals(list) {
  const sum = {}, missingKcal = {}, contrib = {};
  let kcal = 0;
  const keys = new Set();
  for (const e of list) {
    const f = foods.get(e.food);
    if (f) for (const k in f.n) keys.add(k);
  }
  for (const e of list) {
    const f = foods.get(e.food);
    if (!f) continue;
    const fk = ((f.n.kcal || 0) * e.grams) / 100;
    kcal += fk;
    for (const k of keys) {
      const v = f.n[k];
      if (v == null) { missingKcal[k] = (missingKcal[k] || 0) + fk; continue; }
      const amt = (v * e.grams) / 100;
      sum[k] = (sum[k] || 0) + amt;
      if (amt > 0) (contrib[k] = contrib[k] || []).push({ food: f, amount: amt, entry: e });
    }
  }
  const gaps = {};
  for (const [k, m] of Object.entries(missingKcal)) if (kcal > 0 && m / kcal > 0.1) gaps[k] = m / kcal;
  return { sum, gaps, contrib, kcal };
}

// Durchschnitt über mehrere Tage (nur Tage mit Einträgen)
export function rangeTotals(dayKeys) {
  const used = dayKeys.filter((d) => entries(d).length);
  const all = used.flatMap((d) => entries(d));
  const t = totals(all);
  const n = Math.max(used.length, 1);
  for (const k in t.sum) t.sum[k] /= n;
  for (const k in t.contrib) {
    const byFood = new Map();
    for (const c of t.contrib[k]) {
      const prev = byFood.get(c.food.id) || { food: c.food, amount: 0 };
      prev.amount += c.amount / n;
      byFood.set(c.food.id, prev);
    }
    t.contrib[k] = [...byFood.values()];
  }
  t.days = used.length;
  return t;
}

// Gute Quellen für einen Nährstoff, pro üblicher Portion; eigene Gewohnheiten zuerst
export function bestSources(key, limit = 6) {
  const out = [];
  for (const f of foods.values()) {
    if (f.usda || f.recipe || f.supplement || f.n[key] == null) continue;
    const amount = defaultAmount(f);
    const per = (f.n[key] * amount.grams) / 100;
    const kcal = ((f.n.kcal || 0) * amount.grams) / 100;
    if (per <= 0) continue;
    out.push({ food: f, amount, per, kcal, habit: habitScore(f.id) });
  }
  // Nährstoffdichte pro Portion, leicht gedämpft durch Kalorien, plus Gewohnheitsbonus
  out.sort((a, b) => b.per / Math.sqrt(b.kcal + 30) * (1 + b.habit / 4) - a.per / Math.sqrt(a.kcal + 30) * (1 + a.habit / 4));
  return out.slice(0, limit);
}
