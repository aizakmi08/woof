#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const resultsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/index.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`share filesystem guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  resultsSource.includes('import { File, Paths } from "expo-file-system"'),
  "Results share flow must import SDK 55 File/Paths API"
);

assert(
  !resultsSource.includes('import * as FileSystem from "expo-file-system"') &&
    !resultsSource.includes("FileSystem.cacheDirectory") &&
    !resultsSource.includes("FileSystem.copyAsync") &&
    !resultsSource.includes("FileSystem.deleteAsync"),
  "Results share flow must not use legacy FileSystem APIs that throw from the main SDK 55 export"
);

assert(
  /tmpFile = new File\(tmpUri\);[\s\S]{0,120}cleanFile = new File\(Paths\.cache, `\$\{desiredName\}\.png`\);[\s\S]{0,120}tmpFile\.copy\(cleanFile\);[\s\S]{0,80}const cleanUri = cleanFile\.uri;/.test(resultsSource),
  "captured share card image must be copied into cache through File.copy"
);

assert(
  /finally \{[\s\S]{0,80}for \(const file of \[tmpFile, cleanFile\]\)[\s\S]{0,120}if \(file\?\.exists\) file\.delete\(\);/.test(resultsSource),
  "share flow must clean up temp/cache image files with File.delete"
);

assert(
  resultsSource.includes('Alert.alert("Shared as Text"') &&
    resultsSource.includes("we shared the result as text instead"),
  "image-share fallback must be visible to users instead of silently downgrading"
);

assert(
  packageJson.includes('"test:share-filesystem": "node scripts/test-share-filesystem-guards.js"') &&
    packageJson.includes("npm run test:share-filesystem"),
  "share filesystem guard must be wired into package scripts"
);

console.log("share filesystem guard passed");
