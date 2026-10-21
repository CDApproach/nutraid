// Einstieg: Tabs, Tagesnavigation, Eingabe mit Vorschlägen, Tagebuch und Profil.
import { MEALS, SUPPLEMENT_MEAL, mealForHour, energyTarget, targetsFor } from "./referenz.js";
import {
  state, save, foods, loadFoods, loadUsda, usdaReady, search, suggestions, companions, parseInput, amountFor,
  unitsFor, formatAmount, supplementDose, dayKey, entries, addEntry, updateEntry, removeEntry, restoreEntry, exportData, importData,
} from "./daten.js";
import { renderDashboard, bindDashboard, setAddHandler, openFood } from "./dashboard.js";
import { renderVerlauf } from "./verlauf.js";
import { renderCustomList, bindBrowse, openFoodEditor, openRecipeDialog } from "./eigene.js";
import { $, $$, esc, num, toast, initTooltips, dayLabel } from "./ui.js";
import { initPwa, renderAppInfo, requestPersistence, backupReminder } from "./pwa.js";

let day = new Date();
let range = 1;
let meal = mealForHour(new Date().getHours() + new Date().getMinutes() / 60);
let mealPinned = false;
let histDays = 14;
let results = [];
let selected = 0;

const today = () => dayKey(day);

// ---------- Rendering ----------
function renderAll() {
  $("#dayLabel").textContent = dayLabel(day);
  $("#dayPicker").value = today();
  renderMealSwitch();
  renderMeals();
  renderQuick();
  renderSupplements();
  renderDashboard($("#dashboard"), day, range);
  renderMiniSummary();
}

function renderMiniSummary() {
  const list = entries(today());
  const kcal = list.reduce((s, e) => s + kcalOf(e), 0);
  const target = energyTarget(state.profile);
  $("#miniSummary").innerHTML = list.length
    ? `<span><b>${num(kcal)}</b> / ${num(target)} kcal · ${$("#dashboard .stat .big")?.textContent || ""} Ziele</span><a href="#dashboard">Auswertung ↓</a>`
    : "";
}

function renderMealSwitch() {
  $("#mealSwitch").innerHTML = MEALS.map((m) => `<button data-meal="${m.key}" class="${m.key === meal ? "on" : ""}">${m.name}</button>`).join("");
}

function kcalOf(e) {
  const f = foods.get(e.food);
  return f ? ((f.n.kcal || 0) * e.grams) / 100 : 0;
}

function renderMeals() {
  const list = entries(today());
  const y = new Date(day);
  y.setDate(y.getDate() - 1);
  const yList = entries(dayKey(y));
  const meals = list.some((e) => e.meal === SUPPLEMENT_MEAL.key) ? [...MEALS, SUPPLEMENT_MEAL] : MEALS;
  $("#mealList").innerHTML = meals.map((m) => {
    const items = list.filter((e) => e.meal === m.key);
    const yItems = yList.filter((e) => e.meal === m.key);
    const kcal = items.reduce((s, e) => s + kcalOf(e), 0);
    const body = items.length
      ? `<ul>${items.map((e) => {
        const f = foods.get(e.food);
        return `<li data-entry="${e.id}"><span><span class="e-name" data-info="${e.food}" style="cursor:pointer">${esc(f?.name || "Unbekanntes Lebensmittel")}</span>
            <span class="e-amount" data-edit="${e.id}" title="Menge ändern">${esc(formatAmount(e, f))}</span></span>
            <span class="e-kcal">${num(kcalOf(e))} kcal</span>
            <button class="e-del" data-del="${e.id}" aria-label="Entfernen">×</button></li>`;
      }).join("")}</ul>`
      : `<p class="meal-empty">Noch nichts eingetragen.</p>`;
    const actions = [];
    if (!items.length && yItems.length) actions.push(`<button class="btn small" data-copy="${m.key}">↻ Wie gestern (${yItems.length})</button>`);
    if (items.length >= 2 && m !== SUPPLEMENT_MEAL) actions.push(`<button class="btn small ghost" data-recipe="${m.key}">Als Rezept speichern</button>`);
    return `<div class="card meal" data-meal-card="${m.key}">
      <div class="meal-head"><h3>${m.name}</h3><span class="meal-kcal">${items.length ? `${num(kcal)} kcal` : ""}</span></div>
      ${body}${actions.length ? `<div class="meal-actions">${actions.join("")}</div>` : ""}</div>`;
  }).join("");
}

