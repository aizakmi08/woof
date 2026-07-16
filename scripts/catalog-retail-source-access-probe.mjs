import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_OUTPUT_DIR = "outputs/catalog-retail-source-access/current";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_TARGETS = [
  {
    source: "chewy-retail-catalog",
    retailer: "Chewy",
    url: "https://www.chewy.com/b/food-332",
    expectedAccess: "requires_authorized_feed",
  },
  {
    source: "petco-retail-catalog",
    retailer: "Petco",
    url: "https://www.petco.com/shop/en/petcostore/category/dog/dog-food",
    expectedAccess: "requires_authorized_feed",
  },
  {
    source: "petsmart-retail-catalog",
    retailer: "PetSmart",
    url: "https://www.petsmart.com/dog/food/",
    expectedAccess: "runnable",
  },
  {
    source: "walmart-retail-catalog",
    retailer: "Walmart",
    url: "https://www.walmart.com/cp/pet-food/5440",
    expectedAccess: "requires_authorized_feed",
  },
];

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) {
      values.push(value);
      index += 1;
    }
  }
  return values;
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

function normalizeKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source";
}

function loadTargets() {
  const explicitUrls = getArgs("--url");
  if (explicitUrls.length === 0) return DEFAULT_TARGETS;

  return explicitUrls.map((url, index) => ({
    source: normalizeKey(getArgs("--source")[index] || new URL(url).hostname),
    retailer: compact(getArgs("--retailer")[index] || new URL(url).hostname),
    url,
    expectedAccess: "unknown",
  }));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "WoofCatalogVerifier/1.0",
        "Accept": "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5",
      },
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      contentType: response.headers.get("content-type") || "",
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function signalMatches(body) {
  const text = String(body || "");
  const signals = [];
  const checks = [
    ["cloudflare_challenge", /cdn-cgi\/challenge-platform|__CF\$cv|cf-browser-verification|Attention Required/i],
    ["rate_limited", /\b(?:HTTP\s*)?429\b|too many requests|rate limit/i],
    ["captcha_or_robot_check", /\b(captcha|robot check|verify you are human|press and hold)\b/i],
    ["javascript_required_shell", /\b(enable|turn on)\s+javascript|javascript is required/i],
    ["next_data_payload", /<script[^>]+id=["']__NEXT_DATA__["']/i],
    ["petsmart_instantsearch_payload", /Symbol\.for\(["']InstantSearchInitialResults["']\)/i],
    ["product_json_ld", /application\/ld\+json/i],
    ["ingredient_text_visible", /\bingredients?\s*[:\n]/i],
  ];

  for (const [name, regex] of checks) {
    if (regex.test(text)) signals.push(name);
  }
  return signals;
}

function accessDecision({ source, status, body, signals }) {
  if (/^petsmart-retail-catalog$/i.test(source) && signals.includes("petsmart_instantsearch_payload")) return "runnable";
  if (status === 429 || signals.includes("rate_limited")) return "requires_authorized_feed";
  if (signals.includes("cloudflare_challenge") || signals.includes("captcha_or_robot_check")) return "requires_authorized_feed";
  if (/^walmart-retail-catalog$/i.test(source) && signals.includes("next_data_payload")) {
    return "identity_only_requires_authorized_feed";
  }
  if (signals.includes("next_data_payload") || signals.includes("product_json_ld") || signals.includes("ingredient_text_visible")) {
    return "needs_source_specific_adapter_review";
  }
  if (String(body || "").length < 1_000) return "requires_authorized_feed";
  return "needs_source_specific_adapter_review";
}

function markdownReport(results) {
  const rows = results.map((result) => [
    result.retailer,
    result.source,
    String(result.status || result.error || ""),
    result.decision,
    result.expected_access,
    result.body_bytes,
    result.signals.join("; "),
  ]);

  return `# Retail Source Access Probe

Generated: ${new Date().toISOString()}

This report uses normal public fetches with \`WoofCatalogVerifier/1.0\`. It does not use browser stealth, proxy rotation, CAPTCHA handling, or anti-bot bypass. A source can become verified-ready only through exact source-backed ingredients and a verified front image.

| Retailer | Source | Status | Decision | Expected | Bytes | Signals |
|---|---|---:|---|---|---:|---|
${rows.map((row) => `| ${row.map((value) => String(value).replace(/\|/g, "\\|")).join(" | ")} |`).join("\n")}

`;
}

async function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-retail-source-access-probe.mjs [--output-dir <dir>]",
      "",
      "Probes broad retail leader source URLs with normal public fetches and records whether a safe scraper path is currently available.",
      "",
      "Options:",
      "  --output-dir <dir>",
      "  --timeout-ms <n>",
      "  --url <url>          Repeatable custom target.",
      "  --source <slug>      Repeatable custom source for matching --url order.",
      "  --retailer <name>    Repeatable custom retailer for matching --url order.",
    ].join("\n"));
    return;
  }

  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  const timeoutMs = positiveInteger(getArg("--timeout-ms"), DEFAULT_TIMEOUT_MS);
  const targets = loadTargets();
  const rawDir = path.join(outputDir, "raw");
  fs.mkdirSync(rawDir, { recursive: true });

  const results = [];
  for (const target of targets) {
    const source = normalizeKey(target.source);
    try {
      const fetched = await fetchWithTimeout(target.url, timeoutMs);
      const sha256 = crypto.createHash("sha256").update(fetched.body, "utf8").digest("hex");
      const rawPath = path.join(rawDir, `${source}.html`);
      fs.writeFileSync(rawPath, fetched.body, "utf8");
      const signals = signalMatches(fetched.body);
      results.push({
        source,
        retailer: target.retailer,
        url: target.url,
        final_url: fetched.finalUrl,
        expected_access: target.expectedAccess,
        status: fetched.status,
        ok: fetched.ok,
        content_type: fetched.contentType,
        body_bytes: Buffer.byteLength(fetched.body, "utf8"),
        sha256,
        raw_path: rawPath,
        signals,
        decision: accessDecision({ source, status: fetched.status, body: fetched.body, signals }),
      });
    } catch (error) {
      results.push({
        source,
        retailer: target.retailer,
        url: target.url,
        expected_access: target.expectedAccess,
        error: error instanceof Error ? error.message : String(error),
        body_bytes: 0,
        signals: [],
        decision: "requires_authorized_feed",
      });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    timeout_ms: timeoutMs,
    output_dir: outputDir,
    policy: {
      anti_bot_bypass: false,
      user_agent: "WoofCatalogVerifier/1.0",
      verified_promotion_requires: [
        "exact source-backed ingredient statement",
        "verified front package image",
        "dog/cat complete-food metadata",
        "source URL and verification timestamp",
      ],
    },
    results,
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "report.md"), markdownReport(results), "utf8");
  console.log(JSON.stringify({
    output_dir: outputDir,
    results: results.map((result) => ({
      source: result.source,
      status: result.status || result.error,
      decision: result.decision,
      signals: result.signals,
      body_bytes: result.body_bytes,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
