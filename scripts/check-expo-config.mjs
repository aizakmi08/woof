import { spawnSync } from "node:child_process";
import fs from "node:fs";
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
  SENTRY_AUTH_TOKEN: "sntrys_ci_test_token_1234567890",
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function expoCliPath() {
  const basePath = path.join("node_modules", "expo", "bin", "cli");
  assert(
    fs.existsSync(basePath),
    "Expo CLI binary is missing. Run npm ci before npm run check:expo-config."
  );
  return basePath;
}

function runExpoConfig(envOverrides, { json = true } = {}) {
  const args = json
    ? ["config", "--type", "public", "--json"]
    : ["config", "--type", "public"];

  return spawnSync(process.execPath, [expoCliPath(), ...args], {
    env: { ...process.env, EXPO_NO_DOTENV: "1", ...envOverrides },
    encoding: "utf8",
  });
}

function parseJsonOutput(output) {
  const starts = [...output.matchAll(/\{/g)].map((match) => match.index);
  for (const start of starts) {
    try {
      return JSON.parse(output.slice(start));
    } catch {
      // Expo/dotenv can print tips containing object-like snippets before JSON.
    }
  }
  throw new Error("Expo config did not print parseable JSON output");
}

const successRun = runExpoConfig({
  ...REQUIRED_PUBLIC_EAS_ENV,
  ...REQUIRED_PRIVATE_EAS_ENV,
  GOOGLE_WEB_CLIENT_ID: "ci-google-client-placeholder",
  WOOF_SHARE_URL: "https://apps.apple.com/app/id6760733899",
  EAS_BUILD: "true",
  EAS_BUILD_PROFILE: "preview",
});

assert(
  successRun.status === 0,
  `Expo config should resolve for preview builds with public env. stdout=${successRun.stdout} stderr=${successRun.stderr}`
);

const expoConfig = parseJsonOutput(successRun.stdout);
assert(expoConfig.name === "woof", "Expo config name changed unexpectedly");
assert(expoConfig.slug === "woof", "Expo config slug changed unexpectedly");
assert(expoConfig.version === "1.2.1", "Expo config version should match the 1.2.1 update release line");
assert(expoConfig.ios?.bundleIdentifier === "io.woof.app", "Expo config iOS bundle identifier changed unexpectedly");
assert(expoConfig.android?.package === "com.app.woof", "Expo config Android package changed unexpectedly");

for (const [name, expectedValue] of Object.entries(REQUIRED_PUBLIC_EAS_ENV)) {
  assert(
    expoConfig.extra?.[name] === expectedValue,
    `Expo config extra.${name} did not resolve from the provided public environment`
  );
}

const aliasRun = runExpoConfig({
  ...Object.fromEntries(
    Object.entries(REQUIRED_PUBLIC_EAS_ENV).map(([name, value]) => [`EXPO_PUBLIC_${name}`, value])
  ),
  ...REQUIRED_PRIVATE_EAS_ENV,
  EAS_BUILD: "true",
  EAS_BUILD_PROFILE: "preview",
});

assert(
  aliasRun.status === 0,
  `Expo config should resolve public EXPO_PUBLIC_* aliases for preview builds. stdout=${aliasRun.stdout} stderr=${aliasRun.stderr}`
);

const aliasExpoConfig = parseJsonOutput(aliasRun.stdout);
for (const [name, expectedValue] of Object.entries(REQUIRED_PUBLIC_EAS_ENV)) {
  assert(
    aliasExpoConfig.extra?.[name] === expectedValue,
    `Expo config extra.${name} did not resolve from EXPO_PUBLIC_${name}`
  );
}

assert(
  expoConfig.extra?.SENTRY_ORG === REQUIRED_PRIVATE_EAS_ENV.SENTRY_ORG &&
    expoConfig.extra?.SENTRY_PROJECT === REQUIRED_PRIVATE_EAS_ENV.SENTRY_PROJECT,
  "Expo config should expose non-secret Sentry org/project metadata"
);

assert(
  expoConfig.extra?.SENTRY_AUTH_TOKEN == null,
  "Expo config must not expose SENTRY_AUTH_TOKEN to the app bundle"
);

const failureRun = runExpoConfig({
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  REVENUECAT_API_KEY_IOS: "",
  REVENUECAT_API_KEY_ANDROID: "",
  SENTRY_DSN: "",
  SENTRY_ORG: "",
  SENTRY_PROJECT: "",
  SENTRY_AUTH_TOKEN: "",
  EAS_BUILD: "true",
  EAS_BUILD_PROFILE: "production",
}, { json: false });

const failureOutput = `${failureRun.stdout}\n${failureRun.stderr}`;
assert(
  failureRun.status !== 0 && failureOutput.includes("Missing required EAS environment variables"),
  "Expo config should fail fast for production EAS builds with missing public env"
);

const publicSentryTokenRun = runExpoConfig({
  ...REQUIRED_PUBLIC_EAS_ENV,
  SENTRY_ORG: REQUIRED_PRIVATE_EAS_ENV.SENTRY_ORG,
  SENTRY_PROJECT: REQUIRED_PRIVATE_EAS_ENV.SENTRY_PROJECT,
  SENTRY_AUTH_TOKEN: "",
  EXPO_PUBLIC_SENTRY_AUTH_TOKEN: "must-not-satisfy-release-validation",
  EAS_BUILD: "true",
  EAS_BUILD_PROFILE: "production",
}, { json: false });

const publicSentryTokenOutput = `${publicSentryTokenRun.stdout}\n${publicSentryTokenRun.stderr}`;
assert(
  publicSentryTokenRun.status !== 0 && publicSentryTokenOutput.includes("SENTRY_AUTH_TOKEN"),
  "Expo config must not accept EXPO_PUBLIC_SENTRY_AUTH_TOKEN for release Sentry auth validation"
);

const placeholderSentryTokenRun = runExpoConfig({
  ...REQUIRED_PUBLIC_EAS_ENV,
  SENTRY_ORG: REQUIRED_PRIVATE_EAS_ENV.SENTRY_ORG,
  SENTRY_PROJECT: REQUIRED_PRIVATE_EAS_ENV.SENTRY_PROJECT,
  SENTRY_AUTH_TOKEN: "Sentry ready",
  EAS_BUILD: "true",
  EAS_BUILD_PROFILE: "production",
}, { json: false });

const placeholderSentryTokenOutput = `${placeholderSentryTokenRun.stdout}\n${placeholderSentryTokenRun.stderr}`;
assert(
  placeholderSentryTokenRun.status !== 0 &&
    placeholderSentryTokenOutput.includes("Sentry organization auth token"),
  "Expo config must reject placeholder Sentry auth tokens for production builds"
);

console.log("Expo config check passed");
