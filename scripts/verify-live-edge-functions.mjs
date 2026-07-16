import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const FUNCTIONS_DIR = "supabase/functions";
const FUNCTION_NAME_HEADER = "x-woof-function-name";
const AUDIT_VERSION_HEADER = "x-woof-function-audit-version";
const EXPOSE_HEADERS_HEADER = "access-control-expose-headers";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function envValue(name) {
  return (process.env[name] || "").trim();
}

function functionDirs() {
  return fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readConstant(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*["']([^"']+)["']`));
  return match ? match[1] : null;
}

function expectedFunctions() {
  return functionDirs().map((name) => {
    const sourcePath = path.join(FUNCTIONS_DIR, name, "index.ts");
    const source = fs.readFileSync(sourcePath, "utf8");

    return {
      function_name: name,
      expected_name: readConstant(source, "FUNCTION_NAME"),
      expected_audit_version: readConstant(source, "FUNCTION_AUDIT_VERSION"),
    };
  });
}

function functionsBaseUrl({ requireBase }) {
  const direct = argValue("--base-url") ||
    envValue("SUPABASE_FUNCTIONS_BASE_URL") ||
    envValue("WOOF_SUPABASE_FUNCTIONS_BASE_URL");

  if (direct) return stripTrailingSlash(direct);

  const supabaseUrl = envValue("SUPABASE_URL");
  if (supabaseUrl) {
    const parsed = new URL(supabaseUrl);
    const [projectRef, service, topLevelDomain] = parsed.hostname.split(".");
    if (projectRef && service === "supabase" && topLevelDomain === "co") {
      return `https://${projectRef}.functions.supabase.co`;
    }
    throw new Error(`Could not derive functions host from SUPABASE_URL host: ${parsed.hostname}`);
  }

  if (!requireBase) return null;

  throw new Error(
    "Set SUPABASE_URL, SUPABASE_FUNCTIONS_BASE_URL, WOOF_SUPABASE_FUNCTIONS_BASE_URL, or pass --base-url before live verification."
  );
}

function targetUrl(baseUrl, functionName) {
  return baseUrl ? `${baseUrl}/${functionName}` : `<SUPABASE_FUNCTIONS_BASE_URL>/${functionName}`;
}

function validateExpected(functionInfo) {
  const failures = [];
  if (functionInfo.expected_name !== functionInfo.function_name) {
    failures.push(`${functionInfo.function_name}: expected FUNCTION_NAME to match directory`);
  }
  if (!functionInfo.expected_audit_version) {
    failures.push(`${functionInfo.function_name}: missing expected FUNCTION_AUDIT_VERSION`);
  }
  return failures;
}

async function verifyFunction(baseUrl, functionInfo) {
  const url = targetUrl(baseUrl, functionInfo.function_name);
  const response = await fetch(url, { method: "OPTIONS" });
  const liveName = response.headers.get(FUNCTION_NAME_HEADER);
  const liveAuditVersion = response.headers.get(AUDIT_VERSION_HEADER);
  const exposedHeaders = response.headers.get(EXPOSE_HEADERS_HEADER) || "";
  const exposedHeaderNames = exposedHeaders
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);

  const failures = validateExpected(functionInfo);
  if (!response.ok) {
    failures.push(`${functionInfo.function_name}: OPTIONS returned HTTP ${response.status}`);
  }
  if (liveName !== functionInfo.expected_name) {
    failures.push(`${functionInfo.function_name}: live ${FUNCTION_NAME_HEADER} was ${liveName || "missing"}`);
  }
  if (liveAuditVersion !== functionInfo.expected_audit_version) {
    failures.push(`${functionInfo.function_name}: live ${AUDIT_VERSION_HEADER} was ${liveAuditVersion || "missing"}`);
  }
  for (const required of [FUNCTION_NAME_HEADER, AUDIT_VERSION_HEADER]) {
    if (!exposedHeaderNames.includes(required)) {
      failures.push(`${functionInfo.function_name}: ${EXPOSE_HEADERS_HEADER} does not expose ${required}`);
    }
  }

  return {
    function_name: functionInfo.function_name,
    url,
    http_status: response.status,
    expected_name: functionInfo.expected_name,
    live_name: liveName,
    expected_audit_version: functionInfo.expected_audit_version,
    live_audit_version: liveAuditVersion,
    ok: failures.length === 0,
    failures,
  };
}

const dryRun = process.argv.includes("--dry-run");
const functions = expectedFunctions();
const baseUrl = functionsBaseUrl({ requireBase: !dryRun });

if (dryRun) {
  console.log(JSON.stringify({
    dry_run: true,
    base_url: baseUrl,
    functions: functions.map((functionInfo) => ({
      ...functionInfo,
      url: targetUrl(baseUrl, functionInfo.function_name),
      local_failures: validateExpected(functionInfo),
    })),
  }, null, 2));
  process.exit(0);
}

const results = await Promise.all(functions.map((functionInfo) =>
  verifyFunction(baseUrl, functionInfo)
));
const failures = results.flatMap((result) => result.failures);

console.log(JSON.stringify({ base_url: baseUrl, results }, null, 2));

if (failures.length > 0) {
  console.error("Live Edge Function verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Live Edge Function verification passed (${results.length} functions checked)`);
