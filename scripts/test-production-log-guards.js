#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "App.js"), "utf8");
const logSource = fs.readFileSync(path.join(root, "services/productionLogs.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`production log guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  appSource.trimStart().startsWith('import "./services/productionLogs";'),
  "production log filter must be the first App import so it runs before noisy modules"
);

assert(
  logSource.includes('typeof __DEV__ !== "undefined"') &&
    logSource.includes('process.env.NODE_ENV !== "production"'),
  "production log filter must distinguish development from release builds"
);

assert(
  logSource.includes("!isDev") &&
    logSource.includes("__WOOF_PRODUCTION_LOG_FILTER_INSTALLED__"),
  "production log filter must only install once and only outside development"
);

for (const method of ["log", "info", "debug"]) {
  assert(
    logSource.includes(`console.${method} = () => {};`),
    `production log filter must suppress console.${method}`
  );
}

assert(
  !logSource.includes("console.warn =") &&
    !logSource.includes("console.error ="),
  "production log filter must preserve warn/error diagnostics"
);

console.log("production log guard passed");
