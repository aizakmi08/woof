import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const STORAGE_KEY_PREFIX = "@woof/scan_history_";
const LEGACY_STORAGE_KEY = "@woof/scan_history"; // For migration
const MIGRATION_PREFIX = "@woof/history_migrated_";
const MAX_ENTRIES = 50;

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
      console.log("[HISTORY] getCurrentUserId error:", err.message);
    }
    return null;
  }
}

function getStorageKey(userId) {
  // User-specific key for authenticated users, legacy key for anonymous
  return userId ? `${STORAGE_KEY_PREFIX}${userId}` : LEGACY_STORAGE_KEY;
}

async function getLocalHistory(userId = null) {
  try {
    const key = getStorageKey(userId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.log("[HISTORY] Error reading local history:", err.message);
    return [];
  }
}

async function saveLocalHistory(entries, userId = null) {
  const key = getStorageKey(userId);
  await AsyncStorage.setItem(key, JSON.stringify(entries));
}

function toSupabaseRow(entry, userId) {
  return {
    id: entry.id,
    user_id: userId,
    product_name: entry.productName,
    overall_score: entry.overallScore,
    pet_type: entry.petType ?? null,
    date_scanned: entry.dateScanned,
    cache_key: entry.cacheKey ?? null,
    scan_mode: entry.scanMode ?? null,
    data_source: entry.dataSource ?? null,
    photo_uri: entry.photoUri ?? null,
  };
}

function fromSupabaseRow(row) {
  return {
    id: row.id,
    productName: row.product_name,
    overallScore: row.overall_score,
    petType: row.pet_type,
    dateScanned: row.date_scanned,
    cacheKey: row.cache_key,
    scanMode: row.scan_mode,
    dataSource: row.data_source,
    photoUri: row.photo_uri,
  };
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
        .select("*")
        .eq("user_id", userId)
        .order("date_scanned", { ascending: false })
        .limit(MAX_ENTRIES);

      if (!error && data) {
        const supabaseEntries = data.map(fromSupabaseRow);
        // Merge local entries for THIS USER that may not have been synced yet
        try {
          const localEntries = await getLocalHistory(userId);
          const supabaseIds = new Set(supabaseEntries.map((e) => e.id));
          const unsynced = localEntries.filter((e) => !supabaseIds.has(e.id));
          if (unsynced.length > 0) {
            console.log("[HISTORY] Merging", unsynced.length, "unsynced local entries");
            const merged = [...unsynced, ...supabaseEntries]
              .sort((a, b) => new Date(b.dateScanned) - new Date(a.dateScanned))
              .slice(0, MAX_ENTRIES);
            return merged;
          }
        } catch {
          // Local merge failed, still return Supabase data
        }
        return supabaseEntries;
      }
    } catch (err) {
      console.log("[HISTORY] Supabase read failed, falling back to local:", err.message);
    }
  }

  return getLocalHistory(userId);
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
    console.log("[HISTORY] Saved entry locally:", newEntry.productName);

    // Fire-and-forget Supabase upsert
    if (userId) {
      supabase
        .from("scan_history")
        .upsert(toSupabaseRow(newEntry, userId), { onConflict: "id,user_id" })
        .then(({ error }) => {
          if (error) console.log("[HISTORY] Supabase upsert error:", error.message);
          else console.log("[HISTORY] Synced to Supabase:", newEntry.productName);
        });
    }
  } catch (err) {
    console.log("[HISTORY] Error saving entry:", err.message);
  }
}

/**
 * Clear all scan history from both stores.
 */
export async function clearHistory() {
  try {
    const userId = await getCurrentUserId();
    const key = getStorageKey(userId);
    await AsyncStorage.removeItem(key);
    console.log("[HISTORY] Cleared local history");

    if (userId) {
      supabase
        .from("scan_history")
        .delete()
        .eq("user_id", userId)
        .then(({ error }) => {
          if (error) console.log("[HISTORY] Supabase clear error:", error.message);
          else console.log("[HISTORY] Cleared Supabase history");
        });
    }
  } catch (err) {
    console.log("[HISTORY] Error clearing history:", err.message);
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
      console.log("[HISTORY] Migration already completed for user:", userId);
      return;
    }

    // First, check if there's legacy data to migrate
    let localHistory = [];
    const legacyRaw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      try {
        const legacyData = JSON.parse(legacyRaw);
        if (legacyData.length > 0) {
          console.log("[HISTORY] Found", legacyData.length, "entries in legacy storage");
          localHistory = legacyData;

          // Save to user-specific key
          await saveLocalHistory(legacyData, userId);

          // Clear legacy key to prevent future confusion
          await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
          console.log("[HISTORY] Migrated legacy data to user-specific storage");
        }
      } catch (parseErr) {
        console.log("[HISTORY] Failed to parse legacy data:", parseErr.message);
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
      console.log("[HISTORY] Migration upsert error:", error.message);
      // Don't mark as complete so it retries next time
      return;
    }

    try {
      await AsyncStorage.setItem(migrationKey, "true");
      console.log("[HISTORY] Migrated", localHistory.length, "entries to Supabase");
    } catch (storageErr) {
      console.log("[HISTORY] Failed to save migration flag:", storageErr.message);
    }
  } catch (err) {
    console.log("[HISTORY] Migration error:", err.message);
  }
}