function renderQuick() {
  const el = $("#quick");
  if ($("#foodInput").value.trim()) { el.innerHTML = ""; return; }
  const inMeal = entries(today()).filter((e) => e.meal === meal).map((e) => e.food);
  const comp = companions(inMeal, 5);
  const hour = mealHour(meal);
  const sugg = suggestions(12, hour).filter((f) => !inMeal.includes(f.id) && !comp.includes(f) && !f.daily).slice(0, 8);
  let html = "";
  if (comp.length) html += `<span class="q-label">Dazu isst du oft:</span>` + comp.map(chip).join("");
  if (sugg.length) html += `<span class="q-label">Häufig bei dir${mealPinned || !isToday() ? ` (${MEALS.find((m) => m.key === meal).name})` : " um diese Zeit"}:</span>` + sugg.map(chip).join("");
  if (!Object.keys(state.stats).length) html = `<span class="q-label">Tipp: Menge und Einheit kannst du direkt mittippen – „2 Scheiben Vollkornbrot“, „1 Glas Milch“, „Apfel“. Die App lernt mit.</span>`;
  el.innerHTML = html;
}

function chip(f) {
  const a = amountFor(f, { qty: null, unit: null });
  return `<button class="chip" data-quick="${f.id}" data-tip="${esc(`${formatAmount(a, f)} · ${num(((f.n.kcal || 0) * a.grams) / 100)} kcal`)}">+ ${esc(f.name)}</button>`;
}

const isToday = () => dayKey(day) === dayKey(new Date());
function mealHour(m) {
  if (!mealPinned && isToday()) return new Date().getHours();
  return { fruehstueck: 8, mittag: 12, abend: 19, snack: 16 }[m];
}

// Täglich genommene Nahrungsergänzung zum Abhaken
function dailySupplements() {
  return [...foods.values()].filter((f) => f.supplement && f.daily);
}

function renderSupplements() {
  const list = dailySupplements();
  const taken = new Set(entries(today()).map((e) => e.food));
  $("#suppToggles").innerHTML = list.length
    ? `<span class="q-label">Nahrungsergänzung:</span>` + list.map((f) => {
      const on = taken.has(f.id);
      return `<button class="chip ${on ? "on" : ""}" data-supp="${f.id}" aria-pressed="${on}">${on ? "✓" : "○"} ${esc(f.name)} <small>${esc(formatAmount(supplementDose(f), f))}</small></button>`;
    }).join("")
    : "";
}

function toggleSupplement(id) {
  const f = foods.get(id);
  const existing = entries(today()).find((e) => e.food === id);
  if (existing) {
    removeEntry(today(), existing.id);
    renderAll();
  } else {
    add(f, supplementDose(f));
  }
}

// ---------- Hinzufügen ----------
function add(f, amount, m = meal) {
  if (f.supplement) m = SUPPLEMENT_MEAL.key;
  const e = addEntry(today(), f, amount, m);
  requestPersistence();
  toast(`${esc(f.name)} · ${esc(formatAmount(amount, f))} hinzugefügt`, "Rückgängig", () => {
    removeEntry(today(), e.id);
    renderAll();
  });
  renderAll();
}
setAddHandler((f, amount) => add(f, amount));

// ---------- Eingabe & Vorschläge ----------
const input = () => $("#foodInput");
const list = () => $("#suggestList");

function updateSuggest() {
  const text = input().value;
  const parsed = parseInput(text);
  if (!parsed.rest.trim()) { closeSuggest(); renderQuick(); return; }
  results = search(parsed.rest, 8).map((f) => ({ f, a: amountFor(f, parsed) }));
  if (results.length < 4 && !usdaReady() && parsed.rest.trim().length >= 3) {
    loadUsda().then(() => { if (input().value === text) updateSuggest(); });
  }
  selected = 0;
  const items = results.map(({ f, a }, i) => `<li role="option" id="opt${i}" data-i="${i}" aria-selected="${i === selected}">
      <span class="s-name">${esc(f.name)}${f.usda ? '<span class="badge">USDA</span>' : f.recipe ? '<span class="badge">Rezept</span>' : f.supplement ? '<span class="badge">Ergänzung</span>' : f.custom ? '<span class="badge">eigenes</span>' : ""}
      ${f.usda ? `<span class="s-sub">${esc(f.cat)}</span>` : ""}</span>
      <span class="s-meta">${esc(formatAmount(a, f))}<br>${num(((f.n.kcal || 0) * a.grams) / 100)} kcal</span></li>`);
  items.push(`<li class="s-more" data-new="1">+ Eigenes Lebensmittel „${esc(parsed.rest.trim())}“ anlegen</li>`);
  list().innerHTML = items.join("");
  list().hidden = false;
  input().setAttribute("aria-expanded", "true");
  $("#quick").innerHTML = "";
}

function closeSuggest() {
  list().hidden = true;
  input().setAttribute("aria-expanded", "false");
}

