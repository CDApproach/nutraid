// Eigene Lebensmittel (mit Open-Food-Facts-Suche), Rezeptliste und Nachschlagen.
import { NUTRIENTS } from "./referenz.js";
import { state, foods, search, saveCustomFood, deleteCustomFood, loadUsda, recipeFromEntries, formatAmount, supplementDose, recipeIngredients, recipeServings } from "./daten.js";
import { openFood } from "./dashboard.js";
import { esc, num, openSheet, toast, $ } from "./ui.js";

const MICROS = NUTRIENTS.filter((n) => n.group === "vitamin" || n.group === "mineral");
const BASIC = [["kcal", "Energie", "kcal"], ["fat", "Fett", "g"], ["satfat", "davon gesättigt", "g"], ["carbs", "Kohlenhydrate", "g"],
  ["sugar", "davon Zucker", "g"], ["fiber", "Ballaststoffe", "g"], ["protein", "Eiweiß", "g"], ["salt", "Salz", "g"]];

// Open Food Facts liefert alles in g/100 g
const OFF_MICRO = { vitA: ["vitamin-a", 1e6], vitD: ["vitamin-d", 1e6], vitE: ["vitamin-e", 1e3], vitK: ["vitamin-k", 1e6],
  vitC: ["vitamin-c", 1e3], b1: ["vitamin-b1", 1e3], b2: ["vitamin-b2", 1e3], niacinNE: ["vitamin-pp", 1e3], b6: ["vitamin-b6", 1e3],
  folate: ["vitamin-b9", 1e6], b12: ["vitamin-b12", 1e6], b5: ["pantothenic-acid", 1e3], ca: ["calcium", 1e3], p: ["phosphorus", 1e3],
  mg: ["magnesium", 1e3], k: ["potassium", 1e3], fe: ["iron", 1e3], zn: ["zinc", 1e3], cu: ["copper", 1e3], mn: ["manganese", 1e3],
  se: ["selenium", 1e6], iod: ["iodine", 1e6] };

export function renderCustomList() {
  const list = state.custom.filter((c) => !c.remembered);
  const el = document.getElementById("customList");
  if (!list.length) {
    el.innerHTML = `<p class="muted">Noch keine eigenen Einträge. Für verpackte Produkte kannst du die Nährwerte von der Packung abtippen oder über Open Food Facts suchen – und unter „Nahrungsergänzung“ Präparate wie Omega-3-Kapseln oder Vitamin D anlegen.</p>`;
    return;
  }
  el.innerHTML = list.map((c) => `<div class="custom-item">
      <span class="grow"><b>${esc(c.name)}</b> <span class="badge">${c.recipe ? "Rezept" : c.supplement ? "Ergänzung" : "eigenes"}</span>${c.daily ? '<span class="badge">täglich</span>' : ""}<br>
      <span class="small muted">${c.supplement ? suppSummary(c) : c.recipe ? recipeSummary(c) : `${num(c.n.kcal)} kcal / 100 g · ${c.portions.map((p) => `${esc(p[0])} = ${num(p[1])} g`).join(", ")}`}</span></span>
      <button class="btn small" data-show="${c.id}">${c.recipe ? "Zutaten & Nährwerte" : "Nährwerte"}</button>
      ${c.recipe ? "" : `<button class="btn small" data-edit="${c.id}">Bearbeiten</button>`}
      <button class="btn small ghost" data-del="${c.id}" aria-label="Löschen">🗑</button>
    </div>`).join("");
  el.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.show) openFood(foods.get(b.dataset.show));
    if (b.dataset.edit) openFoodEditor(foods.get(b.dataset.edit));
    if (b.dataset.del && confirm("Dieses Lebensmittel löschen? Einträge im Tagebuch damit werden nicht mehr berechnet.")) {
      deleteCustomFood(b.dataset.del);
      renderCustomList();
    }
  };
}

// "2 Portionen à 305 g · 523 kcal · Haferflocken, Milch, Banane"
function recipeSummary(r) {
  const servings = recipeServings(r);
  const portion = r.portions[0][1];
  const names = recipeIngredients(r).map((x) => x.food?.name || "?");
  return `${servings} ${servings === 1 ? "Portion" : "Portionen"} à ${num(portion)} g · ${num((r.n.kcal || 0) * portion / 100)} kcal<br>` +
    esc(names.join(", "));
}

// "2 Kapseln täglich · EPA 500 mg, DHA 250 mg, Vitamin D 20 µg"
function suppSummary(c) {
  const names = { epa: ["EPA", "mg"], dha: ["DHA", "mg"], ala: ["ALA", "mg"] };
  for (const m of MICROS) names[m.key] = [m.name.replace(/ \(.*\)/, ""), m.unit];
  const parts = Object.entries(c.n).filter(([k, v]) => names[k] && v > 0)
    .map(([k, v]) => `${names[k][0]} ${num((v / 100) * c.dose)} ${names[k][1]}`);
  return `${esc(formatAmount(supplementDose(c), c))} pro Tag${parts.length ? " · " + esc(parts.join(", ")) : ""}`;
}

