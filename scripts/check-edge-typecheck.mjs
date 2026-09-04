import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FUNCTIONS_DIR = "supabase/functions";
const LOCKFILE = "deno.lock";

function fail(message) {
  console.error(`Edge Function type check failed: ${message}`);
  process.exit(1);
}

function listFunctionEntrypoints() {
  if (!fs.existsSync(FUNCTIONS_DIR)) {
    fail(`${FUNCTIONS_DIR} is missing`);
  }

  return fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(FUNCTIONS_DIR, entry.name, "index.ts"))
    .filter((entrypoint) => fs.existsSync(entrypoint))
    .sort();
}

function resolveDeno() {
  if (process.env.DENO_BIN) {
    return process.env.DENO_BIN;
  }

  return "deno";
}

const entrypoints = listFunctionEntrypoints();
if (entrypoints.length === 0) {
  fail(`no Edge Function index.ts files found under ${FUNCTIONS_DIR}`);
}

if (!fs.existsSync(LOCKFILE)) {
  fail(`${LOCKFILE} is missing. Run deno check once intentionally, review the generated lockfile, and commit it.`);
}

const denoBin = resolveDeno();
const result = spawnSync(denoBin, ["check", "--lock", LOCKFILE, "--frozen=true", ...entrypoints], {
  stdio: "inherit",
  env: {
    ...process.env,
    DENO_NO_PROMPT: "1",
  },
});

if (result.error) {
  fail(
    `could not start Deno (${result.error.message}). Install Deno or set DENO_BIN=/absolute/path/to/deno before running npm run check:edge-types.`
  );
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log(`Edge Function type check passed for ${entrypoints.length} functions.`);
