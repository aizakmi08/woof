import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import {
  clearLocalHistoryForUser,
  migrateLocalHistoryBetweenUsers,
  migrateLocalHistoryToSupabase,
} from "./history";
import { initializePurchases, getProStatus, resetPurchases } from "./purchases";
import {
  reconcileRevenueCatProfile,
  syncRevenueCatProfile,
} from "./revenuecatSync";
import { clearReviewPromptStorage } from "./reviewPrompt";
import { clearGuestSavePromptStorage } from "./guestSavePrompt";
import { clearResultPromptState } from "./resultPromptState";
import { clearAnalyticsStorage, flushAnalyticsQueue, trackEvent } from "./analytics";
import { clearLocalResults } from "./analysisService";
import { createLogger } from "./logger";
import { normalizePetProfile } from "./petProfile";

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);
const logger = createLogger("AUTH");

const redirectUri = makeRedirectUri({ native: "woof://auth/callback" });
logger.debug("[AUTH] Redirect URI:", redirectUri);

const FREE_SCAN_LIMIT = 3;
const LEGACY_SCAN_COUNT_KEY = "@woof_scan_count";
const SCAN_COUNT_KEY_PREFIX = "@woof_scan_count:";

function isAnonymousUser(user) {
  if (typeof user?.is_anonymous === "boolean") {
    return user.is_anonymous;
  }

  return (
    user?.app_metadata?.provider === "anonymous" ||
    (
      user?.identities?.length === 1 &&
      user.identities[0]?.provider === "anonymous"
    )
  );
}

