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

const redirectUri = makeRedirectUri({ native: "woof://auth/callback" });
console.log("[AUTH] Redirect URI:", redirectUri);

const FREE_SCAN_LIMIT = 3;
const SCAN_COUNT_KEY = "@woof_scan_count";

// DEV MODE: Set to true to bypass scan limits and paywall (NEVER ship with this enabled!)
const DEV_MODE = __DEV__; // Automatically true in dev, false in production

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

  const checkSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        console.log("[AUTH] Session check failed:", error?.message || "No session");
        return false;
      }

      // Check if token is expired or expiring soon
      if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
        console.log("[AUTH] Token expiring, refreshing...");
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !data.session) {
          console.log("[AUTH] Token refresh failed:", refreshError?.message);
          return false;
        }
        console.log("[AUTH] Token refreshed successfully");
      }

      return true;
    } catch (err) {
      console.log("[AUTH] Session check error:", err.message);
      return false;
    }
  }, []);

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
    if (DEV_MODE) return true; // Always allow scans in dev mode
    return isPro || scanCount < FREE_SCAN_LIMIT;
  }, [isPro, scanCount]);

  const remainingScans = useCallback(() => {
    if (DEV_MODE || isPro) return Infinity;
    return Math.max(0, FREE_SCAN_LIMIT - scanCount);
  }, [isPro, scanCount]);

  useEffect(() => {
    let mounted = true;

    // Load scan count from local storage immediately
    AsyncStorage.getItem(SCAN_COUNT_KEY).then((val) => {
      if (val != null && mounted) setScanCount(parseInt(val, 10) || 0);
    });

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted) return;

      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        // Run profile and purchases in parallel with timeout
        const timeoutMs = 5000;
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AUTH_TIMEOUT")), timeoutMs)
        );

        try {
          await Promise.race([
            Promise.all([
              fetchProfile(s.user.id),
              initializePurchases(s.user.id).then(() => checkProStatus().then(pro => {
                if (mounted) setIsPro(pro);
              }))
            ]),
            timeout
          ]);
        } catch (err) {
          console.log("[AUTH] Init timeout or error:", err.message);
          // Continue anyway — user can retry
        }
      }

      if (mounted) setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;

        setSession(s);
        setUser(s?.user ?? null);

        if (event === "SIGNED_IN" && s?.user) {
          // Run in parallel with timeout
          const timeoutMs = 5000;
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("AUTH_TIMEOUT")), timeoutMs)
          );

          try {
            await Promise.race([
              Promise.all([
                fetchProfile(s.user.id),
                initializePurchases(s.user.id).then(() => checkProStatus().then(pro => {
                  if (mounted) setIsPro(pro);
                }))
              ]),
              timeout
            ]);
          } catch (err) {
            console.log("[AUTH] Sign-in timeout or error:", err.message);
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

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
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
        checkSession,
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
