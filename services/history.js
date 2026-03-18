import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const STORAGE_KEY = "@woof/scan_history";
const MIGRATION_PREFIX = "@woof/history_migrated_";
const MAX_ENTRIES = 50;

// --- Helpers ---

async function getCurrentUserId() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function getLocalHistory() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.log("[HISTORY] Error reading local history:", err.message);
    return [];
  }
}

async function saveLocalHistory(entries) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
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
        return data.map(fromSupabaseRow);
      }
    } catch (err) {
      console.log("[HISTORY] Supabase read failed, falling back to local:", err.message);
    }
  }

  return getLocalHistory();
}

/**
 * Add a new scan history entry.
 * Always writes to AsyncStorage. If authenticated, also upserts to Supabase.
 */
export async function addHistoryEntry(entry) {
  try {
    const localHistory = await getLocalHistory();
    const newEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ...entry,
    };
    const updated = [newEntry, ...localHistory].slice(0, MAX_ENTRIES);
    await saveLocalHistory(updated);
    console.log("[HISTORY] Saved entry locally:", newEntry.productName);

    // Fire-and-forget Supabase upsert
    const userId = await getCurrentUserId();
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
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log("[HISTORY] Cleared local history");

    const userId = await getCurrentUserId();
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

    const localHistory = await getLocalHistory();
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
      return;
    }

    await AsyncStorage.setItem(migrationKey, "true");
    console.log("[HISTORY] Migrated", localHistory.length, "entries to Supabase");
  } catch (err) {
    console.log("[HISTORY] Migration error:", err.message);
  }
}
