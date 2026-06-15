#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const supabaseSource = fs.readFileSync(
  path.join(root, "services/supabase.js"),
  "utf8"
);
const appJson = fs.readFileSync(path.join(root, "app.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`auth storage guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  supabaseSource.includes('import * as SecureStore from "expo-secure-store"') &&
    supabaseSource.includes("const nativeSecureAuthStorage"),
  "Supabase auth must use a native SecureStore storage adapter"
);

assert(
  /createClient\([\s\S]*auth:\s*\{[\s\S]*storage:\s*nativeSecureAuthStorage/.test(supabaseSource),
  "Supabase createClient must not receive AsyncStorage directly for auth persistence"
);

assert(
  !/storage:\s*AsyncStorage/.test(supabaseSource),
  "Supabase auth storage must not be direct AsyncStorage"
);

assert(
  supabaseSource.includes('Platform.OS === "web"') &&
    supabaseSource.includes("return AsyncStorage.getItem(key)") &&
    supabaseSource.includes("return AsyncStorage.setItem(key, value)"),
  "AsyncStorage must be limited to web fallback behavior"
);

assert(
  supabaseSource.includes("const legacyValue = await AsyncStorage.getItem(key)") &&
    supabaseSource.includes("await SecureStore.setItemAsync(key, legacyValue)") &&
    supabaseSource.includes("await AsyncStorage.removeItem(key).catch"),
  "native auth storage must migrate existing AsyncStorage sessions into SecureStore"
);

assert(
  supabaseSource.includes("Secure auth storage write failed") &&
    !/catch \(err\)[\s\S]{0,180}AsyncStorage\.setItem\(key, value\)/.test(supabaseSource),
  "native SecureStore write failures must not fall back to insecure AsyncStorage persistence"
);

assert(
  appJson.includes('"expo-secure-store"'),
  "Expo config must include the expo-secure-store plugin"
);

console.log("auth storage guard passed");
