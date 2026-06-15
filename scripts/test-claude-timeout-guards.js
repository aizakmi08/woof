#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const claudeSource = fs.readFileSync(path.join(root, "services/claude.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "services/auth.js"), "utf8");
const scannerSource = fs.readFileSync(path.join(root, "screens/ScannerScreen.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`claude timeout guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  claudeSource.includes("function _withAbort(promise, signal)") &&
    claudeSource.includes("signal.removeEventListener(\"abort\", abortFromParent)") &&
    claudeSource.includes("function _withAuthTimeout(promise, signal, label, timeoutMs = AUTH_HEADER_TIMEOUT_MS)") &&
    claudeSource.includes("AUTH_HEADER_TIMEOUT_MS = 4000") &&
    claudeSource.includes("_authUnknownError(`${label} timed out`)") &&
    /supabase\.auth\.getSession\(\),[\s\S]{0,120}"Session check"/.test(claudeSource) &&
    /_refreshPromise,[\s\S]{0,120}"Session refresh"/.test(claudeSource),
  "auth session and refresh work must be abort-aware and independently bounded"
);

assert(
  claudeSource.includes("function _startTimedRequest(label, timeoutMs, parentSignal)") &&
    claudeSource.includes("let didTimeout = false") &&
    claudeSource.includes("let abortFromParent = null") &&
    claudeSource.includes('err.name = "TimeoutError"') &&
    claudeSource.includes('err.code = "REQUEST_TIMEOUT"') &&
    claudeSource.includes("controller.abort();") &&
    claudeSource.includes("parentSignal.addEventListener(\"abort\", abortFromParent, { once: true })") &&
    claudeSource.includes("parentSignal?.removeEventListener(\"abort\", abortFromParent)"),
  "helper requests must use a shared parent-aware timeout controller with typed timeout errors and listener cleanup"
);

assert(
  claudeSource.includes("function _throwTimeoutIfDeadlineAbort(err, request)") &&
    claudeSource.includes("request.timeoutError()"),
  "internal deadline aborts must be converted away from user-cancellation AbortError"
);

for (const [fn, label, ms] of [
  ["identifyProduct", "identifyProduct", 15000],
  ["ocrIngredients", "ocrIngredients", 20000],
  ["lookupProduct", "lookupProduct", 25000],
]) {
  const start = claudeSource.indexOf(`export async function ${fn}`);
  const end = claudeSource.indexOf("\nexport async function ", start + 1);
  const body = claudeSource.slice(start, end === -1 ? undefined : end);
  assert(
    body.includes(`_startTimedRequest("${label}", ${ms}`) &&
      body.indexOf(`_startTimedRequest("${label}", ${ms}`) < body.indexOf("_getAuthHeaders(request.signal)") &&
      body.includes("request.cleanup();"),
    `${fn} timeout must start before auth headers and clean up in finally`
  );
}

{
  const start = claudeSource.indexOf("export async function lookupIngredients");
  const end = claudeSource.indexOf("\nexport async function ", start + 1);
  const body = claudeSource.slice(start, end === -1 ? undefined : end);
  assert(
    /export async function lookupIngredients\(productName, \{ signal, timeoutMs = 12000 \} = \{\}\)/.test(body) &&
      body.includes('_startTimedRequest("lookupIngredients", timeoutMs, signal)') &&
      body.indexOf('_startTimedRequest("lookupIngredients", timeoutMs, signal)') < body.indexOf("_getAuthHeaders(request.signal)") &&
      body.includes("request.cleanup();"),
    "lookupIngredients timeout must keep a 12s default while allowing shorter caller budgets and cleaning up in finally"
  );
}

for (const [fn, label, ms] of [
  ["analyzeIngredients", "Photo analysis", 60000],
  ["analyzeWithData", "Verified analysis", 60000],
  ["analyzeHumanFood", "Human food analysis", 45000],
]) {
  const start = claudeSource.indexOf(`export async function ${fn}`);
  const end = claudeSource.indexOf("\nexport async function ", start + 1);
  const body = claudeSource.slice(start, end === -1 ? undefined : end);
  assert(
      body.includes(`_startTimedRequest("${label}", ${ms}`) &&
      body.includes("signal: request.signal") &&
      body.includes("request.didTimeout() ? request.timeoutError() : err") &&
      body.includes("reportNetworkError(reported)") &&
      body.includes("_throwTimeoutIfDeadlineAbort(err, request)") &&
      body.includes("request.cleanup();"),
    `${fn} non-streaming timeout must include auth headers, report network deadlines, and throw typed timeout errors`
  );
}

assert(
  /async function _callStreaming[\s\S]{0,240}_startTimedRequest\("Stream response", 30000, signal\)[\s\S]{0,240}_getAuthHeaders\(call\.signal\)/.test(
    claudeSource
	) &&
    /async function _callStreaming[\s\S]*?if \(!response\.ok\) \{[\s\S]*?const err = await _analysisErrorFromResponse\(response\);[\s\S]*?reportNetworkError\(err\);[\s\S]*?throw err;[\s\S]*?\}[\s\S]*?reportNetworkSuccess\(\);/.test(claudeSource) &&
	    /async function _callStreaming[\s\S]*?_throwTimeoutIfDeadlineAbort\(err, call\)/.test(claudeSource) &&
	    /async function _callStreaming[\s\S]*?try \{[\s\S]*?response\.body\.getReader\(\)[\s\S]*?await reader\.read\(\)[\s\S]*?const text = await response\.text\(\);[\s\S]*?return final;[\s\S]*?\} catch \(err\) \{[\s\S]*?_throwTimeoutIfDeadlineAbort\(err, call\);[\s\S]*?\} finally \{[\s\S]*?call\.cleanup\(\);[\s\S]*?\}/.test(claudeSource),
	  "streaming timeout must include auth header acquisition, report HTTP failures before success, body reading, final parsing, and throw typed timeout errors"
	);

assert(
  /async function _callNonStreaming[\s\S]{0,160}_getAuthHeaders\(signal\)/.test(claudeSource),
  "non-streaming helper must pass the caller's timeout signal into auth headers"
);

assert(
  authSource.includes("SESSION_CHECK_TIMEOUT_MS = 4000") &&
    authSource.includes("function withTimeout(promise, label, timeoutMs)") &&
    /const checkSession = useCallback\(async \(\{ timeoutMs = SESSION_CHECK_TIMEOUT_MS \} = \{\}\) => \{/.test(authSource) &&
    /const \{ data: \{ session \}, error \} = await withTimeout\([\s\S]{0,120}supabase\.auth\.getSession\(\),[\s\S]{0,80}"SESSION_CHECK",[\s\S]{0,80}timeoutMs/.test(authSource) &&
    /const \{ data, error: refreshError \} = await withTimeout\([\s\S]{0,120}supabase\.auth\.refreshSession\(\),[\s\S]{0,80}"SESSION_REFRESH",[\s\S]{0,80}timeoutMs/.test(authSource),
  "scanner auth pre-refresh must bound getSession and refreshSession work"
);

assert(
  scannerSource.includes("SCANNER_SESSION_WARM_TIMEOUT_MS = 1200") &&
    scannerSource.includes("checkSession({ timeoutMs: SCANNER_SESSION_WARM_TIMEOUT_MS })"),
  "scanner auth warm-up must use a short timeout so it cannot compete with scan startup"
);

assert(
  packageJson.includes('"test:claude-timeouts": "node scripts/test-claude-timeout-guards.js"') &&
    packageJson.includes("npm run test:claude-timeouts"),
  "Claude timeout guard must be wired into package scripts"
);

console.log("claude timeout guard passed");