function highlight() {
  $$("#suggestList li[data-i]").forEach((li, i) => li.setAttribute("aria-selected", i === selected));
  input().setAttribute("aria-activedescendant", "opt" + selected);
}

function pick(i) {
  const r = results[i];
  if (!r) return;
  add(r.f, r.a);
  input().value = "";
  closeSuggest();
  renderQuick();
  input().focus();
}

function newFoodFromInput() {
  const name = parseInput(input().value).rest.trim();
  closeSuggest();
  openFoodEditor({ name, n: {}, portions: [["Portion", 100]] }, (f) => {
    input().value = "";
    add(f, amountFor(f, { qty: null, unit: null }));
  });
}

function bindInput() {
  input().addEventListener("input", updateSuggest);
  input().addEventListener("keydown", (e) => {
    if (list().hidden) {
      if (e.key === "Enter") updateSuggest();
      return;
    }
    if (e.key === "ArrowDown") { selected = Math.min(selected + 1, results.length - 1); highlight(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { selected = Math.max(selected - 1, 0); highlight(); e.preventDefault(); }
    else if (e.key === "Enter") { e.preventDefault(); results.length ? pick(selected) : newFoodFromInput(); }
    else if (e.key === "Escape") closeSuggest();
  });
  list().addEventListener("mousedown", (e) => e.preventDefault());
  list().addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    if (li.dataset.new) return newFoodFromInput();
    pick(+li.dataset.i);
  });
  input().addEventListener("blur", () => setTimeout(closeSuggest, 150));
  $("#suppToggles").addEventListener("click", (e) => {
    const b = e.target.closest("[data-supp]");
    if (b) toggleSupplement(b.dataset.supp);
  });
  $("#quick").addEventListener("click", (e) => {
    const b = e.target.closest("[data-quick]");
    if (!b) return;
    const f = foods.get(b.dataset.quick);
    add(f, amountFor(f, { qty: null, unit: null }));
  });
}

// ---------- Tagebuch-Aktionen ----------
function bindMeals() {
  $("#mealList").addEventListener("click", (e) => {
    const t = e.target;
    const del = t.closest("[data-del]");
    if (del) {
      const removed = removeEntry(today(), del.dataset.del);
      toast("Eintrag entfernt", "Rückgängig", () => { restoreEntry(today(), removed); renderAll(); });
      return renderAll();
    }
    const ed = t.closest("[data-edit]");
    if (ed) return editAmount(ed);
    const info = t.closest("[data-info]");
    if (info) {
      const e2 = entries(today()).find((x) => x.id === info.closest("[data-entry]").dataset.entry);
      return openFood(foods.get(info.dataset.info), e2);
    }
    const copy = t.closest("[data-copy]");
    if (copy) {
      const y = new Date(day);
      y.setDate(y.getDate() - 1);
      for (const e2 of entries(dayKey(y)).filter((x) => x.meal === copy.dataset.copy)) {
        const f = foods.get(e2.food);
        if (f) addEntry(today(), f, { qty: e2.qty, unit: e2.unit, grams: e2.grams }, e2.meal);
      }
      toast("Mahlzeit von gestern übernommen");
      return renderAll();
    }
    const rec = t.closest("[data-recipe]");
    if (rec) {
      const items = entries(today()).filter((x) => x.meal === rec.dataset.recipe);
      return openRecipeDialog(items, () => renderAll());
    }
    const card = t.closest("[data-meal-card]");
    if (card && !t.closest("button, [data-edit], [data-info]")) {
      meal = card.dataset.mealCard;
      mealPinned = true;
      renderMealSwitch();
      renderQuick();
      input().focus();
    }
  });
}

function editAmount(el) {
  const e = entries(today()).find((x) => x.id === el.dataset.edit);
  const f = foods.get(e.food);
  if (!f) return;
  const units = unitsFor(f);
  el.outerHTML = `<span class="edit-row"><input type="number" step="any" min="0" value="${e.qty}" aria-label="Menge">
    <select aria-label="Einheit">${units.map((u) => `<option ${u.label === e.unit ? "selected" : ""} value="${esc(u.label)}">${esc(u.label)}</option>`).join("")}
    <option disabled>──</option>${MEALS.map((m) => `<option value="meal:${m.key}">→ ${m.name}</option>`).join("")}</select>
    <button class="btn small primary">OK</button></span>`;
  const row = $(`[data-entry="${e.id}"] .edit-row`);
  const [q, sel, ok] = row.children;
  q.focus();
  q.select();
  const commit = () => {
    if (sel.value.startsWith("meal:")) {
      updateEntry(today(), e.id, { meal: sel.value.slice(5) });
    } else {
      const u = units.find((x) => x.label === sel.value);
      const qty = parseFloat(q.value) || 0;
      if (qty > 0) updateEntry(today(), e.id, { qty, unit: u.label, grams: qty * u.g });
    }
    renderAll();
  };
  ok.onclick = commit;
  sel.onchange = () => { if (sel.value.startsWith("meal:")) commit(); };
  q.onkeydown = (ev) => { if (ev.key === "Enter") commit(); if (ev.key === "Escape") renderAll(); };
}

