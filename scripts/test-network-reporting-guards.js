#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const cacheSource = fs.readFileSync(path.join(root, "services/cache.js"), "utf8");
const historySource = fs.readFileSync(path.join(root, "services/history.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const incrementCacheHitBody = cacheSource.match(
  /function _incrementCacheHit\(cacheKey\) \{[\s\S]*?\n\}/
)?.[0] || "";

function assert(condition, message) {
  if (!condition) {
    console.error(`network reporting guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  homeSource.includes('import { reportNetworkError, reportNetworkSuccess, useNetwork } from "../services/network"') &&
    /rpc\("search_products"[\s\S]{0,360}if \(error\) \{[\s\S]{0,120}reportNetworkError\(error\)[\s\S]{0,220}reportNetworkSuccess\(\)/.test(homeSource) &&
    /catch \(err\) \{[\s\S]{0,180}reportNetworkError\(searchTimedOut \? new Error\("SEARCH_TIMEOUT"\) : err\)[\s\S]{0,180}setSearchResults/.test(homeSource),
  "Home search Supabase failures and successes must feed the offline detector"
);

assert(
  /History load error[\s\S]{0,120}reportNetworkError\(err\)/.test(homeSource),
  "Home history timeout/failure path must feed the offline detector"
);

assert(
  cacheSource.includes('import { reportNetworkError, reportNetworkSuccess } from "./network"') &&
    /from\("product_data"\)[\s\S]{0,520}reportNetworkError\(error\)[\s\S]{0,120}reportNetworkSuccess\(\)/.test(cacheSource) &&
    /Scored search error[\s\S]{0,80}reportNetworkError\(err\)/.test(cacheSource),
  "product_data cache lookups must report Supabase network failures and successful round trips"
);

assert(
  /from\("analysis_cache"\)[\s\S]{0,420}if \(error \|\| !data\)[\s\S]{0,160}reportNetworkError\(error\)[\s\S]{0,160}reportNetworkSuccess\(\)/.test(cacheSource) &&
    incrementCacheHitBody.includes('rpc("increment_cache_hit", { p_key: cacheKey })') &&
    incrementCacheHitBody.includes("reportNetworkSuccess()") &&
    !incrementCacheHitBody.includes("reportNetworkError"),
  "analysis cache lookup/prewarm paths must feed the offline detector, while cache-hit telemetry failures stay nonessential"
);

assert(
  historySource.includes('import { reportNetworkError, reportNetworkSuccess } from "./network"') &&
    /from\("scan_history"\)[\s\S]{0,420}if \(error\) \{[\s\S]{0,80}reportNetworkError\(error\)[\s\S]{0,160}reportNetworkSuccess\(\)/.test(historySource) &&
    /Supabase read failed[\s\S]{0,120}reportNetworkError\(err\)/.test(historySource),
  "history read fallback must report Supabase network failures and successes"
);

assert(
  /upsertScanHistoryRows\(toSupabaseRow\(newEntry, userId\), \{ onConflict: "id,user_id" \}, request\.signal\)[\s\S]{0,760}reportNetworkError\(error\)[\s\S]{0,180}reportNetworkSuccess\(\)[\s\S]{0,260}catch\(\(err\) => \{[\s\S]{0,220}reportNetworkError\(err\)[\s\S]{0,220}historyRemoteUpsertInflight = Math\.max\(0, historyRemoteUpsertInflight - 1\)/.test(historySource),
  "history upsert fire-and-forget path must bound remote calls and report non-timeout rejected Supabase calls"
);

assert(
  /const \{ error \} = await supabase[\s\S]{0,120}from\("scan_history"\)[\s\S]{0,80}\.delete\(\)[\s\S]{0,80}\.eq\("user_id", userId\)[\s\S]{0,220}reportNetworkError\(error\)[\s\S]{0,140}reportNetworkSuccess\(\)[\s\S]{0,180}catch \(remoteErr\) \{[\s\S]{0,80}reportNetworkError\(remoteErr\)/.test(historySource),
  "history clear awaited path must report Supabase deletion failures and successes"
);

assert(
  packageJson.includes('"test:network-reporting": "node scripts/test-network-reporting-guards.js"') &&
    packageJson.includes("npm run test:network-reporting"),
  "network reporting guard must be wired into package scripts"
);

console.log("network reporting guard passed");
