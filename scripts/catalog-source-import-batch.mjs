import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const SOURCE_URL_DISCOVERY_SCRIPT = "scripts/catalog-source-url-discovery.mjs";
const PAGE_FEED_EXTRACT_SCRIPT = "scripts/catalog-page-feed-extract.mjs";
const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_MAX_URLS = 250;
const DEFAULT_MIN_SCORE = 3;
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 120_000;
const DEFAULT_EXTRACT_TIMEOUT_MS = 180_000;
const DEFAULT_IMPORT_TIMEOUT_MS = 60_000;

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
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

function nonNegativeInteger(value, fallback = 0) {
  if (value === null || value === undefined || compact(value) === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function slug(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "catalog-source";
}

function normalizedBrand(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueTerms(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(compact).filter(Boolean)) {
    const key = normalizedBrand(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
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

function discoveryConfigFor(target) {
  return target?.discovery && typeof target.discovery === "object"
    ? target.discovery
    : {};
}

function sourceQualityFor(target) {
  if (target?.sourcePriority === "gdsn") return "gdsn";
  if (target?.sourcePriority === "retailer") return "retailer_verified";
  if (target?.sourcePriority === "manufacturer") return "manufacturer";
  return "official";
}

function ingredientVerificationFor(sourceQuality) {
  if (sourceQuality === "gdsn") return "gdsn";
  if (sourceQuality === "manufacturer") return "manufacturer";
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  return "official";
}

function imageVerificationFor(sourceQuality) {
  if (sourceQuality === "manufacturer") return "manufacturer";
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  return "official";
}

function expectedBrandTermsFor(target, brand) {
  const sourceSlug = slug(target?.sourceSlug || target?.sourceOwner || target?.brand || "");
  return uniqueTerms([
    brand,
    target?.brand,
    ...(Array.isArray(target?.aliases) ? target.aliases : []),
    ...(sourceSlug === "k9-natural" ? ["Feline Natural"] : []),
  ]);
}

function runNode(script, args, { timeoutMs } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: timeoutMs,
  });

  if (result.status !== 0) {
    if (result.error?.code === "ETIMEDOUT" || result.signal) {
      throw new Error(`${script} timed out after ${timeoutMs}ms`);
    }

    throw new Error([
      `${script} failed with status ${result.status}`,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((value) => compact(value)));
}

function feedSummary(csvText) {
  const rows = parseCsv(csvText);
  const header = rows[0] || [];
  const dataRows = rows.slice(1);
  const completeIndex = header.indexOf("is_complete_food");
  const ingredientIndex = header.indexOf("ingredient_statement");
  const imageIndex = header.indexOf("product_image_url");

  return {
    rows: dataRows.length,
    complete_food_rows: dataRows.filter((row) => row[completeIndex] === "true").length,
    non_complete_rows: dataRows.filter((row) => row[completeIndex] === "false").length,
    rows_with_ingredients: dataRows.filter((row) => compact(row[ingredientIndex])).length,
    rows_with_images: dataRows.filter((row) => compact(row[imageIndex])).length,
  };
}

function filterUrlList(text, requiredPatternText, excludedPatternText = "") {
  const urls = String(text || "")
    .split(/\r?\n/)
    .map(compact)
    .filter(Boolean);
  if (!requiredPatternText && !excludedPatternText) return { urls, filteredOut: 0 };

  const requiredPattern = requiredPatternText ? new RegExp(requiredPatternText, "i") : null;
  const excludedPattern = excludedPatternText ? new RegExp(excludedPatternText, "i") : null;
  const filtered = urls.filter((url) => (
    (!requiredPattern || requiredPattern.test(url))
    && (!excludedPattern || !excludedPattern.test(url))
  ));
  return {
    urls: filtered,
    filteredOut: urls.length - filtered.length,
  };
}

function windowUrlList(urlFilter, offset, limit) {
  const selected = limit === null
    ? urlFilter.urls.slice(offset)
    : urlFilter.urls.slice(offset, offset + limit);
  return {
    urls: selected,
    filteredOut: urlFilter.filteredOut,
    totalBeforeWindow: urlFilter.urls.length,
    windowedOut: urlFilter.urls.length - selected.length,
  };
}

function appendTrailingSlash(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith("/") && !/\.[a-z0-9]{2,8}$/i.test(parsed.pathname)) {
      parsed.pathname = `${parsed.pathname}/`;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function applyDiscoveryUrlRules(urlFilter, discoveryConfig) {
  let urls = urlFilter.urls;
  if (Array.isArray(discoveryConfig?.stripQueryParams) && discoveryConfig.stripQueryParams.length > 0) {
    urls = urls.map((url) => {
      try {
        const parsed = new URL(url);
        for (const param of discoveryConfig.stripQueryParams) parsed.searchParams.delete(String(param));
        parsed.hash = "";
        return parsed.toString();
      } catch {
        return url;
      }
    });
  }
  if (discoveryConfig?.trailingSlash === "append") {
    urls = urls.map(appendTrailingSlash);
  }
  const seen = new Set();
  return {
    ...urlFilter,
    urls: urls.filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    }),
  };
}

function main() {
  const brand = compact(getArg("--brand"));
  const sourceTargets = loadSourceTargets();
  const target = brand ? sourceTargets.get(normalizedBrand(brand)) : null;
  const discoveryConfig = discoveryConfigFor(target);
  const targetUrl = compact(getArg("--target-url")) || compact(discoveryConfig.targetUrl) || target?.targetUrl || "";
  const source = slug(getArg("--source") || target?.sourceSlug || target?.sourceOwner || brand || "official-feed");
  const outputDir = compact(getArg("--output-dir")) || `outputs/catalog-source-imports/${source}`;
  const urlOffset = nonNegativeInteger(getArg("--url-offset"), 0);
  const urlLimit = positiveInteger(getArg("--url-limit"), null);
  const minimumDiscoveredUrls = urlLimit === null ? null : urlOffset + urlLimit;
  const configuredMaxUrls = positiveInteger(getArg("--max-urls"), positiveInteger(discoveryConfig.maxUrls, DEFAULT_MAX_URLS));
  const maxUrls = minimumDiscoveredUrls === null ? configuredMaxUrls : Math.max(configuredMaxUrls, minimumDiscoveredUrls);
  const minScore = Number(getArg("--min-score") ?? discoveryConfig.minScore ?? DEFAULT_MIN_SCORE);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const discoveryTimeoutMs = positiveInteger(
    getArg("--discovery-timeout-ms"),
    positiveInteger(discoveryConfig.discoveryTimeoutMs, DEFAULT_DISCOVERY_TIMEOUT_MS),
  );
  const extractTimeoutMs = positiveInteger(
    getArg("--extract-timeout-ms"),
    positiveInteger(discoveryConfig.extractTimeoutMs, DEFAULT_EXTRACT_TIMEOUT_MS),
  );
  const importTimeoutMs = positiveInteger(
    getArg("--import-timeout-ms"),
    positiveInteger(discoveryConfig.importTimeoutMs, DEFAULT_IMPORT_TIMEOUT_MS),
  );
  const fetchDelayMs = nonNegativeInteger(getArg("--fetch-delay-ms"), nonNegativeInteger(discoveryConfig.fetchDelayMs, 0));
  const allowPartialPages = hasArg("--allow-partial-pages");
  const strictPages = hasArg("--strict-pages");
  const preferPageBrand = hasArg("--prefer-page-brand");
  const sourceQuality = compact(getArg("--source-quality")) || sourceQualityFor(target);
  const ingredientVerification = compact(getArg("--ingredient-verification")) || ingredientVerificationFor(sourceQuality);
  const imageVerification = compact(getArg("--image-verification")) || imageVerificationFor(sourceQuality);
  const existingUrlListPath = compact(getArg("--url-list"));
  const requiredUrlPattern = compact(getArg("--required-url-pattern")) || compact(discoveryConfig.requiredUrlPattern);
  const excludedUrlPattern = compact(getArg("--excluded-url-pattern")) || compact(discoveryConfig.excludedUrlPattern);
  const expectedBrandTerms = hasArg("--allow-source-brand-mismatch")
    ? []
    : expectedBrandTermsFor(target, brand);
  const continueOnPageError = !strictPages && (
    allowPartialPages
    || sourceQuality === "manufacturer"
    || sourceQuality === "retailer_verified"
  );

  if (!targetUrl && !existingUrlListPath) {
    throw new Error("Usage: node scripts/catalog-source-import-batch.mjs --brand \"Blue Buffalo\" [--target-url https://... | --url-list urls.txt]");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const urlListPath = path.join(outputDir, "urls.txt");
  const feedPath = path.join(outputDir, "feed.csv");
  const sqlDir = path.join(outputDir, "sql");
  const reportPath = path.join(outputDir, "report.json");
  const rawCacheDir = path.join(outputDir, "raw");

  let discovery = { stdout: "", stderr: "" };
  let urlFilter = { urls: [], filteredOut: 0, totalBeforeWindow: 0, windowedOut: 0 };
  if (existingUrlListPath) {
    urlFilter = windowUrlList(filterUrlList(fs.readFileSync(existingUrlListPath, "utf8"), requiredUrlPattern, excludedUrlPattern), urlOffset, urlLimit);
    urlFilter = applyDiscoveryUrlRules(urlFilter, discoveryConfig);
    fs.writeFileSync(urlListPath, `${urlFilter.urls.join("\n")}\n`, "utf8");
  } else {
    const discoveryArgs = [
      "--target-url", targetUrl,
      "--max-urls", String(maxUrls),
      "--min-score", String(minScore),
      "--raw-cache-dir", path.join(rawCacheDir, "discovery"),
    ];
    if (brand) discoveryArgs.push("--brand-term", brand);
    if (requiredUrlPattern) discoveryArgs.push("--required-url-pattern", requiredUrlPattern);
    if (excludedUrlPattern) discoveryArgs.push("--excluded-url-pattern", excludedUrlPattern);
    if (fetchDelayMs > 0) discoveryArgs.push("--fetch-delay-ms", String(fetchDelayMs));
    if (hasArg("--allow-non-us-locales")) discoveryArgs.push("--allow-non-us-locales");
    const maxNestedSitemaps = getArg("--max-nested-sitemaps") ?? discoveryConfig.maxNestedSitemaps;
    const maxCrawlPages = getArg("--max-crawl-pages") ?? discoveryConfig.maxCrawlPages;
    const maxShopifyProductPages = getArg("--max-shopify-product-pages") ?? discoveryConfig.maxShopifyProductPages;
    const shopifyProductTypePattern = getArg("--shopify-product-type-pattern") ?? discoveryConfig.shopifyProductTypePattern;
    const shopifyProductTagPattern = getArg("--shopify-product-tag-pattern") ?? discoveryConfig.shopifyProductTagPattern;
    const shopifyExcludedProductTypePattern = getArg("--shopify-excluded-product-type-pattern") ?? discoveryConfig.shopifyExcludedProductTypePattern;
    const shopifyExcludedProductTagPattern = getArg("--shopify-excluded-product-tag-pattern") ?? discoveryConfig.shopifyExcludedProductTagPattern;
    const extraSitemaps = [
      ...(Array.isArray(discoveryConfig.extraSitemaps) ? discoveryConfig.extraSitemaps : []),
      ...(Array.isArray(discoveryConfig.extraTargetUrls) ? discoveryConfig.extraTargetUrls : []),
    ];
    if (maxNestedSitemaps !== undefined) discoveryArgs.push("--max-nested-sitemaps", String(maxNestedSitemaps));
    if (maxCrawlPages !== undefined) discoveryArgs.push("--max-crawl-pages", String(maxCrawlPages));
    if (maxShopifyProductPages !== undefined) {
      discoveryArgs.push("--max-shopify-product-pages", String(maxShopifyProductPages));
    }
    if (shopifyProductTypePattern) discoveryArgs.push("--shopify-product-type-pattern", String(shopifyProductTypePattern));
    if (shopifyProductTagPattern) discoveryArgs.push("--shopify-product-tag-pattern", String(shopifyProductTagPattern));
    if (shopifyExcludedProductTypePattern) discoveryArgs.push("--shopify-excluded-product-type-pattern", String(shopifyExcludedProductTypePattern));
    if (shopifyExcludedProductTagPattern) discoveryArgs.push("--shopify-excluded-product-tag-pattern", String(shopifyExcludedProductTagPattern));
    for (const sitemap of extraSitemaps) discoveryArgs.push("--extra-sitemap", String(sitemap));

    discovery = runNode(SOURCE_URL_DISCOVERY_SCRIPT, discoveryArgs, { timeoutMs: discoveryTimeoutMs });
    urlFilter = windowUrlList(filterUrlList(discovery.stdout, requiredUrlPattern, excludedUrlPattern), urlOffset, urlLimit);
    urlFilter = applyDiscoveryUrlRules(urlFilter, discoveryConfig);
    fs.writeFileSync(urlListPath, `${urlFilter.urls.join("\n")}\n`, "utf8");
  }

  if (urlFilter.urls.length === 0) {
    throw new Error("Source import batch produced zero product URLs after filtering.");
  }

  const pageExtractArgs = ["--file", urlListPath];
  if (strictPages) pageExtractArgs.push("--strict");
  else if (continueOnPageError) {
    pageExtractArgs.push("--continue-on-error");
  } else {
    pageExtractArgs.push("--strict");
  }
  if (brand) pageExtractArgs.push("--brand", brand);
  if (preferPageBrand) pageExtractArgs.push("--prefer-page-brand");
  if (fetchDelayMs > 0) pageExtractArgs.push("--fetch-delay-ms", String(fetchDelayMs));
  pageExtractArgs.push("--raw-cache-dir", rawCacheDir);
  const pageExtract = runNode(PAGE_FEED_EXTRACT_SCRIPT, pageExtractArgs, { timeoutMs: extractTimeoutMs });
  fs.writeFileSync(feedPath, pageExtract.stdout, "utf8");

  const feedStats = feedSummary(pageExtract.stdout);
  const importArgs = [
    "--file", feedPath,
    "--source", source,
    "--source-quality", sourceQuality,
    "--ingredient-verification", ingredientVerification,
    "--image-verification", imageVerification,
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
  ];
  for (const expectedBrand of expectedBrandTerms) {
    importArgs.push("--expected-brand", expectedBrand);
  }
  if (requiredUrlPattern) {
    importArgs.push("--required-source-url-pattern", requiredUrlPattern);
  }
  if (hasArg("--allow-source-brand-mismatch")) {
    importArgs.push("--allow-source-brand-mismatch");
  }
  const importResult = runNode(OFFICIAL_FEED_IMPORT_SCRIPT, importArgs, { timeoutMs: importTimeoutMs });

  const report = {
    generated_at: new Date().toISOString(),
    brand: brand || target?.brand || null,
    source,
    target_url: targetUrl,
    source_quality: sourceQuality,
    ingredient_verification: ingredientVerification,
    image_verification: imageVerification,
    expected_brand_terms: expectedBrandTerms,
    source_discovery: Object.keys(discoveryConfig).length > 0 ? discoveryConfig : null,
    max_urls: maxUrls,
    existing_url_list_path: existingUrlListPath || null,
    required_url_pattern: requiredUrlPattern || null,
    excluded_url_pattern: excludedUrlPattern || null,
    discovered_or_input_urls: urlFilter.totalBeforeWindow + urlFilter.filteredOut,
    filtered_out_urls: urlFilter.filteredOut,
    url_offset: urlOffset,
    url_limit: urlLimit,
    urls_before_window: urlFilter.totalBeforeWindow,
    windowed_out_urls: urlFilter.windowedOut,
    prepared_urls: urlFilter.urls.length,
    discovery_timeout_ms: discoveryTimeoutMs,
    extract_timeout_ms: extractTimeoutMs,
    import_timeout_ms: importTimeoutMs,
    fetch_delay_ms: fetchDelayMs,
    allow_partial_pages: continueOnPageError,
    strict_pages: strictPages,
    prefer_page_brand: preferPageBrand,
    url_list_path: urlListPath,
    feed_path: feedPath,
    sql_dir: sqlDir,
    raw_cache_dir: rawCacheDir,
    feed: feedStats,
    discovery_warnings: compact(discovery.stderr),
    extraction_warnings: compact(pageExtract.stderr),
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Source import batch prepared: ${source}`);
  console.log(`URLs: ${urlListPath}`);
  console.log(`Feed: ${feedPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Rows: ${feedStats.rows} (${feedStats.complete_food_rows} complete, ${feedStats.non_complete_rows} non-complete)`);
}

main();
