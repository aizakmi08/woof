require("dotenv").config({ quiet: true });

const REQUIRED_BASE_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "GOOGLE_WEB_CLIENT_ID",
];

const PUBLIC_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "GOOGLE_WEB_CLIENT_ID",
  "REVENUECAT_API_KEY_IOS",
  "REVENUECAT_API_KEY_ANDROID",
  "REVENUECAT_TEST_STORE_API_KEY",
];

const ENV_ALIASES = {
  REVENUECAT_API_KEY_IOS: ["REVENUECAT_API_KEY_IOS", "EXPO_PUBLIC_REVENUECAT_API_KEY_IOS"],
  REVENUECAT_API_KEY_ANDROID: ["REVENUECAT_API_KEY_ANDROID", "EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID"],
  REVENUECAT_TEST_STORE_API_KEY: ["REVENUECAT_TEST_STORE_API_KEY", "EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY"],
};

function isProductionBuild() {
  return (
    process.env.EAS_BUILD === "1" ||
    process.env.EAS_BUILD_PROFILE === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function env(name) {
  const names = ENV_ALIASES[name] || [name];
  for (const candidate of names) {
    const value = process.env[candidate];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function requiredRevenueCatEnv() {
  const platform = env("EAS_BUILD_PLATFORM").toLowerCase();
  if (platform === "ios") return ["REVENUECAT_API_KEY_IOS"];
  if (platform === "android") return ["REVENUECAT_API_KEY_ANDROID"];
  return ["REVENUECAT_API_KEY_IOS", "REVENUECAT_API_KEY_ANDROID"];
}

function validateEnv() {
  const missing = [
    ...REQUIRED_BASE_ENV,
    ...(isProductionBuild() ? requiredRevenueCatEnv() : []),
  ].filter((name) => !env(name));
  const invalid = [];

  const supabaseUrl = env("SUPABASE_URL");
  if (supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
    invalid.push("SUPABASE_URL must be a https://*.supabase.co URL");
  }

  const iosKey = env("REVENUECAT_API_KEY_IOS");
  if (iosKey && !iosKey.startsWith("appl_")) {
    invalid.push("REVENUECAT_API_KEY_IOS must start with appl_");
  }

  const androidKey = env("REVENUECAT_API_KEY_ANDROID");
  if (androidKey && !androidKey.startsWith("goog_")) {
    invalid.push("REVENUECAT_API_KEY_ANDROID must start with goog_");
  }

  const testStoreKey = env("REVENUECAT_TEST_STORE_API_KEY");
  if (testStoreKey && !testStoreKey.startsWith("test_")) {
    invalid.push("REVENUECAT_TEST_STORE_API_KEY must start with test_");
  }
  if (isProductionBuild() && testStoreKey) {
    invalid.push("REVENUECAT_TEST_STORE_API_KEY must not be set for production builds");
  }

  if (isProductionBuild() && (missing.length > 0 || invalid.length > 0)) {
    throw new Error(
      [
        "Invalid production app configuration.",
        missing.length ? `Missing: ${missing.join(", ")}` : null,
        invalid.length ? `Invalid: ${invalid.join("; ")}` : null,
      ].filter(Boolean).join(" ")
    );
  }

  if (!isProductionBuild()) {
    for (const message of invalid) {
      console.warn(`[config] ${message}`);
    }
  }
}

module.exports = ({ config }) => {
  validateEnv();

  return {
    ...config,
    extra: {
      ...config.extra,
      ...Object.fromEntries(PUBLIC_ENV.map((name) => [name, env(name)])),
    },
  };
};
