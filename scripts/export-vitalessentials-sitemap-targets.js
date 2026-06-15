#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_URL = "https://www.vitalessentials.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/vitalessentials-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const BRAND = "Vital Essentials";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap-url="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const REJECT_TERMS = [
  "treat", "treats", "chew", "chews", "snack", "snacks", "raw bar",
  "duck heads", "duck necks", "turkey necks", "pig snouts", "moo sticks",
  "bully sticks", "bites", "hearts", "giblets", "liver", "tripe",
  "minnows", "skins", "tendon", "topper", "toppers", "mix in",
  "mixins", "mixer", "mixers", "routeins", "hound on the ground",
  "kitty on the counter",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:vitalessentials-sitemap-catalog -- --output=.tmp/vitalessentials-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap-url=url       Explicit Vital Essentials sitemap URL (${DEFAULT_SITEMAP_URL})
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
  if (!/^https:\/\/www\.vitalessentials\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap-url must be https://www.vitalessentials.com/sitemap.xml.");
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

function asciiFold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/\u202F/g, " ");
}

function normalizeText(value) {
  return asciiFold(value)
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
  return asciiFold(text)
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

function titleFromSlug(slug) {
  return asciiFold(slug)
    .replace(/^vital-essentials-/, "")
    .replace(/^freeze-dried-raw-/, "Freeze-Dried Raw ")
    .replace(/^frozen-raw-/, "Frozen Raw ")
    .replace(/^raw-fusion-/, "Raw Fusion ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bDog Food\b/g, "Dog Food")
    .replace(/\bCat Food\b/g, "Cat Food")
    .replace(/\bMini Nibs\b/g, "Mini Nibs")
    .replace(/\bMini Patties\b/g, "Mini Patties")
    .replace(/\bSoft Nibs\b/g, "Soft Nibs")
    .replace(/\bNibs\b/g, "Nibs")
    .replace(/\bPatties\b/g, "Patties")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUrls(xml) {
  const urls = [];
  const pattern = /<loc>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(xml))) {
    urls.push(decodeXml(match[1]));
  }
  return urls;
}

function slugFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "products" || parts.length !== 2) return "";
    return parts[1];
  } catch {
    return "";
  }
}

function inferPetType(slug) {
  if (/-cat-food(?:-|$)/.test(slug)) return "cat";
  if (/-dog-food(?:-|$)/.test(slug)) return "dog";
  return "";
}

function isCandidateFoodSlug(slug) {
  if (!slug) return false;
  const text = normalizeText(slug);
  if (!/(?:^|-)dog-food(?:-|$)|(?:^|-)cat-food(?:-|$)/.test(slug)) return false;
  if (!/(entree|food|patties|nibs|raw-fusion)/.test(slug)) return false;
  return !REJECT_TERMS.some((term) => hasTerm(text, term));
}

function addSpeciesQualifier(name, petType) {
  const text = normalizeText(name);
  if (petType === "cat" && !/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return `${name} for Cats`;
  if (petType === "dog" && !/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return `${name} for Dogs`;
  return name;
}

function inferVitalEssentialsPetTypes(target) {
  const inferred = inferPetTypes({
    brand: BRAND,
    product_name: `${target.petType} ${target.name} ${target.sourceUrl}`,
    cache_key: normalizeCacheKey(`${target.petType} ${BRAND} ${target.name} ${target.sourceUrl}`),
    source: "vitalessentials_sitemap",
  }, { includeAmbiguous: false });
  if (inferred.length === 1 && inferred[0] === target.petType) return inferred;
  return [target.petType];
}

function normalizeTarget(url) {
  const slug = slugFromUrl(url);
  if (!isCandidateFoodSlug(slug)) return null;
  const petType = inferPetType(slug);
  if (!petType) return null;
  const name = addSpeciesQualifier(titleFromSlug(slug), petType);
  const draft = { name, petType, sourceUrl: url };
  const petTypes = inferVitalEssentialsPetTypes(draft);
  if (petTypes.length !== 1) return null;
  const cacheKey = normalizeCacheKey(`${BRAND} ${name}`);
  if (!cacheKey) return null;
  return {
    name,
    brand: BRAND,
    petType,
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "vitalessentials_sitemap_export",
    sourceQuality: "official_brand_sitemap_slug",
    sourceUrl: url,
    imageUrl: "",
    barcode: "",
    retailerProductId: slug,
    form: "fresh",
    productType: "raw_freeze_dried_or_frozen_food",
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
    if (!response.ok) throw new Error(`Vital Essentials sitemap fetch failed ${response.status}: ${url}`);
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
      const name = titleFromSlug(normalizeCacheKey(row?.product_name || ""));
      const brand = decodeXml(row?.brand);
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
  const byForm = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    byForm.set(target.form, (byForm.get(target.form) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
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
  const urls = extractUrls(sitemap);
  const skipped = { nonFood: 0, existing: 0, duplicate: 0, invalid: 0 };
  const byKey = new Map();

  for (const url of urls) {
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
    source: "vitalessentials_sitemap",
    sitemapUrl,
    includeExisting,
    skipExistingScan,
    scannedUrls: urls.length,
    existingCount: existing.size,
    missingCount: targets.length,
    skipped,
    summary: summarizeTargets(targets),
    targets,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Vital Essentials sitemap URLs scanned: ${urls.length}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Vital Essentials sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Vital Essentials sitemap catalog target export failed:", err.message);
  process.exit(1);
});
