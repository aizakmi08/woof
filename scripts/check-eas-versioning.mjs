import fs from "node:fs";

const failures = [];

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function fail(message) {
  failures.push(message);
}

function requireSnippet(source, snippet, context) {
  if (!source.includes(snippet)) {
    fail(`${context}: missing ${snippet}`);
  }
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const appJson = readJson("app.json");
const easJson = readJson("eas.json");
const plan = readText("EAS_RELEASE_VERSIONING.md");
const checklist = readText("DEPLOYMENT_CHECKLIST.md");
const appStoreAudit = readText("APP_STORE_CONNECT_AUDIT.md");
const projectContext = readText("PROJECT_CONTEXT.md");

const rootLockVersion = packageLock.packages?.[""]?.version;
const expoVersion = appJson.expo?.version;

if (packageJson.version !== "1.2.1") {
  fail(`package.json version should stay on the audited 1.2.1 release line, got ${packageJson.version}`);
}

if (rootLockVersion !== packageJson.version) {
  fail(`package-lock root version ${rootLockVersion || "missing"} does not match package.json ${packageJson.version}`);
}

if (expoVersion !== packageJson.version) {
  fail(`app.json expo.version ${expoVersion || "missing"} does not match package.json ${packageJson.version}`);
}

if (easJson.cli?.appVersionSource !== "remote") {
  fail('eas.json must keep cli.appVersionSource as "remote" until the release versioning process is re-audited');
}

if (easJson.build?.production?.autoIncrement !== true) {
  fail("eas.json production builds must keep autoIncrement enabled");
}

if (easJson.submit?.production?.ios?.ascAppId !== "6760733899") {
  fail("EAS iOS submit ascAppId must match Woof's App Store id 6760733899");
}

if (appJson.expo?.extra?.eas?.projectId !== "ea14f3ad-9dbe-4341-bfba-51eb5c6ead8f") {
  fail("app.json must keep the Woof EAS project id");
}

for (const [source, context, snippets] of [
  [
    plan,
    "EAS_RELEASE_VERSIONING.md",
    [
      "npx eas-cli@latest build:version:get",
      "npx eas-cli@latest build:version:get -p ios",
      "npx eas-cli@latest build:version:set -p ios --build-number 42",
      "build `31`",
      "build version `1.1.1`",
      "Remote EAS app version must match",
      "greater than App Store Connect/TestFlight build `41`",
      "Save the command output",
    ],
  ],
  [
    checklist,
    "DEPLOYMENT_CHECKLIST.md",
    [
      "EAS_RELEASE_VERSIONING.md",
      "npx eas-cli@latest build:version:get -p ios",
      "build number greater than `41`",
    ],
  ],
  [
    appStoreAudit,
    "APP_STORE_CONNECT_AUDIT.md",
    [
      "build `31`",
      "build version `1.1.1`",
      "EAS/App Store remote versioning",
    ],
  ],
  [
    projectContext,
    "PROJECT_CONTEXT.md",
    [
      "EAS_RELEASE_VERSIONING.md",
      "run `npm run check:eas-versioning`",
      "npx eas-cli@latest build:version:get -p ios",
    ],
  ],
]) {
  for (const snippet of snippets) {
    requireSnippet(source, snippet, context);
  }
}

if (failures.length > 0) {
  console.error("EAS versioning check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("EAS versioning check passed: local metadata, remote-versioning config, and pre-submission evidence plan are aligned.");