export function bindBrowse() {
  const input = document.getElementById("browseInput");
  const out = document.getElementById("browseResult");
  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2) { out.innerHTML = ""; return; }
    let res = search(q, 25);
    if (res.length < 10) { await loadUsda(); res = search(q, 25); }
    out.innerHTML = res.map((f) => `<div class="browse-item" data-id="${f.id}"><span>${esc(f.name)}${f.usda ? '<span class="badge">USDA</span>' : ""}</span>
      <span class="muted small">${num(f.n.kcal)} kcal / 100 g</span></div>`).join("") || `<p class="muted">Nichts gefunden.</p>`;
  };
  input.addEventListener("input", run);
  out.onclick = (e) => {
    const it = e.target.closest("[data-id]");
    if (it) openFood(foods.get(it.dataset.id));
  };
}

const round3 = (v) => (v == null ? "" : Math.round(v * 1000) / 1000);

function field(key, label, unit, value) {
  return `<label>${esc(label)} (${unit})<input name="${key}" type="number" step="any" min="0" inputmode="decimal" value="${value ?? ""}"></label>`;
}

const FATTY = [["epa", "EPA (Omega-3)", "mg"], ["dha", "DHA (Omega-3)", "mg"], ["ala", "Alpha-Linolensäure (Omega-3)", "mg"]];
const SUPP_UNITS = ["Kapsel", "Tablette", "Tropfen", "Messlöffel", "Brausetablette", "Kautablette", "Portion"];
// Synthetische Folsäure wirkt stärker als Nahrungsfolat: 1 µg Folsäure = 1,7 µg Folat-Äquivalente
const FOLIC_FACTOR = 1.7;

