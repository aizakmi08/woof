import Constants from "expo-constants";

const isDev = typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";

function requiredExtra(name) {
  const value = Constants.expoConfig?.extra?.[name];
  if (typeof value === "string" && value.trim()) return value.trim();

  const message = `Missing required app config extra: ${name}`;
  if (!isDev) throw new Error(message);
  console.warn(`[config] ${message}`);
  return "";
}

export const SUPABASE_URL = requiredExtra("SUPABASE_URL");

export const SUPABASE_ANON_KEY = requiredExtra("SUPABASE_ANON_KEY");

export const GOOGLE_WEB_CLIENT_ID = requiredExtra("GOOGLE_WEB_CLIENT_ID");
