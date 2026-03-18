import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { migrateLocalHistoryToSupabase } from "./history";
import { initializePurchases, checkProStatus, resetPurchases } from "./purchases";

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

const redirectUri = makeRedirectUri();
console.log("[AUTH] Redirect URI:", redirectUri);

const FREE_SCAN_LIMIT = 3;
const SCAN_COUNT_KEY = "@woof_scan_count";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (!error && data) {
        setProfile(data);
        // Sync scan count from server
        if (data.scan_count != null) {
          setScanCount(data.scan_count);
          AsyncStorage.setItem(SCAN_COUNT_KEY, String(data.scan_count));
        }
        if (data.is_pro) setIsPro(true);
      }
    } catch (err) {
      console.log("[AUTH] Error fetching profile:", err.message);
    }
  }, []);

  const refreshProStatus = useCallback(async () => {
    try {
      const pro = await checkProStatus();
      setIsPro(pro);
      // Sync to database for server-side checks
      if (user?.id) {
        supabase
          .from("profiles")
          .update({ is_pro: pro })
          .eq("id", user.id)
          .then(() => {});
      }
      return pro;
    } catch (err) {
      console.log("[AUTH] Error checking pro status:", err.message);
      return false;
    }
  }, [user?.id]);

  const incrementScanCount = useCallback(async () => {
    // Use functional update to avoid race conditions with concurrent calls
    setScanCount((prev) => {
      const newCount = prev + 1;
      AsyncStorage.setItem(SCAN_COUNT_KEY, String(newCount));
      // Fire-and-forget Supabase update
      if (user?.id) {
        supabase
          .from("profiles")
          .update({ scan_count: newCount })
          .eq("id", user.id)
          .then(() => {});
      }
      return newCount;
    });
  }, [user?.id]);

  const canScan = useCallback(() => {
    return isPro || scanCount < FREE_SCAN_LIMIT;
  }, [isPro, scanCount]);

  const remainingScans = useCallback(() => {
    if (isPro) return Infinity;
    return Math.max(0, FREE_SCAN_LIMIT - scanCount);
  }, [isPro, scanCount]);

  useEffect(() => {
    // Load scan count from local storage immediately
    AsyncStorage.getItem(SCAN_COUNT_KEY).then((val) => {
      if (val != null) setScanCount(parseInt(val, 10) || 0);
    });

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        await fetchProfile(s.user.id);
        await initializePurchases(s.user.id);
        try {
          const pro = await checkProStatus();
          setIsPro(pro);
        } catch (err) {
          console.log("[AUTH] Error checking pro status on init:", err.message);
        }
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        setSession(s);
        setUser(s?.user ?? null);

        if (event === "SIGNED_IN" && s?.user) {
          await fetchProfile(s.user.id);
          await initializePurchases(s.user.id);
          try {
            const pro = await checkProStatus();
            setIsPro(pro);
          } catch (err) {
            console.log("[AUTH] Error checking pro status on sign-in:", err.message);
          }
          migrateLocalHistoryToSupabase(s.user.id).catch((err) =>
            console.log("[AUTH] Migration error:", err.message)
          );
        }

        if (event === "SIGNED_OUT") {
          setProfile(null);
          setIsPro(false);
          setScanCount(0);
          resetPurchases();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // --- Apple Sign-In ---
  const signInWithApple = useCallback(async () => {
    const rawNonce = Array.from(
      Crypto.getRandomValues(new Uint8Array(32)),
      (b) => b.toString(16).padStart(2, "0")
    ).join("");
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error("No identity token from Apple");
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: rawNonce,
    });

    if (error) throw error;
  }, []);

  // --- Google Sign-In (via Supabase OAuth) ---
  const signInWithGoogle = useCallback(async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;

    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      redirectUri
    );

    if (result.type === "success") {
      const url = new URL(result.url);
      const fragment = url.hash.substring(1);
      const params = new URLSearchParams(fragment);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
    }
  }, []);

  // --- Sign Out ---
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isPro,
        scanCount,
        signInWithApple,
        signInWithGoogle,
        signOut,
        refreshProStatus,
        incrementScanCount,
        canScan,
        remainingScans,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