export function openFoodEditor(existing, onSaved) {
  const f = existing || { n: {}, portions: [["Portion", 100]] };
  const supp = !!f.supplement;
  // Nahrungsergänzung wird pro Einheit eingegeben, intern aber wie "pro 100 g" bei 1 g je Einheit gespeichert
  const n = { ...f.n };
  if (supp) {
    for (const k in n) n[k] /= 100;
    if (n.folate != null) n.folate /= FOLIC_FACTOR;
  }
  const microField = (m) => m.key === "folate"
    ? `<label data-only="food">${esc(m.name)} (${m.unit})<input name="folate" type="number" step="any" min="0" inputmode="decimal" value="${supp ? "" : round3(n.folate)}"></label>
       <label data-only="supp">Folsäure (µg)<input name="folicAcid" type="number" step="any" min="0" inputmode="decimal" value="${supp ? round3(n.folate) : ""}"></label>`
    : field(m.key, m.name, m.unit, round3(n[m.key]));
  const hasMicro = MICROS.some((m) => n[m.key] != null);
  const d = openSheet("foodDialog", `
    <div class="sheet-head"><h2>${existing?.id ? "Bearbeiten" : "Neu anlegen"}</h2><button class="close" data-close aria-label="Schließen">×</button></div>
    <div class="range-switch kind-switch" role="group" aria-label="Art">
      <button type="button" data-kind="food">Lebensmittel</button><button type="button" data-kind="supp">Nahrungsergänzung</button>
    </div>
    <div class="card" data-only="food" style="box-shadow:none;background:var(--surface-2)">
      <label class="small">Bei Open Food Facts suchen (Barcode oder Produktname)</label>
      <div style="display:flex;gap:.4rem;margin-top:.3rem"><input id="offQuery" class="input" placeholder="z. B. 4008400401621 oder Skyr Natur">
      <button class="btn" id="offBtn" type="button">Suchen</button></div>
      <div id="offResult" class="small"></div>
    </div>
    <form id="foodForm" class="form-grid">
      <label class="wide">Name<input name="name" required value="${esc(f.name || "")}" placeholder=""></label>
      <label class="wide">Weitere Suchbegriffe (optional, mit Komma getrennt)
        <input name="aliases" placeholder="z. B. Marke, Sorte, andere Bezeichnung" value="${esc((f.aliases || []).join(", "))}"></label>

      <label data-only="food">Portion (Bezeichnung)<input name="pName" value="${esc(supp ? "Portion" : f.portions?.[0]?.[0] || "Portion")}"></label>
      <label data-only="food">Portion (Gramm)<input name="pGrams" type="number" step="any" min="0" value="${supp ? 100 : f.portions?.[0]?.[1] ?? 100}"></label>
      <label data-only="food" class="wide checkbox"><input type="checkbox" name="liquid" ${f.liquid ? "checked" : ""}> Getränk (Mengen in ml)</label>

      <label data-only="supp">Einheit<input name="unit" list="suppUnits" value="${esc(f.unit || "Kapsel")}"></label>
      <datalist id="suppUnits">${SUPP_UNITS.map((u) => `<option value="${u}">`).join("")}</datalist>
      <label data-only="supp">Tagesdosis (Anzahl)<input name="dose" type="number" step="any" min="0" value="${f.dose ?? 1}"></label>
      <label data-only="supp" class="wide checkbox"><input type="checkbox" name="daily" ${f.daily ?? true ? "checked" : ""}> Nehme ich täglich – zum Abhaken im Tagebuch anzeigen</label>
      <label data-only="supp" class="wide">Die Werte unten gelten für
        <select name="per"><option value="unit">1 Einheit (z. B. 1 Kapsel)</option><option value="dose">die ganze Tagesdosis</option></select></label>

      <div class="wide small muted" data-only="food">Nährwerte pro 100 g bzw. 100 ml – wie auf der Packung:</div>
      <div class="wide small muted" data-only="supp">Inhalt laut Packung. Leer lassen, was nicht enthalten ist.</div>
      <div class="wide form-grid" data-only="food">${BASIC.map(([k, l, u]) => field(k, l, u, round3(n[k]))).join("")}</div>
      <div class="wide form-grid" data-only="supp">${field("kcal_s", "Energie", "kcal", supp ? round3(n.kcal) : "")}</div>

      <details class="wide more" data-fatty ${supp || FATTY.some(([k]) => n[k] != null) ? "open" : ""}><summary>Omega-3-Fettsäuren</summary>
        <div class="form-grid">${FATTY.map(([k, l, u]) => field(k, l, u, round3(n[k]))).join("")}</div>
      </details>
      <details class="wide more" ${hasMicro ? "open" : ""}><summary>Vitamine & Mineralstoffe</summary>
        <div class="form-grid">${MICROS.map(microField).join("")}</div>
      </details>
      <button class="btn primary wide" type="submit">Speichern</button>
    </form>`);
  const form = $("#foodForm", d);
  const fill = (vals) => { for (const [k, v] of Object.entries(vals)) if (form.elements[k] && v != null) form.elements[k].value = Math.round(v * 1000) / 1000; };
  if (!supp && n.salt == null && n.na != null) fill({ salt: (n.na * 2.5) / 1000 });

  let kind = supp ? "supp" : "food";
  const setKind = (k) => {
    kind = k;
    d.querySelectorAll("[data-kind]").forEach((b) => b.classList.toggle("on", b.dataset.kind === k));
    d.querySelectorAll("[data-only]").forEach((el) => {
      el.hidden = el.dataset.only !== k;
      el.querySelectorAll("input").forEach((i) => (i.disabled = el.hidden));
    });
    form.elements.name.placeholder = k === "supp" ? "z. B. Omega-3 Algenöl" : "";
    if (k === "supp") d.querySelector("[data-fatty]").open = true;
  };
  d.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => setKind(b.dataset.kind)));
  setKind(kind);

  $("#offBtn", d).onclick = () => offSearch($("#offQuery", d).value.trim(), $("#offResult", d), (p) => {
    // Open Food Facts hat den Hauptnamen oft in einer anderen Sprache – deutschen Namen bevorzugen
    const brands = (p.brands || "").split(",").map((b) => b.trim()).filter(Boolean);
    const name = p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || "";
    form.elements.name.value = [name, brands[0]].filter(Boolean).join(" – ");
    const extra = [...brands.slice(0, 2), p.generic_name_de, p.generic_name, p.product_name, p.product_name_en]
      .map((x) => x?.trim()).filter((x) => x && x !== name);
    form.elements.aliases.value = [...new Set(extra)].join(", ");
    const nu = p.nutriments || {};
    fill({ kcal: nu["energy-kcal_100g"], fat: nu.fat_100g, satfat: nu["saturated-fat_100g"], carbs: nu.carbohydrates_100g,
      sugar: nu.sugars_100g, fiber: nu.fiber_100g, protein: nu.proteins_100g, salt: nu.salt_100g });
    const micro = {};
    // Nullwerte bei Vitaminen/Mineralstoffen sind bei Open Food Facts meist Platzhalter, keine Messwerte
    for (const [k, [off, f2]] of Object.entries(OFF_MICRO)) if (nu[off + "_100g"] > 0) micro[k] = nu[off + "_100g"] * f2;
    fill(micro);
    if (Object.keys(micro).length) form.querySelectorAll("details")[1].open = true;
    if (p.serving_quantity) { form.elements.pGrams.value = p.serving_quantity; form.elements.pName.value = "Portion"; }
  });
  $("#offQuery", d).onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("#offBtn", d).click(); } };

  form.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const nn = {};
    const keys = [...BASIC.map(([k]) => k), "kcal_s", "folicAcid", ...FATTY.map(([k]) => k), ...MICROS.map((m) => m.key)];
    for (const k of keys) {
      const v = fd.get(k);
      if (v !== "" && v != null) nn[k] = parseFloat(v);
    }
    const base = {
      id: existing?.id || "c" + Date.now().toString(36), name: fd.get("name").trim(),
      aliases: fd.get("aliases").split(",").map((a) => a.trim()).filter(Boolean), src: "eigene Angabe",
    };
    let food;
    if (kind === "supp") {
      if (nn.kcal_s != null) nn.kcal = nn.kcal_s;
      delete nn.kcal_s;
      if (nn.folicAcid != null) nn.folate = nn.folicAcid * FOLIC_FACTOR;
      delete nn.folicAcid;
      if (nn.vitA != null) nn.retinol = nn.vitA; // Präparate enthalten meist Retinol – zählt für die Höchstmenge
      const dose = parseFloat(fd.get("dose")) || 1;
      const perUnit = fd.get("per") === "dose" ? 1 / dose : 1;
      for (const k in nn) nn[k] *= 100 * perUnit;
      nn.kcal ??= 0;
      nn.alcohol = 0;
      const unit = fd.get("unit").trim() || "Kapsel";
      food = { ...base, cat: "Nahrungsergänzung", supplement: true, unit, dose, daily: fd.get("daily") === "on",
        portions: [[unit, 1]], n: nn };
    } else {
      if (nn.salt != null) { nn.na = (nn.salt / 2.5) * 1000; delete nn.salt; }
      nn.alcohol = 0;
      food = { ...base, cat: "Eigene", n: nn, liquid: fd.get("liquid") === "on",
        portions: [[fd.get("pName").trim() || "Portion", parseFloat(fd.get("pGrams")) || 100]] };
    }
    saveCustomFood(food);
    d.close();
    toast(`„${esc(food.name)}“ gespeichert`);
    renderCustomList();
    onSaved?.(food);
  };
}

