import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { AppState } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { clearHistoryMemoryCache, clearHistoryMigrationSessionCache, migrateLocalHistoryToSupabase } from "./history";
import { initializePurchases, checkProStatus, logOutPurchases, getPurchaseConfigurationIssue } from "./purchases";
import { clearWarmAnalysisCache } from "./cache";
import { clearAnalysisSessionData } from "./analysisService";
import { clearLocalUserData } from "./localUserData";

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

const redirectUri = makeRedirectUri({ native: "woof://auth/callback" });
console.log("[AUTH] Redirect URI:", redirectUri);

const FREE_SCAN_LIMIT = 3;
const FREE_HUMAN_FOOD_PER_DAY = 1;
const SCAN_COUNT_KEY = "@woof_scan_count";
const HUMAN_FOOD_COUNT_KEY = "@woof_hf_count";       // today's consumed count
const HUMAN_FOOD_DATE_KEY = "@woof_hf_count_date";   // UTC YYYY-MM-DD
const FORCE_FREE_KEY = "@woof_dev_force_free";       // dev toggle to ignore DEV_MODE bypass
const SESSION_CHECK_TIMEOUT_MS = 4000;
const PRO_STATUS_PROFILE_TIMEOUT_MS = 3000;
const PROFILE_FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30_000;

// DEV MODE: bypasses local scan-limit checks only. It must not masquerade as
// a real Pro entitlement, because the analyze Edge Function enforces quota
// from server-side profile/RevenueCat state.
const DEV_MODE = __DEV__; // Automatically true in dev, false in production

function parseStoredQuotaCount(raw, maxAllowed, label) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    if (raw != null) console.log(`[AUTH] Ignoring invalid ${label} quota value:`, raw);
    return 0;
  }
  if (parsed > maxAllowed) {
    console.log(`[AUTH] Clamping ${label} quota value:`, parsed);
    return maxAllowed;
  }
  return parsed;
}

function normalizeServerCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function withTimeout(promise, label, timeoutMs) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [humanFoodCountToday, setHumanFoodCountToday] = useState(0);
  const foregroundProfileRefreshRef = useRef({
    appState: AppState.currentState,
    lastRefreshAt: 0,
  });
  // Dev-only: when true, ignore the DEV_MODE bypass so the real free-tier
  // limits apply. Lets you test the paywall + quota UX without a release build.
  const [forceFreeTier, setForceFreeTier] = useState(false);

  // Returns today's UTC date string for human-food bucketing.
  const todayUtc = () => new Date().toISOString().slice(0, 10);

  // True only when dev is in "real" mode AND this build is dev. Production builds
  // ignore the toggle entirely (the flag is meaningless there).
  const devBypass = DEV_MODE && !forceFreeTier;

  // ── Human-food daily quota ──────────────────────────────────────
  // Server is the source of truth via increment_human_food_count RPC (atomic
  // + handles UTC daily reset). Local mirror in AsyncStorage covers guest mode
  // and gives an instant UI response while the network call is in flight.

  const _readLocalHumanFood = useCallback(async () => {
    try {
      const [date, raw] = await Promise.all([
        AsyncStorage.getItem(HUMAN_FOOD_DATE_KEY),
        AsyncStorage.getItem(HUMAN_FOOD_COUNT_KEY),
      ]);
      if (date !== todayUtc()) return 0; // reset on date rollover
      return parseStoredQuotaCount(raw, FREE_HUMAN_FOOD_PER_DAY, "human_food");
    } catch { return 0; }
  }, []);

  const _writeLocalHumanFood = useCallback(async (count) => {
    try {
      await AsyncStorage.multiSet([
        [HUMAN_FOOD_DATE_KEY, todayUtc()],
        [HUMAN_FOOD_COUNT_KEY, String(count)],
      ]);
    } catch {}
  }, []);

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (!error && data) {
        setProfile(data);
        // Reconcile bounded guest usage into the account without trusting a
        // corrupted local mirror or issuing unbounded RPCs.
        if (data.scan_count != null) {
          const localRaw = await AsyncStorage.getItem(SCAN_COUNT_KEY).catch(() => null);
          const local = parseStoredQuotaCount(localRaw, FREE_SCAN_LIMIT, "scan");
          let serverCount = normalizeServerCount(data.scan_count);

          // Carry over guest usage only up to the published free limit. This
          // avoids replaying corrupted local values into account-wide quota.
          if (!data.is_pro && local > serverCount) {
            const boundedDelta = Math.min(local - serverCount, FREE_SCAN_LIMIT - serverCount);
            for (let i = 0; i < boundedDelta; i++) {
              const { data: nextCount, error: incError } = await supabase.rpc("increment_scan_count", {
                p_user_id: userId,
              });
              if (incError || typeof nextCount !== "number") {
                console.log("[AUTH] scan carryover failed:", incError?.message || "invalid response");
                break;
              }
              serverCount = normalizeServerCount(nextCount);
            }
          }

          setScanCount(serverCount);
          AsyncStorage.setItem(SCAN_COUNT_KEY, String(Math.min(serverCount, FREE_SCAN_LIMIT))).catch(() => {});
        }
        setIsPro(Boolean(data.is_pro));

        // Sync today's human-food count from server. Server's get_today RPC
        // already handles the UTC reset, so we don't need to compare dates.
        try {
          const { data: hfToday } = await supabase.rpc("get_human_food_count_today", {
            p_user_id: userId,
          });
          if (typeof hfToday === "number") {
            const local = await _readLocalHumanFood();
            let serverCount = normalizeServerCount(hfToday);

            if (!data.is_pro && local > serverCount) {
              const { data: nextCount, error: incError } = await supabase.rpc(
                "increment_human_food_count",
                { p_user_id: userId },
              );
              if (!incError && typeof nextCount === "number") {
                serverCount = normalizeServerCount(nextCount);
              } else {
                console.log("[AUTH] human_food carryover failed:", incError?.message || "invalid response");
              }
            }

            const displayCount = Math.min(serverCount, FREE_HUMAN_FOOD_PER_DAY);
            setHumanFoodCountToday(displayCount);
            _writeLocalHumanFood(displayCount);
          }
        } catch (err) {
          console.log("[AUTH] human_food sync failed:", err.message);
        }
      }
    } catch (err) {
      console.log("[AUTH] Error fetching profile:", err.message);
    }
  }, [_readLocalHumanFood, _writeLocalHumanFood]);

  const refreshProStatus = useCallback(async () => {
    let purchasePro = null;
    try {
      purchasePro = await checkProStatus(user?.id || null);
      if (purchasePro === true) {
        setIsPro(true);
        return true;
      }
    } catch (err) {
      console.log("[AUTH] Error checking pro status:", err.message);
      purchasePro = null;
    }

    if (user?.id) {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from("profiles")
            .select("is_pro")
            .eq("id", user.id)
            .single(),
          "PROFILE_PRO_REFRESH",
          PRO_STATUS_PROFILE_TIMEOUT_MS,
        );
        if (!error && typeof data?.is_pro === "boolean") {
          setProfile((prev) => (prev ? { ...prev, is_pro: data.is_pro } : { is_pro: data.is_pro }));
          setIsPro(data.is_pro);
          return data.is_pro;
        }
      } catch (profileErr) {
        console.log("[AUTH] Error refreshing profile pro status:", profileErr.message);
      }
    }

    if (typeof purchasePro === "boolean") {
      setIsPro(purchasePro);
      return purchasePro;
    }

    return null;
  }, [user?.id]);

  const checkSession = useCallback(async ({ timeoutMs = SESSION_CHECK_TIMEOUT_MS } = {}) => {
    try {
      const { data: { session }, error } = await withTimeout(
        supabase.auth.getSession(),
        "SESSION_CHECK",
        timeoutMs,
      );
      if (error || !session) {
        console.log("[AUTH] Session check failed:", error?.message || "No session");
        return false;
      }

      // Check if token is expired or expiring soon
      if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
        console.log("[AUTH] Token expiring, refreshing...");
        const { data, error: refreshError } = await withTimeout(
          supabase.auth.refreshSession(),
          "SESSION_REFRESH",
          timeoutMs,
        );
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

  const incrementHumanFoodCount = useCallback(async () => {
    // Signed-in completed checks are committed by the analyze Edge Function
    // after a schema-valid result. Mirror locally for immediate UI updates
    // without mutating server quota twice.
    if (user?.id) {
      const mirrored = Math.min(humanFoodCountToday + 1, FREE_HUMAN_FOOD_PER_DAY);
      setHumanFoodCountToday(mirrored);
      await _writeLocalHumanFood(mirrored);
      return mirrored;
    }
    // Fallback: optimistic local increment (guest or RPC failure)
    const next = Math.min(humanFoodCountToday + 1, FREE_HUMAN_FOOD_PER_DAY);
    setHumanFoodCountToday(next);
    _writeLocalHumanFood(next);
    return next;
  }, [user?.id, humanFoodCountToday, _writeLocalHumanFood]);

  const canCheckHumanFood = useCallback(() => {
    if (devBypass || isPro) return true;
    return humanFoodCountToday < FREE_HUMAN_FOOD_PER_DAY;
  }, [devBypass, isPro, humanFoodCountToday]);

  const remainingHumanFoodChecks = useCallback(() => {
    if (devBypass || isPro) return Infinity;
    return Math.max(0, FREE_HUMAN_FOOD_PER_DAY - humanFoodCountToday);
  }, [devBypass, isPro, humanFoodCountToday]);

  const incrementScanCount = useCallback(async () => {
    // Signed-in completed scans are committed by the analyze Edge Function
    // after a schema-valid result. Mirror locally for immediate UI updates
    // without mutating server quota twice.
    if (user?.id) {
      const mirrored = Math.min(scanCount + 1, FREE_SCAN_LIMIT);
      setScanCount(mirrored);
      AsyncStorage.setItem(SCAN_COUNT_KEY, String(mirrored)).catch(() => {});
      return mirrored;
    }
    // Fallback: optimistic local increment (guest mode or RPC failure)
    const newCount = Math.min(scanCount + 1, FREE_SCAN_LIMIT);
    setScanCount(newCount);
    AsyncStorage.setItem(SCAN_COUNT_KEY, String(newCount)).catch(() => {});
    return newCount;
  }, [user?.id, scanCount]);

  const isGuest = !user;

  const canScan = useCallback(() => {
    if (devBypass) return true; // Dev bypass — allow all unless "force free tier" is on
    return isPro || scanCount < FREE_SCAN_LIMIT;
  }, [devBypass, isPro, scanCount]);

  const remainingScans = useCallback(() => {
    if (devBypass || isPro) return Infinity;
    return Math.max(0, FREE_SCAN_LIMIT - scanCount);
  }, [devBypass, isPro, scanCount]);

  useEffect(() => {
    let mounted = true;
    const historyMigrations = new Map();

    const retryGuestHistoryMigration = (userId) => {
      if (!userId || historyMigrations.has(userId)) return;
      const migration = migrateLocalHistoryToSupabase(userId)
        .catch((err) => console.log("[AUTH] Migration error:", err.message))
        .finally(() => historyMigrations.delete(userId));
      historyMigrations.set(userId, migration);
    };

    const quotaHydration = Promise.all([
      AsyncStorage.getItem(SCAN_COUNT_KEY)
        .then((val) => {
          if (mounted) setScanCount(parseStoredQuotaCount(val, FREE_SCAN_LIMIT, "scan"));
        })
        .catch(() => {}),
      _readLocalHumanFood()
        .then((c) => {
          if (mounted) setHumanFoodCountToday(c);
        })
        .catch(() => {}),
    ]);

    // Dev-only: hydrate the "force free tier" toggle.
    if (DEV_MODE) {
      AsyncStorage.getItem(FORCE_FREE_KEY).then((val) => {
        if (mounted) setForceFreeTier(val === "true");
      }).catch(() => {});
    }

    // Get initial session
    const startPurchaseStatusCheck = (userId, failurePrefix) => {
      const configurationIssue = getPurchaseConfigurationIssue();
      if (configurationIssue) {
        console.log("[AUTH] Purchases init skipped:", configurationIssue.code, configurationIssue.diagnostics);
        return;
      }
      withTimeout(initializePurchases(userId), "PURCHASES_INIT", 5000)
        .then(() => withTimeout(checkProStatus(userId), "PRO_CHECK", 3000))
        .then((pro) => { if (mounted && typeof pro === "boolean") setIsPro(pro); })
        .catch((err) => console.log(failurePrefix, err.message));
    };

    const startAnonymousPurchasesInit = () => {
      const configurationIssue = getPurchaseConfigurationIssue();
      if (configurationIssue) {
        console.log("[AUTH] Guest purchases init skipped:", configurationIssue.code, configurationIssue.diagnostics);
        return;
      }
      initializePurchases(null).catch(() => {});
    };

    supabase.auth.getSession()
      .then(async ({ data: { session: s } }) => {
        if (!mounted) return;

        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          retryGuestHistoryMigration(s.user.id);
          // Profile/quota hydration gates app readiness. RevenueCat refreshes
          // entitlement state in the background so a slow native purchase SDK
          // cannot hold the whole app on the startup loading screen.
          const profileTask = withTimeout(fetchProfile(s.user.id), "PROFILE", 5000)
            .catch((err) => console.log("[AUTH] Profile load failed:", err.message));
          startPurchaseStatusCheck(s.user.id, "[AUTH] Purchases/pro check failed:");

          await profileTask;
        } else {
          // Don't await — guest users shouldn't pay for purchases SDK init on cold start.
          startAnonymousPurchasesInit();
        }

        await quotaHydration;
        if (mounted) setLoading(false);
      })
      .catch(async (err) => {
        console.log("[AUTH] Initial session load failed:", err.message);
        await quotaHydration;
        if (mounted) setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;

        setSession(s);
        setUser(s?.user ?? null);

        if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
          clearHistoryMemoryCache();
        }

        if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && s?.user) {
          retryGuestHistoryMigration(s.user.id);
        }

        if (event === "SIGNED_IN" && s?.user) {
          const profileTask = withTimeout(fetchProfile(s.user.id), "PROFILE", 5000)
            .catch((err) => console.log("[AUTH] Sign-in profile load failed:", err.message));
          startPurchaseStatusCheck(s.user.id, "[AUTH] RevenueCat init/pro check failed:");

          await profileTask;
        }

        if (event === "SIGNED_OUT") {
          setProfile(null);
          setIsPro(false);
          clearHistoryMigrationSessionCache();
          const localScan = await AsyncStorage.getItem(SCAN_COUNT_KEY).catch(() => null);
          if (mounted) {
            setScanCount(parseStoredQuotaCount(localScan, FREE_SCAN_LIMIT, "scan"));
            _readLocalHumanFood().then((c) => {
              if (mounted) setHumanFoodCountToday(c);
            });
          }
          await logOutPurchases();
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, _readLocalHumanFood]);

  useEffect(() => {
    foregroundProfileRefreshRef.current.appState = AppState.currentState;
    if (!user?.id) return undefined;

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const previousAppState = foregroundProfileRefreshRef.current.appState;
      foregroundProfileRefreshRef.current.appState = nextAppState;
      const returningToForeground =
        nextAppState === "active" &&
        previousAppState &&
        previousAppState !== "active";
      if (!returningToForeground) return;

      const now = Date.now();
      if (
        now - foregroundProfileRefreshRef.current.lastRefreshAt <
        PROFILE_FOREGROUND_REFRESH_MIN_INTERVAL_MS
      ) {
        return;
      }
      foregroundProfileRefreshRef.current.lastRefreshAt = now;

      withTimeout(
        supabase
          .from("profiles")
          .select("is_pro, scan_count")
          .eq("id", user.id)
          .single(),
        "PROFILE_FOREGROUND_REFRESH",
        PRO_STATUS_PROFILE_TIMEOUT_MS,
      )
        .then(({ data, error }) => {
          if (error || !data) {
            if (error) console.log("[AUTH] Foreground profile refresh failed:", error.message);
            return;
          }
          setProfile((prev) => (prev ? { ...prev, ...data } : data));
          if (typeof data.is_pro === "boolean") setIsPro(Boolean(data.is_pro));
          if (data.scan_count != null) {
            const serverCount = normalizeServerCount(data.scan_count);
            setScanCount(serverCount);
            AsyncStorage.setItem(SCAN_COUNT_KEY, String(Math.min(serverCount, FREE_SCAN_LIMIT))).catch(() => {});
          }
        })
        .catch((err) => console.log("[AUTH] Foreground profile refresh failed:", err.message));
    });

    return () => subscription.remove();
  }, [user?.id]);

  // --- Apple Sign-In ---
  const signInWithApple = useCallback(async () => {
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      const unavailable = new Error("Apple Sign-In is not available on this device.");
      unavailable.code = "APPLE_SIGN_IN_UNAVAILABLE";
      throw unavailable;
    }

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

    if (result.type !== "success") {
      const cancelled = new Error("Google sign-in was cancelled.");
      cancelled.code = "GOOGLE_SIGN_IN_CANCELLED";
      throw cancelled;
    }

    const url = new URL(result.url);
    const params = new URLSearchParams(url.search);
    const fragmentParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const oauthError = params.get("error") || fragmentParams.get("error");
    if (oauthError) {
      const description =
        params.get("error_description") ||
        fragmentParams.get("error_description") ||
        oauthError;
      throw new Error(`Google sign-in failed: ${description}`);
    }

    const code = params.get("code");
    if (!code) {
      throw new Error("Google sign-in did not return an authorization code. Please try again.");
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }, []);

  // ─── Dev-only test helpers ──────────────────────────────────────
  // These are exposed unconditionally but only do anything in DEV_MODE.

  const setForceFreeTierFlag = useCallback(async (value) => {
    if (!DEV_MODE) return;
    setForceFreeTier(!!value);
    AsyncStorage.setItem(FORCE_FREE_KEY, value ? "true" : "false").catch(() => {});
  }, []);

  // Reset local pet-food scan quota. Server quota is intentionally not mutable
  // from the client, even in dev builds.
  const resetScanCount = useCallback(async () => {
    if (!DEV_MODE) return;
    setScanCount(0);
    await AsyncStorage.setItem(SCAN_COUNT_KEY, "0").catch(() => {});
  }, []);

  // Reset local human-food quota. Server quota is intentionally not mutable
  // from the client, even in dev builds.
  const resetHumanFoodQuota = useCallback(async () => {
    if (!DEV_MODE) return;
    setHumanFoodCountToday(0);
    await AsyncStorage.multiRemove([HUMAN_FOOD_COUNT_KEY, HUMAN_FOOD_DATE_KEY]).catch(() => {});
  }, []);

  // --- Sign Out ---
  const signOut = useCallback(async () => {
    await logOutPurchases();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // --- Delete Account ---
  const deleteAccount = useCallback(async () => {
    const deletingUserId = user?.id || session?.user?.id || null;
    clearAnalysisSessionData();
    clearWarmAnalysisCache();
    clearHistoryMemoryCache();
    clearHistoryMigrationSessionCache();
    await clearLocalUserData(deletingUserId);

    // Call server-side RPC that deletes all user data + auth record
    const { error } = await supabase.rpc("delete_own_account");
    if (error) throw error;
    // Clear local state
    await logOutPurchases();
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsPro(false);
    setScanCount(0);
    setHumanFoodCountToday(0);
    // Sign out locally (session is already invalid server-side)
    await supabase.auth.signOut().catch(() => {});
  }, [session?.user?.id, user?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isPro,
        hasDevScanBypass: devBypass,
        isGuest,
        scanCount,
        signInWithApple,
        signInWithGoogle,
        signOut,
        deleteAccount,
        refreshProStatus,
        checkSession,
        incrementScanCount,
        canScan,
        remainingScans,
        // Human-food daily quota
        humanFoodCountToday,
        canCheckHumanFood,
        remainingHumanFoodChecks,
        incrementHumanFoodCount,
        // Dev-only test helpers (no-ops in production builds)
        isDev: DEV_MODE,
        forceFreeTier,
        setForceFreeTier: setForceFreeTierFlag,
        resetScanCount,
        resetHumanFoodQuota,
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
