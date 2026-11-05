// Optional OCR. Tesseract.js loads only when needed, so the app works without it.
// For offline OCR, put tesseract.min.js in a lib/ folder (see README note in chat).
const OCR_SOURCES = ["lib/tesseract.min.js", "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(s);
  });
}

async function ensureTesseract() {
  if (window.Tesseract) return;
  for (const src of OCR_SOURCES) {
    try { await loadScript(src); if (window.Tesseract) return; } catch (e) { /* try next source */ }
  }
  throw new Error("OCR library unavailable");
}

async function readIngredientsFromImage(file, onProgress) {
  await ensureTesseract();
  const result = await Tesseract.recognize(file, "eng", {
    logger: m => { if (m.status === "recognizing text" && onProgress) onProgress(Math.round(m.progress * 100)); }
  });
  return result.data.text;
}
