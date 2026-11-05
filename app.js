// UI layer: screens, navigation, storage. All decisions come from analysis.js.
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const cap = s => s[0].toUpperCase() + s.slice(1);
const DIETS = [["none", "None"], ["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["halal", "Halal"]];
const ALLERGIES = ["peanuts", "milk", "soy", "eggs", "gluten"];
const SPICES = [["love", "Love spicy"], ["medium", "Medium"], ["avoid", "Avoid spicy"]];
const SPICE_LABEL = ["Not spicy", "Mild", "Medium", "Hot"];
const STATUS = {
  good: ["GOOD MATCH", "Matches your selected preferences.", "✓"],
  check: ["CHECK CAREFULLY", "A few things deserve a closer look.", "!"],
  "not-match": ["NOT A MATCH", "This product conflicts with some of your preferences.", "✕"]
};
const SHORT = {good: "Good", check: "Check", "not-match": "Not suitable"};

// localStorage wrapper that never throws (private mode etc.)
const store = {
  get(k, d) { try { const v = localStorage.getItem("pc_" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("pc_" + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
};

let prefs = store.get("prefs", {diet: "none", allergies: [], spice: "medium"});
let cmp = store.get("cmp", {a: "p1", b: "p10"});
let draft, current = null, screen = "home", hist = [], animTk = 0;
let preview = "", scanMsg = "", ocrText = "", ocrMsg = "Upload a photo of the ingredients label.";
const SCAN_HINT = "Upload a photo, type a barcode, or try a demo product.";

// ---------- small building blocks ----------
const byId = id => PRODUCTS.find(p => p.id === id);
const chip = (t, cls = "") => `<span class="chip ${cls}">${esc(t)}</span>`;
const tile = p => `<span class="tile" style="background:${p.image.color}26">${p.image.emoji}</span>`;
const topBar = (t, back = true) => `<div class="top">${back ? '<button class="back" data-act="back" aria-label="Back">‹</button>' : ""}<h2>${t}</h2></div>`;
const dots = n => `<div class="dots">${[1, 2, 3].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")} <span class="muted small">${SPICE_LABEL[n]}</span></div>`;
const bar = (l, v, max, u, cls = "") => `<div class="bar"><div class="kv"><span>${l}</span><b>${v} ${u}</b></div><div class="track"><i class="${cls}" style="width:${Math.min(100, v / max * 100)}%"></i></div></div>`;
const dietPills = p => ["vegetarian", "vegan", "halal"].map(k => `<span class="pill ${p.diet[k] ? "good" : "not-match"}">${p.diet[k] ? "✓" : "✕"} ${cap(k)}</span>`).join(" ");

function item(p) {
  const r = analyseProduct(p, prefs);
  return `<button class="item" data-act="open" data-arg="${p.id}">${tile(p)}<div class="grow"><b>${esc(p.name)}</b>
  <div class="chips">${chip("Cal: " + p.nutrition.cal)}${chip("Sugar: " + p.nutrition.sugar + "g")}</div></div>
  <span class="pill ${r.status}">${SHORT[r.status]}</span></button>`;
}

// ---------- screens ----------
function homeView() {
  const recent = store.get("recent", []).map(byId).filter(Boolean);
  return `<section class="hero"><small>PackCheck</small><h1>Know What You're Buying.</h1>
  <p>Scan a packaged product and instantly understand what matters to you.</p>
  <div class="row"><button class="btn white" data-act="go" data-arg="scan">Scan Product</button><button class="btn outline" data-act="go" data-arg="compare">Compare Products</button></div></section>
  <div class="pad"><div class="grid3">${[["🧠", "Smart Analysis"], ["🧪", "Ingredient Check"], ["⚖️", "Product Comparison"]].map(f => `<div class="card feat"><span>${f[0]}</span>${f[1]}</div>`).join("")}</div>
  <h3>How it works</h3><div class="card steps3">${["Scan", "Analyse", "Understand"].map((s, i) => `<div><i>${i + 1}</i>${s}</div>`).join("")}</div>
  <h3>Recent Scans</h3>${recent.length ? recent.map(item).join("") : '<div class="card muted">No scans yet. Try a demo product!</div>'}</div>`;
}

function prefsView() {
  const c = (on, arg, t) => `<button class="chip sel ${on ? "on" : ""}" data-act="pref" data-arg="${arg}">${t}</button>`;
  return topBar("Preferences") + `<div class="pad"><h3>Diet</h3><div class="chips">${DIETS.map(d => c(draft.diet === d[0], "diet:" + d[0], d[1])).join("")}</div>
  <h3>Allergies</h3><div class="chips">${ALLERGIES.map(a => c(draft.allergies.includes(a), "allergy:" + a, cap(a))).join("")}</div>
  <h3>Spice preference</h3><div class="chips">${SPICES.map(s => c(draft.spice === s[0], "spice:" + s[0], s[1])).join("")}</div>
  <button class="btn wide" data-act="savePrefs">Save Preferences</button></div>`;
}

function scanView() {
  return topBar("Scan Product", false) + `<div class="finder"><div class="fin">${preview || '<div class="bars"></div>'}</div>
  <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><span class="line"></span></div>
  <div class="pad"><p id="scanMsg" class="center muted">${esc(scanMsg || SCAN_HINT)}</p>
  <label class="btn wide">Upload Product / Barcode Image<input type="file" accept="image/*" hidden data-file="product"></label>
  <div class="manual"><input id="code" inputmode="numeric" placeholder="Enter barcode manually"><button class="btn" data-act="lookup">Find</button></div>
  <button class="btn wide dark" data-act="demo">Try Demo Product</button>
  <button class="btn wide ghost" data-act="go" data-arg="ocr">Scan Ingredients</button>
  <h3>Demo Products</h3><div class="scroll">${PRODUCTS.map(p => `<button class="chip sel" data-act="open" data-arg="${p.id}">${p.image.emoji} ${esc(p.name)}</button>`).join("")}</div></div>`;
}

function ocrView() {
  return topBar("Scan Ingredients") + `<div class="pad"><div class="card"><p class="muted">Upload a photo of the ingredients label. Reading happens on your device.</p>
  <label class="btn wide">Upload Ingredients Photo<input type="file" accept="image/*" hidden data-file="ocr"></label>
  <p id="ocrStatus" class="muted small" style="margin-top:10px">${esc(ocrMsg)}</p></div>
  <h3>Ingredient text</h3><textarea id="ocrText" rows="6" placeholder="Or type ingredients here, e.g. wheat flour, palm oil, milk powder, salt">${esc(ocrText)}</textarea>
  <button class="btn wide" data-act="analyseText">Analyse Ingredients</button></div>`;
}

function analysisView() {
  return `<div class="pad center"><div class="spin"></div><h2>Smart Analysis</h2><div class="card">${["Reading product information", "Checking ingredients", "Matching preferences", "Preparing smart analysis"].map(s => `<div class="step"><i>✓</i>${s}</div>`).join("")}</div></div>`;
}

function resultView() {
  const p = current, r = analyseProduct(p, prefs), S = STATUS[r.status], n = p.nutrition;
  const list = (arr, ic, cls) => arr.map(t => `<li class="${cls}"><b>${ic}</b>${esc(t)}</li>`).join("");
  const nutrition = n ? `<div class="sub">Negatives</div>${bar("Sugar", n.sugar, 50, "g", "bad")}${bar("Fat", n.fat, 40, "g", "bad")}${bar("Salt", n.salt, 3, "g", "bad")}
    <div class="sub">Positives</div>${bar("Protein", n.protein, 30, "g")}${bar("Energy", n.cal, 600, "kcal")}<p class="muted small">Per 100 g / 100 ml</p>`
    : '<p class="muted">Nutrition isn\'t available for scanned text.</p>';
  return topBar("Scan Result") + `<div class="pad"><div class="banner ${r.status}"><span class="big">${S[2]}</span><div><h2>${S[0]}</h2><p>${S[1]}</p></div><div class="score">${r.score}<small>/100</small></div></div>
  <div class="card prod">${tile(p)}<div><b>${esc(p.name)}</b><div class="muted small">${esc(p.brand)} · ${esc(p.category)}</div><p>${esc(p.description)}</p></div></div>
  <div class="card"><h3 style="margin-top:0">Smart reasons</h3><ul class="reasons">${list(r.reasons, "✕", "bad")}${list(r.cautions, "!", "warn")}${list(r.positives, "✓", "ok")}</ul>
  <details><summary>How the score is calculated</summary>${r.breakdown.map(b => `<div class="kv"><span>${esc(b.label)}</span><b>${b.pts}</b></div>`).join("") || '<div class="muted">No deductions.</div>'}
  <p class="muted small">Starts at 100. A preference-matching score, not medical advice.</p></details></div>
  <div class="card"><h3 style="margin-top:0">Ingredients</h3><div class="chips">${p.ingredients.map(i => chip(cap(i))).join("")}</div></div>
  <div class="card"><h3 style="margin-top:0">Allergens</h3><div class="chips">${p.allergens.length ? p.allergens.map(a => chip(cap(a), prefs.allergies.includes(a) ? "bad" : "")).join("") : '<span class="muted">None declared</span>'}</div></div>
  <div class="card"><h3 style="margin-top:0">Nutrition</h3>${nutrition}</div>
  <div class="card"><h3 style="margin-top:0">Diet compatibility</h3><div class="chips">${dietPills(p)}</div></div>
  <div class="card"><h3 style="margin-top:0">Spice level</h3>${dots(p.spiceLevel)}</div>
  <button class="btn wide" data-act="go" data-arg="compare">Compare with another product</button></div>`;
}

function compareView() {
  const a = byId(cmp.a), b = byId(cmp.b), c = compareProducts(a, b, prefs);
  const sel = (id, k) => `<select data-sel="${k}" aria-label="Product ${k.toUpperCase()}">${PRODUCTS.map(p => `<option value="${p.id}" ${p.id === id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`;
  const side = f => `<div class="two"><div>${f(a, c.ra, "a")}</div><div>${f(b, c.rb, "b")}</div></div>`;
  const duo = (label, k, u, lowerBetter) => {
    const x = a.nutrition[k], y = b.nutrition[k], m = Math.max(x, y, 1);
    const w = x === y ? 0 : (lowerBetter ? x < y : x > y) ? 1 : 2; // 1 = A better, 2 = B better
    const one = (v, i) => `<div class="track"><i class="${!w || w === i ? "" : "dim"}" style="width:${v / m * 100}%"></i></div><small>${v} ${u}</small>`;
    return `<div class="card"><b>${label}</b><div class="two"><div>${one(x, 1)}</div><div>${one(y, 2)}</div></div></div>`;
  };
  const row = (label, f) => `<div class="card"><b>${label}</b>${side(f)}</div>`;
  return topBar("Smart Comparison", false) + `<div class="pad"><div class="two" style="margin-top:0">${sel(cmp.a, "a")}${sel(cmp.b, "b")}</div>
  <div class="card">${side((p, r, k) => `<div class="cmpHead">${tile(p)}<b>${esc(p.name)}</b><div class="big2 ${r.status}">${r.score}</div><span class="pill ${r.status}">${c.winner === k ? "★ Better match" : SHORT[r.status]}</span></div>`)}</div>
  <div class="card verdict"><h3 style="margin-top:0">Smart verdict</h3><p>${esc(c.text)}</p></div>
  ${duo("Sugar (lower is better)", "sugar", "g", true)}${duo("Calories (lower is better)", "cal", "kcal", true)}${duo("Protein (higher is better)", "protein", "g", false)}
  ${row("Allergens", p => p.allergens.length ? p.allergens.map(x => chip(x, prefs.allergies.includes(x) ? "bad" : "")).join("") : '<span class="muted">None</span>')}
  ${row("Diet compatibility", p => `<div class="chips">${dietPills(p)}</div>`)}
  ${row("Spice level", p => dots(p.spiceLevel))}
  ${row("Ingredient concerns", (p, r) => r.concerns.length ? r.concerns.map(x => chip(x)).join("") : '<span class="muted">None</span>')}
  ${row("Score breakdown", (p, r) => r.breakdown.map(x => `<div class="kv"><span>${esc(x.label)}</span><b>${x.pts}</b></div>`).join("") || '<span class="muted">No deductions</span>')}
  <p class="muted small center" style="margin-top:12px">Scores start at 100 and show preference matching only. They are not medical advice.</p></div>`;
}

function profileView() {
  const spice = SPICES.find(s => s[0] === prefs.spice)[1];
  return topBar("Profile", false) + `<div class="pad"><div class="card"><h3 style="margin-top:0">Your preferences</h3>
  <div class="chips">${chip("Diet: " + cap(prefs.diet))}${chip("Spice: " + spice)}${prefs.allergies.map(a => chip("No " + a)).join("")}</div>
  <button class="btn wide" data-act="go" data-arg="prefs">Edit Preferences</button></div>
  <button class="btn wide ghost" data-act="clearRecent">Clear Recent Scans</button>
  <div class="card"><h3 style="margin-top:0">About PackCheck</h3><p class="muted">PackCheck uses a local rule-based engine, not artificial intelligence. Your preferences and scans stay on this device. Results are for product-preference matching only and are not medical advice.</p></div></div>`;
}

// ---------- navigation ----------
const VIEWS = {home: homeView, prefs: prefsView, scan: scanView, ocr: ocrView, analysis: analysisView, result: resultView, compare: compareView, profile: profileView};
const NAVMAP = {home: "home", scan: "scan", ocr: "scan", analysis: "scan", result: "scan", compare: "compare", prefs: "profile", profile: "profile"};

function render() {
  $("#app").innerHTML = `<div class="screen">${VIEWS[screen]()}</div>`;
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.arg === NAVMAP[screen]));
}

function go(name, replace) {
  if (!replace && name !== screen) hist = hist.concat(screen).slice(-20);
  screen = name;
  if (name === "prefs") draft = JSON.parse(JSON.stringify(prefs));
  if (name === "scan") { preview = ""; scanMsg = ""; }
  render();
  $("#app").scrollTop = 0;
  if (name === "analysis") runAnalysis();
}

// Short animated analysis, then jump to the result.
function runAnalysis() {
  const tk = ++animTk;
  document.querySelectorAll(".step").forEach((el, i) => setTimeout(() => { if (tk === animTk) el.classList.add("done"); }, 350 * (i + 1)));
  setTimeout(() => { if (tk === animTk && screen === "analysis") go("result", true); }, 1900);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800);
}

function addRecent(id) {
  store.set("recent", [id].concat(store.get("recent", []).filter(x => x !== id)).slice(0, 5));
}

function setScanMsg(t) { scanMsg = t; const e = $("#scanMsg"); if (e) e.textContent = t; }

// ---------- actions (buttons use data-act) ----------
const actions = {
  go: a => go(a),
  back() {
    let s;
    do { s = hist.length ? hist[hist.length - 1] : "home"; hist = hist.slice(0, -1); } while (s === "analysis");
    screen = s; render(); $("#app").scrollTop = 0;
  },
  open(id) { const p = byId(id); if (!p) return; current = p; addRecent(id); go("analysis"); },
  demo() { actions.open(PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)].id); },
  lookup() {
    const p = findByBarcode($("#code").value);
    if (p) actions.open(p.id); else setScanMsg("No product with that barcode in the local database. Try a demo product.");
  },
  pref(arg) {
    const [k, v] = arg.split(":");
    if (k === "allergy") draft.allergies = draft.allergies.includes(v) ? draft.allergies.filter(x => x !== v) : draft.allergies.concat(v);
    else draft[k] = v;
    render();
  },
  savePrefs() { prefs = draft; store.set("prefs", prefs); toast("Preferences saved"); actions.back(); },
  analyseText() {
    const text = ($("#ocrText").value || "").trim();
    if (!text) { toast("Add some ingredient text first"); return; }
    ocrText = text; current = productFromText(text); go("analysis");
  },
  clearRecent() { store.set("recent", []); toast("Recent scans cleared"); }
};

document.addEventListener("click", e => {
  const t = e.target.closest("[data-act]");
  if (t && actions[t.dataset.act]) actions[t.dataset.act](t.dataset.arg);
});

document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.sel) { cmp[t.dataset.sel] = t.value; store.set("cmp", cmp); render(); }
  else if (t.dataset.file === "product" && t.files[0]) handleProductImage(t.files[0]);
  else if (t.dataset.file === "ocr" && t.files[0]) handleOcrImage(t.files[0]);
});

async function handleProductImage(file) {
  preview = `<img src="${URL.createObjectURL(file)}" alt="Uploaded product">`;
  scanMsg = "Looking for a barcode…"; render();
  const found = await detectBarcode(file);
  const p = (found.code && findByBarcode(found.code)) || findByName(file.name);
  if (p) { actions.open(p.id); return; }
  setScanMsg(found.code ? "Barcode " + found.code + " isn't in the local database."
    : found.supported ? "No barcode found. Type it below or pick a demo product."
    : "Barcode detection isn't supported in this browser. Type the barcode or pick a demo product.");
}

async function handleOcrImage(file) {
  const st = $("#ocrStatus");
  st.textContent = "Reading ingredients...";
  try {
    const text = await readIngredientsFromImage(file, pct => { st.textContent = "Reading ingredients... " + pct + "%"; });
    ocrText = text.trim(); $("#ocrText").value = ocrText;
    st.textContent = ocrText ? "Done. Check the text, then analyse it." : "No text found. You can type the ingredients instead.";
  } catch (err) {
    st.textContent = "Couldn't read the image. Type the ingredients below instead.";
  }
}

render();
