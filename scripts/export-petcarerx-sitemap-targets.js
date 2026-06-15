#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_INDEX_URL = "https://www.petcarerx.com/xml/sitemap.ashx";
const DEFAULT_SITEMAP_URL = "https://www.petcarerx.com/xml/sitemap.ashx?map=ProductSitemap";
const DEFAULT_OUTPUT = ".tmp/petcarerx-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "WoofApp/1.1 catalog coverage export (contact: support@woof.app)";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapIndexArg = process.argv.find((arg) => arg.startsWith("--sitemap-index="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const includeTreats = process.argv.includes("--include-treats");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapIndexUrl = sitemapIndexArg ? sitemapIndexArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_INDEX_URL;
const explicitSitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : "";
const configuredSitemapUrl = explicitSitemapUrl || DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const CORE_FOOD_TERMS = [
  "dog food", "cat food", "puppy food", "kitten food",
  "dry dog food", "dry cat food", "wet dog food", "wet cat food",
  "canned dog food", "canned cat food", "fresh dog food", "fresh cat food",
  "freeze-dried dog food", "freeze dried dog food", "freeze-dried cat food", "freeze dried cat food",
  "air-dried dog food", "air dried dog food", "air-dried cat food", "air dried cat food",
  "dehydrated dog food", "dehydrated cat food", "kibble", "pate", "paté", "stew",
  "entree", "entrée", "gravy",
  "morsels", "recipe", "dinner", "chunks in gravy", "minced", "shreds", "loaf",
  "raw dog food", "raw cat food", "refrigerated dog food", "refrigerated cat food",
];

const TREAT_TERMS = [
  "treat", "treats", "chew", "chews", "jerky", "biscuits", "cookies",
  "dental", "bone", "bones", "bully stick", "rawhide",
];

const SUPPLEMENTAL_FOOD_TERMS = [
  "supplemental", "supplemental cat food", "supplemental dog food",
  "broth", "broths", "meal topper", "food topper", "topper",
];

const NON_FOOD_TERMS = [
  "toy", "leash", "collar", "harness", "bed", "crate", "kennel", "playpen",
  "bowl", "feeder", "fountain", "filter", "pump", "litter", "wipes", "shampoo",
  "conditioner", "spray", "brush", "comb", "nail", "diaper", "bandage",
  "apparel", "sweater", "costume", "carrier", "ramp", "gate", "door", "mat",
  "storage container", "scoop", "lid", "replacement", "refill", "stain", "odor",
  "remover", "wound", "hot spot", "supplement", "probiotic", "vitamin",
  "medicine", "medication", "medicated", "generic", "caps", "capsule", "capsules",
  "tablet", "tablets", "tabs", "solution", "suspension", "ointment", "ophthalmic",
  "antibiotic", "antirobe", "amoxicillin", "clavamox", "doxycycline", "metronidazole",
  "heartworm", "flea", "tick", "toothpaste", "detoxifier", "calming support",
  "digestive support", "hip joint support",
];

const BRAND_HINTS = [
  "9 Lives", "ACANA", "Almo Nature", "Applaws", "Badlands Ranch", "Blue Buffalo",
  "Blue Wilderness", "Canidae", "Cesar", "Diamond Naturals", "Dr. Marty",
  "Diamond", "Eagle Pack", "Earth Animal", "Eukanuba", "Evanger's", "Fancy Feast", "Farmina", "Friskies", "Freshpet", "Fromm",
  "Fussie Cat", "Hill's Prescription Diet", "Hill's Science Diet", "Holistic Select",
  "IAMS", "Instinct", "Merrick", "Meow Mix", "Natural Balance", "Nature's Recipe",
  "Nulo", "NutriSource", "Nutro", "Open Farm", "Orijen", "Pedigree", "Primal",
  "Purina Beneful", "Purina Cat Chow", "Purina Dog Chow", "Purina ONE",
  "Purina Pro Plan", "Purina", "Rachael Ray Nutrish", "Royal Canin", "Sheba",
  "PureVita", "Redbarn", "Solid Gold", "Stella & Chewy's", "Taste of the Wild", "The Honest Kitchen",
  "Tiki Cat", "Vital Essentials", "Wellness CORE", "Wellness", "Weruva",
  "Whiskas", "Ziwi Peak",
].sort((a, b) => b.length - a.length);

