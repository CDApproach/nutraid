// Barcode-Scanner über die Kamera.
// Nutzt den eingebauten BarcodeDetector, wenn der Browser ihn wirklich kann (auf GrapheneOS/Vanadium
// ohne Google-Dienste meist nicht) – sonst die mitgelieferte ZXing-Bibliothek (wird erst bei Bedarf geladen).
import { $, openSheet } from "./ui.js";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

export const canScan = () => !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

let zxingLoad;
function loadZxing() {
  zxingLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "js/vendor/zxing.min.js";
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => { zxingLoad = null; reject(new Error("ZXing nicht geladen")); };
    document.head.append(s);
  });
  return zxingLoad;
}

async function nativeDetector() {
  if (!("BarcodeDetector" in window)) return null;
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (!formats.includes("ean_13")) return null;
    const det = new BarcodeDetector({ formats });
    return async (video) => (await det.detect(video))[0]?.rawValue || null;
  } catch {
    return null;
  }
}

async function zxingDetector() {
  const Z = await loadZxing();
  const hints = new Map([
    [Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]],
    [Z.DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return null;
    // Nur den mittleren Streifen auswerten – dort liegt der Rahmen, und es geht deutlich schneller
    const sh = Math.min(vh, vw * 0.6), sy = (vh - sh) / 2;
    const w = Math.min(vw, 1000), h = Math.round(sh * (w / vw));
    canvas.width = w; canvas.height = h;
    ctx.drawImage(video, 0, sy, vw, sh, 0, 0, w, h);
    try {
      const src = new Z.HTMLCanvasElementLuminanceSource(canvas);
      return reader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(src))).getText();
    } catch {
      return null; // in diesem Bild kein Barcode
    } finally {
      reader.reset();
    }
  };
}

/** Öffnet die Kamera und liefert den ersten erkannten Barcode (oder null bei Abbruch). */
export function scanBarcode() {
  return new Promise((resolve) => {
    const d = openSheet("scanDialog", `
      <div class="sheet-head"><h2>Barcode scannen</h2><button class="close" data-close aria-label="Schließen">×</button></div>
      <div class="scan-view">
        <video id="scanVideo" playsinline muted></video>
        <div class="scan-frame" aria-hidden="true"></div>
      </div>
      <p class="small muted" id="scanHint">Kamera wird gestartet …</p>
      <div class="row-btns"><button class="btn" type="button" id="scanTorch" hidden>Licht an</button>
        <button class="btn" type="button" data-close>Abbrechen</button></div>`);
    const video = $("#scanVideo", d), hint = $("#scanHint", d);
    let stream, done = false, timer;

    // Ein verspätetes close-Event eines vorherigen Scans darf diesen hier nicht beenden
    const onClose = () => { if (!d.open) finish(null); };
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      d.removeEventListener("close", onClose);
      stream?.getTracks().forEach((t) => t.stop());
      if (d.open) d.close();
      resolve(code);
    };
    d.addEventListener("close", onClose);

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch (err) {
        hint.textContent = err?.name === "NotAllowedError"
          ? "Kein Zugriff auf die Kamera. Erlaube ihn in den Browser- bzw. App-Einstellungen und versuch es noch mal."
          : "Die Kamera lässt sich nicht starten. Du kannst die Nummer unter dem Barcode auch abtippen.";
        return;
      }
      if (done) return stream.getTracks().forEach((t) => t.stop());
      video.srcObject = stream;
      await video.play().catch(() => {});

      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() || {};
      if (caps.torch) {
        const btn = $("#scanTorch", d);
        let on = false;
        btn.hidden = false;
        btn.onclick = async () => {
          on = !on;
          await track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
          btn.textContent = on ? "Licht aus" : "Licht an";
        };
      }
      if (caps.focusMode?.includes("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});

      let detect = await nativeDetector();
      if (!detect) {
        try { detect = await zxingDetector(); }
        catch { hint.textContent = "Der Scanner konnte nicht geladen werden. Bitte einmal mit Internet öffnen."; return; }
      }
      hint.textContent = "Halte den Barcode in den Rahmen.";
      const tick = async () => {
        if (done) return;
        const code = await detect(video).catch(() => null);
        if (code && /^\d{8,14}$/.test(code)) {
          navigator.vibrate?.(60);
          return finish(code);
        }
        timer = setTimeout(tick, 120);
      };
      tick();
    })();
  });
}
