#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const webhookSource = fs.readFileSync(path.join(root, "supabase/functions/revenuecat-webhook/index.ts"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const releaseRunbook = fs.readFileSync(path.join(root, "docs/release-verification.md"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`revenuecat webhook guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  webhookSource.includes('const PRO_ENTITLEMENT_ID = "pro"') &&
    webhookSource.includes('const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1"') &&
    webhookSource.includes("/subscribers/${encodeURIComponent(appUserId)}") &&
    webhookSource.includes('data?.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID]'),
  "webhook must sync the configured Pro entitlement from RevenueCat subscriber state"
);

assert(
  webhookSource.includes("REVENUECAT_WEBHOOK_AUTH_TOKEN") &&
    webhookSource.includes('req.headers.get("Authorization")') &&
    webhookSource.includes("bearerToken") &&
    webhookSource.includes('return jsonResponse({ error: "Unauthorized" }, 401)'),
  "webhook must verify RevenueCat's Authorization header before processing"
);

assert(
  webhookSource.includes("REVENUECAT_REST_API_KEY") &&
    webhookSource.includes('"Authorization": `Bearer ${apiKey}`') &&
    webhookSource.includes("REVENUECAT_TIMEOUT_MS") &&
    webhookSource.includes("SUPABASE_TIMEOUT_MS"),
  "webhook must use a server-side RevenueCat REST API key with bounded external calls"
);

assert(
  webhookSource.includes('event.type === "TEST"') &&
    webhookSource.includes("revenueCatUserIds(event)") &&
    webhookSource.includes("UUID_RE") &&
    webhookSource.includes("event.aliases") &&
    webhookSource.includes("event.transferred_to") &&
    webhookSource.includes("event.transferred_from"),
  "webhook must ignore dashboard tests and only sync Supabase UUID app user ids, including aliases and transfer ids"
);

assert(
  webhookSource.includes('.from("profiles")') &&
    webhookSource.includes("is_pro: active") &&
    webhookSource.includes("pro_expires_at: expiresAt") &&
    webhookSource.includes("updated_at: new Date().toISOString()") &&
    webhookSource.includes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'),
  "webhook must update only server-owned profile entitlement fields through the service role"
);

assert(
  packageJson.includes("supabase/functions/revenuecat-webhook/index.ts") &&
    packageJson.includes('"test:revenuecat-webhook": "node scripts/test-revenuecat-webhook-guards.js"') &&
    packageJson.includes("npm run test:revenuecat-webhook"),
  "RevenueCat webhook must be wired into edge checks and guard suite"
);

assert(
  envExample.includes("REVENUECAT_WEBHOOK_AUTH_TOKEN=") &&
    envExample.includes("REVENUECAT_REST_API_KEY=") &&
    releaseRunbook.includes("revenuecat-webhook") &&
    releaseRunbook.includes("profiles.is_pro"),
  "RevenueCat webhook secrets and release verification must be documented"
);

console.log("revenuecat webhook guard passed");
