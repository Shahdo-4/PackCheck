
const ALLERGEN_WORDS = {peanuts:["peanut","groundnut"],milk:["milk","whey","casein","lactose","butter","cream","cheese"],soy:["soy","soya","lecithin"],eggs:["egg","albumen"],gluten:["wheat","barley","rye","malt","gluten"]};
const NOT_VEGETARIAN = ["gelatin","chicken","beef","pork","lard","fish","meat","tallow","bacon","ham"];
const NOT_VEGAN = ["milk","whey","casein","butter","cream","cheese","egg","honey","lactose"];
const NOT_HALAL = ["pork","lard","gelatin","alcohol","wine","bacon","ham","beer","rum"];
const SPICY_WORDS = ["chili","chilli","pepper","cayenne","masala","paprika","spicy","jalapeno"];
const CONCERNS = [[/palm oil/,"Contains palm oil"],[/colou?r/,"Added colouring"],[/msg|flavour enhancer|monosodium/,"Flavour enhancer (MSG)"],[/syrup/,"Added syrups"],[/aspartame|sucralose|sweetener/,"Artificial sweeteners"],[/preservative|benzoate/,"Preservatives"]];

const hasAny = (text, words) => words.some(w => text.includes(w));
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// Build a product-like object from raw ingredient text (used after OCR).
function productFromText(text) {
  const t = text.toLowerCase();
  const spicyHits = SPICY_WORDS.filter(w => t.includes(w)).length;
  return {
    id: "scan", name: "Scanned label", brand: "Ingredient text", category: "Ingredient scan",
    description: "Analysed from the ingredient text you scanned.",
    ingredients: t.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean),
    allergens: Object.keys(ALLERGEN_WORDS).filter(a => hasAny(t, ALLERGEN_WORDS[a])),
    nutrition: null,
    diet: {vegetarian: !hasAny(t, NOT_VEGETARIAN), vegan: !hasAny(t, NOT_VEGETARIAN.concat(NOT_VEGAN)), halal: !hasAny(t, NOT_HALAL)},
    spiceLevel: spicyHits >= 2 ? 3 : spicyHits ? 1 : 0,
    image: {emoji: "📄", color: "#3b82f6"}, keywords: []
  };
}

// Ingredient concerns found in the ingredient list and nutrition numbers.
function findConcerns(p) {
  const t = p.ingredients.join(", ").toLowerCase();
  const out = CONCERNS.filter(c => c[0].test(t)).map(c => c[1]);
  if (p.nutrition) {
    if (p.nutrition.sugar > 15) out.push("High sugar (" + p.nutrition.sugar + " g/100g)");
    if (p.nutrition.salt > 1.5) out.push("High salt (" + p.nutrition.salt + " g/100g)");
  }
  return out;
}

// Main function: score starts at 100, each rule adds a visible deduction.
function analyseProduct(p, prefs) {
  const reasons = [], positives = [], cautions = [], breakdown = [];
  const add = (label, pts) => breakdown.push({label, pts});
  let conflict = false;

  // 1. Allergy conflicts (major)
  const hits = p.allergens.filter(a => prefs.allergies.includes(a));
  hits.forEach(a => { reasons.push("Contains " + a); add("Contains " + a, -40); conflict = true; });
  if (!hits.length && prefs.allergies.length) positives.push("No selected allergens detected");

  // 2. Diet compatibility (major)
  if (prefs.diet !== "none") {
    if (p.diet[prefs.diet]) positives.push("Suitable for " + prefs.diet + " diet");
    else { reasons.push("Not " + prefs.diet + " friendly"); add("Not " + prefs.diet, -35); conflict = true; }
  }

  // 3. Spice preference
  const s = p.spiceLevel;
  if (prefs.spice === "avoid") {
    if (s >= 2) { cautions.push("Spicy, and you prefer to avoid spice"); add("Spicy product", -15); }
    else positives.push(s ? "Mild spice" : "Not spicy");
  } else if (prefs.spice === "love" && s >= 2) positives.push("Spicy, just how you like it");
  else if (prefs.spice === "medium" && s === 3) { cautions.push("Very spicy"); add("Very spicy", -8); }

  // 4. Ingredient concerns (small deductions, max 3)
  const concerns = findConcerns(p);
  concerns.slice(0, 3).forEach(c => { cautions.push(c); add(c, -5); });

  if (!positives.length && !reasons.length && !cautions.length) positives.push("No conflicts found");

  // 5-7. Score and final status
  const score = clamp(100 + breakdown.reduce((sum, b) => sum + b.pts, 0));
  const status = conflict ? "not-match" : score < 90 ? "check" : "good";
  return {status, score, reasons, positives, cautions, breakdown, concerns};
}

// Smart comparison: match score, then the product that is worse on a metric loses points.
function compareProducts(a, b, prefs) {
  const ra = analyseProduct(a, prefs), rb = analyseProduct(b, prefs);
  const metrics = [["sugar", true, 8, "Higher sugar"], ["cal", true, 5, "More calories"], ["protein", false, 4, "Less protein"]];
  metrics.forEach(([k, lowerBetter, pts, label]) => {
    const x = a.nutrition[k], y = b.nutrition[k];
    if (x === y) return;
    const aWins = lowerBetter ? x < y : x > y;
    const loser = aWins ? rb : ra;
    loser.breakdown.push({label, pts: -pts});
    loser.score = clamp(loser.score - pts);
  });
  const winner = ra.score === rb.score ? null : ra.score > rb.score ? "a" : "b";
  let text = "Both products score the same for your preferences.";
  if (winner) {
    const [w, l, rw, rl] = winner === "a" ? [a, b, ra, rb] : [b, a, rb, ra];
    const parts = [];
    if (rw.reasons.length < rl.reasons.length) parts.push("fewer conflicts with your preferences (" + rw.reasons.length + " vs " + rl.reasons.length + ")");
    if (w.nutrition.sugar < l.nutrition.sugar) parts.push("lower sugar (" + w.nutrition.sugar + " g vs " + l.nutrition.sugar + " g)");
    if (w.nutrition.cal < l.nutrition.cal) parts.push("fewer calories");
    if (w.nutrition.protein > l.nutrition.protein) parts.push("more protein");
    text = w.name + " is the better match" + (parts.length ? ": it has " + parts.join(", ") : "") + ".";
  }
  return {ra, rb, winner, text};
}
