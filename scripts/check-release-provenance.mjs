import { execFileSync } from "node:child_process";
import fs from "node:fs";

function fail(message) {
  console.error(`Release provenance check failed: ${message}`);
  process.exit(1);
}

function git(args, options = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    fail(error.stderr?.trim() || `git ${args.join(" ")} failed`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const metadataOnly = process.argv.includes("--metadata-only");
const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const appJson = readJson("app.json");
const storeConfig = readJson("store.config.json");
const version = appJson.expo?.version;
const expectedVersion = optionValue("--expected-version");

if (!version) fail("app.json does not declare expo.version");
for (const [source, candidate] of [
  ["package.json", packageJson.version],
  ["package-lock.json", packageLock.version],
  ["package-lock.json root package", packageLock.packages?.[""]?.version],
  ["store.config.json", storeConfig.apple?.version],
]) {
  if (candidate !== version) fail(`${source} declares ${candidate || "no version"}; expected ${version}`);
}
if (expectedVersion && expectedVersion !== version) {
  fail(`requested/submitted version ${expectedVersion} does not match committed version ${version}`);
}

const committedVersion = JSON.parse(git(["show", "HEAD:app.json"])).expo?.version;
if (committedVersion !== version) {
  fail(`working app.json version ${version} is not committed at HEAD (${committedVersion || "missing"})`);
}

const status = git(["status", "--porcelain", "--untracked-files=all"]);
if (status) fail("working tree is dirty");

if (!metadataOnly) {
  const head = git(["rev-parse", "HEAD"]);
  const tag = `v${version}`;
  const localTagTarget = git(["rev-list", "-n", "1", tag]);
  if (localTagTarget !== head) fail(`${tag} does not point to HEAD ${head}`);

  const remoteTags = git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
  const remoteTargets = remoteTags
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0]);
  if (!remoteTargets.includes(head)) {
    fail(`${tag} is not pushed to origin at HEAD ${head}`);
  }
}

console.log(`Release provenance check passed for v${version}${metadataOnly ? " (metadata only)" : ""}.`);
