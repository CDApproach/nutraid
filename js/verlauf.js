// Verlauf: Energie-Balken pro Tag und Heatmap der Nährstoffabdeckung.
import { NUTRIENTS, targetsFor } from "./referenz.js";
import { state, totals, entries } from "./daten.js";
import { daysEnding } from "./dashboard.js";
import { esc, num, pct } from "./ui.js";

const HEAT_KEYS = ["protein", "fiber", "vitA", "vitD", "vitE", "vitK", "vitC", "b1", "b2", "niacinNE", "b6", "folate", "b12",
  "ca", "mg", "k", "fe", "zn", "se", "iod", "ala", "epadha"];
const STEPS = [[0.25, "var(--seq-1)"], [0.5, "var(--seq-2)"], [0.75, "var(--seq-3)"], [1, "var(--seq-4)"], [Infinity, "var(--seq-5)"]];

const shortDate = (k) => {
  const [, m, d] = k.split("-");
  return `${+d}.${+m}.`;
};

export function renderVerlauf(days) {
  const keys = daysEnding(new Date(), days);
  const targets = targetsFor(state.profile);
  const data = keys.map((k) => ({ k, n: entries(k).length, t: totals(entries(k)) }));
  renderKcal(data, targets.kcal);
  renderHeat(data, targets);
}

function renderKcal(data, target) {
  const el = document.getElementById("kcalChart");
  const W = Math.max(el.clientWidth || 320, data.length * 8 + 52), H = 220, pad = { l: 44, r: 8, t: 12, b: 26 };
  const top = Math.max(target * 1.15, ...data.map((d) => d.t.kcal));
  const tickStep = top > 4000 ? 1000 : 500;
  const max = Math.ceil(top / tickStep) * tickStep;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const bw = Math.min(18, (W - pad.l - pad.r) / data.length - 4);
  const step = (W - pad.l - pad.r) / data.length;
  const ticks = [];
  for (let v = 0; v <= max; v += max / tickStep > 6 ? tickStep * 2 : tickStep) ticks.push(v);
  const labelEvery = Math.ceil(44 / step);
  let svg = `<svg width="${W}" height="${H}" role="img" aria-label="Kalorien pro Tag">`;
  for (const v of ticks) {
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" stroke-width="1"/>
      <text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${num(v)}</text>`;
  }
  data.forEach((d, i) => {
    const x = pad.l + i * step + (step - bw) / 2;
    const h = H - pad.b - y(d.t.kcal);
    const tip = d.n ? `<b>${shortDate(d.k)}</b><br>${num(d.t.kcal)} kcal (${pct((d.t.kcal / target) * 100)} des Ziels)<br>Protein ${num(d.t.sum.protein || 0)} g · Ballaststoffe ${num(d.t.sum.fiber || 0)} g` : `<b>${shortDate(d.k)}</b><br>keine Einträge`;
    svg += `<g data-tip="${esc(tip)}"><rect x="${pad.l + i * step}" y="${pad.t}" width="${step}" height="${H - pad.t - pad.b}" fill="transparent"/>`;
    if (d.n) svg += `<path d="M${x},${H - pad.b} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z" fill="var(--s1)"/>`;
    svg += `</g>`;
    if (i % labelEvery === 0) svg += `<text x="${pad.l + i * step + step / 2}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${shortDate(d.k)}</text>`;
  });
  svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(target)}" y2="${y(target)}" stroke="var(--text-2)" stroke-dasharray="4 3" stroke-width="1.5"/>
    <text x="${W - pad.r}" y="${y(target) - 5}" text-anchor="end" font-size="11" fill="var(--text-2)">Ziel ${num(target)} kcal</text></svg>`;
  el.innerHTML = svg;
}

function renderHeat(data, targets) {
  const byKey = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));
  const labelEvery = Math.ceil(data.length / 7);
  let html = `<table class="heatmap"><thead><tr><th></th>${data.map((d, i) => `<th${i % labelEvery === 0 ? ` colspan="1" style="text-align:left;white-space:nowrap;overflow:visible;max-width:22px"` : ""}>${i % labelEvery === 0 ? shortDate(d.k) : ""}</th>`).join("")}</tr></thead><tbody>`;
  for (const k of HEAT_KEYS) {
    const n = byKey[k];
    html += `<tr><th>${esc(n.name.replace(/ \(.*\)/, ""))}</th>`;
    for (const d of data) {
      if (!d.n) { html += `<td style="background:var(--surface-2)" data-tip="${shortDate(d.k)}: keine Einträge"></td>`; continue; }
      const r = (d.t.sum[k] || 0) / targets[k];
      const col = STEPS.find(([lim]) => r < lim)[1];
      html += `<td style="background:${col}" data-tip="${esc(`<b>${n.name}</b> · ${shortDate(d.k)}<br>${num(d.t.sum[k] || 0)} ${n.unit} = ${pct(r * 100)}`)}"></td>`;
    }
    html += `</tr>`;
  }
  document.getElementById("heatmap").innerHTML = html + `</tbody></table>`;
  document.getElementById("heatLegend").innerHTML = `<span>Abdeckung:</span>` +
    [["< 25 %", 0], ["25–50 %", 1], ["50–75 %", 2], ["75–100 %", 3], ["≥ 100 %", 4]].map(([l, i]) => `<span><i style="background:${STEPS[i][1]}"></i> ${l}</span>`).join("") +
    `<span><i style="background:var(--surface-2)"></i> kein Eintrag</span>`;
}
