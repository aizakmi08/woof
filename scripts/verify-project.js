const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.cwd();

const requiredFiles = [
  "App.js",
  "app.config.js",
  "config/env.js",
  "services/analysisService.js",
  "services/claude.js",
  "services/opff.js",
  "services/supabase.js",
  "supabase/functions/analyze/index.ts",
  "supabase/migrations/001_auth_and_history.sql",
  "docs/privacy.html",
  "docs/support.html",
  "README.md",
];

const requiredDirs = [
  "screens",
  "services",
  "supabase/functions/analyze",
  "supabase/migrations",
  "docs",
];

const missing = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    missing.push(file);
  }
}

for (const dir of requiredDirs) {
  const stat = fs.existsSync(path.join(root, dir)) && fs.statSync(path.join(root, dir));
  if (!stat || !stat.isDirectory()) {
    missing.push(`${dir}/`);
  }
}

const migrations = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"));

if (migrations.length < 6) {
  missing.push("at least 6 Supabase migration files");
}

function isTracked(file) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", file], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

for (const forbidden of [".env", ".env.local"]) {
  if (isTracked(forbidden)) {
    missing.push(`${forbidden} should not be committed`);
  }
}

if (missing.length > 0) {
  console.error("Woof project verification failed:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(`Woof project verification passed with ${migrations.length} migrations.`);
