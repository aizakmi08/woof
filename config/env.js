import Constants from "expo-constants";

function expoPublicEnv(name) {
  if (typeof process === "undefined") return "";
  return process.env?.[`EXPO_PUBLIC_${name}`] || "";
}

export const SUPABASE_URL =
  Constants.expoConfig?.extra?.SUPABASE_URL ||
  expoPublicEnv("SUPABASE_URL");

export const SUPABASE_ANON_KEY =
  Constants.expoConfig?.extra?.SUPABASE_ANON_KEY ||
  expoPublicEnv("SUPABASE_ANON_KEY");

export const GOOGLE_WEB_CLIENT_ID =
  Constants.expoConfig?.extra?.GOOGLE_WEB_CLIENT_ID ||
  expoPublicEnv("GOOGLE_WEB_CLIENT_ID");

export const REVENUECAT_API_KEY_IOS =
  Constants.expoConfig?.extra?.REVENUECAT_API_KEY_IOS ||
  expoPublicEnv("REVENUECAT_API_KEY_IOS");

export const REVENUECAT_API_KEY_ANDROID =
  Constants.expoConfig?.extra?.REVENUECAT_API_KEY_ANDROID ||
  expoPublicEnv("REVENUECAT_API_KEY_ANDROID");

export const WOOF_SHARE_URL =
  Constants.expoConfig?.extra?.WOOF_SHARE_URL ||
  expoPublicEnv("WOOF_SHARE_URL") ||
  "https://apps.apple.com/app/id6760733899";

export const SENTRY_DSN =
  Constants.expoConfig?.extra?.SENTRY_DSN ||
  expoPublicEnv("SENTRY_DSN");