function isActiveProfilePro(profile) {
  if (!profile?.is_pro) return false;
  if (!profile.pro_expires_at) return true;

  const expiresAt = Date.parse(profile.pro_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function scanCountStorageKey(userId) {
  return userId ? `${SCAN_COUNT_KEY_PREFIX}${userId}` : LEGACY_SCAN_COUNT_KEY;
}

function persistScanCount(userId, count) {
  if (!userId) return;
  AsyncStorage.setItem(scanCountStorageKey(userId), String(count)).catch(() => {});
  AsyncStorage.removeItem(LEGACY_SCAN_COUNT_KEY).catch(() => {});
}

async function completeBrowserAuth(url) {
  const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);

  if (result.type !== "success") {
    const error = new Error("Authentication was cancelled.");
    error.code = "ERR_REQUEST_CANCELED";
    throw error;
  }

  const callbackUrl = new URL(result.url);
  const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(callbackUrl.search.replace(/^\?/, ""));
  const authError =
    queryParams.get("error_description") ||
    queryParams.get("error") ||
    hashParams.get("error_description") ||
    hashParams.get("error");

  if (authError) {
    throw new Error(decodeURIComponent(authError));
  }

  const code = queryParams.get("code") || hashParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  const accessToken = hashParams.get("access_token") || queryParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token") || queryParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }

  throw new Error("Authentication callback did not include a session.");
}

async function startBrowserProviderFlow(provider, { linkCurrentUser = false } = {}) {
  const request = {
    provider,
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  };

  const { data, error } = linkCurrentUser
    ? await supabase.auth.linkIdentity(request)
    : await supabase.auth.signInWithOAuth(request);

  if (error) throw error;
  if (!data?.url) throw new Error("Authentication URL was not returned.");

  await completeBrowserAuth(data.url);

  if (linkCurrentUser) {
    await supabase.auth.refreshSession().catch(() => {});
  }
}

async function syncProfileFromAuthUser(authUser) {
  if (!authUser?.id) return;

  const metadata = authUser.user_metadata || {};
  const email = authUser.email || metadata.email || null;
  const displayName =
    metadata.full_name ||
    metadata.name ||
    (email ? email.split("@")[0] : null);
  const avatarUrl = metadata.avatar_url || metadata.picture || null;
  const provider = authUser.app_metadata?.provider || null;
  const profileFields = {
    updated_at: new Date().toISOString(),
  };

  if (displayName) profileFields.display_name = displayName;
  if (avatarUrl) profileFields.avatar_url = avatarUrl;
  if (email) profileFields.email = email;
  if (provider) profileFields.provider = provider;

  const { data: existingProfile, error: readError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (readError) {
    logger.debug("[AUTH] Profile read error:", readError.message);
    return;
  }

  const profileWrite = existingProfile
    ? supabase
      .from("profiles")
      .update({
        updated_at: profileFields.updated_at,
        ...(profileFields.display_name && { display_name: profileFields.display_name }),
        ...(profileFields.avatar_url && { avatar_url: profileFields.avatar_url }),
      })
      .eq("id", authUser.id)
    : supabase
      .from("profiles")
      .insert({ id: authUser.id, ...profileFields });

  const { error } = await profileWrite;
  if (error) {
    logger.debug("[AUTH] Profile sync error:", error.message);
  }
}

export function AuthProvider({ children, skipAutomaticGuestSession = false }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [anonymousUnavailable, setAnonymousUnavailable] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const setupUserIdRef = useRef(null);

  const fetchProfile = useCallback(async (userId, { updateProState = true } = {}) => {
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
          persistScanCount(userId, data.scan_count);
        }
        if (updateProState) {
          setIsPro(isActiveProfilePro(data));
        }
        return data;
      }
    } catch (err) {
      logger.debug("[AUTH] Error fetching profile:", err.message);
    }
    return null;
  }, []);

  const startAnonymousSession = useCallback(async ({ automatic = false } = {}) => {
    trackEvent("anonymous_sign_in_started", { automatic });

    const { data, error } = await supabase.auth.signInAnonymously({
      options: {
        data: {
          source: automatic ? "automatic_start" : "manual_continue",
        },
      },
    });

    if (error) {
      setAnonymousUnavailable(true);
      trackEvent("anonymous_sign_in_failed", {
        automatic,
        message: error.message,
      });
      throw error;
    }

    if (!data?.session) {
      setAnonymousUnavailable(true);
      const missingSessionError = new Error("Guest session could not be created.");
      trackEvent("anonymous_sign_in_failed", {
        automatic,
        message: missingSessionError.message,
      });
      throw missingSessionError;
    }

    setAnonymousUnavailable(false);
    trackEvent("anonymous_signed_in", { automatic });
    return data.session;
  }, []);

  const resolveProStatus = useCallback(async ({ source = "unknown", userId, profileData = null } = {}) => {
    const sourceKey = typeof source === "string" && source.trim()
      ? source.trim().slice(0, 80)
      : "unknown";
    const status = await getProStatus();

    if (status.isPro) {
      const syncState = await syncRevenueCatProfile({ source: sourceKey });
      if (syncState?.is_pro === false) {
        trackEvent("revenuecat_status_mismatch", {
          source: sourceKey,
          sdk_is_pro: true,
          server_sync_is_pro: false,
          sync_status: syncState.status || "unknown",
        });
        reconcileRevenueCatProfile({ source: sourceKey }).catch((err) => {
          logger.debug("[AUTH] RevenueCat reconciliation failed:", err?.message || "Unknown error");
        });
        return true;
      }
      return true;
    }

    if (status.checked) {
      const fallbackProfile = profileData || (userId
        ? await fetchProfile(userId, { updateProState: false })
        : null);
      const profilePro = isActiveProfilePro(fallbackProfile);

      if (!profilePro) return false;

      trackEvent("revenuecat_status_mismatch", {
        source: sourceKey,
        sdk_is_pro: false,
        profile_is_pro: true,
        reason: status.reason || "checked_inactive",
      });

      const syncState = await syncRevenueCatProfile({
        source: `${sourceKey}_sdk_inactive`,
      });
      if (typeof syncState?.is_pro === "boolean") {
        trackEvent("revenuecat_status_fallback_used", {
          source: sourceKey,
          fallback: "server_sync",
          reason: status.reason || "checked_inactive",
          is_pro: syncState.is_pro,
        });
        return syncState.is_pro;
      }

      trackEvent("revenuecat_status_fallback_used", {
        source: sourceKey,
        fallback: "profile",
        reason: `${status.reason || "checked_inactive"}_sync_unavailable`,
        is_pro: true,
      });
      return true;
    }

    const syncState = await syncRevenueCatProfile({ source: `${sourceKey}_sdk_unchecked` });
    if (typeof syncState?.is_pro === "boolean") {
      trackEvent("revenuecat_status_fallback_used", {
        source: sourceKey,
        fallback: "server_sync",
        reason: status.reason || "unchecked",
        is_pro: syncState.is_pro,
      });
      return syncState.is_pro;
    }

    const fallbackProfile = profileData || (userId ? await fetchProfile(userId, { updateProState: false }) : null);
    const profilePro = isActiveProfilePro(fallbackProfile);
    trackEvent("revenuecat_status_fallback_used", {
      source: sourceKey,
      fallback: "profile",
      reason: status.reason || "unchecked",
      is_pro: profilePro,
    });
    return profilePro;
  }, [fetchProfile]);

  const runSignedInSetup = useCallback(async (authUser, shouldContinue = () => true) => {
    if (!authUser?.id || setupUserIdRef.current === authUser.id) return;
    setupUserIdRef.current = authUser.id;

    const timeoutMs = 5000;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AUTH_TIMEOUT")), timeoutMs)
    );

    try {
      const profilePromise = (async () => {
        await syncProfileFromAuthUser(authUser);
        return fetchProfile(authUser.id, { updateProState: false });
      })();

      await Promise.race([
        Promise.all([
          profilePromise,
          initializePurchases(authUser.id).then(async () => {
            const profileData = await profilePromise.catch(() => null);
            const pro = await resolveProStatus({
              source: "auth_init",
              userId: authUser.id,
              profileData,
            });

            if (pro && shouldContinue()) {
              fetchProfile(authUser.id, { updateProState: false }).catch(() => {});
            }

            if (shouldContinue()) setIsPro(pro);
          }),
        ]),
        timeout,
      ]);
    } catch (err) {
      logger.debug("[AUTH] Init timeout or error:", err.message);
    }

    migrateLocalHistoryToSupabase(authUser.id).catch((err) =>
      logger.debug("[AUTH] Migration error:", err.message)
    );
  }, [fetchProfile, resolveProStatus]);

  const refreshProStatus = useCallback(async ({ source = "manual_refresh", userId = user?.id } = {}) => {
    try {
      const pro = await resolveProStatus({ source, userId });

      if (pro && userId) {
        fetchProfile(userId, { updateProState: false }).catch(() => {});
      }

      setIsPro(pro);
      return pro;
    } catch (err) {
      logger.debug("[AUTH] Error checking pro status:", err.message);
      return false;
    }
  }, [fetchProfile, resolveProStatus, user?.id]);

  const updatePetProfile = useCallback(async (nextProfile) => {
    if (!user?.id) throw new Error("Sign in before saving pet details.");

    const petProfile = normalizePetProfile(nextProfile);
    if (!petProfile.name || !petProfile.petType) {
      throw new Error("Pet name and pet type are required.");
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({
        pet_profile: petProfile,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) throw error;
    setProfile(data);
    return petProfile;
  }, [user?.id]);

  const finishAccountLink = useCallback(async ({ provider, previousUserId }) => {
    const { data: { session: updatedSession } } = await supabase.auth.getSession();
    const updatedUser = updatedSession?.user ?? null;

    setSession(updatedSession);
    setUser(updatedUser);
    setIsAnonymous(isAnonymousUser(updatedUser));

    if (!updatedUser) {
      throw new Error("Account link did not return an active session.");
    }

    if (previousUserId && previousUserId !== updatedUser.id) {
      const migration = await migrateLocalHistoryBetweenUsers(previousUserId, updatedUser.id);
      if (migration.error) {
        trackEvent("guest_history_migration_failed", {
          provider,
          message: migration.error,
          changed_user_id: true,
        });
      } else {
        trackEvent("guest_history_migration_completed", {
          provider,
          migrated_count: migration.migrated || 0,
          synced: migration.synced === true,
          changed_user_id: true,
        });
      }
    } else {
      trackEvent("guest_history_migration_skipped", {
        provider,
        changed_user_id: false,
      });
    }

    const purchasesInitialized = await initializePurchases(updatedUser.id);
    trackEvent("account_link_revenuecat_reidentified", {
      provider,
      changed_user_id: previousUserId ? previousUserId !== updatedUser.id : false,
      purchases_initialized: purchasesInitialized,
    });

    await syncProfileFromAuthUser(updatedUser);
    await fetchProfile(updatedUser.id, { updateProState: false });
    await refreshProStatus({ source: `account_link_${provider}`, userId: updatedUser.id });
  }, [fetchProfile, refreshProStatus]);

  const checkSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        logger.debug("[AUTH] Session check failed:", error?.message || "No session");
        return false;
      }

      // Refresh before scan/upload flows so analysis does not start with a near-expired token.
      if (session.expires_at && Date.now() / 1000 > session.expires_at - 300) {
        logger.debug("[AUTH] Token expiring, refreshing...");
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !data.session) {
          logger.debug("[AUTH] Token refresh failed:", refreshError?.message);
          return false;
        }
        logger.debug("[AUTH] Token refreshed successfully");
      }

      return true;
    } catch (err) {
      logger.debug("[AUTH] Session check error:", err.message);
      return false;
    }
  }, []);

  const incrementScanCount = useCallback(async (scanUsage = null) => {
    if (scanUsage?.scan_count != null) {
      const syncedCount = Number(scanUsage.scan_count) || 0;
      setScanCount(syncedCount);
      persistScanCount(user?.id, syncedCount);
      return;
    }

    // Use functional update to avoid race conditions with concurrent calls
    setScanCount((prev) => {
      const newCount = prev + 1;
      persistScanCount(user?.id, newCount);
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
    let mounted = true;

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        if (!mounted) return;

        setSession(s);
        setUser(s?.user ?? null);
        setIsAnonymous(isAnonymousUser(s?.user));

        if (event === "SIGNED_IN" && s?.user) {
          flushAnalyticsQueue({ source: "auth_state_signed_in" }).catch(() => {});
          trackEvent("auth_signed_in", {
            provider: isAnonymousUser(s.user) ? "anonymous" : s.user.app_metadata?.provider || "unknown",
            trigger: event,
          });

          // Supabase holds an auth lock while this callback runs. Defer any
          // database/auth work so sign-in can finish and startup cannot stall.
          setTimeout(() => {
            if (!mounted) return;
            runSignedInSetup(s.user, () => mounted).catch((err) => {
              logger.debug("[AUTH] Signed-in setup error:", err.message);
            });
          }, 0);
        }

        if (event === "SIGNED_OUT") {
          trackEvent("auth_signed_out", {}, { queueWhenSignedOut: false });
          setupUserIdRef.current = null;
          setProfile(null);
          setIsPro(false);
          setIsAnonymous(false);
          setScanCount(0);
          setTimeout(() => {
            resetPurchases().catch((err) => {
              logger.debug("[AUTH] Purchase reset error:", err.message);
            });
          }, 0);
        }
      }
    );

    // Get initial session. If none exists, create a guest session so users can scan first.
    supabase.auth.getSession()
      .then(async ({ data: { session: s } }) => {
        if (!mounted) return;

        let activeSession = s;

        if (!activeSession && !skipAutomaticGuestSession) {
          try {
            activeSession = await startAnonymousSession({ automatic: true });
          } catch (err) {
            logger.debug("[AUTH] Anonymous session unavailable:", err.message);
          }
        }

        if (!mounted) return;

        setSession(activeSession);
        setUser(activeSession?.user ?? null);
        setIsAnonymous(isAnonymousUser(activeSession?.user));

        if (activeSession?.user) {
          flushAnalyticsQueue({ source: "auth_boot_existing_session" }).catch(() => {});
          await runSignedInSetup(activeSession.user, () => mounted);
        }

        if (mounted) setLoading(false);
      })
      .catch((err) => {
        logger.debug("[AUTH] Initial session error:", err.message);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [runSignedInSetup, skipAutomaticGuestSession, startAnonymousSession]);

  // --- Apple Sign-In ---
  const signInWithApple = useCallback(async () => {
    if (isAnonymousUser(user)) {
      const previousUserId = user?.id ?? null;
      await startBrowserProviderFlow("apple", { linkCurrentUser: true });
      await finishAccountLink({ provider: "apple", previousUserId });
      return;
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
  }, [fetchProfile, finishAccountLink, refreshProStatus, user]);

  // --- Google Sign-In (via Supabase OAuth) ---
  const signInWithGoogle = useCallback(async () => {
    const linkCurrentUser = isAnonymousUser(user);
    const previousUserId = linkCurrentUser ? user?.id ?? null : null;
    await startBrowserProviderFlow("google", {
      linkCurrentUser,
    });

    if (linkCurrentUser) {
      await finishAccountLink({ provider: "google", previousUserId });
    } else {
      const { data: { session: updatedSession } } = await supabase.auth.getSession();
      const updatedUser = updatedSession?.user ?? null;
      setSession(updatedSession);
      setUser(updatedUser);
      setIsAnonymous(isAnonymousUser(updatedUser));

      if (updatedUser) {
        await syncProfileFromAuthUser(updatedUser);
        await fetchProfile(updatedUser.id, { updateProState: false });
        await refreshProStatus({ source: "sign_in_google", userId: updatedUser.id });
      }
    }
  }, [fetchProfile, finishAccountLink, refreshProStatus, user]);

  // --- Sign Out ---
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // --- Delete Account ---
  const deleteAccount = useCallback(async () => {
    const deletedUserId = user?.id ?? null;

    // Call server-side RPC that deletes all user data + auth record
    const { error } = await supabase.rpc("delete_own_account");
    if (error) throw error;

    // Clear local state
    await Promise.all([
      AsyncStorage.removeItem(LEGACY_SCAN_COUNT_KEY),
      deletedUserId
        ? AsyncStorage.removeItem(scanCountStorageKey(deletedUserId))
        : Promise.resolve(),
      clearLocalHistoryForUser(deletedUserId),
      clearLocalResults(),
      clearResultPromptState(deletedUserId),
      clearGuestSavePromptStorage(deletedUserId),
      clearReviewPromptStorage(deletedUserId),
      clearAnalyticsStorage(),
    ]);

    await resetPurchases();
    setupUserIdRef.current = null;
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsPro(false);
    setIsAnonymous(false);
    setScanCount(0);
    // Sign out locally (session is already invalid server-side)
    await supabase.auth.signOut().catch(() => {});
  }, [user?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isPro,
        isAnonymous,
        anonymousUnavailable,
        scanCount,
        startAnonymousSession,
        signInWithApple,
        signInWithGoogle,
        signOut,
        deleteAccount,
        updatePetProfile,
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
