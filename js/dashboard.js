// Auswertung: Energie-Ring, Makros, Nährstoffbalken, Lücken, Pflanzenstoffe und Detail-Dialoge.
import { NUTRIENTS, GROUPS, PHYTO, NOT_TRACKED, PHYTO_EXCLUDED, targetsFor, energyTarget } from "./referenz.js";
import { state, foods, totals, rangeTotals, entries, bestSources, defaultAmount, formatAmount, dayKey } from "./daten.js";
import { esc, fmt, num, pct, status, openSheet } from "./ui.js";

const byKey = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));
// Diese zählen für "Ziele erreicht"
const SCORED = NUTRIENTS.filter((n) => n.kind === "min" && n.key !== "kcal" && n.key !== "water");
const MICRO = NUTRIENTS.filter((n) => n.group === "vitamin" || n.group === "mineral");

let ctx = null; // letzte Berechnung, für Dialoge
let onAdd = () => {};
export function setAddHandler(fn) { onAdd = fn; }

export function daysEnding(day, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(day);
    d.setDate(d.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

function ring(value, target) {
  const r = 64, c = 2 * Math.PI * r;
  const ratio = target ? value / target : 0;
  const shown = Math.min(ratio, 1);
  const over = ratio > 1.1;
  const color = over ? "var(--serious)" : "var(--accent)";
  return `<div class="ring-wrap" data-tip="${esc(`Energie: ${num(value)} von ${num(target)} kcal (${pct(ratio * 100)})`)}">
    <svg viewBox="0 0 150 150" width="150" height="150" aria-hidden="true">
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--track)" stroke-width="12"/>
      ${shown > 0 ? `<circle cx="75" cy="75" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${(c * shown).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 75 75)"/>` : ""}
    </svg>
    <div class="ring-center"><strong>${num(value)}</strong><span>von ${num(target)} kcal</span>
      <span>${ratio < 1 ? `noch ${num(target - value)}` : over ? `${num(value - target)} drüber` : "Ziel erreicht"}</span></div>
  </div>`;
}

function bar(ratio, color) {
  const w = Math.max(0, Math.min(ratio, 1)) * 100;
  return `<div class="bar"><i style="width:${w}%;background:${color}"></i></div>`;
}

function nutRow(n, t) {
  const v = t.sum[n.key] ?? 0;
  const target = ctx.targets[n.key];
  const ratio = target ? v / target : 0;
  const ulVal = n.ul ? (t.sum[n.ulKey || n.key] ?? 0) : 0;
  const ulExceeded = n.ul && ulVal > n.ul;
  const st = status(n, ratio, ulExceeded);
  const gap = t.gaps[n.key] || (n.key === "metcys" || n.key === "phetyr" ? t.gaps.met : 0);
  const kindTxt = n.kind === "max" ? "max." : n.kind === "info" ? "ca." : "Ziel";
  const tipTxt = `<b>${esc(n.name)}</b><br>${fmt(v, n.unit)} von ${kindTxt} ${fmt(target, n.unit)} – ${st.label}` +
    (gap ? `<br>⚠ Für ${Math.round(gap * 100)} % der Kalorien fehlen Daten` : "");
  return `<button class="nut" data-nut="${n.key}" data-tip="${esc(tipTxt)}">
    <span class="n-name">${esc(n.name)}${gap ? '<span class="warn-ico" aria-label="Daten unvollständig">⚠</span>' : ""}</span>
    <span class="n-pct">${pct(ratio * 100)}</span>
    <span>${bar(ratio, st.color)}<span class="n-amt">${fmt(v, n.unit)} / ${kindTxt} ${fmt(target, n.unit)}</span></span>
  </button>`;
}

function macroRow(label, key, t, color) {
  const v = t.sum[key] ?? 0, target = ctx.targets[key];
  const n = byKey[key];
  return `<div class="macro-row" data-nut="${key}" style="cursor:pointer"
      data-tip="${esc(`${label}: ${fmt(v, "g")} von ${n.kind === "min" ? "Ziel" : "ca."} ${fmt(target, "g")}`)}">
    <span>${label}</span>${bar(target ? v / target : 0, color)}<span class="val">${num(v)} / ${num(target)} g</span></div>`;
}

function energySplit(t) {
  const p = (t.sum.protein || 0) * 4, c = (t.sum.carbs || 0) * 4, f = (t.sum.fat || 0) * 9, a = (t.sum.alcohol || 0) * 7;
  const total = p + c + f + a;
  if (!total) return "";
  const parts = [["Protein", p, "var(--s1)", "10–20 %"], ["Kohlenhydrate", c, "var(--s2)", "> 50 %"], ["Fett", f, "var(--s3)", "30–35 %"], ["Alkohol", a, "var(--s4)", "0 %"]]
    .filter((x) => x[1] > 0);
  return `<div class="split"><div class="small muted" style="margin-bottom:.3rem">Energieverteilung</div>
    <div class="split-bar">${parts.map(([l, v, col, rec]) => `<span style="width:${(v / total) * 100}%;background:${col}" data-tip="${esc(`${l}: ${pct((v / total) * 100)} der Energie (Empfehlung ${rec})`)}"></span>`).join("")}</div>
    <div class="split-legend">${parts.map(([l, v, col, rec]) => `<span><i class="dot" style="background:${col}"></i>${l} ${pct((v / total) * 100)} <span class="muted">(${rec})</span></span>`).join("")}</div></div>`;
}

function phytoValue(p, t) {
  return (t.sum[p.key] || 0) * (p.scale || 1);
}

function weeklyGrams(key) {
  const keys = daysEnding(ctx.day, 7);
  return totals(keys.flatMap((d) => entries(d))).sum[key] || 0;
}

function phytoCard(p, t) {
  const v = phytoValue(p, t);
  let main, goal = "";
  if (p.mode === "grams") {
    const wk = weeklyGrams(p.key);
    main = `${num(v)} g`;
    goal = `7 Tage: ${num(wk)} g ≈ ${num(wk / 100)} Portionen · ${esc(p.goalNote)}`;
  } else {
    main = fmt(v, p.unit);
    goal = p.goal ? `${pct((v / p.goal) * 100)} von ${fmt(p.goal, p.unit)} (${esc(p.goalNote || "Ziel")})` : "";
  }
  const ratio = p.goal ? v / p.goal : p.mode === "grams" ? Math.min(v / 100, 1) : 0;
  let extra = "";
  if (p.sub) {
    const total = p.sub.reduce((s, x) => s + (t.sum[x.key] || 0), 0);
    if (total > 0) {
      const cols = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "#e87ba4"];
      extra = `<div class="subbar">${p.sub.map((x, i) => {
        const val = t.sum[x.key] || 0;
        return val > 0 ? `<span style="width:${(val / total) * 100}%;background:${cols[i]}" data-tip="${esc(`${x.name}: ${fmt(val, "mg")}`)}"></span>` : "";
      }).join("")}</div>`;
    }
  }
  const gap = t.gaps[p.key] ? `<div class="goal">⚠ Für ${Math.round(t.gaps[p.key] * 100)} % der Kalorien fehlen Daten</div>` : "";
  return `<button class="phyto" data-phyto="${p.key}">
    <h3><span>${esc(p.name)}</span><span class="ev l${p.level}">${esc(p.evidence)}</span></h3>
    <div class="amount">${main}</div>
    ${bar(ratio, v > 0 ? "var(--accent)" : "var(--track)")}
    <div class="goal">${goal}</div>${extra}${gap}
    <div class="src">${esc(p.good.split(". ")[0])}.</div>
  </button>`;
}

function gapSection(t) {
  const open = SCORED.filter((n) => n.group !== "amino")
    .map((n) => ({ n, ratio: (t.sum[n.key] || 0) / ctx.targets[n.key] }))
    .filter((x) => x.ratio < 1)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 4);
  if (!open.length) return `<div class="card"><h2>Alle Ziele erreicht 🎉</h2><p class="muted small">Alle Vitamine, Mineralstoffe und essentiellen Nährstoffe sind gedeckt.</p></div>`;
  return `<div class="card gaps"><h2>Am meisten fehlt noch</h2>
    ${open.map(({ n, ratio }) => {
      const src = bestSources(n.key, 3);
      return `<div class="gap"><span class="gap-name">${esc(n.name)}</span><span class="gap-pct">${pct(ratio * 100)}</span>
        ${src.map((s) => `<button class="chip" data-add="${s.food.id}" data-tip="${esc(`${formatAmount(s.amount, s.food)} liefern ${fmt(s.per, n.unit)} ${n.name} (${pct((s.per / ctx.targets[n.key]) * 100)}) · ${num(s.kcal)} kcal`)}">+ ${esc(s.food.name)} <small>${pct((s.per / ctx.targets[n.key]) * 100)}</small></button>`).join("")}
      </div>`;
    }).join("")}
    <p class="group-note">Vorschläge pro üblicher Portion – Lebensmittel, die du oft isst, werden bevorzugt. Antippen fügt sie zur aktuellen Mahlzeit hinzu.</p>
  </div>`;
}

export function renderDashboard(root, day, range) {
  const keys = daysEnding(day, range);
  const t = range === 1 ? totals(entries(keys[0])) : rangeTotals(keys);
  const targets = targetsFor(state.profile);
  ctx = { t, targets, day, range, isToday: dayKey(day) === dayKey(new Date()) };

  const hasData = range === 1 ? entries(keys[0]).length > 0 : t.days > 0;
  if (!hasData) {
    root.innerHTML = `<div class="card empty-state"><div class="big-emoji">🥗</div>
      <h2>${range === 1 ? "Noch nichts eingetragen" : "Keine Einträge in diesem Zeitraum"}</h2>
      <p>Tippe links ein, was du gegessen hast – z. B. <b>„2 Eier“</b>, <b>„Haferflocken 60 g“</b> oder einfach <b>„Banane“</b>.<br>
      Die App merkt sich, was du oft isst, und schlägt es dir passend zur Tageszeit vor.</p></div>`;
    return;
  }

  const reached = SCORED.filter((n) => (t.sum[n.key] || 0) >= targets[n.key]).length;
  const microAvg = MICRO.reduce((s, n) => s + Math.min((t.sum[n.key] || 0) / targets[n.key], 1), 0) / MICRO.length;
  const phytoHit = PHYTO.filter((p) => phytoValue(p, t) > 0).length;
  const rangeTxt = range === 1 ? "" : ` <span class="muted small">(Ø aus ${t.days} ${t.days === 1 ? "Tag" : "Tagen"} mit Einträgen)</span>`;

  let html = `
  <div class="scorebar">
    <div class="stat" data-tip="Vitamine, Mineralstoffe, essentielle Fett- und Aminosäuren, Protein und Ballaststoffe"><div class="big">${reached} / ${SCORED.length}</div><div class="lbl">Ziele erreicht</div></div>
    <div class="stat" data-tip="Durchschnittliche Deckung aller Vitamine und Mineralstoffe (jeweils max. 100 % gezählt)"><div class="big">${pct(microAvg * 100)}</div><div class="lbl">Vitamine & Mineralstoffe gedeckt</div></div>
    <div class="stat" data-tip="Wie viele der ${PHYTO.length} gesundheitsfördernden Pflanzenstoff-Gruppen dabei waren"><div class="big">${phytoHit} / ${PHYTO.length}</div><div class="lbl">Pflanzenstoff-Gruppen</div></div>
  </div>
  <div class="card">
    <h2>Energie & Makronährstoffe${rangeTxt}</h2>
    <div class="overview">
      ${ring(t.sum.kcal || 0, targets.kcal)}
      <div class="macros">
        ${macroRow("Protein", "protein", t, "var(--s1)")}
        ${macroRow("Kohlenhydrate", "carbs", t, "var(--s2)")}
        ${macroRow("Fett", "fat", t, "var(--s3)")}
        ${macroRow("Ballaststoffe", "fiber", t, "var(--accent)")}
        <div class="macro-row" data-nut="water" style="cursor:pointer" data-tip="${esc(`Wasser aus Getränken und Essen: ${fmt(t.sum.water || 0, "ml")} von ${fmt(targets.water, "ml")}`)}">
          <span>Wasser</span>${bar((t.sum.water || 0) / targets.water, "var(--seq-3)")}<span class="val">${num((t.sum.water || 0) / 1000)} / ${num(targets.water / 1000)} l</span></div>
      </div>
    </div>
    ${energySplit(t)}
  </div>
  ${gapSection(t)}`;

  for (const g of ["vitamin", "mineral", "fett", "amino", "limit"]) {
    const list = NUTRIENTS.filter((n) => n.group === g);
    html += `<div class="card"><h2>${GROUPS[g]}</h2><div class="nut-grid">${list.map((n) => nutRow(n, t)).join("")}</div>
      ${g === "mineral" ? `<p class="group-note">Iod ist geschätzt (hängt stark von Jodsalz ab). ${NOT_TRACKED}</p>` : ""}
      ${g === "amino" ? `<p class="group-note">Bedarf nach WHO in mg pro kg Körpergewicht. Wer genug Protein aus abwechslungsreichen Quellen isst, deckt diese meist automatisch.</p>` : ""}
    </div>`;
  }

  html += `<div class="card"><h2>Sekundäre Pflanzenstoffe & bioaktive Stoffe</h2>
    <p class="muted small" style="margin-top:0">Keine offiziellen Tageswerte – die Orientierungswerte stammen aus Studien bzw. von der EFSA. Antippen für Details.</p>
    <div class="phyto-grid">${PHYTO.map((p) => phytoCard(p, t)).join("")}</div>
    <p class="group-note">${PHYTO_EXCLUDED}</p></div>`;

  root.innerHTML = html;
}

// ---------- Detail-Dialoge ----------
function sourceList(list, unit, total) {
  if (!list?.length) return `<p class="muted small">Heute noch keine Quelle.</p>`;
  return `<ul class="src-list">${list.sort((a, b) => b.amount - a.amount).slice(0, 8).map((c) =>
    `<li><span>${esc(c.food.name)}</span><span class="v">${fmt(c.amount, unit)} · ${pct((c.amount / total) * 100)}</span></li>`).join("")}</ul>`;
}

function suggestionList(key, unit, target, scale = 1) {
  const src = bestSources(key, 8);
  return `<ul class="src-list">${src.map((s) =>
    `<li><span>${esc(s.food.name)} <span class="muted small">${esc(formatAmount(s.amount, s.food))}</span></span>
     <span class="v">${fmt(s.per * scale, unit)}${target ? ` · ${pct((s.per * scale / target) * 100)}` : ""}<button class="add-btn" data-add="${s.food.id}">+ hinzufügen</button></span></li>`).join("")}</ul>`;
}

export function openNutrient(key) {
  const n = byKey[key];
  const { t, targets } = ctx;
  const v = t.sum[key] || 0, target = targets[key];
  const st = status(n, v / target, n.ul && (t.sum[n.ulKey || key] || 0) > n.ul);
  const contribKey = key === "metcys" ? "met" : key === "phetyr" ? "phe" : key;
  const d = openSheet("detailDialog", `
    <div class="sheet-head"><h2>${esc(n.name)}</h2><button class="close" data-close aria-label="Schließen">×</button></div>
    <p><b style="font-size:1.3rem">${pct((v / target) * 100)}</b> · ${fmt(v, n.unit)} von ${n.kind === "max" ? "max." : n.kind === "info" ? "ca." : ""} ${fmt(target, n.unit)} – ${st.label}</p>
    ${bar(v / target, st.color)}
    <p class="small muted">Referenz: ${esc(n.src)}${n.ul ? ` · Tolerierbare Höchstmenge (EFSA): ${fmt(n.ul, n.unit)}${n.ulKey === "retinol" ? " (nur tierisches Retinol)" : ""}` : ""}</p>
    ${n.info ? `<p>${esc(n.info)}</p>` : ""}
    ${t.gaps[key] ? `<p class="small">⚠ Für ${Math.round(t.gaps[key] * 100)} % der gegessenen Kalorien enthält die Datenbank keinen Wert – der echte Wert liegt wahrscheinlich höher.</p>` : ""}
    <h3>${ctx.range === 1 ? "Deine Quellen" : "Deine Quellen (Ø pro Tag)"}</h3>
    ${sourceList(t.contrib[contribKey], n.unit, t.sum[contribKey] || v)}
    ${n.kind !== "max" && n.group !== "limit" ? `<h3>Gute Quellen (pro Portion)</h3>${suggestionList(key, n.unit, target)}` : ""}
  `);
  bindAdd(d);
}

export function openPhyto(key) {
  const p = PHYTO.find((x) => x.key === key);
  const { t } = ctx;
  const scale = p.scale || 1;
  const v = phytoValue(p, t);
  const contrib = (t.contrib[key] || []).map((c) => ({ ...c, amount: c.amount * scale }));
  const sub = p.sub ? `<h3>Untergruppen</h3><ul class="src-list">${p.sub.map((x) =>
    `<li><span><b>${esc(x.name)}</b><br><span class="small muted">${esc(x.good)}</span></span><span class="v">${fmt(t.sum[x.key] || 0, "mg")}</span></li>`).join("")}</ul>` : "";
  const d = openSheet("detailDialog", `
    <div class="sheet-head"><h2>${esc(p.name)}</h2><button class="close" data-close aria-label="Schließen">×</button></div>
    <p><span class="ev l${p.level}">${esc(p.evidence)}</span></p>
    <p><b style="font-size:1.3rem">${fmt(v, p.unit)}</b>${p.goal ? ` von ${fmt(p.goal, p.unit)} (${esc(p.goalNote || "Ziel")})` : p.goalNote ? ` · ${esc(p.goalNote)}` : ""}</p>
    <h3>Wofür gut?</h3><p>${esc(p.good)}</p>
    <p class="small muted">Typische Quellen: ${esc(p.sources)}</p>
    ${sub}
    <h3>${ctx.range === 1 ? "Deine Quellen" : "Deine Quellen (Ø pro Tag)"}</h3>
    ${sourceList(contrib, p.unit, v)}
    <h3>Gute Quellen (pro Portion)</h3>${suggestionList(key, p.unit, p.goal, scale)}
  `);
  bindAdd(d);
}

function bindAdd(root) {
  root.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => {
    const f = foods.get(b.dataset.add);
    onAdd(f, defaultAmount(f));
    b.textContent = "✓";
    b.disabled = true;
  }));
}

export function bindDashboard(root) {
  root.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) {
      const f = foods.get(add.dataset.add);
      onAdd(f, defaultAmount(f));
      return;
    }
    const nut = e.target.closest("[data-nut]");
    if (nut) return openNutrient(nut.dataset.nut);
    const ph = e.target.closest("[data-phyto]");
    if (ph) return openPhyto(ph.dataset.phyto);
  });
}

// Nährstoffprofil eines einzelnen Lebensmittels (für Lebensmittel-Tab und Tagebuch)
export function openFood(f, amount = defaultAmount(f)) {
  const targets = targetsFor(state.profile);
  const g = amount.grams;
  const rows = NUTRIENTS.filter((n) => n.kind !== "info" && n.group !== "amino" && f.n[n.key] != null && n.key !== "kcal")
    .map((n) => ({ n, v: (f.n[n.key] * g) / 100 }))
    .map((x) => ({ ...x, r: x.v / targets[x.n.key] }))
    .sort((a, b) => b.r - a.r);
  const phyto = PHYTO.filter((p) => (f.n[p.key] || 0) > 0)
    .map((p) => `<li><span>${esc(p.name)}</span><span class="v">${fmt((f.n[p.key] * g / 100) * (p.scale || 1), p.unit)}</span></li>`).join("");
  const d = openSheet("detailDialog", `
    <div class="sheet-head"><h2>${esc(f.name)}</h2><button class="close" data-close aria-label="Schließen">×</button></div>
    <p class="small muted">${esc(formatAmount(amount, f))} · ${num((f.n.kcal || 0) * g / 100)} kcal · Quelle: ${esc(f.src || "")}${f.usda ? " (USDA, US-Produkt – ggf. angereichert)" : ""}</p>
    <p><button class="btn primary small" data-add="${f.id}">+ Zur aktuellen Mahlzeit</button></p>
    <h3>Anteil am Tagesbedarf (diese Portion)</h3>
    <div>${rows.map(({ n, v, r }) => {
      const st = status(n, r, false);
      return `<div class="macro-row" data-tip="${esc(`${n.name}: ${fmt(v, n.unit)}`)}"><span class="small">${esc(n.name)}</span>${bar(r, n.kind === "max" ? "var(--serious)" : st.color === "var(--good)" ? "var(--good)" : "var(--accent)")}<span class="val">${pct(r * 100)}</span></div>`;
    }).join("")}</div>
    ${phyto ? `<h3 style="margin-top:.8rem">Pflanzenstoffe</h3><ul class="src-list">${phyto}</ul>` : ""}
  `);
  bindAdd(d);
}

export { energyTarget };
