// Kleine DOM- und Formatierungshelfer.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const nf = (d) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
export function num(v) {
  if (v == null || isNaN(v)) return "–";
  const a = Math.abs(v);
  return nf(a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 1 : a >= 0.1 ? 2 : 3).format(v);
}
export const fmt = (v, unit) => `${num(v)} ${unit}`;
export const pct = (v) => (v == null || !isFinite(v) ? "–" : `${Math.round(v)} %`);

// Status einer Abdeckung (Farbe wird immer zusammen mit der Prozentzahl gezeigt)
export function status(nut, ratio, ulExceeded) {
  if (ulExceeded) return { color: "var(--critical)", label: "über der Höchstmenge" };
  if (nut.kind === "info") return { color: "var(--seq-3)", label: "Orientierung" };
  if (nut.kind === "max") {
    if (ratio > 1) return { color: "var(--critical)", label: "über dem Grenzwert" };
    if (ratio > 0.8) return { color: "var(--warning)", label: "nahe am Grenzwert" };
    return { color: "var(--good)", label: "im Rahmen" };
  }
  if (ratio >= 1) return { color: "var(--good)", label: "gedeckt" };
  if (ratio >= 0.5) return { color: "var(--warning)", label: "teilweise gedeckt" };
  return { color: "var(--serious)", label: "deutlich zu wenig" };
}

// ---------- Tooltip ----------
const tip = () => document.getElementById("tooltip");
export function initTooltips() {
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t) return;
    const el = tip();
    el.innerHTML = t.dataset.tip;
    el.hidden = false;
    position(e);
  });
  document.addEventListener("pointermove", (e) => {
    if (!tip().hidden) position(e);
  });
  document.addEventListener("pointerout", (e) => {
    const t = e.target.closest("[data-tip]");
    if (t && !t.contains(e.relatedTarget)) tip().hidden = true;
  });
  document.addEventListener("scroll", () => (tip().hidden = true), true);
}
function position(e) {
  const el = tip();
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  el.style.left = Math.max(8, x) + "px";
  el.style.top = Math.max(8, y) + "px";
}

// ---------- Toast ----------
let toastTimer;
export function toast(text, action, onAction) {
  const el = document.getElementById("toast");
  el.innerHTML = `<span>${text}</span>` + (action ? `<button>${esc(action)}</button>` : "");
  el.hidden = false;
  if (action) el.querySelector("button").onclick = () => { el.hidden = true; onAction(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 5000);
}

export function openSheet(id, html) {
  const d = document.getElementById(id);
  d.innerHTML = `<div class="sheet-inner">${html}</div>`;
  d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => d.close()));
  if (!d.open) d.showModal();
  d.onclick = (e) => { if (e.target === d) d.close(); };
  return d;
}

export function dayLabel(d) {
  const today = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5);
  if (diff === 0) return "Heute";
  if (diff === -1) return "Gestern";
  if (diff === 1) return "Morgen";
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
}
