#!/usr/bin/env node
/**
 * scrape-fda-recalls.js — Pulls pet food recalls from the openFDA API and
 * upserts them into brand_recalls.
 *
 * Uses the PUBLIC openFDA food enforcement endpoint — no API key or
 * ScrapingBee credits required. This data is authoritative; the Edge Function
 * uses it to override Claude's inferred recallSeverity at scoring time.
 *
 * Usage:
 *   node scripts/scrape-fda-recalls.js                # scrape + upsert
 *   node scripts/scrape-fda-recalls.js --dry-run      # scrape, print, don't write
 *   node scripts/scrape-fda-recalls.js --since=2015   # only recalls from 2015+
 *   node scripts/scrape-fda-recalls.js --limit=50     # cap results (debugging)
 *
 * Env:
 *   SUPABASE_SERVICE_ROLE_KEY — required to upsert (bypasses RLS)
 */

const SB_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = true] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const DRY_RUN = !!args["dry-run"];
const SINCE_YEAR = parseInt(args.since || "2010");
const LIMIT = args.limit ? parseInt(args.limit) : null;

// ── Known pet brands ─────────────────────────────────────────────────
// Used to (a) recognize when a recall_firm is a pet-food company even when
// product_description doesn't mention pet food, and (b) pick a canonical
// display name that matches how the rest of the app refers to the brand.
// Sorted longest-first so "Purina Pro Plan" wins over "Purina".

const KNOWN_BRANDS = [
  "Midwestern Pet Foods", "Stella & Chewy's", "The Honest Kitchen",
  "Rachael Ray Nutrish", "Hills Science Diet", "Hill's Science Diet",
  "Taste of the Wild", "Natural Balance", "Diamond Naturals",
  "Stella and Chewy", "Nature's Variety", "Champion Petfoods",
  "Purina Pro Plan", "Purina Beneful", "Purina ONE", "Purina Beyond",
  "Blue Buffalo", "Royal Canin", "Hill's Pet Nutrition", "Wellness CORE",
  "Kirkland Signature", "Merrick", "Wellness", "Orijen", "Acana",
  "Iams", "Eukanuba", "Pedigree", "Cesar", "Fromm", "Canidae",
  "Beneful", "Friskies", "Fancy Feast", "Sheba", "Meow Mix",
  "Diamond", "Victor", "Nutro", "Instinct", "Open Farm", "Farmina",
  "Ol' Roy", "Ol Roy", "Kibbles n Bits", "Gravy Train", "Alpo",
  "Science Diet", "Science Pet", "Milk-Bone", "Milk Bone", "Greenies",
  "Temptations", "Crave", "Sportmix", "Pro Pac", "Exclusive",
  "Evanger's", "Party Animal", "Answers Pet Food", "Primal Pet Foods",
  "Primal", "Rawz", "Tiki Cat", "Tiki Dog", "Weruva", "Ziwi Peak",
  "The Farmer's Dog", "Ollie", "Just Food For Dogs", "Solid Gold",
  "Castor & Pollux", "Halo", "Wild Earth", "Nulo", "American Journey",
  "Whole Earth Farms", "Purina", "Good N' Fun", "Jiminy's",
  "Triumph Pet Industries", "Sunshine Mills", "Nutrisca",
  "Thogersen Family Farm", "Lystn LLC", "Raws for Paws",
  "Smokehouse Pet Products", "Texas Tripe", "J.M. Smucker",
  "Mars Petcare", "Colgate", "Del Monte", "Natura Pet Products",
];

// ── Pet food detection ───────────────────────────────────────────────
// Strict signal-from-product-description, because many human food brands
// share names with pet brands (Diamond/Diamond Foods, Wellness the human
// vitamin line / Wellness Pet, Del Monte pet/human). Brand-only matching on
// the recalling firm produces too many false positives (bread mixes, yogurt,
// BBQ sauce) so we require an explicit pet-food keyword in the description.

