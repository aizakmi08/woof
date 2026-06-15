#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analyzeSource = fs.readFileSync(
  path.join(root, "supabase/functions/analyze/index.ts"),
  "utf8"
);
const productLookupSource = fs.readFileSync(
  path.join(root, "supabase/functions/product-lookup/index.ts"),
  "utf8"
);
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`edge request cancellation guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  analyzeSource.includes("function startLinkedTimedRequest(label: string, timeoutMs: number, parentSignal?: AbortSignal)") &&
    analyzeSource.includes("parentSignal.addEventListener(\"abort\", abortFromParent, { once: true })") &&
    analyzeSource.includes("parentSignal?.removeEventListener(\"abort\", abortFromParent)") &&
    analyzeSource.includes("abort: () => controller.abort()"),
  "Edge analyze requests must have a reusable timeout that links to the client request signal"
);

assert(
  analyzeSource.includes("async function runSupabaseQuery(") &&
    analyzeSource.includes("buildQuery: (signal: AbortSignal) => PromiseLike<any>") &&
    /const request = startLinkedTimedRequest\(label, timeoutMs, parentSignal\);[\s\S]{0,160}return await buildQuery\(request\.signal\);[\s\S]{0,80}request\.cleanup\(\);/.test(analyzeSource),
  "Edge analyze Supabase reads and writes must use the shared request-linked deadline helper"
);

assert(
  analyzeSource.includes("function runBackgroundTask(label: string, task: Promise<unknown>): void") &&
    analyzeSource.includes("(globalThis as any).EdgeRuntime") &&
    analyzeSource.includes("edgeRuntime.waitUntil(guarded)") &&
    analyzeSource.includes('runBackgroundTask("Stream cache/quota persistence"') &&
    analyzeSource.includes('runBackgroundTask(\n          "Non-stream user OCR catalog save"') &&
    analyzeSource.includes('runBackgroundTask(\n        "Non-stream cache write"'),
  "completed-result cache/catalog persistence must use EdgeRuntime.waitUntil background tasks instead of untracked post-response promises"
);

assert(
  analyzeSource.includes("const EDGE_CACHE_READ_TIMEOUT_MS = 5_000") &&
    analyzeSource.includes("const EDGE_CACHE_WRITE_TIMEOUT_MS = 5_000") &&
    analyzeSource.includes("const EDGE_BRAND_PROFILE_TIMEOUT_MS = 4_000") &&
    analyzeSource.includes("const EDGE_QUOTA_COMMIT_TIMEOUT_MS = 5_000"),
  "Edge analyze database deadlines must be short enough to avoid store-network loading stalls"
);

assert(
  analyzeSource.includes('"Pre-call cache lookup"') &&
    analyzeSource.includes("EDGE_CACHE_READ_TIMEOUT_MS") &&
    analyzeSource.includes(".abortSignal(signal)\n            .maybeSingle()") &&
    analyzeSource.includes('"Brand profile lookup"') &&
    analyzeSource.includes("EDGE_BRAND_PROFILE_TIMEOUT_MS") &&
    analyzeSource.includes('supabase.rpc("get_brand_profile"') &&
    analyzeSource.includes("}).abortSignal(signal)") &&
    analyzeSource.includes('"Analysis cache write"') &&
    analyzeSource.includes("EDGE_CACHE_WRITE_TIMEOUT_MS") &&
    analyzeSource.includes('.from("analysis_cache")') &&
    analyzeSource.includes(".upsert(") &&
    analyzeSource.includes(")\n      .abortSignal(signal)"),
  "pre-call cache reads, brand profile reads, and shared cache writes must be abortable"
);

assert(
  analyzeSource.includes('"User OCR catalog save"') &&
    analyzeSource.includes("EDGE_CACHE_WRITE_TIMEOUT_MS") &&
    analyzeSource.includes('supabase.rpc("save_product_data"') &&
    analyzeSource.includes("}).abortSignal(signal)") &&
    analyzeSource.includes('"Completed quota commit"') &&
    analyzeSource.includes("EDGE_QUOTA_COMMIT_TIMEOUT_MS") &&
    analyzeSource.includes("supabase.rpc(rpcName") &&
    analyzeSource.includes("}).abortSignal(signal)"),
  "user OCR catalog writes and completed quota commits must be request-linked and bounded"
);

assert(
  analyzeSource.includes("applyBrandProfile(supabase, analysis as Record<string, any>, brandHint, req.signal)") &&
    analyzeSource.includes("commitCompletedQuota(") &&
    analyzeSource.includes("serverQuotaAccounting === true,\n            req.signal") &&
    analyzeSource.includes("await applyBrandProfile(supabase, analysis as Record<string, any>, brandHint);") &&
    analyzeSource.includes("await saveTrustedUserOcrProductData(supabase, analysis!, opffProduct, cacheKey);") &&
    analyzeSource.includes("await writeToCache(supabase, analysis!, mode, cacheKey, opffProduct, requestedLookupType, cacheAliases);") &&
    analyzeSource.includes("saveTrustedUserOcrProductData(supabase, analysis!, opffProduct, cacheKey),") &&
    analyzeSource.includes("writeToCache(supabase, analysis!, mode, cacheKey, opffProduct, requestedLookupType, cacheAliases),"),
  "pre-response correction/quota work must remain request-linked where it gates the response, while completed-result background cache/catalog writes must use detached bounded deadlines"
);

assert(
  analyzeSource.includes('startLinkedTimedRequest("GPT identify", 15000, req.signal)') &&
    analyzeSource.includes("signal: identifyRequest.signal") &&
    /identifyRequest\.didTimeout\(\)[\s\S]{0,120}Identification timed out/.test(analyzeSource) &&
    /req\.signal\.aborted[\s\S]{0,120}Request cancelled/.test(analyzeSource),
  "identify helper must abort on client disconnect and stop at its deadline instead of falling through to slower work"
);

assert(
  analyzeSource.includes('startLinkedTimedRequest("GPT ingredients lookup", 10000, req.signal)') &&
    analyzeSource.includes("signal: ingredientsLookupRequest.signal") &&
    analyzeSource.includes('"reason": "lookup timeout"') &&
    analyzeSource.includes("ingredientsLookupRequest.cleanup();"),
  "ingredients lookup helper must be deadline-bound and client-abort-aware"
);

assert(
  analyzeSource.includes('startLinkedTimedRequest("Claude analysis", CLAUDE_TIMEOUT_MS, req.signal)') &&
    analyzeSource.includes("signal: claudeRequest.signal") &&
    !analyzeSource.includes("const fetchController = new AbortController()") &&
    !analyzeSource.includes("const fetchTimeout = setTimeout(() => fetchController.abort(), CLAUDE_TIMEOUT_MS)"),
  "main Claude call must use the linked request signal instead of an isolated controller"
);

assert(
  analyzeSource.includes("const abortableClientStream = new ReadableStream") &&
    analyzeSource.includes("async cancel()") &&
    analyzeSource.includes("claudeRequest.abort();") &&
    analyzeSource.includes("await clientReader.cancel().catch(() => {});") &&
    analyzeSource.includes("return new Response(abortableClientStream"),
  "streaming responses must abort upstream work when the client cancels the response"
);

assert(
  /finally \{[\s\S]{0,80}clearTimeout\(cacheTimeout\);[\s\S]{0,80}claudeRequest\.cleanup\(\);[\s\S]{0,40}\}/.test(analyzeSource) &&
    analyzeSource.includes("claudeResponse.json().finally(() => claudeRequest.cleanup())"),
  "Edge analyze must keep cleanup active through streaming and non-streaming body consumption"
);

assert(
  productLookupSource.includes("function startLinkedTimedRequest(label: string, timeoutMs: number, parentSignal?: AbortSignal)") &&
    productLookupSource.includes("parentSignal.addEventListener(\"abort\", abortFromParent, { once: true })") &&
    productLookupSource.includes("parentSignal?.removeEventListener(\"abort\", abortFromParent)") &&
    productLookupSource.includes("async function fetchJsonWithLinkedTimeout") &&
    productLookupSource.includes("async function fetchTextWithLinkedTimeout") &&
    !productLookupSource.includes("AbortSignal.timeout("),
  "product-lookup upstream fetches must use request-linked timeout helpers, not isolated AbortSignal.timeout calls"
);

assert(
  productLookupSource.includes("const PRODUCT_LOOKUP_DB_TIMEOUT_MS = 8_000") &&
    productLookupSource.includes("const PRODUCT_LOOKUP_CACHE_READ_TIMEOUT_MS = 5_000") &&
    productLookupSource.includes("const PRODUCT_LOOKUP_CACHE_WRITE_TIMEOUT_MS = 5_000") &&
    productLookupSource.includes("async function runSupabaseQuery(") &&
    /Promise\.race\(\[buildQuery\(request\.signal\), abortPromise\]\)/.test(productLookupSource),
  "product-lookup Supabase work must use request-linked DB deadlines, including APIs without native abort support"
);

assert(
  productLookupSource.includes('"Auth user lookup"') &&
    productLookupSource.includes('"Authenticated product lookup rate limit"') &&
    productLookupSource.includes('"Anonymous product lookup rate limit"') &&
    productLookupSource.includes('"Product data cache lookup"') &&
    productLookupSource.includes('"Product data cache write"') &&
    /Product data cache lookup[\s\S]{0,520}\.abortSignal\(signal\)/.test(productLookupSource) &&
    /Product data cache write[\s\S]{0,760}\.abortSignal\(signal\)/.test(productLookupSource),
  "product-lookup auth, rate-limit, cache read, and cache write database paths must be bounded"
);

assert(
  /fetchJsonWithLinkedTimeout\([\s\S]{0,360}await response\.json\(\)[\s\S]{0,120}request\.cleanup\(\)/.test(productLookupSource) &&
    /fetchTextWithLinkedTimeout\([\s\S]{0,360}await response\.text\(\)[\s\S]{0,120}request\.cleanup\(\)/.test(productLookupSource),
  "product-lookup linked timeout helpers must keep deadlines active through response body consumption"
);

assert(
  productLookupSource.includes("searchAmazon(productName, brand, petType, scrapingBeeKey, req.signal)") &&
    productLookupSource.includes("searchOPFF(productName, brand, petType, req.signal)") &&
    productLookupSource.includes("scrapeViaGoogle(config, productName, brand, scrapingBeeKey, req.signal)") &&
    productLookupSource.includes("universalIngredientSearch(productName, brand, petType, scrapingBeeKey, req.signal)"),
  "product-lookup tiered scraper calls must propagate the client request signal"
);

assert(
  packageJson.includes('"test:edge-request-cancellation": "node scripts/test-edge-request-cancellation-guards.js"') &&
    packageJson.includes("npm run test:edge-request-cancellation"),
  "edge request cancellation guard must be wired into package scripts"
);

console.log("edge request cancellation guard passed");
