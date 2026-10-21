// Installierbare App: Service Worker, dauerhafter Speicher, Installationsknopf und Update-Hinweis.
import { state } from "./daten.js";
import { $, toast } from "./ui.js";

let installEvent = null;

export function initPwa() {
  registerWorker();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e;
    renderAppInfo();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    toast("App installiert – du findest „NutrAid“ jetzt bei deinen Apps");
    requestPersistence().then(renderAppInfo);
  });
}

async function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    const offerUpdate = (worker) => toast("Neue Version verfügbar", "Neu laden", () => worker.postMessage("skipWaiting"), true);
    const watch = (w) => w?.addEventListener("statechange", () => {
      if (w.state === "installed" && navigator.serviceWorker.controller) offerUpdate(w);
    });
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    watch(reg.installing);
    reg.addEventListener("updatefound", () => watch(reg.installing));
    // Nur nach einem Update neu laden, nicht bei der allerersten Installation
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !reloading) { reloading = true; location.reload(); }
    });
    // Beim Zurückkehren in die App nach Updates schauen
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  } catch { /* z. B. in privaten Fenstern nicht verfügbar */ }
}

// Ohne "persistent" darf der Browser die Daten bei Speicherknappheit löschen
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

const isStandalone = () => matchMedia("(display-mode: standalone)").matches;

export async function renderAppInfo() {
  const el = $("#appInfo");
  if (!el) return;
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const days = state.lastBackup ? Math.floor((Date.now() - state.lastBackup) / 864e5) : null;
  const lines = [];
  lines.push(isStandalone()
    ? "✓ Läuft als installierte App."
    : installEvent
      ? `<button class="btn primary" id="installBtn">App installieren</button>`
      : "Installieren: im Browsermenü (⋮) „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.");
  lines.push(persisted
    ? "✓ Dauerhafter Speicher aktiv – der Browser löscht deine Einträge nicht von selbst."
    : `Speicher ist nicht dauerhaft geschützt. <button class="btn small" id="persistBtn">Schutz anfordern</button>`);
  lines.push(days == null ? "Noch keine Sicherung heruntergeladen." : `Letzte Sicherung: ${days === 0 ? "heute" : days === 1 ? "gestern" : `vor ${days} Tagen`}.`);
  el.innerHTML = lines.map((l) => `<p class="small">${l}</p>`).join("");
  $("#installBtn")?.addEventListener("click", async () => {
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    renderAppInfo();
  });
  $("#persistBtn")?.addEventListener("click", async () => {
    const ok = await requestPersistence();
    toast(ok ? "Speicher ist jetzt dauerhaft geschützt" : "Der Browser hat abgelehnt – installiere die App, dann klappt es meist automatisch");
    renderAppInfo();
  });
}

// Erinnerung, wenn lange keine Sicherung gemacht wurde (höchstens einmal pro Woche)
export function backupReminder(goToProfile) {
  const entries = Object.keys(state.log).length;
  const last = state.lastBackup || 0;
  const lastAsk = state.lastBackupAsk || 0;
  if (entries < 7 || Date.now() - last < 30 * 864e5 || Date.now() - lastAsk < 7 * 864e5) return;
  state.lastBackupAsk = Date.now();
  toast("Deine letzte Sicherung ist über 30 Tage her.", "Jetzt sichern", goToProfile);
}
