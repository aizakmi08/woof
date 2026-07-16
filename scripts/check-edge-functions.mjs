import fs from "node:fs";
import path from "node:path";

const FUNCTIONS_DIR = "supabase/functions";
const failures = [];

const FUNCTION_RULES = {
  analyze: {
    requiresBearerAuth: true,
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"],
    requiredRpc: ["check_rate_limit", "consume_scan", "reverse_scan"],
  },
  "product-lookup": {
    requiresBearerAuth: true,
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    requiredRpc: [],
  },
  "label-lookup": {
    requiresBearerAuth: true,
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"],
    requiredRpc: ["check_rate_limit"],
  },
  "revenuecat-sync": {
    requiresBearerAuth: true,
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REVENUECAT_REST_API_KEY"],
    requiredRpc: [],
  },
  "revenuecat-webhook": {
    requiresBearerAuth: false,
    requiresWebhookAuth: true,
    requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REVENUECAT_WEBHOOK_AUTH"],
    requiredRpc: [],
  },
};

function fail(message) {
  failures.push(message);
}

function functionDirs() {
  return fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function hasRegex(text, regex) {
  return regex.test(text);
}

function numericConstant(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)`));
  return match ? Number(match[1].replace(/_/g, "")) : null;
}

function checkCommon(name, source) {
  if (!hasRegex(source, /Deno\.serve\s*\(/)) {
    fail(`${name}: missing Deno.serve handler`);
  }

  if (!hasRegex(source, /if\s*\(\s*req\.method\s*===\s*["']OPTIONS["']\s*\)/)) {
    fail(`${name}: missing OPTIONS preflight handler`);
  }

  if (!hasRegex(source, /req\.method\s*!==\s*["']POST["']/)) {
    fail(`${name}: missing POST-only method guard`);
  }

  if (!hasRegex(source, /const\s+CORS_HEADERS\s*=/)) {
    fail(`${name}: missing CORS_HEADERS constant`);
  }

  const corsHeaderMatch = source.match(/const\s+CORS_HEADERS\s*=\s*\{([\s\S]*?)\n\};/);
  if (corsHeaderMatch?.[1] && /["']Access-Control-Allow-Origin["']\s*:\s*["']\*["']/.test(corsHeaderMatch[1])) {
    fail(`${name}: do not use wildcard Access-Control-Allow-Origin in static CORS headers`);
  }

  if (!source.includes("function corsHeaders(req: Request)")) {
    fail(`${name}: missing request-aware CORS header helper`);
  }

  if (!source.includes('"Vary": "Origin"')) {
    fail(`${name}: CORS headers must set Vary: Origin`);
  }

  if (!source.includes('"Access-Control-Expose-Headers"')) {
    fail(`${name}: CORS headers must expose deployment marker headers`);
  }

  const functionNameMatch = source.match(/const\s+FUNCTION_NAME\s*=\s*["']([^"']+)["']/);
  if (!functionNameMatch) {
    fail(`${name}: missing FUNCTION_NAME deployment marker`);
  } else if (functionNameMatch[1] !== name) {
    fail(`${name}: FUNCTION_NAME must match function directory`);
  }

  const auditVersionMatch = source.match(/const\s+FUNCTION_AUDIT_VERSION\s*=\s*["']([^"']+)["']/);
  if (!auditVersionMatch) {
    fail(`${name}: missing FUNCTION_AUDIT_VERSION deployment marker`);
  } else if (!/^\d{4}-\d{2}-\d{2}-edge-[a-z0-9-]+$/.test(auditVersionMatch[1])) {
    fail(`${name}: FUNCTION_AUDIT_VERSION must be date-prefixed and edge-scoped`);
  }

  for (const requiredHeader of [
    '"X-Woof-Function-Name"',
    '"X-Woof-Function-Audit-Version"',
    "DEPLOYMENT_HEADERS",
  ]) {
    if (!source.includes(requiredHeader)) {
      fail(`${name}: missing deployment marker header ${requiredHeader}`);
    }
  }

  if (!source.includes('Deno.env.get("WOOF_ALLOWED_ORIGINS")')) {
    fail(`${name}: CORS helper must support WOOF_ALLOWED_ORIGINS`);
  }

  if (!source.includes("const responseHeaders = corsHeaders(req);")) {
    fail(`${name}: request handler must compute request-aware CORS headers`);
  }

  if (!source.includes("return new Response(null, { headers: responseHeaders })")) {
    fail(`${name}: OPTIONS response must return request-aware CORS headers`);
  }

  if (/new\s+Response\s*\(\s*null\s*,\s*\{\s*headers:\s*CORS_HEADERS\s*\}/.test(source)) {
    fail(`${name}: OPTIONS response must use request-aware CORS headers`);
  }

  if (source.includes("Deno.env.get(") && !source.includes("requiredEnv(")) {
    fail(`${name}: Deno.env.get usage must go through requiredEnv or explicit checked helper`);
  }

  if (/Deno\.env\.get\([^)]*\)!/.test(source)) {
    fail(`${name}: do not use non-null assertions on Deno.env.get`);
  }
}

function checkAuth(name, source, rules) {
  if (rules.requiresBearerAuth) {
    if (!source.includes('startsWith("Bearer ")') && !source.includes("startsWith('Bearer ')")) {
      fail(`${name}: missing Bearer token check`);
    }

    if (!source.includes(".auth.getUser(")) {
      fail(`${name}: missing Supabase auth.getUser validation`);
    }
  }

  if (rules.requiresWebhookAuth) {
    if (!source.includes("REVENUECAT_WEBHOOK_AUTH")) {
      fail(`${name}: missing RevenueCat webhook auth secret`);
    }

    if (!source.includes("isAuthorized(req)")) {
      fail(`${name}: missing webhook authorization check`);
    }
  }
}

function checkRequiredEnv(name, source, rules) {
  for (const envName of rules.requiredEnv || []) {
    if (!source.includes(`requiredEnv("${envName}")`) && !source.includes(`requiredEnv('${envName}')`)) {
      fail(`${name}: missing requiredEnv check for ${envName}`);
    }
  }
}

function checkRequiredRpc(name, source, rules) {
  for (const rpcName of rules.requiredRpc || []) {
    if (!source.includes(`"${rpcName}"`) && !source.includes(`'${rpcName}'`)) {
      fail(`${name}: missing ${rpcName} RPC usage`);
    }
  }
}

function checkNoClientSecrets(name, source) {
  if (/SUPABASE_SERVICE_ROLE_KEY["']?\s*[:=]\s*["'][A-Za-z0-9_.-]+/.test(source)) {
    fail(`${name}: service role key value appears hard-coded`);
  }

  if (/ANTHROPIC_API_KEY["']?\s*[:=]\s*["']sk-/.test(source)) {
    fail(`${name}: Anthropic key value appears hard-coded`);
  }
}

function checkAnalyzeScanReversal(source) {
  if (!source.includes("let streamResultDelivered = false")) {
    fail("analyze: stream path must track whether a valid result was delivered");
  }

  if (!source.includes("streamResultDelivered = true")) {
    fail("analyze: stream path must mark successful delivery before skipping reversal");
  }

  const deliveryIndex = source.indexOf("streamResultDelivered = true");
  const usageEventIndex = source.indexOf("streamScanUsageEvent(scanUsage)");
  if (usageEventIndex === -1 || deliveryIndex === -1 || usageEventIndex > deliveryIndex) {
    fail("analyze: successful stream delivery must emit woof_scan_usage before marking delivery complete");
  }

  const cancelMatch = source.match(/async\s+cancel\s*\(\)\s*\{([\s\S]*?)\n\s*\}/);
  if (!cancelMatch || !cancelMatch[1].includes("reverseConsumedScan")) {
    fail("analyze: stream cancel handler must reverse counted scans");
  }

  if (!cancelMatch || !cancelMatch[1].includes("!streamResultDelivered")) {
    fail("analyze: stream cancel reversal must only run before successful delivery");
  }
}

function checkAnalyzeImageBudget(source) {
  const scannerSource = fs.readFileSync("screens/ScannerScreen.js", "utf8");
  const edgeLimit = numericConstant(source, "MAX_IMAGE_B64_LENGTH");
  const clientLimit = numericConstant(scannerSource, "MAX_CLIENT_IMAGE_BASE64_LENGTH");

  if (!Number.isFinite(edgeLimit)) {
    fail("analyze: missing numeric MAX_IMAGE_B64_LENGTH constant");
    return;
  }

  if (!Number.isFinite(clientLimit)) {
    fail("ScannerScreen: missing numeric MAX_CLIENT_IMAGE_BASE64_LENGTH constant");
    return;
  }

  if (edgeLimit !== clientLimit) {
    fail(`analyze: MAX_IMAGE_B64_LENGTH (${edgeLimit}) must match ScannerScreen MAX_CLIENT_IMAGE_BASE64_LENGTH (${clientLimit})`);
  }
}

function checkAnalyzeVerifiedProvenance(source) {
  if (!source.includes("VERIFIED_INGREDIENT_STATUSES")) {
    fail("analyze: verified mode must declare accepted ingredient provenance statuses");
  }

  if (!source.includes("function hasVerifiedIngredientData")) {
    fail("analyze: verified mode must validate ingredient provenance before scoring");
  }

  if (!source.includes("Verified ingredient provenance is required for verified mode")) {
    fail("analyze: verified mode must reject products missing verified provenance");
  }

  if (source.includes("Here is VERIFIED data from Open Pet Food Facts")) {
    fail("analyze: verified prompt must not claim OPFF data is inherently verified");
  }
}

const dirs = functionDirs();

for (const name of dirs) {
  const rules = FUNCTION_RULES[name];
  if (!rules) {
    fail(`${name}: add this function to FUNCTION_RULES in scripts/check-edge-functions.mjs`);
    continue;
  }

  const indexPath = path.join(FUNCTIONS_DIR, name, "index.ts");
  if (!fs.existsSync(indexPath)) {
    fail(`${name}: missing index.ts`);
    continue;
  }

  const source = fs.readFileSync(indexPath, "utf8");
  checkCommon(name, source);
  checkAuth(name, source, rules);
  checkRequiredEnv(name, source, rules);
  checkRequiredRpc(name, source, rules);
  checkNoClientSecrets(name, source);
  if (name === "analyze") {
    checkAnalyzeScanReversal(source);
    checkAnalyzeImageBudget(source);
    checkAnalyzeVerifiedProvenance(source);
  }
}

const missingRules = Object.keys(FUNCTION_RULES).filter((name) => !dirs.includes(name));
for (const name of missingRules) {
  fail(`${name}: rule exists but function directory is missing`);
}

if (failures.length > 0) {
  console.error("Edge Function safety check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Edge Function safety check passed (${dirs.length} functions checked)`);
