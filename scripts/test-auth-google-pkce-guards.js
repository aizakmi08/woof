#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const supabaseSource = fs.readFileSync(path.join(root, "services/supabase.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "services/auth.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`auth google PKCE guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  /createClient\([\s\S]*auth:\s*\{[\s\S]*detectSessionInUrl:\s*false,[\s\S]*flowType:\s*"pkce"/.test(
    supabaseSource
  ),
  "Supabase auth client must use PKCE while keeping React Native URL auto-detection disabled"
);

assert(
  authSource.includes("supabase.auth.signInWithOAuth") &&
    authSource.includes("skipBrowserRedirect: true") &&
    authSource.includes("WebBrowser.openAuthSessionAsync"),
  "Google sign-in must keep the app-owned browser session flow"
);

assert(
  authSource.includes('result.type !== "success"') &&
    authSource.includes('cancelled.code = "GOOGLE_SIGN_IN_CANCELLED"') &&
    authSource.includes("Google sign-in was cancelled."),
  "Google sign-in must throw a readable cancellation error"
);

assert(
  authSource.includes('params.get("error")') &&
    authSource.includes('fragmentParams.get("error")') &&
    authSource.includes("Google sign-in failed:") &&
    authSource.includes('params.get("error_description")'),
  "Google sign-in must surface OAuth redirect errors and descriptions"
);

assert(
  authSource.includes('const code = params.get("code")') &&
    authSource.includes("Google sign-in did not return an authorization code") &&
    authSource.includes("supabase.auth.exchangeCodeForSession(code)"),
  "Google sign-in must exchange the PKCE authorization code for a session"
);

assert(
  !authSource.includes('params.get("access_token")') &&
    !authSource.includes('params.get("refresh_token")') &&
    !authSource.includes("supabase.auth.setSession({"),
  "Google sign-in must not accept bearer tokens from redirect fragments"
);

assert(
  packageJson.includes('"test:auth-google-pkce": "node scripts/test-auth-google-pkce-guards.js"') &&
    packageJson.includes("npm run test:auth-google-pkce"),
  "Google PKCE guard must be wired into package scripts"
);

console.log("auth google PKCE guard passed");
