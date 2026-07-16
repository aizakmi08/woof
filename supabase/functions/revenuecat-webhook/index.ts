import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const PRO_ENTITLEMENT_ID = "pro";
const REVENUECAT_API_BASE_URL = "https://api.revenuecat.com/v1";
const SUBSCRIBER_SYNC_TIMEOUT_MS = 8000;

const DEFAULT_BROWSER_ORIGINS = new Set([
  "http://localhost:19006",
  "http://localhost:3000",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://127.0.0.1:19006",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8082",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers":
    "X-Woof-Function-Name, X-Woof-Function-Audit-Version",
  "Vary": "Origin",
};

const FUNCTION_NAME = "revenuecat-webhook";
const FUNCTION_AUDIT_VERSION = "2026-06-17-edge-reconcile-v1";
const DEPLOYMENT_HEADERS = {
  "X-Woof-Function-Name": FUNCTION_NAME,
  "X-Woof-Function-Audit-Version": FUNCTION_AUDIT_VERSION,
};

const GRANT_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "REFUND_REVERSED",
  "PRODUCT_CHANGE",
  "PURCHASE_REDEEMED",
]);

const REVOKE_EVENT_TYPES = new Set([
  "EXPIRATION",
]);

type EntitlementState = {
  shouldUpdate: boolean;
  isPro: boolean;
  proExpiresAt: string | null;
  ignoredReason: string | null;
};

type SubscriberState = {
  isPro: boolean;
  proExpiresAt: string | null;
  productId: string | null;
  entitlementIds: string[];
  managementUrl: string | null;
  originalAppUserId: string | null;
};

type SubscriberFetchResult = {
  status: "synced" | "error";
  subscriber?: Record<string, unknown>;
  appUserId?: string | null;
  error?: string | null;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function optionalEnv(name: string): string | null {
  const value = Deno.env.get(name);
  return value || null;
}

function configuredAllowedOrigins(): Set<string> {
  const configured = Deno.env.get("WOOF_ALLOWED_ORIGINS") || "";
  const origins = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_BROWSER_ORIGINS, ...origins]);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  if (!origin) {
    return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS, "Access-Control-Allow-Origin": "*" };
  }

  if (configuredAllowedOrigins().has(origin)) {
    return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS, "Access-Control-Allow-Origin": origin };
  }

  return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS };
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = CORS_HEADERS,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...DEPLOYMENT_HEADERS, ...headers, "Content-Type": "application/json" },
  });
}

function isAuthorized(req: Request): boolean {
  let expected: string;
  try {
    expected = requiredEnv("REVENUECAT_WEBHOOK_AUTH");
  } catch (err) {
    console.error("[REVENUECAT] Server configuration error:", (err as Error).message);
    return false;
  }

  const authorization = req.headers.get("Authorization") || "";
  return authorization === expected || authorization === `Bearer ${expected}`;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toIso(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function isFutureIsoDate(value: string | null): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function toTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function uniqueTextValues(values: Array<unknown>): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) ids.add(trimmed);
  }
  return [...ids];
}

function hasProEntitlement(event: Record<string, unknown>): boolean {
  const entitlementIds = toTextArray(event.entitlement_ids);
  return entitlementIds.includes(PRO_ENTITLEMENT_ID) || event.entitlement_id === PRO_ENTITLEMENT_ID;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function uniqueUuidIds(values: Array<unknown>): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    if (typeof value === "string" && isUuid(value)) ids.add(value);
  }
  return [...ids];
}

function candidateUserIds(event: Record<string, unknown>): string[] {
  return uniqueUuidIds([
    event.app_user_id,
    event.original_app_user_id,
    ...toTextArray(event.aliases),
  ]);
}

function candidateRevenueCatAppUserIds(event: Record<string, unknown>): string[] {
  return uniqueTextValues([
    event.app_user_id,
    event.original_app_user_id,
    ...toTextArray(event.aliases),
  ]);
}

function transferFromIds(event: Record<string, unknown>): string[] {
  return uniqueTextValues(toTextArray(event.transferred_from));
}

