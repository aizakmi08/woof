#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const migrationPath = path.join(
  root,
  "supabase/migrations/024_fix_cleanup_expired_cache.sql"
);
const migration = fs.readFileSync(migrationPath, "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`cache cleanup guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  /CREATE OR REPLACE FUNCTION public\.cleanup_expired_cache\(\)/.test(migration),
  "latest migration must replace public.cleanup_expired_cache"
);

assert(
  /SECURITY DEFINER[\s\S]{0,80}SET search_path = public/.test(migration),
  "cleanup function must pin search_path under SECURITY DEFINER"
);

assert(
  /DELETE FROM public\.analysis_cache[\s\S]{0,80}WHERE expires_at < NOW\(\);[\s\S]{0,100}GET DIAGNOSTICS deleted_count = ROW_COUNT;/.test(
    migration
  ),
  "cleanup must delete all expired rows and read ROW_COUNT"
);

assert(
  !/DELETE FROM public?\.?analysis_cache[\s\S]{0,120}RETURNING\s+1\s+INTO\s+deleted_count/i.test(
    migration
  ),
  "cleanup must not use scalar DELETE RETURNING"
);

assert(
  /REVOKE ALL ON FUNCTION public\.cleanup_expired_cache\(\)[\s\S]{0,80}FROM PUBLIC, anon, authenticated;/.test(
    migration
  ) &&
    /GRANT EXECUTE ON FUNCTION public\.cleanup_expired_cache\(\)[\s\S]{0,80}TO service_role;/.test(
      migration
    ),
  "cleanup function must remain service-role only"
);

assert(
  packageJson.includes('"test:cache-cleanup": "node scripts/test-cache-cleanup-guards.js"') &&
    packageJson.includes("npm run test:cache-cleanup"),
  "cache cleanup guard must be wired into package scripts"
);

console.log("cache cleanup guard passed");