const BRAND_PREFIX_ALIASES = [
  ["Beneful", "Purina Beneful"],
  ["Blue Natural Veterinarian Diet", "Blue Buffalo"],
  ["Blue Natural Veterinary Diet", "Blue Buffalo"],
  ["Diamond Care", "Diamond"],
  ["Diamond Maintenance", "Diamond"],
  ["Diamond Performance", "Diamond"],
  ["Diamond Puppy", "Diamond"],
  ["Nature's Variety Instinct", "Instinct"],
  ["O.n.e.", "Purina ONE"],
].sort((a, b) => b[0].length - a[0].length);

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:petcarerx-sitemap-catalog -- --output=.tmp/petcarerx-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap-index=url     PetCareRx sitemap index URL (${DEFAULT_SITEMAP_INDEX_URL})
  --sitemap=url           Explicit PetCareRx ProductSitemap URL (default ${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N missing targets are collected (default 0, no limit)
  --include-existing      Include targets already present in product_data for audit only
  --include-treats        Include treat/chew URLs in addition to core food URLs
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!Number.isFinite(limit) || limit < 0) {
    usage("--limit must be a non-negative number.");
  }
  if (sitemapIndexArg && !/^https:\/\/www\.petcarerx\.com\/xml\/sitemap\.ashx$/i.test(sitemapIndexUrl)) {
    usage("--sitemap-index must be https://www.petcarerx.com/xml/sitemap.ashx.");
  }
  if (!/^https:\/\/www\.petcarerx\.com\/xml\/sitemap\.ashx\?map=ProductSitemap$/i.test(configuredSitemapUrl)) {
    usage("--sitemap must be the PetCareRx ProductSitemap URL.");
  }
}

function decodeXml(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&#\d+;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCacheKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[-/&]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s&'%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return text.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}

function cleanUrl(value) {
  const url = decodeXml(value).split("?")[0].split("#")[0];
  if (!/^https:\/\/www\.petcarerx\.com\/[^/]+\/\d+$/i.test(url)) return "";
  return url;
}

function cleanImageUrl(value) {
  const url = decodeXml(value);
  if (!/^https:\/\/cdn\.petcarerx\.com\//i.test(url)) return "";
  return url.slice(0, 500);
}

function cleanProductName(value) {
  const cleaned = decodeXml(value)
    .replace(/\s*,?\s*(?:case of|pack of)\s*\d+\b.*$/i, "")
    .replace(/\s*,?\s*\d+(\.\d+)?\s*-?\s*(?:oz|fl\s*-?\s*oz|lb|lbs|kg|g|pound|ounce)s?\s*(?:bag|can|tray|pouch|box|tub|bottle|carton|cup)?\b.*$/i, "")
    .replace(/\s*,?\s*\d+\s*(?:count|ct|pack|pk)\b.*$/i, "")
    .replace(/\s*,?\s*\d+\s*-\s*$/i, "")
    .replace(/[\s,-]+$/g, "")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  return restoreKnownBrandTypography(titleCaseProductName(cleaned));
}

function titleCaseProductName(value) {
  const smallWords = new Set(["and", "or", "of", "for", "in", "with", "to"]);
  return String(value || "")
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part)) return part;
      if (part === "&" || part === "-") return part;
      if (/^[A-Z0-9&+%-]+$/.test(part) && /[A-Z]/.test(part)) return part;
      const lower = part.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.replace(/(^|[-'/])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    })
    .join("")
    .replace(/\s+([,])/g, "$1")
    .trim();
}

function productNameFromUrl(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const slug = parts[parts.length - 2] || "";
  return cleanProductName(decodeURIComponent(slug).replace(/-/g, " "));
}

function inferBrand(name) {
  const normalizedName = normalizeText(name);
  const alias = BRAND_PREFIX_ALIASES.find(([prefix]) => {
    const normalizedPrefix = normalizeText(prefix);
    return normalizedName === normalizedPrefix ||
      normalizedName.startsWith(`${normalizedPrefix} `) ||
      normalizedName.startsWith(`${normalizedPrefix}-`);
  });
  if (alias) return alias[1];
  const match = BRAND_HINTS.find((brand) => {
    const normalizedBrand = normalizeText(brand);
    return normalizedName === normalizedBrand ||
      normalizedName.startsWith(`${normalizedBrand} `) ||
      normalizedName.startsWith(`${normalizedBrand}-`);
  });
  return match || "";
}

function restoreKnownBrandTypography(value) {
  return String(value || "")
    .replace(/\bHill S\b/g, "Hill's")
    .replace(/\bNature S\b/g, "Nature's")
    .replace(/\bStella & Chewy S\b/g, "Stella & Chewy's")
    .replace(/\bEvanger S\b/g, "Evanger's")
    .replace(/\bPurevita\b/g, "PureVita")
    .replace(/\bEntr E\b/g, "Entree");
}

function productIdFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

async function fetchText(url) {
  const curlText = fetchTextWithCurl(url);
  if (curlText) return curlText;

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`PetCareRx sitemap fetch failed ${response.status}: ${url}`);
  }
  return response.text();
}

function fetchTextWithCurl(url) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "woof-petcarerx-"));
  const tempFile = path.join(tempDir, "sitemap.xml");
  const result = spawnSync("curl", [
    "-L",
    "--fail",
    "--max-time",
    "30",
    "-A",
    USER_AGENT,
    "-o",
    tempFile,
    url,
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  let body = "";
  try {
    body = fs.existsSync(tempFile) ? fs.readFileSync(tempFile, "utf8") : "";
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
  if (result.status !== 0 || !body || !/^<\?xml|<urlset|<sitemapindex/i.test(body.trim())) {
    return "";
  }
  return body;
}

function extractSitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1]))
    .filter((url) => /^https:\/\/www\.petcarerx\.com\/xml\/sitemap\.ashx\?map=ProductSitemap$/i.test(url))
    .filter((url, index, list) => list.indexOf(url) === index);
}