// Direct phrases — any of these in the product description is a hard signal.
const PET_FOOD_KEYWORDS = [
  "dog food", "cat food", "pet food", "dog treat", "cat treat", "pet treat",
  "dog chew", "cat chew", "rawhide", "dental chew", "dog biscuit",
  "dog jerky", "dog kibble", "cat kibble", "pet snack", "pet food mix",
  "canine diet", "feline diet", "pet nutrition", "pet nutrition product",
  "for dogs", "for cats", "for puppies", "for kittens", "for your dog", "for your cat",
  "dog product", "cat product", "animal feed", "horse feed", "rabbit feed",
  "cattle feed", "livestock feed",
  // Dry-food words specific to pet context
  "kibble", "dog nugget", "cat nugget", "dog biscuit",
  // Pet-treat words (generic)
  "pig ear", "bully stick",
];

// Tokens that, when BOTH categories appear, indicate pet food — e.g. product_description
// says "Chicken Recipe Dog Meal". (Not perfect: "beef dog biscuits" matches "dog" and
// "biscuits". Good — real pet food often lacks the explicit "dog food" phrase.)
const PET_ANIMAL_TOKENS = /\b(dogs?|cats?|puppies|puppy|kittens?|canines?|felines?)\b/i;
const PET_CONTEXT_TOKENS = /\b(food|feed|treat|chew|biscuit|jerky|nugget|kibble|diet|meal|formula|recipe|patty|patties|snack|nibble|bite)\b/i;

// Firms whose name ALONE is sufficient signal (pet-exclusive companies).
// A "Wellness Pet" recall with a vague description still counts as pet food.
const PET_EXCLUSIVE_FIRM_PATTERNS = [
  /\bpet\s+food\b/i, /\bpet\s+foods\b/i, /\bpet\s+nutrition\b/i,
  /\bpet\s+products\b/i, /\banimal\s+nutrition\b/i, /\bpetfoods\b/i,
  // Explicit well-known pet-only firms (not ambiguous with human brands):
  /\bmidwestern\s+pet\s+foods\b/i,
  /\bchampion\s+petfoods\b/i,
  /\bpurina\b/i, /\bmars\s+petcare\b/i,
  /\bblue\s+buffalo\b/i, /\bhill'?s\s+pet\b/i, /\broyal\s+canin\b/i,
  /\bstella\s*(?:&|and)\s*chewy/i, /\bthe\s+honest\s+kitchen\b/i,
  /\bnatura\s+pet\b/i, /\bevanger'?s\b/i,
  /\bbravo\s+packing\b/i, /\btriumph\s+pet\b/i,
  /\bsunshine\s+mills\b/i, /\btuffy'?s\s+pet\b/i,
];

function isPetFoodRecall(rec) {
  const desc = rec.product_description || "";
  const descLower = desc.toLowerCase();
  const reason = (rec.reason_for_recall || "").toLowerCase();

  // 1. Direct phrase in the description or reason.
  if (PET_FOOD_KEYWORDS.some((k) => descLower.includes(k) || reason.includes(k))) return true;

  // 2. Co-occurrence: animal token AND food/feed context token both present in
  // the product description. Stronger than either alone.
  if (PET_ANIMAL_TOKENS.test(desc) && PET_CONTEXT_TOKENS.test(desc)) return true;

  // 3. Firm is pet-exclusive.
  const firm = rec.recalling_firm || "";
  if (PET_EXCLUSIVE_FIRM_PATTERNS.some((p) => p.test(firm))) return true;

  return false;
}

function normalizeBrand(s) {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|®|™|\u00ae|\u2122/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveBrand(rec) {
  const blob = [
    rec.product_description || "",
    rec.recalling_firm || "",
  ].join(" ");

  // Try each known brand (longest first via list order above)
  for (const b of KNOWN_BRANDS) {
    const pattern = new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(blob)) {
      return { brand_display: b, brand_normalized: normalizeBrand(b) };
    }
  }

  // Fall back to the recalling firm (clean it up)
  const firm = rec.recalling_firm || "";
  const cleaned = firm
    .replace(/\b(inc|llc|co|corp|corporation|company|ltd|limited|pet food|pet foods|pet products|pet nutrition|petfoods)\b\.?/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 2) {
    return {
      brand_display: cleaned.replace(/\b\w/g, (c) => c.toUpperCase()),
      brand_normalized: normalizeBrand(cleaned),
    };
  }

  return null;
}

