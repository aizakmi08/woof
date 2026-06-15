#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const edgeFiles = [
  "supabase/functions/analyze/index.ts",
  "supabase/functions/product-lookup/index.ts",
];

function assert(condition, message) {
  if (!condition) {
    console.error(`edge CORS guard failed: ${message}`);
    process.exit(1);
  }
}

for (const relativePath of edgeFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");

  assert(
    !source.includes('"Access-Control-Allow-Origin": "*"') &&
      !source.includes("'Access-Control-Allow-Origin': '*'"),
    `${relativePath} must not allow arbitrary browser origins`
  );

  assert(
    source.includes("ALLOWED_CORS_ORIGINS") &&
      source.includes("Origin not allowed") &&
      source.includes("Vary\": \"Origin"),
    `${relativePath} must use an explicit CORS allowlist`
  );

  assert(
    source.includes("if (!origin)") &&
      source.includes("return BASE_CORS_HEADERS"),
    `${relativePath} must preserve native app requests without an Origin header`
  );

  assert(
    source.includes("ENVIRONMENT") &&
      source.includes("localhost|127\\.0\\.0\\.1"),
    `${relativePath} must keep localhost-only development CORS support out of production`
  );
}

console.log("edge CORS guard passed");
