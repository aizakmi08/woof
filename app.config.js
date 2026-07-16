if (process.env.EAS_BUILD !== "true") {
  require("dotenv").config();
}

const REQUIRED_PUBLIC_EAS_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SENTRY_DSN",
];

const REQUIRED_PLATFORM_EAS_ENV = {
  ios: ["REVENUECAT_API_KEY_IOS"],
  android: ["REVENUECAT_API_KEY_ANDROID"],
};

const REQUIRED_SENTRY_EAS_ENV = [
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN",
];

function isValidSentryAuthToken(value) {
  return /^sntrys_[A-Za-z0-9_-]{20,}$/.test(value || "");
}

function publicEnv(name) {
  return process.env[`EXPO_PUBLIC_${name}`] || process.env[name];
}

function assertReleaseEnv() {
  const isEasBuild = process.env.EAS_BUILD === "true";
  const buildProfile = process.env.EAS_BUILD_PROFILE || "";
  const platform = process.env.EAS_BUILD_PLATFORM || "";
  const shouldValidate = isEasBuild && buildProfile !== "development";

  if (!shouldValidate) return;

  const missing = [
    ...REQUIRED_PUBLIC_EAS_ENV.filter((name) => !publicEnv(name)),
    ...(REQUIRED_PLATFORM_EAS_ENV[platform] || []).filter((name) => !publicEnv(name)),
    ...REQUIRED_SENTRY_EAS_ENV.filter((name) => !process.env[name]),
  ];

  if (missing.length > 0) {
    throw new Error(
      `Missing required EAS environment variables for ${buildProfile || "release"} build: ${missing.join(", ")}`
    );
  }

  if (!isValidSentryAuthToken(process.env.SENTRY_AUTH_TOKEN)) {
    throw new Error(
      `Invalid SENTRY_AUTH_TOKEN for ${buildProfile || "release"} build. Replace the placeholder with a Sentry organization auth token.`
    );
  }
}

module.exports = ({ config }) => {
  assertReleaseEnv();
  const sentryPublicEnv = {
    SENTRY_DSN: publicEnv("SENTRY_DSN"),
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  };
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
  void sentryAuthToken;

  return {
    ...config,
    extra: {
      ...config.extra,
      SUPABASE_URL: publicEnv("SUPABASE_URL"),
      SUPABASE_ANON_KEY: publicEnv("SUPABASE_ANON_KEY"),
      GOOGLE_WEB_CLIENT_ID: publicEnv("GOOGLE_WEB_CLIENT_ID"),
      REVENUECAT_API_KEY_IOS: publicEnv("REVENUECAT_API_KEY_IOS"),
      REVENUECAT_API_KEY_ANDROID: publicEnv("REVENUECAT_API_KEY_ANDROID"),
      WOOF_SHARE_URL: publicEnv("WOOF_SHARE_URL") || "https://apps.apple.com/app/id6760733899",
      ...sentryPublicEnv,
    },
  };
};
