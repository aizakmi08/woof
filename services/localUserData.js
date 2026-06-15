import AsyncStorage from "@react-native-async-storage/async-storage";

const SCAN_COUNT_KEY = "@woof_scan_count";
const HUMAN_FOOD_COUNT_KEY = "@woof_hf_count";
const HUMAN_FOOD_DATE_KEY = "@woof_hf_count_date";
const RECENT_SEARCHES_KEY = "@woof_recent_searches";
const LOCAL_RESULT_KEYS = "@woof_result_keys";
const LOCAL_RESULT_PREFIX = "@woof_result_";
const HISTORY_PREFIX = "@woof/scan_history_";
const LEGACY_HISTORY_KEY = "@woof/scan_history";
const HISTORY_MIGRATION_PREFIX = "@woof/history_migrated_";
const OPFF_CACHE_PREFIX = "@woof_opff_";

const LOCAL_USER_DATA_PREFIXES = [
  HISTORY_PREFIX,
  HISTORY_MIGRATION_PREFIX,
  LOCAL_RESULT_PREFIX,
  OPFF_CACHE_PREFIX,
];

function _userScopedKeys(userId) {
  if (!userId) return [];
  return [
    `${HISTORY_PREFIX}${userId}`,
    `${HISTORY_MIGRATION_PREFIX}${userId}`,
  ];
}

/**
 * Removes local data derived from scans, searches, quota mirrors, and product
 * lookups. Device preferences such as theme, onboarding, and legal consent are
 * intentionally left alone because they are not account-associated scan data.
 */
export async function clearLocalUserData(userId) {
  const failures = [];
  let enumeratedStoredKeys = false;
  const keys = new Set([
    SCAN_COUNT_KEY,
    HUMAN_FOOD_COUNT_KEY,
    HUMAN_FOOD_DATE_KEY,
    RECENT_SEARCHES_KEY,
    LOCAL_RESULT_KEYS,
    LEGACY_HISTORY_KEY,
    ..._userScopedKeys(userId),
  ]);

  try {
    const storedKeys = await AsyncStorage.getAllKeys();
    enumeratedStoredKeys = true;
    for (const key of storedKeys) {
      if (LOCAL_USER_DATA_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.add(key);
      }
    }
  } catch (err) {
    failures.push(err);
    console.log("[LOCAL DATA] Failed to enumerate local user data keys:", err.message);
  }

  try {
    const indexedResults = await AsyncStorage.getItem(LOCAL_RESULT_KEYS);
    const resultKeys = JSON.parse(indexedResults || "[]");
    if (Array.isArray(resultKeys)) {
      for (const key of resultKeys) {
        if (typeof key === "string" && key) {
          keys.add(`${LOCAL_RESULT_PREFIX}${key}`);
        }
      }
    }
  } catch (err) {
    if (!enumeratedStoredKeys) failures.push(err);
    console.log("[LOCAL DATA] Failed to read local result index:", err.message);
  }

  if (keys.size > 0) {
    try {
      await AsyncStorage.multiRemove([...keys]);
    } catch (err) {
      failures.push(err);
      console.log("[LOCAL DATA] Failed to remove local user data:", err.message);
    }
  }

  if (failures.length > 0) {
    const err = new Error("Failed to clear local account data. Please try again.");
    err.cause = failures[0];
    throw err;
  }

  return [...keys];
}