async function offSearch(q, out, onPick) {
  if (!q) return;
  out.innerHTML = "Suche …";
  const fields = "code,product_name,product_name_de,product_name_en,generic_name,generic_name_de,brands,nutriments,serving_quantity";
  try {
    let products;
    if (/^\d{8,14}$/.test(q)) {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${q}?fields=${fields}`).then((r) => r.json());
      products = r.product ? [r.product] : [];
    } else {
      // Über den lokalen server.py, weil die OFF-Such-API keine Browser-Anfragen (CORS) erlaubt
      const r = await fetch(`api/off-search?q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error("offline");
      products = ((await r.json()).hits || []).map((p) => ({ ...p, brands: [].concat(p.brands || []).slice(0, 2).join(", ") }));
    }
    products = products.filter((p) => p.nutriments?.["energy-kcal_100g"] != null);
    if (!products.length) { out.innerHTML = "Nichts gefunden."; return; }
    out.innerHTML = `<ul class="src-list">${products.map((p, i) => `<li><span>${esc(p.product_name_de || p.product_name || p.generic_name_de || "?")} <span class="muted">${esc(p.brands || "")}</span></span>
      <span class="v">${num(p.nutriments["energy-kcal_100g"])} kcal<button type="button" class="add-btn" data-i="${i}">übernehmen</button></span></li>`).join("")}</ul>`;
    out.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { onPick(products[+b.dataset.i]); out.innerHTML = "✓ Übernommen – bitte kurz prüfen."; }));
  } catch {
    out.innerHTML = "Open Food Facts ist gerade nicht erreichbar (die Namenssuche braucht den lokalen server.py, Barcodes gehen immer). Du kannst die Werte auch von der Packung abtippen.";
  }
}

export function openRecipeDialog(list, onSaved) {
  const d = openSheet("foodDialog", `
    <div class="sheet-head"><h2>Als Rezept speichern</h2><button class="close" data-close aria-label="Schließen">×</button></div>
    <p class="small muted">${list.length} Zutaten, zusammen ${num(list.reduce((s, e) => s + e.grams, 0))} g. Das Rezept taucht danach in der Suche auf.</p>
    <form id="recipeForm" class="form-grid">
      <label class="wide">Name<input name="name" required placeholder="z. B. Mein Porridge"></label>
      <label>Anzahl Portionen<input name="servings" type="number" min="1" step="1" value="1"></label>
      <button class="btn primary wide" type="submit">Speichern</button>
    </form>`);
  $("#recipeForm", d).onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = recipeFromEntries(fd.get("name").trim(), list, Math.max(1, parseInt(fd.get("servings")) || 1));
    saveCustomFood(r);
    d.close();
    toast(`Rezept „${esc(r.name)}“ gespeichert`);
    renderCustomList();
    onSaved?.(r);
  };
}
