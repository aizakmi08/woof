import fs from "node:fs";
import { safeFetchText } from "./catalog-safe-fetch.mjs";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_MAX_URLS = 250;
const DEFAULT_MIN_SCORE = 3;
const DEFAULT_MAX_NESTED_SITEMAPS = 20;
const DEFAULT_MAX_CRAWL_PAGES = 100;
const USER_AGENT = "WoofCatalogVerifier/1.0 (product URL discovery)";
const LOCALE_PREFIX_PATTERN = /^\/([a-z]{2})-([a-z]{2})(?:\/|$)/i;
const PRODUCT_PATH_PATTERNS = [
  /\/products?\//i,
  /\/shop\/.*\/product/i,
  /^\/(?:dogs|cats)\/shop\/[^/]+$/i,
  /\/p\//i,
  /\/pd\//i,
  /\/item\//i,
  /^\/(?:dog|cat)-food\/[^/]+\/[^/]+/i,
];
const EXCLUDED_PATH_PATTERNS = [
  /\/(?:blog|blogs|article|articles|news|press|about|contact|store-locator|stores|account|cart|checkout|search|collections|collection|categories|category|policies|privacy|terms)(?:\/|$)/i,
  /\/(?:compare|compare-your-brand|dog-and-cat-food-product-recommender|dog-food-bowl-builder)(?:\/|$)/i,
  /\/product-finder(?:\/|$)/i,
  /\/pro-plan\/products(?:\/|$)/i,
  /\/(?:fancy-feast|friskies|purina-one|beneful)\/products(?:\/|$)/i,
  /\/natural-(?:dog|cat|pet)-food(?:\/|$)/i,
  /\/(?:dog|cat)-treats(?:\/|$)/i,
  /\/(?:dog|cat)-food-toppers(?:\/|$)/i,
  /\/(?:dog|cat)\/food-toppers(?:\/|$)/i,
  /\.(?:jpg|jpeg|png|webp|gif|svg|pdf|zip)(?:$|\?)/i,
];
const CRAWL_PATH_PATTERNS = [
  /\/product-finder(?:\/|$)/i,
  /\/pro-plan\/products(?:\/|$)/i,
  /\/(?:fancy-feast|friskies|purina-one|beneful)\/products(?:\/|$)/i,
  /\/on\/demandware\.store\/[^?#]+\/Search-UpdateGrid(?:$|\?)/i,
];
const PET_TERMS = /\b(dog|dogs|puppy|puppies|canine|cat|cats|kitten|kittens|feline|pet|pets)\b/i;
const FOOD_TERMS = /\b(food|kibble|dry|wet|can|canned|pate|pat[eé]|recipe|formula|meal|stew|gravy|morsel|chunk|shred|freeze[- ]?dried|dehydrated|fresh|frozen)\b/i;

function getArgs(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function getArg(name, fallback = null) {
  const values = getArgs(name);
  return values.length > 0 ? values[values.length - 1] : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function normalizedBrand(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeUrl(value, baseUrl = "") {
  const text = decodeEntities(compact(value));
  if (!text || /^mailto:|^tel:|^javascript:/i.test(text)) return "";

  try {
    const url = new URL(text, baseUrl || undefined);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|gad_|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    if ([...url.searchParams.keys()].length === 0) url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function sameOrigin(url, origin) {
  if (!origin) return true;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function nonUsLocaleCountry(pathname) {
  const match = String(pathname || "").match(LOCALE_PREFIX_PATTERN);
  if (!match) return "";
  const country = match[2].toLowerCase();
  return country === "us" ? "" : country;
}

function shouldCrawlUrl(url) {
  try {
    const { pathname } = new URL(url);
    return CRAWL_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
  } catch {
    return false;
  }
}

function loadSourceTargets() {
  const rows = JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"));
  const byBrand = new Map();

  for (const target of rows) {
    for (const value of [target.brand, ...(Array.isArray(target.aliases) ? target.aliases : [])]) {
      const key = normalizedBrand(value);
      if (key) byBrand.set(key, target);
    }
  }

  return byBrand;
}

function sourceTargetFromArgs() {
  const brand = getArg("--brand");
  if (!brand) return null;

  const target = loadSourceTargets().get(normalizedBrand(brand));
  if (!target) {
    throw new Error(`No source target found for brand: ${brand}`);
  }
  return target;
}

async function fetchText(url) {
  return safeFetchText(url, {
    userAgent: USER_AGENT,
    accept: "text/html,application/xhtml+xml,application/xml,text/xml,text/plain",
    cacheDir: compact(getArg("--raw-cache-dir")),
    fetchDelayMs: nonNegativeInteger(getArg("--fetch-delay-ms"), 0),
  });
}

function readLocal(filePath, sourceUrl = "") {
  return {
    body: fs.readFileSync(filePath, "utf8"),
    finalUrl: sourceUrl || `file://${filePath}`,
    contentType: /\.xml$/i.test(filePath) ? "application/xml" : "text/html",
  };
}

function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeEntities(match[1]))
    .map((value) => compact(value))
    .filter(Boolean);
}

function extractRobotsSitemaps(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*sitemap:\s*(.+)\s*$/i)?.[1])
    .map(compact)
    .filter(Boolean);
}

function extractHtmlLinks(html, baseUrl) {
  return [
    ...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/\bdata-url=["']([^"']+)["']/gi),
  ]
    .map((match) => normalizeUrl(match[1], baseUrl))
    .filter(Boolean);
}

function productMetadataText(value) {
  if (Array.isArray(value)) return value.map(compact).filter(Boolean).join(" ");
  return compact(value);
}

function productMatchesMetadataFilters(product, filters = {}) {
  const typeText = productMetadataText(
    product?.product_type
      || product?.productType
      || product?.type
      || product?.category
  );
  const tagText = productMetadataText(product?.tags);

  if (filters.productTypePattern && !filters.productTypePattern.test(typeText)) return false;
  if (filters.productTagPattern && !filters.productTagPattern.test(tagText)) return false;
  if (filters.excludedProductTypePattern && filters.excludedProductTypePattern.test(typeText)) return false;
  if (filters.excludedProductTagPattern && filters.excludedProductTagPattern.test(tagText)) return false;
  return true;
}

function extractJsonProductUrls(text, baseUrl, filters = {}) {
  try {
    const json = JSON.parse(text);
    const products = Array.isArray(json?.products)
      ? json.products
      : Array.isArray(json)
        ? json
        : [];
    return products
      .filter((product) => productMatchesMetadataFilters(product, filters))
      .map((product) => compact(product?.handle || product?.url || product?.product_url))
      .filter(Boolean)
      .map((value) => {
        if (/^https?:\/\//i.test(value)) return normalizeUrl(value, baseUrl);
        const handle = value
          .replace(/^\/+/, "")
          .replace(/^products\//i, "")
          .replace(/\/+$/, "");
        return normalizeUrl(`/products/${handle}`, baseUrl);
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function shopifyProductsJsonNextPageUrl(text, currentUrl, maxShopifyProductPages) {
  if (!maxShopifyProductPages || maxShopifyProductPages <= 1) return "";

  let parsed;
  try {
    parsed = new URL(currentUrl);
  } catch {
    return "";
  }
  if (!/\/products\.json$/i.test(parsed.pathname)) return "";

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return "";
  }
  const products = Array.isArray(json?.products) ? json.products : [];
  if (products.length === 0) return "";

  const limit = positiveInteger(parsed.searchParams.get("limit"), products.length);
  if (products.length < limit) return "";

  const currentPage = positiveInteger(parsed.searchParams.get("page"), 1);
  if (currentPage >= maxShopifyProductPages) return "";

  parsed.searchParams.set("page", String(currentPage + 1));
  return normalizeUrl(parsed.toString(), currentUrl);
}

function urlScore(url, brandTerms = [], { allowNonUsLocales = false } = {}) {
  let score = 0;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return -100;
  }

  if (!allowNonUsLocales && nonUsLocaleCountry(parsed.pathname)) return -100;

  const path = decodeURIComponent(parsed.pathname.replace(/[-_+/]+/g, " "));
  const fullText = `${parsed.hostname} ${path}`.toLowerCase();

  if (EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname))) score -= 8;
  if (PRODUCT_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname))) score += 5;
  if (PET_TERMS.test(fullText)) score += 3;
  if (FOOD_TERMS.test(fullText)) score += 2;

  for (const brand of brandTerms) {
    const normalized = normalizedBrand(brand);
    if (normalized && fullText.includes(normalized)) score += 1;
  }

  return score;
}

function sortDiscovered(urls, brandTerms, minScore, maxUrls, options = {}) {
  const requiredPattern = options.requiredUrlPattern
    ? new RegExp(options.requiredUrlPattern, "i")
    : null;
  const excludedPattern = options.excludedUrlPattern
    ? new RegExp(options.excludedUrlPattern, "i")
    : null;
  const scored = [...new Set(urls)]
    .filter((url) => !requiredPattern || requiredPattern.test(url))
    .filter((url) => !excludedPattern || !excludedPattern.test(url))
    .map((url) => ({ url, score: urlScore(url, brandTerms, options) }))
    .filter((row) => row.score >= minScore)
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));

  return scored.slice(0, maxUrls);
}

