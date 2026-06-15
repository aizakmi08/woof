#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const authSource = fs.readFileSync(path.join(root, "services/auth.js"), "utf8");
const localDataSource = fs.readFileSync(path.join(root, "services/localUserData.js"), "utf8");
const analysisSource = fs.readFileSync(path.join(root, "services/analysisService.js"), "utf8");
const cacheSource = fs.readFileSync(path.join(root, "services/cache.js"), "utf8");
const historySource = fs.readFileSync(path.join(root, "services/history.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`account deletion cleanup guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  localDataSource.includes("export async function clearLocalUserData(userId)") &&
    localDataSource.includes('const SCAN_COUNT_KEY = "@woof_scan_count"') &&
    localDataSource.includes('const HUMAN_FOOD_COUNT_KEY = "@woof_hf_count"') &&
    localDataSource.includes('const HUMAN_FOOD_DATE_KEY = "@woof_hf_count_date"') &&
    localDataSource.includes('const RECENT_SEARCHES_KEY = "@woof_recent_searches"') &&
    localDataSource.includes('const LOCAL_RESULT_KEYS = "@woof_result_keys"') &&
    localDataSource.includes('const LOCAL_RESULT_PREFIX = "@woof_result_"') &&
    localDataSource.includes('const HISTORY_PREFIX = "@woof/scan_history_"') &&
    localDataSource.includes('const LEGACY_HISTORY_KEY = "@woof/scan_history"') &&
    localDataSource.includes('const HISTORY_MIGRATION_PREFIX = "@woof/history_migrated_"') &&
    localDataSource.includes('const OPFF_CACHE_PREFIX = "@woof_opff_"'),
  "local cleanup must explicitly cover quotas, recent searches, local results, history, migration flags, and OPFF lookup cache"
);

assert(
  localDataSource.includes("AsyncStorage.getAllKeys()") &&
    localDataSource.includes("LOCAL_USER_DATA_PREFIXES.some") &&
    localDataSource.includes("AsyncStorage.getItem(LOCAL_RESULT_KEYS)") &&
    localDataSource.includes("AsyncStorage.multiRemove([...keys])") &&
    localDataSource.includes('new Error("Failed to clear local account data. Please try again.")') &&
    localDataSource.includes("throw err;"),
  "local cleanup must enumerate prefixed/generated keys, remove them together, and fail closed on cleanup errors"
);

assert(
  analysisSource.includes("const scheduledCleanups = new Map()") &&
    analysisSource.includes("const localResultMemoryCache = new Map()") &&
    analysisSource.includes("function _clearScheduledCleanup(key)") &&
    analysisSource.includes("scheduledCleanups.set(cleanupKey, timeoutId)") &&
    analysisSource.includes("export function clearAnalysisSessionData()") &&
    analysisSource.includes("entry.controller?.abort?.()") &&
    analysisSource.includes("analyses.clear()") &&
    analysisSource.includes("keyAliases.clear()") &&
    analysisSource.includes("localResultMemoryCache.clear()") &&
    analysisSource.includes("clearTimeout(timeoutId)") &&
    analysisSource.includes("scheduledCleanups.clear()"),
  "analysis session data must be abortable and clear in-memory analyses, local result replay cache, and cleanup timers"
);

assert(
  cacheSource.includes("export function clearWarmAnalysisCache()") &&
	    cacheSource.includes("_warmCache.clear()") &&
	    historySource.includes("export function clearHistoryMemoryCache()") &&
	    historySource.includes("_invalidateMemCache()") &&
	    historySource.includes("currentUserIdCache = { value: null, ts: 0 };") &&
	    historySource.includes("export function clearHistoryMigrationSessionCache()") &&
    historySource.includes("completedHistoryMigrationUsers.clear()"),
  "account deletion must be able to clear in-memory cache and migration-session surfaces"
);

assert(
    authSource.includes('import { clearLocalUserData } from "./localUserData"') &&
    authSource.includes('import { clearWarmAnalysisCache } from "./cache"') &&
    authSource.includes('import { clearAnalysisSessionData } from "./analysisService"') &&
    authSource.includes("clearHistoryMemoryCache, clearHistoryMigrationSessionCache, migrateLocalHistoryToSupabase"),
  "auth delete flow must import local and in-memory cleanup helpers"
);

const deleteStart = authSource.indexOf("const deleteAccount = useCallback(async () =>");
const deleteEnd = authSource.indexOf("return (", deleteStart);
assert(deleteStart !== -1 && deleteEnd !== -1, "deleteAccount block must be present");

const deleteBlock = authSource.slice(deleteStart, deleteEnd);
const cleanupIndex = deleteBlock.indexOf("await clearLocalUserData(deletingUserId);");
const rpcIndex = deleteBlock.indexOf('supabase.rpc("delete_own_account")');

assert(
  deleteBlock.includes("const deletingUserId = user?.id || session?.user?.id || null;") &&
    deleteBlock.includes("clearAnalysisSessionData();") &&
    deleteBlock.includes("clearWarmAnalysisCache();") &&
    deleteBlock.includes("clearHistoryMemoryCache();") &&
    deleteBlock.includes("clearHistoryMigrationSessionCache();") &&
    cleanupIndex !== -1 &&
    rpcIndex !== -1 &&
    cleanupIndex < rpcIndex,
  "deleteAccount must clear disk and memory user data before deleting the server account"
);

assert(
  !deleteBlock.includes("AsyncStorage.multiRemove([SCAN_COUNT_KEY, HUMAN_FOOD_COUNT_KEY, HUMAN_FOOD_DATE_KEY])"),
  "deleteAccount must not regress to quota-only local cleanup"
);

assert(
  packageJson.includes('"test:account-deletion-cleanup": "node scripts/test-account-deletion-cleanup-guards.js"') &&
    packageJson.includes("npm run test:account-deletion-cleanup"),
  "account deletion cleanup guard must be wired into package scripts"
);

console.log("account deletion cleanup guard passed");