// ── Severity classification ──────────────────────────────────────────
// openFDA fields: classification = "Class I" | "Class II" | "Class III"
//                 status = "Ongoing" | "Completed" | "Terminated"
//
// Class I  = reasonable probability of serious adverse health consequences or death.
// Class II = may cause temporary/medically reversible adverse health consequences.
// Class III = unlikely to cause adverse health consequences.

function classifySeverity(rec) {
  const status = (rec.status || "").toLowerCase();
  const klass = (rec.classification || "").toLowerCase();
  if (status === "ongoing") return "active";
  if (klass.includes("class i") && !klass.includes("class ii") && !klass.includes("class iii")) return "major";
  // Class II and III default to minor unless status says otherwise.
  return "minor";
}

// Pull the underlying cause from the recall reason (for the cause column + UI).
function extractCause(reasonText) {
  if (!reasonText) return null;
  const t = reasonText.toLowerCase();
  const causes = [
    ["salmonella", "Salmonella"],
    ["listeria", "Listeria"],
    ["e. coli", "E. coli"],
    ["aflatoxin", "Aflatoxin"],
    ["pentobarbital", "Pentobarbital"],
    ["vitamin d", "Vitamin D toxicity"],
    ["thiamine", "Thiamine deficiency"],
    ["mold", "Mold contamination"],
    ["melamine", "Melamine"],
    ["metal", "Metal contamination"],
    ["plastic", "Plastic contamination"],
    ["foreign material", "Foreign material"],
    ["undeclared", "Undeclared allergen"],
    ["mislabel", "Mislabeling"],
    ["spoilage", "Spoilage"],
  ];
  for (const [needle, label] of causes) {
    if (t.includes(needle)) return label;
  }
  return null;
}

function parseFdaDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// ── Fetch from openFDA ───────────────────────────────────────────────

async function fetchFdaPage(skip = 0, pageSize = 100, attempt = 1) {
  // openFDA paginates via skip + limit (max 100). Build the URL by hand because
  // URLSearchParams url-encodes the literal brackets and '+' separators that
  // openFDA's search grammar requires verbatim.
  const search = `product_type:Food+AND+recall_initiation_date:[${SINCE_YEAR}0101+TO+20991231]`;
  const url = `https://api.fda.gov/food/enforcement.json?search=${search}&limit=${pageSize}&skip=${skip}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (r.status === 404) return { results: [], total: 0 };
    // openFDA returns transient 502s under sustained load. Retry up to 4 times
    // with exponential backoff (1s, 2s, 4s, 8s) before giving up on the page.
    if (r.status >= 500 && r.status < 600 && attempt < 5) {
      const backoff = 1000 * Math.pow(2, attempt - 1);
      process.stdout.write(`\n[FDA] ${r.status} at skip=${skip}, retry ${attempt}/4 in ${backoff}ms\n`);
      await new Promise((res) => setTimeout(res, backoff));
      return fetchFdaPage(skip, pageSize, attempt + 1);
    }
    if (!r.ok) throw new Error(`openFDA ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    const data = await r.json();
    return {
      results: data.results || [],
      total: data.meta?.results?.total || 0,
    };
  } catch (err) {
    // AbortError (network timeout) — also retry a few times.
    if ((err.name === "AbortError" || err.name === "TypeError") && attempt < 5) {
      const backoff = 1000 * Math.pow(2, attempt - 1);
      process.stdout.write(`\n[FDA] ${err.name} at skip=${skip}, retry ${attempt}/4 in ${backoff}ms\n`);
      await new Promise((res) => setTimeout(res, backoff));
      return fetchFdaPage(skip, pageSize, attempt + 1);
    }
    throw err;
  }
}