function defaultSitemapCandidates(targetUrl) {
  try {
    const url = new URL(targetUrl);
    return [
      `${url.origin}/sitemap.xml`,
      `${url.origin}/sitemap_products_1.xml`,
      `${url.origin}/robots.txt`,
    ];
  } catch {
    return [];
  }
}

async function discoverRemote({
  targetUrl,
  extraSitemaps,
  maxNestedSitemaps,
  maxCrawlPages,
  maxShopifyProductPages,
  productFilters,
}) {
  const urls = [];
  const fetched = new Set();
  const crawlQueued = new Set();
  const origin = new URL(targetUrl).origin;
  const queue = [targetUrl, ...defaultSitemapCandidates(targetUrl), ...extraSitemaps];
  let nestedSitemaps = 0;
  let crawlPages = 0;

  function queueCrawl(url) {
    const normalized = normalizeUrl(url, targetUrl);
    if (
      !normalized
      || fetched.has(normalized)
      || crawlQueued.has(normalized)
      || !sameOrigin(normalized, origin)
      || !shouldCrawlUrl(normalized)
      || crawlPages >= maxCrawlPages
    ) {
      return false;
    }

    crawlPages += 1;
    crawlQueued.add(normalized);
    queue.push(normalized);
    return true;
  }

  while (queue.length > 0) {
    const next = normalizeUrl(queue.shift(), targetUrl);
    if (!next || fetched.has(next) || !sameOrigin(next, origin)) continue;
    fetched.add(next);

    let result;
    try {
      result = await fetchText(next);
    } catch {
      continue;
    }

    const content = result.body;
    const looksXml = /xml/i.test(result.contentType) || /<urlset|<sitemapindex/i.test(content);
    const looksJson = /json/i.test(result.contentType) || /^\s*[\[{]/.test(content);
    const looksRobots = /\/robots\.txt$/i.test(new URL(result.finalUrl).pathname);

    if (looksRobots) {
      queue.push(...extractRobotsSitemaps(content));
    } else if (looksXml) {
      for (const loc of extractSitemapUrls(content)) {
        if (/\.xml(?:$|\?)/i.test(loc) && nestedSitemaps < maxNestedSitemaps) {
          nestedSitemaps += 1;
          queue.push(loc);
        } else if (!queueCrawl(loc)) {
          urls.push(normalizeUrl(loc, result.finalUrl));
        }
      }
    } else if (looksJson) {
      urls.push(...extractJsonProductUrls(content, result.finalUrl, productFilters));
      const nextShopifyPage = shopifyProductsJsonNextPageUrl(
        content,
        result.finalUrl,
        maxShopifyProductPages,
      );
      if (nextShopifyPage && !fetched.has(nextShopifyPage)) queue.push(nextShopifyPage);
    } else {
      for (const link of extractHtmlLinks(content, result.finalUrl)) {
        if (!queueCrawl(link)) {
          urls.push(link);
        }
      }
    }
  }

  return urls.filter(Boolean);
}

function discoverLocal({ htmlFiles, sitemapFiles, sourceUrl }) {
  const urls = [];

  for (const filePath of htmlFiles) {
    const { body, finalUrl } = readLocal(filePath, sourceUrl);
    urls.push(...extractHtmlLinks(body, finalUrl));
  }

  for (const filePath of sitemapFiles) {
    const { body, finalUrl } = readLocal(filePath, sourceUrl);
    urls.push(...extractSitemapUrls(body).map((url) => normalizeUrl(url, finalUrl)));
  }

  return urls.filter(Boolean);
}

function printRows(rows, { json, csv }) {
  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (csv) {
    console.log("url,score");
    for (const row of rows) {
      console.log(`"${row.url.replace(/"/g, '""')}",${row.score}`);
    }
    return;
  }

  for (const row of rows) console.log(row.url);
}

async function main() {
  const target = sourceTargetFromArgs();
  const targetUrl = getArg("--target-url") || target?.targetUrl || "";
  const htmlFiles = getArgs("--html");
  const sitemapFiles = getArgs("--sitemap");
  const sourceUrl = getArg("--source-url") || targetUrl;
  const maxUrls = positiveInteger(getArg("--max-urls"), DEFAULT_MAX_URLS);
  const minScore = Number(getArg("--min-score") ?? DEFAULT_MIN_SCORE);
  const maxNestedSitemaps = nonNegativeInteger(getArg("--max-nested-sitemaps"), DEFAULT_MAX_NESTED_SITEMAPS);
  const maxCrawlPages = positiveInteger(getArg("--max-crawl-pages"), DEFAULT_MAX_CRAWL_PAGES);
  const maxShopifyProductPages = positiveInteger(getArg("--max-shopify-product-pages"), 1);
  const allowNonUsLocales = hasArg("--allow-non-us-locales");
  const requiredUrlPattern = getArg("--required-url-pattern");
  const excludedUrlPattern = getArg("--excluded-url-pattern");
  const shopifyProductTypePatternText = getArg("--shopify-product-type-pattern");
  const shopifyProductTagPatternText = getArg("--shopify-product-tag-pattern");
  const shopifyExcludedProductTypePatternText = getArg("--shopify-excluded-product-type-pattern");
  const shopifyExcludedProductTagPatternText = getArg("--shopify-excluded-product-tag-pattern");
  const productFilters = {
    productTypePattern: shopifyProductTypePatternText ? new RegExp(shopifyProductTypePatternText, "i") : null,
    productTagPattern: shopifyProductTagPatternText ? new RegExp(shopifyProductTagPatternText, "i") : null,
    excludedProductTypePattern: shopifyExcludedProductTypePatternText ? new RegExp(shopifyExcludedProductTypePatternText, "i") : null,
    excludedProductTagPattern: shopifyExcludedProductTagPatternText ? new RegExp(shopifyExcludedProductTagPatternText, "i") : null,
  };
  const json = hasArg("--json");
  const csv = hasArg("--csv");
  const brandTerms = target
    ? [target.brand, ...(Array.isArray(target.aliases) ? target.aliases : [])]
    : getArgs("--brand-term");

  if (!targetUrl && htmlFiles.length === 0 && sitemapFiles.length === 0) {
    throw new Error("Usage: node scripts/catalog-source-url-discovery.mjs --brand \"Blue Buffalo\" or --target-url https://... or --html page.html/--sitemap sitemap.xml");
  }

  const urls = [
    ...discoverLocal({ htmlFiles, sitemapFiles, sourceUrl }),
    ...(targetUrl && /^https?:\/\//i.test(targetUrl)
      ? await discoverRemote({
        targetUrl,
        extraSitemaps: [...getArgs("--extra-sitemap"), ...getArgs("--extra-target-url")],
        maxNestedSitemaps,
        maxCrawlPages,
        maxShopifyProductPages,
        productFilters,
      })
      : []),
  ];
  const rows = sortDiscovered(urls, brandTerms, minScore, maxUrls, {
    allowNonUsLocales,
    requiredUrlPattern,
    excludedUrlPattern,
  });
  printRows(rows, { json, csv });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
