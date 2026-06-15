import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config/env";

const nativeSecureAuthStorage = {
  async getItem(key) {
    if (Platform.OS === "web") {
      return AsyncStorage.getItem(key);
    }

    try {
      const secureValue = await SecureStore.getItemAsync(key);
      if (secureValue) return secureValue;

      // One-time migration for users who already had a Supabase session in
      // AsyncStorage before auth persistence moved to SecureStore.
      const legacyValue = await AsyncStorage.getItem(key);
      if (legacyValue) {
        await SecureStore.setItemAsync(key, legacyValue);
        await AsyncStorage.removeItem(key).catch(() => {});
        return legacyValue;
      }
    } catch (err) {
      console.log("[SUPABASE] Secure auth storage read failed:", err.message);
    }

    return null;
  },

  async setItem(key, value) {
    if (Platform.OS === "web") {
      return AsyncStorage.setItem(key, value);
    }

    try {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.removeItem(key).catch(() => {});
    } catch (err) {
      console.log("[SUPABASE] Secure auth storage write failed:", err.message);
    }
  },

  async removeItem(key) {
    if (Platform.OS === "web") {
      return AsyncStorage.removeItem(key);
    }

    await Promise.all([
      SecureStore.deleteItemAsync(key).catch(() => {}),
      AsyncStorage.removeItem(key).catch(() => {}),
    ]);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: nativeSecureAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
