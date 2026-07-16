import { supabase } from "./supabase";
import { createLogger } from "./logger";

export const FREE_SCAN_LIMIT = 3;
const logger = createLogger("ENTITLEMENTS");

export async function consumeScan({ scanId, scanMode } = {}) {
  const { data, error } = await supabase.rpc("consume_scan", {
    p_scan_id: scanId || null,
    p_scan_mode: scanMode || "unknown",
    p_free_limit: FREE_SCAN_LIMIT,
  });

  if (error) {
    logger.debug("[ENTITLEMENTS] consume_scan error:", error.message);
    throw error;
  }

  if (!data?.allowed) {
    const limitError = new Error("You've used your free scans. Upgrade to keep scanning.");
    limitError.code = "SCAN_LIMIT_REACHED";
    limitError.reason = data?.reason || "free_limit_reached";
    limitError.scanUsage = data;
    throw limitError;
  }

  return data;
}
