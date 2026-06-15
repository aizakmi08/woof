#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const requiredBase = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "GOOGLE_WEB_CLIENT_ID",
];

const envAliases = {
  REVENUECAT_API_KEY_IOS: ["REVENUECAT_API_KEY_IOS", "EXPO_PUBLIC_REVENUECAT_API_KEY_IOS"],
  REVENUECAT_API_KEY_ANDROID: ["REVENUECAT_API_KEY_ANDROID", "EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID"],
  REVENUECAT_TEST_STORE_API_KEY: ["REVENUECAT_TEST_STORE_API_KEY", "EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY"],
};

function env(name) {
  const names = envAliases[name] || [name];
  for (const candidate of names) {
    const value = process.env[candidate];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isProductionBuild() {
  return (
    env("EAS_BUILD") === "1" ||
    env("EAS_BUILD_PROFILE") === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function requiredRevenueCatEnv() {
  const platform = env("EAS_BUILD_PLATFORM").toLowerCase();
  if (platform === "ios") return ["REVENUECAT_API_KEY_IOS"];
  if (platform === "android") return ["REVENUECAT_API_KEY_ANDROID"];
  return ["REVENUECAT_API_KEY_IOS", "REVENUECAT_API_KEY_ANDROID"];
}

const missing = [
  ...requiredBase,
  ...(isProductionBuild() ? requiredRevenueCatEnv() : ["REVENUECAT_API_KEY_IOS"]),
].filter((name) => !env(name));
const invalid = [];

if (
  env("SUPABASE_URL") &&
  !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(env("SUPABASE_URL"))
) {
  invalid.push("SUPABASE_URL must be a https://*.supabase.co URL");
}

if (
  env("REVENUECAT_API_KEY_IOS") &&
  !env("REVENUECAT_API_KEY_IOS").startsWith("appl_")
) {
  invalid.push("REVENUECAT_API_KEY_IOS must start with appl_");
}

if (
  env("REVENUECAT_API_KEY_ANDROID") &&
  !env("REVENUECAT_API_KEY_ANDROID").startsWith("goog_")
) {
  invalid.push("REVENUECAT_API_KEY_ANDROID must start with goog_");
}

if (
  env("REVENUECAT_TEST_STORE_API_KEY") &&
  !env("REVENUECAT_TEST_STORE_API_KEY").startsWith("test_")
) {
  invalid.push("REVENUECAT_TEST_STORE_API_KEY must start with test_");
}

if (isProductionBuild() && env("REVENUECAT_TEST_STORE_API_KEY")) {
  invalid.push("REVENUECAT_TEST_STORE_API_KEY must not be set for production builds");
}

if (missing.length > 0 || invalid.length > 0) {
  console.error("Config validation failed.");
  if (missing.length > 0) console.error(`Missing: ${missing.join(", ")}`);
  for (const message of invalid) console.error(message);
  process.exit(1);
}

console.log("Config validation passed.");
