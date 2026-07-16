import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Expose-Headers":
    "X-Woof-Function-Name, X-Woof-Function-Audit-Version",
  "Vary": "Origin",
};

const FUNCTION_NAME = "revenuecat-sync";
const FUNCTION_AUDIT_VERSION = "2026-07-10-edge-live-profile-contract-v4";
const DEPLOYMENT_HEADERS = {
  "X-Woof-Function-Name": FUNCTION_NAME,
  "X-Woof-Function-Audit-Version": FUNCTION_AUDIT_VERSION,
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
  error?: string | null;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
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

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing auth token" }, 401);
  }

  let supabaseUrl: string;
  let supabaseServiceKey: string;
  let revenueCatApiKey: string;
  try {
    supabaseUrl = requiredEnv("SUPABASE_URL");
    supabaseServiceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    revenueCatApiKey = requiredEnv("REVENUECAT_REST_API_KEY");
  } catch (err) {
    console.error("[REVENUECAT_SYNC] Server configuration error:", (err as Error).message);
    return json({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.substring(7));

  if (authError || !user) {
    console.error("[REVENUECAT_SYNC] Auth failed:", authError?.message || "No user");
    return json({ error: "Invalid auth token" }, 401);
  }

  const subscriberResult = await fetchSubscriber(user.id, revenueCatApiKey);
  if (!subscriberResult.subscriber) {
    console.error("[REVENUECAT_SYNC] Subscriber sync failed:", subscriberResult.error || "unknown");
    return json({
      ok: false,
      status: subscriberResult.status,
      error: subscriberResult.error || "subscriber_fetch_failed",
    }, 502);
  }

  const state = subscriberEntitlementState(subscriberResult.subscriber);
  const syncedAt = new Date().toISOString();
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        is_pro: state.isPro,
        pro_expires_at: state.proExpiresAt,
        updated_at: syncedAt,
      },
      { onConflict: "id" },
    );

  if (profileError) {
    console.error("[REVENUECAT_SYNC] Profile update failed:", profileError.message);
    return json({ error: "Failed to update subscription status" }, 500);
  }

  return json({
    ok: true,
    status: subscriberResult.status,
    is_pro: state.isPro,
    pro_expires_at: state.proExpiresAt,
    product_id: state.productId,
    entitlement_ids: state.entitlementIds,
    subscriber_synced_at: syncedAt,
    management_url_present: !!state.managementUrl,
    original_app_user_id_present: !!state.originalAppUserId,
  });
});
