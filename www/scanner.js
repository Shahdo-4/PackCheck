// Product lookup + barcode detection. Every function fails safely.
function findByBarcode(code) {
  const c = String(code || "").replace(/\D/g, "");
  return PRODUCTS.find(p => p.barcode === c) || null;
}

// Guess the product from a file name like "peanut_butter.jpg".
function findByName(name) {
  const n = String(name || "").toLowerCase().replace(/[_-]+/g, " ");
  return PRODUCTS.find(p => p.keywords.some(k => n.includes(k))) || null;
}

// Uses the BarcodeDetector API when the browser has it; otherwise reports "unsupported".
async function detectBarcode(file) {
  if (!("BarcodeDetector" in window)) return {supported: false, code: null};
  try {
    const bitmap = await createImageBitmap(file);
    const found = await new BarcodeDetector().detect(bitmap);
    return {supported: true, code: found[0] ? found[0].rawValue : null};
  } catch (e) {
    return {supported: true, code: null};
  }
}
