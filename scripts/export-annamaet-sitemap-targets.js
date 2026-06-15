#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_URL = "https://annamaet.com/products-sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/annamaet-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const BRAND = "Annamaet";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const DOG_FORMULA_SLUGS = new Set([
  "annamaet-ohana",
  "ultra-high-protein-dog-food",
  "annamaet-sustain",
  "small-breed-salmon",
  "small-breed-dog-food",
  "sensitive-skin-and-stomach-dog-food",
  "salcha-formula",
  "annamaet-re-juvenate",
  "original-senior-dog-food",
  "original-puppy-formula",
  "option-formula",
  "large-breed-dog-food",
  "manitok-formula",
  "extra-formula",
  "lean-formula",
  "aqualuk-formula",
  "adult-dog-food-formula",
  "aqualuk",
  "lean",
  "salcha",
]);

const CAT_FORMULA_SLUGS = new Set([
  "feline-lean",
  "original-feline",
  "grain-free-cat-food",
  "feline-sustain-no-29",
]);

const DOG_CAT_FORMULA_SLUGS = new Set([
  "chicken-freez-dried-raw",
  "surf-turf-freeze-dried-raw",
  "turkey-freeze-dried-raw",
]);

const REJECT_TERMS = [
  "glycocharge", "enhance", "endure", "impact", "recovery chews",
  "supplement", "supplements", "vitamin", "mineral", "hip joint",
  "post exercise", "chew", "chews", "treat", "treats", "book",
  "buy direct", "products", "toy", "toys", "apparel", "litter",
  "accessory", "accessories",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:annamaet-sitemap-catalog -- --output=.tmp/annamaet-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit Annamaet product sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N missing targets are collected (default 0, no limit)
  --include-existing      Include targets already present in product_data for audit only
  --skip-existing-scan    Skip product_data alias reads for smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
  if (!/^https:\/\/annamaet\.com\/products-sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://annamaet.com/products-sitemap.xml.");
  }
}

function decodeXml(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&#39;|&apos;|’|‘/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;|“|”/g, "\"")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#\d+;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/['’™®]/g, " ")
    .replace(/[-_/,%]+/g, " ")
    .replace(/[^a-z0-9\s&+%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return text.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}

function normalizeCacheKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe|food for dogs|food for cats)\b/gi, "")
    .replace(/\bw\b/g, "with")
    .replace(/[-/&+,%]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseProductName(value) {
  const smallWords = new Set(["and", "or", "of", "for", "in", "with", "to", "the"]);
  return String(value || "")
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part)) return part;
      if (/^[A-Z0-9&+%-]+$/.test(part) && /[A-Z]/.test(part)) return part;
      const lower = part.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.replace(/(^|[-'/])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    })
    .join("")
    .replace(/\bFreez Dried\b/g, "Freeze-Dried")
    .replace(/\bFreeze Dried\b/g, "Freeze-Dried")
    .replace(/\bSurf Turf\b/g, "Surf & Turf")
    .replace(/\bOhana\b/g, "Ohana")
    .replace(/\bRe Juvenate\b/g, "Re-Juvenate")
    .trim();
}

function cleanProductName(value) {
  return titleCaseProductName(decodeXml(value)
    .replace(/^annamaet\s+/i, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220));
}

function cleanUrl(value) {
  const url = decodeXml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/annamaet\.com\/products\/[a-z0-9-]+$/i.test(url)) return "";
  return url;
}

function extractUrls(xml) {
  const urls = [];
  const pattern = /<loc>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(xml))) {
    const url = cleanUrl(match[1]);
    if (url) urls.push(url);
  }
  return urls;
}

function slugFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || parts[0] !== "products") return "";
    return parts[1];
  } catch {
    return "";
  }
}

function isCandidateFoodSlug(slug) {
  if (!slug) return false;
  const text = normalizeText(slug);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  return DOG_FORMULA_SLUGS.has(slug) || CAT_FORMULA_SLUGS.has(slug) || DOG_CAT_FORMULA_SLUGS.has(slug);
}

function petTypesFromSlug(slug) {
  if (DOG_CAT_FORMULA_SLUGS.has(slug)) return ["dog", "cat"];
  if (CAT_FORMULA_SLUGS.has(slug)) return ["cat"];
  if (DOG_FORMULA_SLUGS.has(slug)) return ["dog"];
  const inferred = inferPetTypes({
    brand: BRAND,
    product_name: slug.replace(/-/g, " "),
    cache_key: normalizeCacheKey(slug),
    source: "annamaet_sitemap",
  }, { includeAmbiguous: false });
  return inferred;
}

function formFromSlug(slug) {
  if (DOG_CAT_FORMULA_SLUGS.has(slug)) return "fresh";
  return "dry";
}

