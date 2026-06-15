#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analyzeSource = fs.readFileSync(
  path.join(root, "supabase/functions/analyze/index.ts"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    console.error(`edge quota guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  analyzeSource.includes("MAX_REQUEST_BYTES") &&
    analyzeSource.includes("Request body too large"),
  "analyze must reject oversized requests before parsing JSON"
);

assert(
  analyzeSource.includes("Rate limit unavailable. Please try again."),
  "rate-limit RPC failures must fail closed"
);

assert(
  analyzeSource.includes('"Authenticated rate limit check"') &&
    analyzeSource.includes('"Anonymous rate limit check"') &&
    analyzeSource.includes('"Guest human-food rate limit check"') &&
    /Authenticated rate limit check[\s\S]{0,520}\.abortSignal\(signal\)/.test(analyzeSource) &&
    /Anonymous rate limit check[\s\S]{0,260}\.abortSignal\(signal\)/.test(analyzeSource) &&
    /Guest human-food rate limit check[\s\S]{0,320}\.abortSignal\(signal\)/.test(analyzeSource),
  "rate-limit RPCs must be request-linked and deadline-bound"
);

assert(
  analyzeSource.includes("AUTH_HELPER_RATE_LIMIT_PER_HOUR") &&
    analyzeSource.includes("user-helper:${user.id}") &&
    analyzeSource.includes("Too many analysis helper requests"),
  "authenticated helper modes must use a separate fail-closed hourly rate bucket"
);

assert(
  analyzeSource.includes("const HELPER_MODES = new Set") &&
    analyzeSource.includes("const isHelperMode = HELPER_MODES.has(mode)") &&
    analyzeSource.includes("if (user && !isHelperMode)"),
  "helper mode detection must be shared by rate limits and quota bypass logic"
);

assert(
  analyzeSource.includes("MAX_PRODUCT_LOOKUP_NAME_LENGTH") &&
    analyzeSource.includes("productName too long (max 200 chars)."),
  "helper product-name prompts must be length-clamped before model calls"
);

assert(
  analyzeSource.includes(".maybeSingle()") &&
    analyzeSource.includes("Missing profile row; repairing") &&
    analyzeSource.includes(".upsert("),
  "authenticated quota checks must repair missing profile rows before enforcement"
);

assert(
  analyzeSource.includes('"Profile quota lookup"') &&
    analyzeSource.includes('"Profile repair"') &&
    analyzeSource.includes('"Profile entitlement expiry repair"') &&
    analyzeSource.includes('"Human food quota lookup"') &&
    /Profile quota lookup[\s\S]{0,320}\.abortSignal\(signal\)[\s\S]{0,80}\.maybeSingle\(\)/.test(analyzeSource) &&
    /Profile repair[\s\S]{0,620}\.abortSignal\(signal\)[\s\S]{0,80}\.single\(\)/.test(analyzeSource) &&
    /Profile entitlement expiry repair[\s\S]{0,360}\.abortSignal\(signal\)/.test(analyzeSource) &&
    /Human food quota lookup[\s\S]{0,260}\.abortSignal\(signal\)/.test(analyzeSource),
  "profile and free-quota checks must be request-linked and deadline-bound"
);

assert(
  !/if\s*\(\s*profile\s*&&\s*!\s*profile\.is_pro\s*\)/.test(analyzeSource),
  "quota enforcement must not be skipped when profile is missing"
);

assert(
  analyzeSource.includes("return jsonResponse({ error: \"Quota check unavailable. Please try again.\" }, 503)"),
  "profile lookup errors must fail closed"
);

assert(
  analyzeSource.includes("serverQuotaAccounting = false") &&
    analyzeSource.includes("clientProStatus = false") &&
    analyzeSource.includes("quotaProfileForAccounting") &&
    analyzeSource.includes("commitCompletedQuota"),
  "new clients must opt into server-owned quota accounting after valid completion"
);

assert(
  analyzeSource.includes("REVENUECAT_REST_API_KEY") &&
    analyzeSource.includes("REVENUECAT_ENTITLEMENT_TIMEOUT_MS") &&
    analyzeSource.includes("recoverProEntitlementFromRevenueCat") &&
    analyzeSource.includes("function isStoredProExpirationActive(profile") &&
    analyzeSource.includes('.select("is_pro, scan_count, pro_expires_at")') &&
    analyzeSource.includes("profile_entitlement_expiry_repair") &&
    analyzeSource.includes("quotaProfile = { ...quotaProfile, is_pro: true }") &&
    analyzeSource.includes(`${'${REVENUECAT_API_BASE}'}/subscribers/${'${encodeURIComponent(userId)}'}`) &&
    analyzeSource.includes('data?.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID]') &&
    analyzeSource.includes('"RevenueCat entitlement profile update"') &&
    analyzeSource.includes("function subscriptionSyncUnavailableResponse") &&
    analyzeSource.includes('code: "subscription_sync_unavailable"') &&
    analyzeSource.includes("clientProStatus === true") &&
    analyzeSource.includes('is_pro: true') &&
    analyzeSource.includes('logAuditEvent("revenuecat_entitlement_recovery"'),
  "quota-limit boundary must repair still-active stored Pro expirations and have a bounded server-side RevenueCat entitlement recovery path"
);

assert(
  /clientProStatus === true\) \{[\s\S]{0,220}recoverProEntitlementFromRevenueCat\(supabase, user\.id, req\.signal\)[\s\S]{0,220}quotaProfile = \{ \.\.\.quotaProfile, is_pro: true \}[\s\S]{0,160}!recovered\.checked[\s\S]{0,120}subscriptionSyncUnavailableResponse\(corsHeaders\)[\s\S]{0,180}quotaProfileForAccounting = quotaProfile/.test(analyzeSource),
  "client Pro hints must trigger server-side RevenueCat recovery before free-user quota accounting, without granting access from the client hint itself"
);

assert(
  /usedToday \|\| 0\) >= 1\) \{[\s\S]{0,260}recoverProEntitlementFromRevenueCat\(supabase, user\.id, req\.signal\)[\s\S]{0,260}quotaProfile = \{ \.\.\.quotaProfile, is_pro: true \}[\s\S]{0,180}!recovered\.checked[\s\S]{0,120}subscriptionSyncUnavailableResponse\(corsHeaders\)/.test(analyzeSource) &&
    /quotaProfile\.scan_count \|\| 0\) >= 3\) \{[\s\S]{0,260}recoverProEntitlementFromRevenueCat\(supabase, user\.id, req\.signal\)[\s\S]{0,260}quotaProfile = \{ \.\.\.quotaProfile, is_pro: true \}[\s\S]{0,180}!recovered\.checked[\s\S]{0,120}subscriptionSyncUnavailableResponse\(corsHeaders\)/.test(analyzeSource),
  "RevenueCat recovery must run before quota limit errors and unchecked recovery must fail as subscription-sync unavailable"
);

assert(
  !/revenuecat_entitlement_recovery[\s\S]{0,500}user\.id/.test(analyzeSource),
  "RevenueCat entitlement recovery audit markers must not include user identifiers"
);

assert(
  /function commitCompletedQuota\([\s\S]{0,500}serverQuotaAccounting[\s\S]{0,500}increment_human_food_count[\s\S]{0,220}increment_scan_count/.test(analyzeSource),
  "completed quota commits must be gated by the opt-in flag and use the correct server RPC"
);

assert(
  [...analyzeSource.matchAll(/if \(isValid\) \{[\s\S]{0,420}commitCompletedQuota/g)].length >= 2,
  "Edge must commit quota only after schema-valid analysis"
);

console.log("edge quota guard passed");
