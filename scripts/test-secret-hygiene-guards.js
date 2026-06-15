#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const scriptsDir = path.join(root, "scripts");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

const forbidden = [
  { label: "OpenAI-style secret", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { label: "JWT-looking token", pattern: /eyJ[A-Za-z0-9_-]{20,}/ },
  { label: "project Supabase URL", pattern: /https:\/\/[a-z0-9-]+\.supabase\.co/i },
  { label: "ScrapingBee fallback key", pattern: /process\.env\.SBKEY\s*\|\|\s*["'][^"']+["']/ },
  { label: "OpenAI fallback key", pattern: /process\.env\.(OKEY|OPENAI_KEY)\s*\|\|\s*["']sk-/ },
];

function assert(condition, message) {
  if (!condition) {
    console.error(`secret hygiene guard failed: ${message}`);
    process.exit(1);
  }
}

function listFiles(dir) {
  const files = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      files.push(...listFiles(full));
    } else if (/\.(js|ts|mjs|cjs|sh|md|json)$/.test(name)) {
      files.push(full);
    }
  }
  return files;
}

const hits = [];
for (const file of listFiles(scriptsDir)) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8");
  for (const { label, pattern } of forbidden) {
    if (pattern.test(text)) hits.push(`${rel}: ${label}`);
  }
}

assert(hits.length === 0, `forbidden secret patterns found:\n${hits.join("\n")}`);

assert(
  packageJson.includes('"test:secret-hygiene": "node scripts/test-secret-hygiene-guards.js"') &&
    packageJson.includes("npm run test:secret-hygiene"),
  "secret hygiene guard must be wired into package scripts"
);

console.log("secret hygiene guard passed");
