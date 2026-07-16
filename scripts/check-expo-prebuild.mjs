import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REQUIRED_PUBLIC_EAS_ENV = {
  SUPABASE_URL: "https://ci-placeholder.supabase.co",
  SUPABASE_ANON_KEY: "ci-supabase-anon-placeholder",
  REVENUECAT_API_KEY_IOS: "ci-revenuecat-ios-placeholder",
  REVENUECAT_API_KEY_ANDROID: "ci-revenuecat-android-placeholder",
  SENTRY_DSN: "https://public@sentry.example/1",
};

const REQUIRED_PRIVATE_EAS_ENV = {
  SENTRY_ORG: "ci-sentry-org",
  SENTRY_PROJECT: "ci-sentry-project",
  SENTRY_AUTH_TOKEN: "ci-sentry-auth-token",
};

const skipEntries = new Set([
  ".expo",
  ".git",
  "android",
  "ios",
  "node_modules",
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function expoBinaryPath() {
  const basePath = path.join("node_modules", ".bin", process.platform === "win32" ? "expo.cmd" : "expo");
  assert(
    fs.existsSync(basePath),
    "Expo CLI binary is missing. Run npm ci before npm run check:prebuild."
  );
  return path.resolve(basePath);
}

function copyProject(sourceDir, targetDir, isRoot = false) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (isRoot && skipEntries.has(entry.name)) continue;

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyProject(sourcePath, targetPath);
    } else if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(sourcePath), targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

const sourceDir = process.cwd();
const prebuildDir = fs.mkdtempSync(path.join(os.tmpdir(), "woof-prebuild-smoke-"));
const nodeModulesPath = path.join(sourceDir, "node_modules");

assert(fs.existsSync(nodeModulesPath), "node_modules is missing. Run npm ci before npm run check:prebuild.");

copyProject(sourceDir, prebuildDir, true);
fs.symlinkSync(nodeModulesPath, path.join(prebuildDir, "node_modules"), "dir");

const nodeBinDir = path.dirname(process.execPath);
const result = spawnSync(
  expoBinaryPath(),
  [
    "prebuild",
    prebuildDir,
    "--platform",
    "all",
    "--no-install",
  ],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      ...REQUIRED_PUBLIC_EAS_ENV,
      ...REQUIRED_PRIVATE_EAS_ENV,
      GOOGLE_WEB_CLIENT_ID: "ci-google-client-placeholder",
      WOOF_SHARE_URL: "https://apps.apple.com/app/id6760733899",
      EAS_BUILD: "true",
      EAS_BUILD_PROFILE: "preview",
      PATH: `${nodeBinDir}${path.delimiter}${process.env.PATH || ""}`,
    },
  }
);

const output = `${result.stdout || ""}\n${result.stderr || ""}`;
if (output.trim()) {
  console.log(output.trim());
}

if (result.error) {
  throw new Error(`Expo prebuild failed to start: ${result.error.message}`);
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}

assert(
  !output.includes("Install expo-system-ui"),
  "Expo prebuild still warns that expo-system-ui is missing"
);
assert(
  fs.existsSync(path.join(prebuildDir, "ios", "Podfile")),
  "Expo prebuild did not generate ios/Podfile"
);
assert(
  fs.existsSync(path.join(prebuildDir, "ios", "woof.xcodeproj", "project.pbxproj")),
  "Expo prebuild did not generate the iOS Xcode project"
);
const generatedPbxProject = fs.readFileSync(
  path.join(prebuildDir, "ios", "woof.xcodeproj", "project.pbxproj"),
  "utf8"
);
const generatedNormalScheme = fs.readFileSync(
  path.join(prebuildDir, "ios", "woof.xcodeproj", "xcshareddata", "xcschemes", "woof.xcscheme"),
  "utf8"
);
const generatedStoreKitScheme = fs.readFileSync(
  path.join(prebuildDir, "ios", "woof.xcodeproj", "xcshareddata", "xcschemes", "woof StoreKit.xcscheme"),
  "utf8"
);
const generatedStoreKitConfig = JSON.parse(fs.readFileSync(
  path.join(prebuildDir, "ios", "woof", "Woof.storekit"),
  "utf8"
));
assert(
  fs.existsSync(path.join(prebuildDir, "ios", "woof", "Woof.storekit")),
  "Expo prebuild did not copy the local StoreKit catalog"
);
assert(
  generatedStoreKitConfig.settings?._timeRate === 0,
  "Expo prebuild StoreKit catalog must keep the subscription renewal rate at Real Time"
);
assert(
  fs.existsSync(path.join(prebuildDir, "ios", "woofTests", "WoofConfigurationTests.swift")),
  "Expo prebuild did not copy the native StoreKit catalog test"
);
assert(
  generatedPbxProject.includes("woofTests.xctest")
    && generatedPbxProject.includes("WoofConfigurationTests.swift in Sources")
    && generatedPbxProject.includes("Woof.storekit in Resources"),
  "Expo prebuild did not create the native StoreKit test target"
);
assert(
  !generatedNormalScheme.includes("StoreKitConfigurationFileReference")
    && generatedNormalScheme.includes("woofTests.xctest"),
  "Normal iOS scheme must run native tests without local StoreKit data"
);
assert(
  generatedStoreKitScheme.includes("StoreKitConfigurationFileReference")
    && generatedStoreKitScheme.includes('identifier = "../woof/Woof.storekit"')
    && generatedStoreKitScheme.includes('buildForArchiving = "NO"'),
  "StoreKit scheme must be simulator-only and reference Woof.storekit"
);
assert(
  fs.existsSync(path.join(prebuildDir, "android", "settings.gradle")),
  "Expo prebuild did not generate android/settings.gradle"
);
assert(
  fs.existsSync(path.join(prebuildDir, "android", "app", "build.gradle")),
  "Expo prebuild did not generate android/app/build.gradle"
);

console.log(`Expo prebuild check passed: native projects generated in ${prebuildDir}`);
