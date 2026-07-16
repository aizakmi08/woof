import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { createLogger } from "./logger";
import { productHasVerifiedImage } from "./catalogQuality";

const STORAGE_KEY_PREFIX = "@woof/scan_history_";
const LEGACY_STORAGE_KEY = "@woof/scan_history"; // For migration
const MIGRATION_PREFIX = "@woof/history_migrated_";
const MAX_ENTRIES = 50;
const MAX_RESULT_SNAPSHOT_CHARS = 60000;
const HISTORY_LIST_COLUMNS = [
  "id",
  "product_name",
  "overall_score",
  "pet_type",
  "date_scanned",
  "cache_key",
  "scan_mode",
  "data_source",
  "safety_level",
  "photo_uri",
  "product_image_url",
].join(",");
const HISTORY_CATALOG_IMAGE_COLUMNS = [
  "cache_key",
  "image_url",
  "image_verification_status",
  "source_url",
].join(",");
const logger = createLogger("HISTORY");

// --- Helpers ---

async function getCurrentUserId() {
  try {
    // Add timeout to prevent hanging on slow auth checks
    const timeoutMs = 3000;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AUTH_SESSION_TIMEOUT")), timeoutMs)
    );

    const { data: { session } } = await Promise.race([
      supabase.auth.getSession(),
      timeout
    ]);
    return session?.user?.id ?? null;
  } catch (err) {
    if (err.message !== "AUTH_SESSION_TIMEOUT") {
      logger.debug("[HISTORY] getCurrentUserId error:", err.message);
    }
    return null;
  }
}

function getStorageKey(userId) {
  // User-specific key for authenticated users, legacy key for anonymous
  return userId ? `${STORAGE_KEY_PREFIX}${userId}` : LEGACY_STORAGE_KEY;
}

function boundedResultSnapshot(entry = {}) {
  if (entry.scanMode !== "human_food" || !entry.resultSnapshot || typeof entry.resultSnapshot !== "object") {
    return null;
  }

  const { __scanUsage: _scanUsage, ...publicResult } = entry.resultSnapshot;
  try {
    const serialized = JSON.stringify(publicResult);
    if (!serialized || serialized.length > MAX_RESULT_SNAPSHOT_CHARS) return null;
    return publicResult;
  } catch {
    return null;
  }
}

async function getLocalHistory(userId = null) {
  try {
    const key = getStorageKey(userId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    logger.debug("[HISTORY] Error reading local history:", err.message);
    return [];
  }
}

async function saveLocalHistory(entries, userId = null) {
  const key = getStorageKey(userId);
  await AsyncStorage.setItem(key, JSON.stringify(entries));
}

export async function clearLocalHistoryForUser(userId = null) {
  const keys = [
    getStorageKey(userId),
    LEGACY_STORAGE_KEY,
  ];

  if (userId) {
    keys.push(`${MIGRATION_PREFIX}${userId}`);
  }

  await AsyncStorage.multiRemove([...new Set(keys)]);
}

export async function migrateLocalHistoryBetweenUsers(fromUserId, toUserId) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) {
    return { migrated: 0, skipped: true };
  }

  try {
    const [fromHistory, toHistory] = await Promise.all([
      getLocalHistory(fromUserId),
      getLocalHistory(toUserId),
    ]);

    if (fromHistory.length === 0) {
      return { migrated: 0, skipped: false };
    }

    const seenIds = new Set();
    const merged = [...fromHistory, ...toHistory]
      .filter((entry) => {
        if (!entry?.id || seenIds.has(entry.id)) return false;
        seenIds.add(entry.id);
        return true;
      })
      .sort((a, b) => new Date(b.dateScanned) - new Date(a.dateScanned))
      .slice(0, MAX_ENTRIES);

    await saveLocalHistory(merged, toUserId);

    const rows = merged.map((entry) => toSupabaseRow(entry, toUserId));
    const { error } = await supabase
      .from("scan_history")
      .upsert(rows, { onConflict: "id,user_id" });

    if (error) {
      logger.debug("[HISTORY] Linked-account history upsert error:", error.message);
      return { migrated: fromHistory.length, synced: false };
    }

    await AsyncStorage.multiRemove([
      getStorageKey(fromUserId),
      `${MIGRATION_PREFIX}${fromUserId}`,
    ]);

    logger.debug("[HISTORY] Migrated guest history to linked account:", fromHistory.length);
    return { migrated: fromHistory.length, synced: true };
  } catch (err) {
    logger.debug("[HISTORY] Linked-account history migration error:", err.message);
    return { migrated: 0, synced: false, error: err.message };
  }
}

