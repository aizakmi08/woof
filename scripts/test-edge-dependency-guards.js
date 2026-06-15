#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const edgeFiles = [
  "supabase/functions/analyze/index.ts",
  "supabase/functions/product-lookup/index.ts",
  "supabase/functions/revenuecat-webhook/index.ts",
];
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const denoLock = fs.readFileSync(path.join(root, "deno.lock"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`edge dependency guard failed: ${message}`);
    process.exit(1);
  }
}

const pinnedSupabaseImport = "https://esm.sh/@supabase/supabase-js@2.108.0";

for (const relativePath of edgeFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");

  assert(
    source.includes(`from "${pinnedSupabaseImport}"`),
    `${relativePath} must import the exact pinned Supabase Edge client`
  );

  assert(
    !/esm\.sh\/@supabase\/supabase-js@2(["'?]|$)/.test(source),
    `${relativePath} must not use a floating Supabase major import`
  );
}

assert(
  denoLock.includes(`"${pinnedSupabaseImport}"`),
  "deno.lock must pin the exact Supabase Edge client URL"
);

assert(
  !denoLock.includes('"https://esm.sh/@supabase/supabase-js@2"'),
  "deno.lock must not retain a floating Supabase major redirect"
);

assert(
  packageJson.includes(
    '"check:edge": "npx -y deno-bin check supabase/functions/analyze/index.ts supabase/functions/product-lookup/index.ts supabase/functions/revenuecat-webhook/index.ts"'
  ),
  "Edge functions must be covered by the Deno type-check gate"
);

assert(
  packageJson.includes('"test:edge-dependencies": "node scripts/test-edge-dependency-guards.js"') &&
    packageJson.includes("npm run test:edge-dependencies"),
  "edge dependency guard must be wired into package scripts"
);

console.log("edge dependency guard passed");
