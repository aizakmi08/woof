import { supabase } from "./supabase";
import { trackEvent } from "./analytics";
import { createLogger } from "./logger";

const logger = createLogger("REVENUECAT_SYNC");
const SYNC_FUNCTION_NAME = "revenuecat-sync";
const MAX_SYNC_ERROR_LENGTH = 240;
const RECONCILE_DELAYS_MS = [1200, 3200, 7000];

let reconciliationPromise = null;

function syncSource(source) {
  return typeof source === "string" && source.trim()
    ? source.trim().slice(0, 80)
    : "unknown";
}

function syncErrorText(value) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, MAX_SYNC_ERROR_LENGTH)
    : null;
}

async function extractFunctionErrorDetails(err) {
  const response = err?.context;
  const details = {
    message: syncErrorText(err?.message) || "RevenueCat profile sync failed",
    http_status: Number.isFinite(response?.status) ? response.status : null,
    sync_status: null,
    function_error: null,
  };

  if (!response || typeof response.clone !== "function") {
    return details;
  }

  try {
    const body = await response.clone().json();
    if (body && typeof body === "object") {
      details.sync_status = syncErrorText(body.status);
      details.function_error = syncErrorText(body.error);
      details.message = details.function_error || details.message;
      return details;
    }
  } catch {
    // Fall through to a text body if the function did not return JSON.
  }

  try {
    const text = await response.clone().text();
    details.function_error = syncErrorText(text);
    details.message = details.function_error || details.message;
  } catch {
    // Keep the generic Supabase function error message.
  }

  return details;
}

export async function syncRevenueCatProfile({ source = "unknown" } = {}) {
  const normalizedSource = syncSource(source);

  try {
    const { data, error } = await supabase.functions.invoke(SYNC_FUNCTION_NAME, {
      body: { source: normalizedSource },
    });

    if (error) throw error;

    const entitlementIds = Array.isArray(data?.entitlement_ids)
      ? data.entitlement_ids
      : [];

    trackEvent("revenuecat_profile_sync_completed", {
      source: normalizedSource,
      success: data?.ok === true,
      status: data?.status || "unknown",
      is_pro: data?.is_pro ?? null,
      entitlement_count: entitlementIds.length,
    });

    return data || null;
  } catch (err) {
    const details = await extractFunctionErrorDetails(err);
    logger.debug("[REVENUECAT_SYNC] sync failed:", details.message);
    trackEvent("revenuecat_profile_sync_failed", {
      source: normalizedSource,
      message: details.message,
      http_status: details.http_status,
      sync_status: details.sync_status,
      function_error: details.function_error,
    });
    return null;
  }
}

function waitForReconciliation(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function reconcileRevenueCatProfile({ source = "unknown" } = {}) {
  if (reconciliationPromise) {
    logger.debug("[REVENUECAT_SYNC] Reusing active reconciliation");
    return reconciliationPromise;
  }

  const normalizedSource = syncSource(source).slice(0, 56);
  logger.debug("[REVENUECAT_SYNC] Reconciliation scheduled:", normalizedSource);
  reconciliationPromise = (async () => {
    trackEvent("revenuecat_profile_reconcile_started", {
      source: normalizedSource,
      attempt_count: RECONCILE_DELAYS_MS.length,
    });

    let latestState = null;
    for (let index = 0; index < RECONCILE_DELAYS_MS.length; index += 1) {
      await waitForReconciliation(RECONCILE_DELAYS_MS[index]);
      const attempt = index + 1;
      logger.debug("[REVENUECAT_SYNC] Reconciliation attempt:", attempt);
      latestState = await syncRevenueCatProfile({
        source: `${normalizedSource}_retry_${attempt}`,
      });

      if (latestState?.is_pro === true) {
        logger.debug("[REVENUECAT_SYNC] Reconciliation completed:", attempt);
        trackEvent("revenuecat_profile_reconcile_completed", {
          source: normalizedSource,
          attempt,
          status: latestState.status || "unknown",
        });
        return latestState;
      }

      trackEvent("revenuecat_profile_reconcile_attempt", {
        source: normalizedSource,
        attempt,
        success: latestState?.ok === true,
        status: latestState?.status || "unknown",
        is_pro: latestState?.is_pro ?? null,
      });
    }

    trackEvent("revenuecat_profile_reconcile_exhausted", {
      source: normalizedSource,
      attempt_count: RECONCILE_DELAYS_MS.length,
      status: latestState?.status || "unknown",
      is_pro: latestState?.is_pro ?? null,
    });
    logger.debug("[REVENUECAT_SYNC] Reconciliation exhausted");
    return latestState;
  })().finally(() => {
    reconciliationPromise = null;
  });

  return reconciliationPromise;
}