function transferToIds(event: Record<string, unknown>): string[] {
  return uniqueTextValues(toTextArray(event.transferred_to));
}

function eventTimestampIso(event: Record<string, unknown>): string {
  return toIso(event.event_timestamp_ms) || new Date().toISOString();
}

function appendUniqueUuidIds(current: string[], next: string[]): string[] {
  return uniqueUuidIds([...current, ...next]);
}

function entitlementState(event: Record<string, unknown>): EntitlementState {
  const type = String(event.type || "");

  if (type === "TEST") {
    return { shouldUpdate: false, isPro: false, proExpiresAt: null, ignoredReason: "test_event" };
  }

  if (!hasProEntitlement(event)) {
    return { shouldUpdate: false, isPro: false, proExpiresAt: null, ignoredReason: "no_pro_entitlement" };
  }

  const expirationAt = toIso(event.expiration_at_ms);
  const expirationMs = typeof event.expiration_at_ms === "number" ? event.expiration_at_ms : null;
  const graceExpiresAt = toIso(event.grace_period_expiration_at_ms);
  const graceExpirationMs = typeof event.grace_period_expiration_at_ms === "number"
    ? event.grace_period_expiration_at_ms
    : null;
  const now = Date.now();

  if (REVOKE_EVENT_TYPES.has(type)) {
    return { shouldUpdate: true, isPro: false, proExpiresAt: expirationAt || new Date().toISOString(), ignoredReason: null };
  }

  if (type === "BILLING_ISSUE") {
    if (graceExpirationMs && graceExpirationMs > now) {
      return { shouldUpdate: true, isPro: true, proExpiresAt: graceExpiresAt, ignoredReason: null };
    }
    return { shouldUpdate: false, isPro: false, proExpiresAt: null, ignoredReason: "billing_issue_without_grace" };
  }

  if (type === "SUBSCRIPTION_PAUSED") {
    return { shouldUpdate: false, isPro: false, proExpiresAt: null, ignoredReason: "pause_without_expiration" };
  }

  if (type === "CANCELLATION") {
    const activeUntilExpiration = expirationMs == null || expirationMs > now;
    return {
      shouldUpdate: true,
      isPro: activeUntilExpiration,
      proExpiresAt: expirationAt,
      ignoredReason: null,
    };
  }

  if (GRANT_EVENT_TYPES.has(type)) {
    const activeUntilExpiration = expirationMs == null || expirationMs > now;
    return {
      shouldUpdate: true,
      isPro: activeUntilExpiration,
      proExpiresAt: expirationAt,
      ignoredReason: null,
    };
  }

  return { shouldUpdate: false, isPro: false, proExpiresAt: null, ignoredReason: `unsupported_event_type:${type}` };
}

function readSubscriber(payload: Record<string, unknown>): Record<string, unknown> | null {
  const directSubscriber = toRecord(payload.subscriber);
  if (directSubscriber) return directSubscriber;

  const value = toRecord(payload.value);
  return value ? toRecord(value.subscriber) : null;
}

