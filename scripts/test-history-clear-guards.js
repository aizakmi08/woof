#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const historySource = fs.readFileSync(path.join(root, "services/history.js"), "utf8");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`history clear guard failed: ${message}`);
    process.exit(1);
  }
}

const clearStart = historySource.indexOf("export async function clearHistory");
const migrateStart = historySource.indexOf("export async function migrateLocalHistoryToSupabase");
assert(clearStart !== -1 && migrateStart !== -1, "clearHistory must be present");

const clearBlock = historySource.slice(clearStart, migrateStart);

assert(
  clearBlock.includes("const failures = []") &&
    clearBlock.includes("failures.push(localErr)") &&
    clearBlock.includes("failures.push(error)") &&
    clearBlock.includes("failures.push(remoteErr)"),
  "clearHistory must collect local and remote deletion failures"
);

assert(
  /const \{ error \} = await supabase[\s\S]{0,120}\.from\("scan_history"\)[\s\S]{0,80}\.delete\(\)[\s\S]{0,80}\.eq\("user_id", userId\)/.test(clearBlock),
  "signed-in clearHistory must await the Supabase history delete"
);

assert(
  clearBlock.includes("if (failures.length > 0)") &&
    clearBlock.includes('new Error("Failed to clear all scan history. Please try again.")') &&
    clearBlock.includes("throw err;"),
  "clearHistory must reject when any store fails so UI cannot claim full deletion"
);

const handlerStart = homeSource.indexOf("const handleClearHistory = () =>");
const handlerEnd = homeSource.indexOf("return (", handlerStart);
assert(handlerStart !== -1 && handlerEnd !== -1, "Home clear-history handler must be present");

const handlerBlock = homeSource.slice(handlerStart, handlerEnd);
assert(
  handlerBlock.includes("onPress: async () =>") &&
    handlerBlock.includes("await clearHistory();") &&
    handlerBlock.includes("setHistory([]);") &&
    handlerBlock.includes('Alert.alert("Could Not Clear History"') &&
    handlerBlock.includes("loadHistory();"),
  "Home must await clearHistory, clear UI only on success, and reload/show error on failure"
);

assert(
  !handlerBlock.includes("clearHistory().then(() => setHistory([]))"),
  "Home must not clear visible history through a fire-and-forget clearHistory promise"
);

console.log("history clear guard passed");
