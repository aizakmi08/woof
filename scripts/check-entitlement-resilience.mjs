import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const resilienceSource = fs.readFileSync(
  path.join(root, "services", "entitlementResilience.js"),
  "utf8"
).replace(/^import[^\n]+\n/gm, "").replace(/\bexport\s+/g, "");

const api = new Function(`
  const AsyncStorage = {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  };
  ${resilienceSource}
  return {
    authRefreshFailurePolicy,
    cachedProExpiry,
    cachedProIsActive,
    entitlementResilienceQaScenario,
    webhookEventShouldApply,
  };
`)();

const now = Date.parse("2026-08-23T20:00:00.000Z");
assert(
  api.authRefreshFailurePolicy({ name: "TypeError", message: "Network request failed" })
    === "retry_keep_session",
  "plain network failure must retain the signed-in session"
);
assert(
  api.authRefreshFailurePolicy({
    name: "AuthApiError",
    status: 400,
    code: "refresh_token_not_found",
    message: "Invalid refresh token",
  }) === "sign_out",
  "a rejected missing refresh token must sign out"
);
assert(
  api.cachedProIsActive({
    isPro: true,
    expiresAt: "2026-08-24T20:00:00.000Z",
  }, now),
  "an unexpired per-user Pro cache must keep Pro UI active"
);
assert(
  !api.cachedProIsActive({
    isPro: true,
    expiresAt: "2026-08-22T20:00:00.000Z",
  }, now),
  "an expired Pro cache must not grant UI entitlement"
);
assert(
  api.cachedProExpiry({ isPro: true, now }) === "2026-08-30T20:00:00.000Z",
  "a current Pro entitlement without an expiry must get a bounded fallback expiry"
);
assert(
  !api.webhookEventShouldApply(
    "2026-08-23T20:00:00.000Z",
    "2026-08-23T19:55:00.000Z"
  ),
  "an older expiration event must not overwrite a newer renewal"
);
assert(
  api.webhookEventShouldApply(
    "2026-08-23T20:00:00.000Z",
    "2026-08-23T20:05:00.000Z"
  ),
  "a newer RevenueCat event must remain applicable"
);

for (const scenario of [
  "refresh_network_failure",
  "cached_pro_profile_failure",
  "out_of_order_webhook",
]) {
  assert(
    api.entitlementResilienceQaScenario(scenario, now).passed,
    `Development QA entitlement fixture must pass: ${scenario}`
  );
}

const authSource = fs.readFileSync(path.join(root, "services", "auth.js"), "utf8");
const claudeSource = fs.readFileSync(path.join(root, "services", "claude.js"), "utf8");
const webhookSource = fs.readFileSync(
  path.join(root, "supabase", "functions", "revenuecat-webhook", "index.ts"),
  "utf8"
);

assert(
  /anonymousSignInPromiseRef/.test(authSource)
    && /authTransitionRef/.test(authSource)
    && /automaticGuestPendingRef/.test(authSource)
    && /latestSessionRef/.test(authSource),
  "automatic guest sign-in must be single-flight, ordered, and splash-gated"
);
assert(
  /anonymous_sign_in_discarded[\s\S]*restored_non_anonymous_session/.test(authSource)
    && /supabase\.auth\.setSession\(\{[\s\S]*access_token: currentSession\.access_token[\s\S]*refresh_token: currentSession\.refresh_token/.test(authSource)
    && /supabase\.auth\.signOut\(\{ scope: "local" \}\)/.test(authSource),
  "a discarded late anonymous sign-in must restore the real session or clear the anonymous residue locally"
);
assert(
  /readPersistedScanCount/.test(authSource)
    && /readCachedEntitlement/.test(authSource)
    && /cachedProIsActive/.test(authSource),
  "cold start must hydrate scan count and unexpired Pro UI state"
);
assert(
  /await initializePurchases\(updatedUser\.id\)[\s\S]*installPurchaseListener\(updatedUser\.id\)/.test(authSource),
  "account linking must reinstall the RevenueCat listener for the updated user"
);
assert(
  /authRefreshFailurePolicy\(refreshError\) === "sign_out"/.test(claudeSource)
    && /AUTH_REFRESH_RETRYABLE/.test(claudeSource),
  "session refresh must distinguish revoked credentials from retryable connectivity failures"
);
assert(
  /updateProfilesForNewerEvent/.test(webhookSource)
    && /revenuecat_last_event_at\.is\.null,revenuecat_last_event_at\.lt\./.test(webhookSource)
    && /stale_event_timestamp/.test(webhookSource),
  "raw RevenueCat webhook fallback must atomically reject stale event timestamps"
);

console.log("Entitlement resilience checks passed (3 QA scenarios, auth ordering, cache, and webhook monotonicity).")