async function fetchSubscriber(appUserId: string, apiKey: string): Promise<SubscriberFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUBSCRIBER_SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${REVENUECAT_API_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      const suffix = details ? `:${details.slice(0, 200)}` : "";
      return { status: "error", error: `subscriber_fetch_http_${response.status}${suffix}` };
    }

    const payload = await response.json() as Record<string, unknown>;
    const subscriber = readSubscriber(payload);
    if (!subscriber) {
      return { status: "error", error: "subscriber_payload_missing_subscriber" };
    }

    return { status: "synced", subscriber };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "error", error: "subscriber_fetch_timeout" };
    }
    const message = err instanceof Error ? err.message : "subscriber_fetch_failed";
    return { status: "error", error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchFirstSubscriber(appUserIds: string[], apiKey: string): Promise<SubscriberFetchResult> {
  let lastError: string | null = null;

  for (const appUserId of appUserIds) {
    const result = await fetchSubscriber(appUserId, apiKey);
    if (result.subscriber) {
      return { ...result, appUserId };
    }
    lastError = result.error || lastError;
  }

  return {
    status: "error",
    appUserId: appUserIds[0] || null,
    error: lastError || "subscriber_fetch_failed",
  };
}

function subscriberEntitlementState(subscriber: Record<string, unknown>): SubscriberState {
  const entitlements = toRecord(subscriber.entitlements);
  const proEntitlement = entitlements ? toRecord(entitlements[PRO_ENTITLEMENT_ID]) : null;
  const managementUrl = typeof subscriber.management_url === "string" ? subscriber.management_url : null;
  const originalAppUserId = typeof subscriber.original_app_user_id === "string" ? subscriber.original_app_user_id : null;

  if (!proEntitlement) {
    return {
      isPro: false,
      proExpiresAt: null,
      productId: null,
      entitlementIds: [],
      managementUrl,
      originalAppUserId,
    };
  }

  const expiresAt = toIsoDate(proEntitlement.expires_date);
  const graceExpiresAt = toIsoDate(proEntitlement.grace_period_expires_date);
  const active = !expiresAt || isFutureIsoDate(expiresAt) || isFutureIsoDate(graceExpiresAt);
  const productId = typeof proEntitlement.product_identifier === "string"
    ? proEntitlement.product_identifier
    : null;

  return {
    isPro: active,
    proExpiresAt: isFutureIsoDate(graceExpiresAt) ? graceExpiresAt : expiresAt,
    productId,
    entitlementIds: [PRO_ENTITLEMENT_ID],
    managementUrl,
    originalAppUserId,
  };
}

function profileIdsForSubscriber(
  appUserIds: string[],
  event: Record<string, unknown>,
  subscriber: Record<string, unknown>,
): string[] {
  return uniqueUuidIds([
    ...appUserIds,
    event.app_user_id,
    event.original_app_user_id,
    ...toTextArray(event.aliases),
    subscriber.original_app_user_id,
  ]);
}

function eventEntitlementUpdates(
  event: Record<string, unknown>,
  eventId: string,
  eventType: string,
  entitlement: EntitlementState,
): Record<string, unknown> {
  return {
    is_pro: entitlement.isPro,
    pro_expires_at: entitlement.proExpiresAt,
    revenuecat_app_user_id: typeof event.app_user_id === "string" ? event.app_user_id : null,
    revenuecat_product_id: typeof event.product_id === "string" ? event.product_id : null,
    revenuecat_store: typeof event.store === "string" ? event.store : null,
    revenuecat_environment: typeof event.environment === "string" ? event.environment : null,
    revenuecat_entitlement_ids: toTextArray(event.entitlement_ids),
    revenuecat_last_event_id: eventId,
    revenuecat_last_event_type: eventType,
    revenuecat_last_event_at: eventTimestampIso(event),
    updated_at: new Date().toISOString(),
  };
}

function subscriberEntitlementUpdates(
  event: Record<string, unknown>,
  eventId: string,
  eventType: string,
  state: SubscriberState,
  subscriberAppUserId: string,
  subscriberSyncedAt: string,
): Record<string, unknown> {
  return {
    is_pro: state.isPro,
    pro_expires_at: state.proExpiresAt,
    revenuecat_app_user_id: subscriberAppUserId,
    revenuecat_product_id: state.productId || (typeof event.product_id === "string" ? event.product_id : null),
    revenuecat_store: typeof event.store === "string" ? event.store : null,
    revenuecat_environment: typeof event.environment === "string" ? event.environment : null,
    revenuecat_entitlement_ids: state.entitlementIds,
    revenuecat_last_event_id: eventId,
    revenuecat_last_event_type: eventType,
    revenuecat_last_event_at: eventTimestampIso(event),
    revenuecat_subscriber_synced_at: subscriberSyncedAt,
    revenuecat_management_url: state.managementUrl,
    updated_at: subscriberSyncedAt,
  };
}

function transferRevocationUpdates(
  event: Record<string, unknown>,
  eventId: string,
  eventType: string,
  subscriberSyncedAt: string,
): Record<string, unknown> {
  return {
    is_pro: false,
    pro_expires_at: subscriberSyncedAt,
    revenuecat_last_event_id: eventId,
    revenuecat_last_event_type: eventType,
    revenuecat_last_event_at: eventTimestampIso(event),
    revenuecat_subscriber_synced_at: subscriberSyncedAt,
    updated_at: subscriberSyncedAt,
  };
}

async function updateProfiles(
  supabase: SupabaseClient,
  userIds: string[],
  updates: Record<string, unknown>,
): Promise<void> {
  if (userIds.length === 0) return;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .in("id", userIds);

  if (error) {
    throw new Error(error.message);
  }
}

Deno.serve(async (req) => {
  const responseHeaders = corsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    jsonResponse(body, status, responseHeaders);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: responseHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!isAuthorized(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const event = body.event as Record<string, unknown> | undefined;
  if (!event || typeof event !== "object") {
    return json({ error: "Missing RevenueCat event" }, 400);
  }

  let supabaseUrl: string;
  let supabaseServiceKey: string;
  try {
    supabaseUrl = requiredEnv("SUPABASE_URL");
    supabaseServiceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  } catch (err) {
    console.error("[REVENUECAT] Server configuration error:", (err as Error).message);
    return json({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const revenueCatApiKey = optionalEnv("REVENUECAT_REST_API_KEY");

  const eventType = String(event.type || "UNKNOWN");
  const eventId =
    typeof event.id === "string" && event.id
      ? event.id
      : `${eventType}:${event.event_timestamp_ms || "no_timestamp"}:${event.transaction_id || crypto.randomUUID()}`;

  let processedUserIds: string[] = [];
  let ignoredReason: string | null = null;
  let subscriberSyncStatus: string | null = revenueCatApiKey ? "skipped" : "not_configured";
  let subscriberSyncError: string | null = null;
  let subscriberSyncedAt: string | null = null;
  let subscriberAppUserId: string | null = null;

  try {
    if (eventType === "TRANSFER") {
      const fromProfileIds = uniqueUuidIds(transferFromIds(event));
      const toAppUserIds = transferToIds(event);
      const nowIso = new Date().toISOString();

      if (fromProfileIds.length > 0) {
        await updateProfiles(
          supabase,
          fromProfileIds,
          transferRevocationUpdates(event, eventId, eventType, nowIso),
        );
        processedUserIds = appendUniqueUuidIds(processedUserIds, fromProfileIds);
      }

      if (revenueCatApiKey && toAppUserIds.length > 0) {
        const subscriberResult = await fetchFirstSubscriber(toAppUserIds, revenueCatApiKey);
        subscriberSyncStatus = subscriberResult.status;
        subscriberSyncError = subscriberResult.error || null;
        subscriberAppUserId = subscriberResult.appUserId || null;

        if (subscriberResult.subscriber && subscriberResult.appUserId) {
          const state = subscriberEntitlementState(subscriberResult.subscriber);
          subscriberSyncedAt = new Date().toISOString();
          const toProfileIds = profileIdsForSubscriber(toAppUserIds, event, subscriberResult.subscriber);

          if (toProfileIds.length > 0) {
            await updateProfiles(
              supabase,
              toProfileIds,
              subscriberEntitlementUpdates(
                event,
                eventId,
                eventType,
                state,
                subscriberResult.appUserId,
                subscriberSyncedAt,
              ),
            );
            processedUserIds = appendUniqueUuidIds(processedUserIds, toProfileIds);
          } else {
            ignoredReason = "subscriber_sync_no_uuid_destination";
          }
        } else {
          ignoredReason = "transfer_subscriber_sync_failed";
        }
      } else if (!revenueCatApiKey) {
        ignoredReason = processedUserIds.length > 0
          ? "transfer_destination_requires_subscriber_sync"
          : "transfer_requires_subscriber_sync";
      } else {
        subscriberSyncStatus = "no_app_user_id";
        ignoredReason = processedUserIds.length > 0
          ? "transfer_missing_destination"
          : "transfer_no_uuid_app_user_id";
      }
    } else {
      const entitlement = entitlementState(event);
      const revenueCatAppUserIds = candidateRevenueCatAppUserIds(event);
      let usedSubscriberSync = false;
      ignoredReason = entitlement.ignoredReason;

      if (eventType !== "TEST" && revenueCatApiKey && revenueCatAppUserIds.length > 0) {
        const subscriberResult = await fetchFirstSubscriber(revenueCatAppUserIds, revenueCatApiKey);
        subscriberSyncStatus = subscriberResult.status;
        subscriberSyncError = subscriberResult.error || null;
        subscriberAppUserId = subscriberResult.appUserId || null;

        if (subscriberResult.subscriber && subscriberResult.appUserId) {
          const state = subscriberEntitlementState(subscriberResult.subscriber);
          subscriberSyncedAt = new Date().toISOString();
          const userIds = profileIdsForSubscriber(revenueCatAppUserIds, event, subscriberResult.subscriber);

          if (userIds.length > 0) {
            await updateProfiles(
              supabase,
              userIds,
              subscriberEntitlementUpdates(
                event,
                eventId,
                eventType,
                state,
                subscriberResult.appUserId,
                subscriberSyncedAt,
              ),
            );
            processedUserIds = appendUniqueUuidIds(processedUserIds, userIds);
            ignoredReason = null;
            usedSubscriberSync = true;
          } else {
            ignoredReason = "subscriber_sync_no_uuid_app_user_id";
          }
        }
      } else if (eventType !== "TEST" && revenueCatApiKey && revenueCatAppUserIds.length === 0) {
        subscriberSyncStatus = "no_app_user_id";
      }

      if (!usedSubscriberSync) {
        const userIds = candidateUserIds(event);
        if (entitlement.shouldUpdate && userIds.length > 0) {
          await updateProfiles(
            supabase,
            userIds,
            eventEntitlementUpdates(event, eventId, eventType, entitlement),
          );
          processedUserIds = appendUniqueUuidIds(processedUserIds, userIds);
          ignoredReason = null;
        } else if (entitlement.shouldUpdate && userIds.length === 0) {
          ignoredReason = "no_uuid_app_user_id";
        }
      }
    }
  } catch (err) {
    console.error("[REVENUECAT] Profile update failed:", (err as Error).message);
    return json({ error: "Failed to update subscription status" }, 500);
  }

  const { error: eventError } = await supabase
    .from("revenuecat_events")
    .upsert(
      {
        event_id: eventId,
        event_type: eventType,
        app_user_id: typeof event.app_user_id === "string" ? event.app_user_id : null,
        original_app_user_id: typeof event.original_app_user_id === "string" ? event.original_app_user_id : null,
        aliases: toTextArray(event.aliases),
        transaction_id: typeof event.transaction_id === "string" ? event.transaction_id : null,
        original_transaction_id: typeof event.original_transaction_id === "string" ? event.original_transaction_id : null,
        product_id: typeof event.product_id === "string" ? event.product_id : null,
        entitlement_ids: toTextArray(event.entitlement_ids),
        environment: typeof event.environment === "string" ? event.environment : null,
        store: typeof event.store === "string" ? event.store : null,
        event_timestamp: toIso(event.event_timestamp_ms),
        payload: body,
        processed_user_ids: processedUserIds,
        ignored_reason: ignoredReason,
        subscriber_sync_status: subscriberSyncStatus,
        subscriber_sync_error: subscriberSyncError,
        subscriber_synced_at: subscriberSyncedAt,
        subscriber_app_user_id: subscriberAppUserId,
      },
      { onConflict: "event_id" },
    );

  if (eventError) {
    console.error("[REVENUECAT] Event log write failed:", eventError.message);
    return json({ error: "Failed to log webhook event" }, 500);
  }

  return json({
    ok: true,
    event_id: eventId,
    event_type: eventType,
    processed_user_ids: processedUserIds,
    ignored_reason: ignoredReason,
    subscriber_sync_status: subscriberSyncStatus,
    subscriber_sync_error: subscriberSyncError,
  });
});
