import Constants from "expo-constants";

export const SUPABASE_URL =
  Constants.expoConfig?.extra?.SUPABASE_URL ?? "";

export const SUPABASE_ANON_KEY =
  Constants.expoConfig?.extra?.SUPABASE_ANON_KEY ?? "";

export const GOOGLE_WEB_CLIENT_ID =
  Constants.expoConfig?.extra?.GOOGLE_WEB_CLIENT_ID ?? "";
