#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const claudeSource = fs.readFileSync(path.join(root, "services/claude.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`claude auth session guard failed: ${message}`);
    process.exit(1);
  }
}

const authStart = claudeSource.indexOf("async function _getAuthHeaders(signal");
const parseStart = claudeSource.indexOf("function cleanAndParse", authStart);
assert(authStart !== -1 && parseStart !== -1, "_getAuthHeaders must be present");
const authBlock = claudeSource.slice(authStart, parseStart);

assert(
  claudeSource.includes("function _authRecoveryError") &&
    claudeSource.includes("function _authUnknownError") &&
    claudeSource.includes('err.name = "AuthSessionError"') &&
    claudeSource.includes('err.code = "AUTH_SESSION_EXPIRED"') &&
    claudeSource.includes('err.name = "AuthSessionUnknownError"') &&
    claudeSource.includes('err.code = "AUTH_SESSION_UNKNOWN"') &&
    claudeSource.includes("function _isAuthRecoveryError"),
  "Claude auth failures must use typed auth recovery/unknown errors"
);

assert(
  /async function _getAuthHeaders\(signal, \{ timeoutMs = AUTH_HEADER_TIMEOUT_MS \} = \{\}\)/.test(authBlock) &&
    /supabase\.auth\.getSession\(\),[\s\S]{0,120}"Session check"/.test(authBlock) &&
    /_refreshPromise,[\s\S]{0,120}"Session refresh"/.test(authBlock),
  "auth header acquisition must bound session lookup and refresh work"
);

assert(
  /if \(sessionError\) \{[\s\S]{0,120}throw _authRecoveryError\("Session expired"\);/.test(authBlock),
  "session lookup errors must fail closed instead of proceeding as guest"
);

assert(
  /if \(!session\) \{[\s\S]{0,120}return GUEST_HEADERS;/.test(authBlock),
  "explicit no-session guest mode must still use guest headers"
);

assert(
  /if \(refreshError \|\| !data\?\.session\) \{[\s\S]{0,180}supabase\.auth\.signOut\(\)[\s\S]{0,120}throw _authRecoveryError\("Session expired"\);/.test(authBlock),
  "expired signed-in sessions with failed refresh must throw auth recovery instead of returning guest headers"
);

assert(
  /if \(!token\) \{[\s\S]{0,140}supabase\.auth\.signOut\(\)[\s\S]{0,120}throw _authRecoveryError\("Session expired"\);/.test(authBlock),
  "signed-in sessions without usable tokens must not downgrade to guest headers"
);

assert(
  !/refreshError[\s\S]{0,180}return GUEST_HEADERS;/.test(authBlock) &&
    !/!token\) return GUEST_HEADERS;/.test(authBlock),
  "refresh/token failures must not return guest headers"
);

assert(
  /export async function ocrIngredients[\s\S]*?catch \(err\) \{[\s\S]{0,80}if \(_isAuthRecoveryError\(err\)\) throw err;/.test(claudeSource) &&
    /export async function lookupIngredients[\s\S]*?catch \(err\) \{[\s\S]{0,80}if \(_isAuthRecoveryError\(err\)\) throw err;/.test(claudeSource),
  "helper fallbacks must not swallow auth recovery errors as OCR/search misses"
);

assert(
  packageJson.includes('"test:claude-auth-session": "node scripts/test-claude-auth-session-guards.js"') &&
    packageJson.includes("npm run test:claude-auth-session"),
  "Claude auth session guard must be wired into package scripts"
);

console.log("claude auth session guard passed");