function toSupabaseRow(entry, userId) {
  const productName = entry.productName || entry.foodName || "Scan result";

  return {
    id: entry.id,
    user_id: userId,
    product_name: productName,
    overall_score: entry.overallScore,
    pet_type: entry.petType ?? null,
    date_scanned: entry.dateScanned,
    cache_key: entry.cacheKey ?? null,
    scan_mode: entry.scanMode ?? null,
    data_source: entry.dataSource ?? null,
    safety_level: entry.safetyLevel ?? null,
    photo_uri: entry.photoUri ?? null,
    product_image_url: entry.productImageUrl ?? null,
    result_snapshot: boundedResultSnapshot(entry),
  };
}

function fromSupabaseRow(row) {
  const productName = row.product_name || "Scan result";

  return {
    id: row.id,
    productName,
    ...(row.scan_mode === "human_food" && { foodName: productName }),
    overallScore: row.overall_score,
    petType: row.pet_type,
    dateScanned: row.date_scanned,
    cacheKey: row.cache_key,
    scanMode: row.scan_mode,
    dataSource: row.data_source,
    safetyLevel: row.safety_level,
    photoUri: row.photo_uri,
    productImageUrl: row.product_image_url,
    ...(row.product_image_url && { displayImageUrl: row.product_image_url }),
    ...(row.result_snapshot && { resultSnapshot: row.result_snapshot }),
  };
}

async function hydrateHistoryDisplayImages(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return entries;

  const cacheKeys = [...new Set(entries
    .filter((entry) => entry?.scanMode !== "human_food")
    .map((entry) => String(entry?.cacheKey || "").trim())
    .filter(Boolean))];

  if (cacheKeys.length === 0) return entries;

  try {
    const { data, error } = await supabase
      .from("product_data")
      .select(HISTORY_CATALOG_IMAGE_COLUMNS)
      .in("cache_key", cacheKeys);

    if (error || !data) {
      if (error) logger.debug("[HISTORY] Catalog image hydration error:", error.message);
      return entries;
    }

    const imageByCacheKey = new Map(
      data
        .filter((product) => productHasVerifiedImage(product))
        .map((product) => [product.cache_key, product.image_url])
    );

    return entries.map((entry) => {
      const displayImageUrl = entry.productImageUrl || imageByCacheKey.get(entry.cacheKey);
      return displayImageUrl ? { ...entry, displayImageUrl } : entry;
    });
  } catch (err) {
    logger.debug("[HISTORY] Catalog image hydration failed:", err.message);
    return entries;
  }
}

// --- Public API ---

/**
 * Read scan history.
 * If authenticated, try Supabase first; fall back to local on failure.
 */
export async function getHistory() {
  const userId = await getCurrentUserId();

  if (userId) {
    try {
      const { data, error } = await supabase
        .from("scan_history")
        .select(HISTORY_LIST_COLUMNS)
        .eq("user_id", userId)
        .order("date_scanned", { ascending: false })
        .limit(MAX_ENTRIES);

      if (!error && data) {
        const localEntries = await getLocalHistory(userId).catch(() => []);
        const localById = new Map(localEntries.map((entry) => [entry.id, entry]));
        const supabaseEntries = data.map(fromSupabaseRow).map((entry) => {
          const localSnapshot = boundedResultSnapshot(localById.get(entry.id));
          return localSnapshot ? { ...entry, resultSnapshot: localSnapshot } : entry;
        });
        // Merge local entries for THIS USER that may not have been synced yet
        try {
          const supabaseIds = new Set(supabaseEntries.map((e) => e.id));
          const unsynced = localEntries.filter((e) => !supabaseIds.has(e.id));
          if (unsynced.length > 0) {
            logger.debug("[HISTORY] Merging", unsynced.length, "unsynced local entries");
            const merged = [...unsynced, ...supabaseEntries]
              .sort((a, b) => new Date(b.dateScanned) - new Date(a.dateScanned))
              .slice(0, MAX_ENTRIES);
            return hydrateHistoryDisplayImages(merged);
          }
        } catch {
          // Local merge failed, still return Supabase data
        }
        return hydrateHistoryDisplayImages(supabaseEntries);
      }
    } catch (err) {
      logger.debug("[HISTORY] Supabase read failed, falling back to local:", err.message);
    }
  }

  return hydrateHistoryDisplayImages(await getLocalHistory(userId));
}

