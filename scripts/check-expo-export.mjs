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

const OPTIONAL_PUBLIC_EAS_ENV = {
  GOOGLE_WEB_CLIENT_ID: "ci-google-client-placeholder",
  WOOF_SHARE_URL: "https://apps.apple.com/app/id6760733899",
};

const nativeExportDir = process.env.WOOF_EXPO_EXPORT_DIR ||
  path.join(os.tmpdir(), "woof-expo-export-smoke");
const webExportDir = process.env.WOOF_EXPO_WEB_EXPORT_DIR ||
  path.join(os.tmpdir(), "woof-expo-web-export-smoke");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function expoBinaryPath() {
  const basePath = path.join("node_modules", ".bin", process.platform === "win32" ? "expo.cmd" : "expo");
  assert(
    fs.existsSync(basePath),
    "Expo CLI binary is missing. Run npm ci before npm run check:bundle."
  );
  return basePath;
}

function listFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

const nodeBinDir = path.dirname(process.execPath);
const publicEnv = {
  ...REQUIRED_PUBLIC_EAS_ENV,
  ...OPTIONAL_PUBLIC_EAS_ENV,
};
const publicAliasEnv = Object.fromEntries(
  Object.entries(publicEnv).map(([name, value]) => [`EXPO_PUBLIC_${name}`, value])
);
const releaseEnv = {
  ...process.env,
  ...publicEnv,
  ...publicAliasEnv,
  ...REQUIRED_PRIVATE_EAS_ENV,
  EAS_BUILD: "true",
  EAS_BUILD_PROFILE: "preview",
  PATH: `${nodeBinDir}${path.delimiter}${process.env.PATH || ""}`,
};

function runExpoExport({ platform, outputDir, extraArgs = [] }) {
  fs.rmSync(outputDir, { recursive: true, force: true });

  const result = spawnSync(
    expoBinaryPath(),
    [
      "export",
      "--platform",
      platform,
      "--output-dir",
      outputDir,
      "--clear",
      ...extraArgs,
    ],
    {
      stdio: "inherit",
      env: releaseEnv,
    }
  );

  if (result.error) {
    throw new Error(`Expo ${platform} export failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  return listFiles(outputDir).map((filePath) => path.relative(outputDir, filePath));
}

const nativeExportedFiles = runExpoExport({
  platform: "all",
  outputDir: nativeExportDir,
  extraArgs: ["--source-maps", "external"],
});
assert(
  nativeExportedFiles.some((filePath) => filePath.startsWith("_expo/static/js/ios/") && filePath.endsWith(".hbc")),
  "Expo export did not produce an iOS Hermes bundle"
);
assert(
  nativeExportedFiles.some((filePath) => filePath.startsWith("_expo/static/js/android/") && filePath.endsWith(".hbc")),
  "Expo export did not produce an Android Hermes bundle"
);
assert(
  nativeExportedFiles.includes("metadata.json"),
  "Expo export did not produce metadata.json"
);

const webExportedFiles = runExpoExport({
  platform: "web",
  outputDir: webExportDir,
});
const webBundleFiles = webExportedFiles.filter(
  (filePath) => filePath.startsWith("_expo/static/js/web/") && filePath.endsWith(".js")
);

assert(webExportedFiles.includes("index.html"), "Expo web export did not produce index.html");
assert(webExportedFiles.includes("metadata.json"), "Expo web export did not produce metadata.json");
assert(webBundleFiles.length > 0, "Expo web export did not produce a web JavaScript bundle");

const webBundleText = webBundleFiles
  .map((filePath) => fs.readFileSync(path.join(webExportDir, filePath), "utf8"))
  .join("\n");

assert(
  webBundleText.includes(REQUIRED_PUBLIC_EAS_ENV.SUPABASE_URL),
  "Expo web bundle did not include public Supabase config"
);
assert(
  webBundleText.includes(REQUIRED_PUBLIC_EAS_ENV.REVENUECAT_API_KEY_IOS),
  "Expo web bundle did not include public RevenueCat config"
);
assert(
  !webBundleText.includes(REQUIRED_PRIVATE_EAS_ENV.SENTRY_AUTH_TOKEN),
  "Expo web bundle leaked the private Sentry auth token"
);
assert(
  !webBundleText.includes("EXPO_PUBLIC_SENTRY_AUTH_TOKEN"),
  "Expo web bundle includes the forbidden public Sentry auth token alias"
);

console.log(
  `Expo export check passed: ${nativeExportedFiles.length} native files in ${nativeExportDir}; ` +
    `${webExportedFiles.length} web files in ${webExportDir}`
);
