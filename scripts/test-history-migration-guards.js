#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const authSource = fs.readFileSync(path.join(root, "services/auth.js"), "utf8");
const historySource = fs.readFileSync(path.join(root, "services/history.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`history migration guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  authSource.includes("const historyMigrations = new Map()") &&
    authSource.includes("const retryGuestHistoryMigration = (userId) =>") &&
    authSource.includes("historyMigrations.has(userId)") &&
    authSource.includes("historyMigrations.delete(userId)") &&
    authSource.includes('if (event === "SIGNED_IN" || event === "SIGNED_OUT")') &&
    authSource.includes("clearHistoryMemoryCache();") &&
    authSource.includes("clearHistoryMigrationSessionCache"),
  "auth must deduplicate concurrent guest-history migrations per user and clear history/user-id memory plus migration skips on account boundary changes"
);

assert(
  /supabase\.auth\.getSession\(\)[\s\S]*?if \(s\?\.user\) \{[\s\S]{0,120}retryGuestHistoryMigration\(s\.user\.id\);/.test(authSource),
  "restored getSession users must retry guest-history migration"
);

assert(
  /\(event === "INITIAL_SESSION" \|\| event === "SIGNED_IN"\) && s\?\.user[\s\S]{0,120}retryGuestHistoryMigration\(s\.user\.id\);/.test(authSource),
  "INITIAL_SESSION and SIGNED_IN events must retry guest-history migration"
);

const signedInBlock = authSource.slice(
  authSource.indexOf('if (event === "SIGNED_IN" && s?.user)'),
  authSource.indexOf('if (event === "SIGNED_OUT")')
);
assert(
  !signedInBlock.includes("migrateLocalHistoryToSupabase"),
  "SIGNED_IN should use the shared retry helper rather than a one-off migration call"
);

const signedOutBlock = authSource.slice(
  authSource.indexOf('if (event === "SIGNED_OUT")'),
  authSource.indexOf("await logOutPurchases();", authSource.indexOf('if (event === "SIGNED_OUT")')) + "await logOutPurchases();".length
);
assert(
  signedOutBlock.includes("clearHistoryMigrationSessionCache();"),
  "sign-out must clear completed migration session skips so later guest scans can migrate on the next sign-in"
);

assert(
  historySource.includes("// Don't mark as complete so it retries next time"),
  "history migration must remain retryable after upsert failure"
);

assert(
  historySource.includes("const completedHistoryMigrationUsers = new Set()") &&
    historySource.includes("export function clearHistoryMigrationSessionCache()") &&
    historySource.includes("completedHistoryMigrationUsers.clear()"),
  "history migration must expose a session cache clear hook for sign-out and account deletion"
);

const migrationStart = historySource.indexOf("export async function migrateLocalHistoryToSupabase(userId)");
assert(migrationStart !== -1, "history must export migrateLocalHistoryToSupabase");

const migrationSource = historySource.slice(migrationStart);
const legacyReadIndex = migrationSource.indexOf("AsyncStorage.getItem(LEGACY_STORAGE_KEY)");
const alreadyMigratedReturnIndex = migrationSource.indexOf("if (alreadyMigrated && legacyHistory.length === 0)");
const upsertIndex = migrationSource.indexOf("upsertScanHistoryRows(rows, { onConflict: \"id,user_id\" })");
const legacyRemoveIndex = migrationSource.indexOf("AsyncStorage.removeItem(LEGACY_STORAGE_KEY)");

assert(
  historySource.includes("const alreadyMigrated = (await AsyncStorage.getItem(migrationKey)) === \"true\";"),
  "history migration should parse the per-user migration flag as a boolean"
);

assert(
  migrationSource.includes("if (!userId || completedHistoryMigrationUsers.has(userId)) return;") &&
    migrationSource.includes("completedHistoryMigrationUsers.add(userId);"),
  "history migration must skip repeated completed checks in the same signed-in session"
);

assert(
  legacyReadIndex !== -1 &&
    alreadyMigratedReturnIndex !== -1 &&
    legacyReadIndex < alreadyMigratedReturnIndex,
  "migration must check anonymous guest history before returning for an already-migrated user"
);

assert(
  migrationSource.includes("alreadyMigrated && legacyHistory.length === 0"),
  "already-migrated users may only skip migration when no guest history exists"
);

assert(
  /if \(alreadyMigrated && legacyHistory\.length === 0\) \{[\s\S]{0,180}completedHistoryMigrationUsers\.add\(userId\);[\s\S]{0,80}return;/.test(migrationSource),
  "already-migrated users should be added to the session migration skip only after confirming no guest history exists"
);

assert(
  migrationSource.includes("const userHistory = await getLocalHistory(userId);") &&
    migrationSource.includes("[...legacyHistory, ...userHistory]") &&
    migrationSource.includes("new Map([...legacyHistory, ...userHistory]"),
  "guest history migration must merge and dedupe legacy entries into user-specific local history"
);

assert(
  upsertIndex !== -1 && legacyRemoveIndex !== -1 && upsertIndex < legacyRemoveIndex,
  "legacy guest history must be removed only after a successful Supabase upsert path"
);

const upsertFailureBlock = migrationSource.slice(
  migrationSource.indexOf("if (error) {"),
  migrationSource.indexOf("reportNetworkSuccess();")
);
assert(
  upsertFailureBlock.includes("return;") &&
    !upsertFailureBlock.includes("AsyncStorage.setItem(migrationKey, \"true\")") &&
    !upsertFailureBlock.includes("AsyncStorage.removeItem(LEGACY_STORAGE_KEY)") &&
    !upsertFailureBlock.includes("completedHistoryMigrationUsers.add(userId)"),
  "upsert failures must not mark migration complete, cache completion, or clear retryable guest history"
);

console.log("history migration guard passed");
