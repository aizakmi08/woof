import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.0";

const PRO_ENTITLEMENT_ID = "pro";
const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1";
const REVENUECAT_TIMEOUT_MS = 8_000;
const SUPABASE_TIMEOUT_MS = 8_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bearerToken(header: string | null) {
  const match = /^Bearer\s+(.+)$/i.exec(header || "");
  return match?.[1]?.trim() || "";
}

function uniqueUuidValues(values: unknown[]) {
  const ids = new Set<string>();
  for (const value of values) {
    if (typeof value === "string" && UUID_RE.test(value)) {
      ids.add(value);
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && UUID_RE.test(item)) {
          ids.add(item);
        }
      }
    }
  }
  return [...ids];
}

function revenueCatUserIds(event: Record<string, unknown>) {
  return uniqueUuidValues([
    event.app_user_id,
    event.original_app_user_id,
    event.transferred_to,
    event.transferred_from,
    event.aliases,
  ]);
}

function parseExpiration(expiresDate: unknown) {
  if (typeof expiresDate !== "string" || !expiresDate) return null;
  const ms = Date.parse(expiresDate);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function isEntitlementActive(entitlement: Record<string, unknown> | null) {
  if (!entitlement) return false;
  const expiresAt = parseExpiration(entitlement.expires_date);
  if (!expiresAt) return true;
  return Date.parse(expiresAt) > Date.now();
}

async function withTimeout<T>(label: string, timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(`${label} timeout`), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSubscriber(appUserId: string, apiKey: string) {
  const response = await withTimeout("RevenueCat subscriber lookup", REVENUECAT_TIMEOUT_MS, (signal) =>
    fetch(`${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
      signal,
    })
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`RevenueCat subscriber lookup failed: ${response.status} ${body.slice(0, 160)}`);
  }

  return response.json();
}

async function syncProfileEntitlement(supabase: any, userId: string, apiKey: string) {
  const data = await fetchSubscriber(userId, apiKey);
  const entitlement = data?.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID] || null;
  const active = isEntitlementActive(entitlement);
  const expiresAt = parseExpiration(entitlement?.expires_date);

  const { data: updated, error } = await withTimeout<any>("Supabase entitlement update", SUPABASE_TIMEOUT_MS, (signal) =>
    supabase
      .from("profiles")
      .update({
        is_pro: active,
        pro_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("id")
      .abortSignal(signal)
  );

  if (error) {
    throw new Error(`Profile entitlement update failed: ${error.message}`);
  }

  return {
    userId,
    active,
    expiresAt,
    updated: Array.isArray(updated) ? updated.length : 0,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const webhookToken = Deno.env.get("REVENUECAT_WEBHOOK_AUTH_TOKEN") || "";
  if (!webhookToken) {
    console.error("[REVENUECAT] Missing REVENUECAT_WEBHOOK_AUTH_TOKEN");
    return jsonResponse({ error: "Webhook auth is not configured" }, 503);
  }

  if (bearerToken(req.headers.get("Authorization")) !== webhookToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const revenueCatApiKey = Deno.env.get("REVENUECAT_REST_API_KEY") || "";
  if (!revenueCatApiKey) {
    console.error("[REVENUECAT] Missing REVENUECAT_REST_API_KEY");
    return jsonResponse({ error: "RevenueCat API is not configured" }, 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const event = payload.event && typeof payload.event === "object"
    ? payload.event as Record<string, unknown>
    : null;
  if (!event) {
    return jsonResponse({ error: "Missing RevenueCat event" }, 400);
  }

  if (event.type === "TEST") {
    return jsonResponse({ ok: true, ignored: "test_event" });
  }

  const userIds = revenueCatUserIds(event);
  if (userIds.length === 0) {
    console.log("[REVENUECAT] Ignoring webhook without Supabase UUID app_user_id", {
      type: event.type || "unknown",
      hasAppUserId: Boolean(event.app_user_id),
    });
    return jsonResponse({ ok: true, ignored: "non_supabase_app_user_id" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const results = [];
  for (const userId of userIds) {
    results.push(await syncProfileEntitlement(supabase, userId, revenueCatApiKey));
  }

  console.log("[REVENUECAT] Synced entitlement", {
    type: event.type || "unknown",
    eventId: typeof event.id === "string" ? event.id : null,
    synced: results.length,
    active: results.filter((result) => result.active).length,
  });

  return jsonResponse({ ok: true, synced: results.length });
});