function addSpeciesQualifier(name, petTypes) {
  const text = normalizeText(name);
  if (petTypes.length > 1) return /\b(dog|cat|dogs|cats|canine|feline)\b/.test(text) ? name : `${name} Dog & Cat Food`;
  if (petTypes[0] === "cat" && !/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return `${name} Cat Food`;
  if (petTypes[0] === "dog" && !/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return `${name} Dog Food`;
  return name;
}

function normalizeTarget(url) {
  const slug = slugFromUrl(url);
  if (!isCandidateFoodSlug(slug)) return null;
  const petTypes = petTypesFromSlug(slug);
  if (petTypes.length === 0 || petTypes.some((petType) => petType !== "dog" && petType !== "cat")) return null;
  const name = addSpeciesQualifier(cleanProductName(slug), petTypes);
  const cacheKey = normalizeCacheKey(`${BRAND} ${name}`);
  if (!cacheKey) return null;
  return {
    name,
    brand: BRAND,
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "annamaet_sitemap_export",
    sourceQuality: "official_brand_sitemap_slug",
    sourceUrl: url,
    imageUrl: "",
    barcode: "",
    retailerProductId: slug,
    form: formFromSlug(slug),
    productType: DOG_CAT_FORMULA_SLUGS.has(slug) ? "freeze_dried_raw_food" : "dry_food",
    searchTerms: [...new Set([`${BRAND} ${name}`, name, url].filter(Boolean))],
  };
}

function collectPlannedCacheKeys(target) {
  const lookupName = target.brand && target.name && !target.name.toLowerCase().startsWith(target.brand.toLowerCase())
    ? `${target.brand} ${target.name}`
    : target.name;
  return [
    target.cacheKey,
    normalizeCacheKey(target.name),
    normalizeCacheKey(lookupName),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout fetching ${url}`)), 90_000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/xml,text/xml,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Annamaet sitemap fetch failed ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchExistingCacheKeys() {
  if (skipExistingScan) return new Set();
  const keys = new Set();
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`timeout reading product_data range ${from}-${from + REST_PAGE_SIZE - 1}`)), 45_000);
    let page;
    try {
      const response = await fetch(`${base}?select=cache_key,product_name,brand&order=cache_key.asc`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
      page = await response.json();
    } finally {
      clearTimeout(timer);
    }
    for (const row of page) {
      const cacheKey = String(row?.cache_key || "").trim();
      const name = cleanProductName(row?.product_name || "");
      const brand = cleanProductName(row?.brand || "");
      for (const key of [
        cacheKey,
        normalizeCacheKey(name),
        normalizeCacheKey(brand && name && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name),
      ]) {
        if (key) keys.add(key);
      }
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return keys;
}

function summarizeTargets(targets) {
  const byPetType = new Map();
  const byLookupPetType = new Map();
  const byForm = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    byForm.set(target.form, (byForm.get(target.form) || 0) + 1);
    for (const petType of target.petTypes || [target.petType]) {
      byLookupPetType.set(petType, (byLookupPetType.get(petType) || 0) + 1);
    }
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    byLookupPetType: [...byLookupPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    byForm: [...byForm.entries()]
      .map(([form, count]) => ({ form, count }))
      .sort((a, b) => b.count - a.count || a.form.localeCompare(b.form)),
  };
}

async function main() {
  assertConfig();

  const existing = await fetchExistingCacheKeys();
  const sitemap = await fetchText(sitemapUrl);
  const rawUrls = [...String(sitemap || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1]));
  const urls = extractUrls(sitemap);
  const skipped = { nonFood: 0, existing: 0, duplicate: 0, invalid: 0 };
  const byKey = new Map();

  for (const url of rawUrls) {
    const slug = slugFromUrl(url);
    if (!isCandidateFoodSlug(slug)) {
      skipped.nonFood++;
      continue;
    }
    const target = normalizeTarget(url);
    if (!target) {
      skipped.invalid++;
      continue;
    }
    if (!includeExisting && collectPlannedCacheKeys(target).some((key) => existing.has(key))) {
      skipped.existing++;
      continue;
    }
    if (byKey.has(target.cacheKey)) {
      skipped.duplicate++;
      continue;
    }
    byKey.set(target.cacheKey, target);
    if (limit > 0 && byKey.size >= limit) break;
  }

  const targets = [...byKey.values()].sort((a, b) =>
    String(a.petType).localeCompare(String(b.petType)) ||
    String(a.name).localeCompare(String(b.name)) ||
    String(a.cacheKey).localeCompare(String(b.cacheKey))
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "annamaet_sitemap",
    sitemapUrl,
    includeExisting,
    skipExistingScan,
    scannedUrls: rawUrls.length,
    candidateUrls: urls.length,
    existingCount: existing.size,
    missingCount: targets.length,
    skipped,
    summary: summarizeTargets(targets),
    targets,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Annamaet sitemap URLs scanned: ${rawUrls.length}`);
  console.log(`Candidate Annamaet product URLs: ${urls.length}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Annamaet sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Annamaet sitemap catalog target export failed:", err.message);
  process.exit(1);
});
