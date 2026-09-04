import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

function fail(message) {
  console.error(`iOS submission refused: ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

const version = JSON.parse(fs.readFileSync("app.json", "utf8")).expo?.version;
const expectedAttestation = `${version}:typed-search-product-open`;
if (process.env.WOOF_OWNER_DEVICE_VERIFIED !== expectedAttestation) {
  fail(
    `owner iPhone verification is missing; after installing the build and confirming typed search → tap, `
    + `set WOOF_OWNER_DEVICE_VERIFIED=${expectedAttestation}`
  );
}

run(process.execPath, ["scripts/check-release-provenance.mjs", "--expected-version", version]);

const rawBuilds = execFileSync("npx", [
  "--yes",
  "eas-cli@latest",
  "build:list",
  "--platform",
  "ios",
  "--status",
  "finished",
  "--limit",
  "1",
  "--json",
  "--non-interactive",
], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const [build] = JSON.parse(rawBuilds);
if (!build) fail("EAS has no finished iOS build");

const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (build.appVersion !== version) {
  fail(`latest EAS build is ${build.appVersion}; committed version is ${version}`);
}
if (build.gitCommitHash !== head) {
  fail(`latest EAS build SHA ${build.gitCommitHash || "missing"} does not match HEAD ${head}`);
}

run("npx", [
  "--yes",
  "eas-cli@latest",
  "submit",
  "--platform",
  "ios",
  "--profile",
  "production",
  "--id",
  build.id,
  "--non-interactive",
]);