function parseProductUrls(xml, sitemapUrl) {
  const rows = [];
  for (const match of String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = match[1];
    const sourceUrl = cleanUrl(block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]);
    if (!sourceUrl) continue;
    const title = cleanProductName(block.match(/<image:title>([\s\S]*?)<\/image:title>/i)?.[1]);
    const name = title || productNameFromUrl(sourceUrl);
    if (!name) continue;
    const imageUrl = cleanImageUrl(block.match(/<image:loc>([\s\S]*?)<\/image:loc>/i)?.[1]);
    rows.push({ sourceUrl, name, imageUrl, productId: productIdFromUrl(sourceUrl), sitemapUrl });
  }
  return rows;
}

function isCandidateFoodUrl(row) {
  const text = normalizeText(row.name);
  const hasPetSignal = inferPetTypes({
    product_name: row.name,
    cache_key: normalizeCacheKey(row.name),
    source: "petcarerx_sitemap",
  }, { includeAmbiguous: false }).length > 0;
  if (!hasPetSignal) return false;
  if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false;
  const coreFood = CORE_FOOD_TERMS.some((term) => hasTerm(text, term));
  const treat = includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term));
  return coreFood || treat;
}

function normalizeTarget(row) {
  const name = cleanProductName(row.name);
  const cacheKey = normalizeCacheKey(name);
  if (!cacheKey) return null;
  const brand = inferBrand(name);
  const petTypes = inferPetTypes({
    product_name: name,
    cache_key: cacheKey,
    source: "petcarerx_sitemap",
  }, { includeAmbiguous: false });
  if (petTypes.length === 0) return null;
  return {
    name,
    brand,
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "petcarerx_sitemap_export",
    sourceQuality: "retailer_sitemap_title",
    sourceUrl: row.sourceUrl,
    imageUrl: row.imageUrl,
    barcode: "",
    retailerProductId: row.productId,
    sourceSitemap: row.sitemapUrl,
    searchTerms: [...new Set([name, row.sourceUrl].filter(Boolean))],
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

async function resolveSitemapUrl() {
  if (explicitSitemapUrl) return explicitSitemapUrl;
  if (!sitemapIndexArg) return DEFAULT_SITEMAP_URL;
  const indexXml = await fetchText(sitemapIndexUrl);
  const discovered = extractSitemapLocs(indexXml);
  if (discovered.length === 0) {
    throw new Error("PetCareRx sitemap index did not expose a ProductSitemap URL.");
  }
  return discovered[0];
}

async function fetchExistingCacheKeys() {
  const keys = new Set();
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key,product_name,brand&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    }
    const page = await response.json();
    for (const row of page) {
      const cacheKey = String(row?.cache_key || "").trim();
      const name = cleanProductName(row?.product_name);
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
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
  };
}

async function main() {
  assertConfig();

  const existing = await fetchExistingCacheKeys();
  const skipped = {
    nonFood: 0,
    existing: 0,
    duplicate: 0,
    invalid: 0,
  };
  const byKey = new Map();
  const sitemapUrl = await resolveSitemapUrl();
  const xml = await fetchText(sitemapUrl);
  const rows = parseProductUrls(xml, sitemapUrl);
  let scannedProducts = 0;

  for (const row of rows) {
    scannedProducts++;
    if (!isCandidateFoodUrl(row)) {
      skipped.nonFood++;
      continue;
    }
    const target = normalizeTarget(row);
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
    source: "petcarerx_product_sitemap",
    sitemapIndexUrl,
    sitemapUrl,
    explicitSitemapUrl,
    includeExisting,
    includeTreats,
    scannedProducts,
    existingCount: existing.size,
    missingCount: targets.length,
    skipped,
    summary: summarizeTargets(targets),
    targets,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`PetCareRx products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing PetCareRx sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("PetCareRx sitemap catalog target export failed:", err.message);
  process.exit(1);
});