async function fetchAllPetFoodRecalls() {
  console.log(`\n[FDA] Fetching food enforcement records since ${SINCE_YEAR}...`);
  const all = [];
  let skip = 0;
  const pageSize = 100;
  let total = null;

  while (true) {
    const { results, total: pageTotal } = await fetchFdaPage(skip, pageSize);
    if (total === null) { total = pageTotal; console.log(`[FDA] ${total} total food recalls since ${SINCE_YEAR}`); }
    if (results.length === 0) break;

    const petOnly = results.filter(isPetFoodRecall);
    all.push(...petOnly);
    process.stdout.write(`\r[FDA] page ${Math.floor(skip / pageSize) + 1}  fetched=${skip + results.length}/${total}  pet-food=${all.length}   `);

    if (results.length < pageSize) break;
    skip += pageSize;
    if (LIMIT && all.length >= LIMIT) break;
    // Gentle rate — openFDA allows 240 req/min with no key, we're well under
    await new Promise((r) => setTimeout(r, 300));
  }
  process.stdout.write("\n");
  return all;
}

// ── Upsert ───────────────────────────────────────────────────────────

async function upsertRecall(rec) {
  const brand = resolveBrand(rec);
  if (!brand) return { skipped: true, reason: "no brand" };

  const body = {
    brand_normalized: brand.brand_normalized,
    brand_display: brand.brand_display,
    recall_date: parseFdaDate(rec.recall_initiation_date),
    severity: classifySeverity(rec),
    cause: extractCause(rec.reason_for_recall),
    product_name: (rec.product_description || "").slice(0, 500),
    reason: (rec.reason_for_recall || "").slice(0, 800),
    status: (rec.status || "resolved").toLowerCase(),
    source: "fda",
    source_url: `https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts`,
    fda_recall_number: rec.recall_number || null,
  };

  if (DRY_RUN) return { dry: true, body };

  const url = `${SB_URL}/rest/v1/brand_recalls?on_conflict=fda_recall_number`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    return { error: `${r.status}: ${errText.slice(0, 200)}` };
  }
  return { ok: true, brand: brand.brand_display };
}

// ── Main ─────────────────────────────────────────────────────────────

(async () => {
  if (!DRY_RUN && !SERVICE_ROLE_KEY) {
    console.error("✗ SUPABASE_SERVICE_ROLE_KEY not set. Use --dry-run to preview without writing.");
    process.exit(1);
  }

  const recalls = await fetchAllPetFoodRecalls();
  console.log(`\n[FDA] Total pet-food recalls resolved: ${recalls.length}\n`);

  if (DRY_RUN) {
    console.log("── DRY RUN: first 10 matches ──");
    for (const r of recalls.slice(0, 10)) {
      const brand = resolveBrand(r);
      console.log(`  ${parseFdaDate(r.recall_initiation_date) || "????-??-??"}  ${(brand?.brand_display || "?").padEnd(28)}  ${classifySeverity(r).padEnd(6)}  ${extractCause(r.reason_for_recall) || "—"}`);
      console.log(`    ${(r.product_description || "").slice(0, 100)}`);
    }
    console.log(`\n(showing 10 of ${recalls.length}; re-run without --dry-run to upsert)`);
    return;
  }

  let inserted = 0, skipped = 0, failed = 0;
  const errors = [];
  const bySev = { active: 0, major: 0, minor: 0 };
  const byBrand = new Map();

  for (const r of recalls) {
    const res = await upsertRecall(r);
    if (res.skipped) { skipped++; continue; }
    if (res.error) { failed++; errors.push(res.error); continue; }
    inserted++;
    const sev = classifySeverity(r);
    bySev[sev]++;
    const brand = resolveBrand(r)?.brand_display || "?";
    byBrand.set(brand, (byBrand.get(brand) || 0) + 1);

    if (inserted % 25 === 0) process.stdout.write(`\r[upsert] ${inserted}/${recalls.length}   `);
  }
  process.stdout.write("\n");

  console.log(`\n=== Summary ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped:  ${skipped} (no brand match)`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  By severity: active=${bySev.active} major=${bySev.major} minor=${bySev.minor}`);

  const topBrands = [...byBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(`\n  Top brands by recall count:`);
  for (const [brand, count] of topBrands) {
    console.log(`    ${String(count).padStart(3)}×  ${brand}`);
  }

  if (errors.length > 0) {
    console.log(`\n  First 5 errors:`);
    for (const e of errors.slice(0, 5)) console.log(`    - ${e}`);
  }
})().catch((err) => {
  console.error("\n✗ Fatal:", err.message);
  process.exit(1);
});