export async function getHistoryResultSnapshot(historyId) {
  if (!historyId) return null;
  const userId = await getCurrentUserId();
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from("scan_history")
      .select("scan_mode,result_snapshot")
      .eq("id", historyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;
    return boundedResultSnapshot({
      scanMode: data.scan_mode,
      resultSnapshot: data.result_snapshot,
    });
  } catch (err) {
    logger.debug("[HISTORY] Result snapshot read failed:", err.message);
    return null;
  }
}

/**
 * Add a new scan history entry.
 * Always writes to AsyncStorage. If authenticated, also upserts to Supabase.
 */
export async function addHistoryEntry(entry) {
  try {
    const userId = await getCurrentUserId();
    const localHistory = await getLocalHistory(userId);
    const newEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ...entry,
    };
    const updated = [newEntry, ...localHistory].slice(0, MAX_ENTRIES);
    await saveLocalHistory(updated, userId);
    logger.debug("[HISTORY] Saved entry locally:", newEntry.productName);

    // Fire-and-forget Supabase upsert
    if (userId) {
      supabase
        .from("scan_history")
        .upsert(toSupabaseRow(newEntry, userId), { onConflict: "id,user_id" })
        .then(({ error }) => {
          if (error) logger.debug("[HISTORY] Supabase upsert error:", error.message);
          else logger.debug("[HISTORY] Synced to Supabase:", newEntry.productName);
        });
    }
  } catch (err) {
    logger.debug("[HISTORY] Error saving entry:", err.message);
  }
}

/**
 * Clear all scan history from both stores.
 */
export async function clearHistory() {
  try {
    const userId = await getCurrentUserId();
    await clearLocalHistoryForUser(userId);
    logger.debug("[HISTORY] Cleared local history");

    if (userId) {
      supabase
        .from("scan_history")
        .delete()
        .eq("user_id", userId)
        .then(({ error }) => {
          if (error) logger.debug("[HISTORY] Supabase clear error:", error.message);
          else logger.debug("[HISTORY] Cleared Supabase history");
        });
    }
  } catch (err) {
    logger.debug("[HISTORY] Error clearing history:", err.message);
  }
}

/**
 * Migrate local AsyncStorage history to Supabase on first sign-in.
 * Also migrates from legacy shared key to user-specific key.
 * Idempotent — keyed by user ID.
 */
export async function migrateLocalHistoryToSupabase(userId) {
  const migrationKey = MIGRATION_PREFIX + userId;

  try {
    const alreadyMigrated = await AsyncStorage.getItem(migrationKey);
    if (alreadyMigrated === "true") {
      logger.debug("[HISTORY] Migration already completed for user:", userId);
      return;
    }

    // First, check if there's legacy data to migrate
    let localHistory = [];
    const legacyRaw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      try {
        const legacyData = JSON.parse(legacyRaw);
        if (legacyData.length > 0) {
          logger.debug("[HISTORY] Found", legacyData.length, "entries in legacy storage");
          localHistory = legacyData;

          // Save to user-specific key
          await saveLocalHistory(legacyData, userId);

          // Clear legacy key to prevent future confusion
          await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
          logger.debug("[HISTORY] Migrated legacy data to user-specific storage");
        }
      } catch (parseErr) {
        logger.debug("[HISTORY] Failed to parse legacy data:", parseErr.message);
      }
    } else {
      // No legacy data, check user-specific storage
      localHistory = await getLocalHistory(userId);
    }

    if (localHistory.length === 0) {
      await AsyncStorage.setItem(migrationKey, "true");
      return;
    }

    const rows = localHistory.map((entry) => toSupabaseRow(entry, userId));
    const { error } = await supabase
      .from("scan_history")
      .upsert(rows, { onConflict: "id,user_id" });

    if (error) {
      logger.debug("[HISTORY] Migration upsert error:", error.message);
      // Don't mark as complete so it retries next time
      return;
    }

    try {
      await AsyncStorage.setItem(migrationKey, "true");
      logger.debug("[HISTORY] Migrated", localHistory.length, "entries to Supabase");
    } catch (storageErr) {
      logger.debug("[HISTORY] Failed to save migration flag:", storageErr.message);
    }
  } catch (err) {
    logger.debug("[HISTORY] Migration error:", err.message);
  }
}