// ---------- Profil ----------
function renderProfile() {
  const form = $("#profileForm");
  const p = state.profile;
  for (const k of ["sex", "age", "weight", "height", "pal"]) form.elements[k].value = String(p[k]);
  form.elements.menstruating.checked = !!p.menstruating;
  form.elements.kcalOverride.value = p.kcalOverride || "";
  updateProfileCalc();
  renderAppInfo();
}

function readProfile() {
  const f = $("#profileForm").elements;
  return { sex: f.sex.value, age: +f.age.value || 35, weight: +f.weight.value || 70, height: +f.height.value || 170,
    pal: +f.pal.value, menstruating: f.menstruating.checked, kcalOverride: +f.kcalOverride.value || 0 };
}

function updateProfileCalc() {
  const p = readProfile();
  $("#menstruatingRow").hidden = p.sex !== "f";
  const t = targetsFor(p);
  $("#kcalCalc").innerHTML = `Dein Ziel: <b>${num(energyTarget(p))} kcal</b> · Protein ${num(t.protein)} g · Ballaststoffe ${num(t.fiber)} g · Wasser ${num(t.water / 1000)} l`;
}

function bindProfile() {
  const form = $("#profileForm");
  form.addEventListener("input", updateProfileCalc);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    state.profile = readProfile();
    state.setupDone = true;
    save();
    toast("Profil gespeichert – Zielwerte aktualisiert");
    showTab("heute");
  });
  $("#exportBtn").onclick = () => {
    const blob = new Blob([exportData()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nutraid-${dayKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    state.lastBackup = Date.now();
    save();
    renderAppInfo();
  };
  $("#importFile").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importData(await file.text());
      toast("Sicherung geladen");
      renderProfile();
      renderAll();
    } catch (err) {
      toast("Konnte die Datei nicht laden: " + esc(err.message));
    }
  };
}

// ---------- Tabs & Navigation ----------
function showTab(name) {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
  $$(".tab").forEach((s) => s.classList.toggle("active", s.id === "tab-" + name));
  if (name === "heute") renderAll();
  if (name === "verlauf") renderVerlauf(histDays);
  if (name === "lebensmittel") renderCustomList();
  if (name === "profil") renderProfile();
  scrollTo({ top: 0 });
}

function shiftDay(n) {
  day = new Date(day);
  day.setDate(day.getDate() + n);
  if (!mealPinned) meal = isToday() ? mealForHour(new Date().getHours()) : meal;
  renderAll();
}

function bindNav() {
  $$(".tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  $("#prevDay").onclick = () => shiftDay(-1);
  $("#nextDay").onclick = () => shiftDay(1);
  $("#dayLabel").onclick = () => { const p = $("#dayPicker"); p.showPicker ? p.showPicker() : p.click(); };
  $("#dayPicker").onchange = (e) => {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split("-").map(Number);
    day = new Date(y, m - 1, d);
    renderAll();
  };
  $$(".daybar .range-switch button").forEach((b) => (b.onclick = () => {
    range = +b.dataset.range;
    $$(".daybar .range-switch button").forEach((x) => x.classList.toggle("on", x === b));
    renderDashboard($("#dashboard"), day, range);
  }));
  $("#histRange").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    histDays = +b.dataset.days;
    $$("#histRange button").forEach((x) => x.classList.toggle("on", x === b));
    renderVerlauf(histDays);
  };
  $("#mealSwitch").onclick = (e) => {
    const b = e.target.closest("[data-meal]");
    if (!b) return;
    meal = b.dataset.meal;
    mealPinned = true;
    renderMealSwitch();
    renderQuick();
    input().focus();
  };
  $("#newFoodBtn").onclick = () => openFoodEditor(null);
}

async function init() {
  initTooltips();
  initPwa();
  await loadFoods();
  bindNav();
  bindInput();
  bindMeals();
  bindProfile();
  bindBrowse();
  bindDashboard($("#dashboard"));
  if (!state.setupDone) {
    showTab("profil");
    toast("Willkommen! Trag kurz dein Profil ein, damit die Zielwerte passen.");
  } else {
    showTab(location.hash === "#verlauf" ? "verlauf" : "heute");
    backupReminder(() => showTab("profil"));
    save();
  }
}

init();
