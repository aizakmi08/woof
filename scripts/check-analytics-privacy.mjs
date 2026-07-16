import fs from "node:fs";

const sourcePath = "services/analytics.js";
const source = fs.readFileSync(sourcePath, "utf8");
const authSourcePath = "services/auth.js";
const authSource = fs.readFileSync(authSourcePath, "utf8");
const errorReportingSourcePath = "services/errorReporting.js";
const errorReportingSource = fs.readFileSync(errorReportingSourcePath, "utf8");
const failures = [];

function expectSnippet(snippet, message) {
  if (!source.includes(snippet)) failures.push(message);
}

function expectErrorReportingSnippet(snippet, message) {
  if (!errorReportingSource.includes(snippet)) failures.push(message);
}

expectSnippet("function redactString", "analytics.js must define a central redactString helper");
expectSnippet("function releaseContext", "analytics.js must define a central releaseContext helper");
expectSnippet("[email]", "analytics redaction must cover email addresses");
expectSnippet("[url]", "analytics redaction must cover URLs");
expectSnippet("[file]", "analytics redaction must cover file URLs");
expectSnippet("/Users", "analytics redaction must cover plain local file paths");
expectSnippet("/storage", "analytics redaction must cover Android-style file paths");
expectSnippet("[jwt]", "analytics redaction must cover JWT-like tokens");
expectSnippet("[secret]", "analytics redaction must cover common API key prefixes");
expectSnippet("[redacted]", "analytics redaction must cover long opaque payloads");
expectSnippet('redactString(value).slice(0, MAX_STRING_LENGTH)', "string analytics properties must pass through redactString");
expectSnippet("app_version", "analytics events must include app version for release diagnostics");
expectSnippet("native_build_version", "analytics events must include native build version for release diagnostics");
expectSnippet("runtime_version", "analytics events must include runtime version for release diagnostics");
expectSnippet("execution_environment", "analytics events must include execution environment for release diagnostics");
expectSnippet("...releaseContext()", "analytics events must merge centralized release context");
expectSnippet("let flushPromise = null", "analytics queue flushes must be single-flight to avoid duplicate inserts");
expectSnippet("queueWhenSignedOut = true", "trackEvent must support intentionally not queueing signed-out events");
expectSnippet("return Array.isArray(parsed) ? parsed : []", "persisted analytics queue reads must ignore non-array JSON");
expectSnippet("userIdAtCapture", "queued analytics events must record the user id they were captured under");
expectSnippet("function eventCapturedForCurrentUser", "analytics queue flush must validate queued event ownership");
expectSnippet('Object.prototype.hasOwnProperty.call(event, "userIdAtCapture")', "legacy queued analytics without capture ownership must not flush to a future user");
expectSnippet("analytics_queue_dropped", "analytics queue drops must be recorded when ownership does not match");
expectSnippet("analytics_flush_source", "flushed analytics events must record their flush source");
expectSnippet("analytics_queue_flushed", "analytics queue flush diagnostics must be recorded");
expectSnippet("queued_event_count", "analytics queue flush diagnostics must record queued event count");
expectSnippet("dropped_event_count", "analytics queue drop diagnostics must record dropped event count");

expectErrorReportingSnippet("function normalizeForFingerprint", "error reporting must normalize messages for stable grouping");
expectErrorReportingSnippet("function errorCategory", "error reporting must categorize app errors");
expectErrorReportingSnippet("error_fingerprint", "app error analytics must include a stable error_fingerprint");
expectErrorReportingSnippet("error_category", "app error analytics must include error_category");
expectErrorReportingSnippet("/Users", "error reporting redaction must cover plain local file paths");
expectErrorReportingSnippet("/storage", "error reporting redaction must cover Android-style file paths");
expectErrorReportingSnippet("[jwt]", "error reporting redaction must cover JWT-like tokens");
expectErrorReportingSnippet("[secret]", "error reporting redaction must cover common API key prefixes");
expectErrorReportingSnippet("function normalizeText", "error reporting must normalize text before redacting");
expectErrorReportingSnippet("return truncate(redacted, maxLength)", "error reporting must redact before truncating messages");

if (!authSource.includes('flushAnalyticsQueue({ source: "auth_boot_existing_session" })')) {
  failures.push("auth boot with an existing session must flush queued analytics events");
}

if (!authSource.includes('flushAnalyticsQueue({ source: "auth_state_signed_in" })')) {
  failures.push("SIGNED_IN auth state must flush queued analytics events");
}

if (!authSource.includes('trackEvent("auth_signed_out", {}, { queueWhenSignedOut: false })')) {
  failures.push("auth_signed_out must not be queued and later attributed to a different user");
}

if (/typeof\s+value\s*===\s*["']string["']\)\s*return\s+value\.slice/.test(source)) {
  failures.push("string analytics properties must not be returned with value.slice before redaction");
}

if (failures.length > 0) {
  console.error("Analytics privacy check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Analytics privacy check passed");
