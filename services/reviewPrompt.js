import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";
import { trackEvent } from "./analytics";

const APP_STORE_REVIEW_URL = "itms-apps://itunes.apple.com/app/viewContentsUserReviews/id6760733899?action=write-review";
const APP_STORE_WEB_URL = "https://apps.apple.com/app/apple-store/id6760733899?action=write-review";
const PLAY_STORE_REVIEW_URL = "market://details?id=com.app.woof";
const PLAY_STORE_WEB_URL = "https://play.google.com/store/apps/details?id=com.app.woof";

const LEGACY_SUCCESS_COUNT_KEY = "@woof_review_success_count";
const LEGACY_PROMPT_COUNT_KEY = "@woof_review_prompt_count";
const LEGACY_LAST_PROMPT_AT_KEY = "@woof_review_last_prompt_at";
const REVIEW_SUCCESS_COUNT_KEY_PREFIX = "@woof_review_success_count:";
const REVIEW_PROMPT_COUNT_KEY_PREFIX = "@woof_review_prompt_count:";
const REVIEW_LAST_PROMPT_AT_KEY_PREFIX = "@woof_review_last_prompt_at:";

const MIN_GOOD_SCORE = 70;
const MIN_SUCCESSFUL_RESULTS = 2;
const MAX_PROMPTS = 2;
const PROMPT_COOLDOWN_MS = 120 * 24 * 60 * 60 * 1000;

function reviewUrls() {
  if (Platform.OS === "ios") {
    return {
      primary: __DEV__ ? APP_STORE_WEB_URL : APP_STORE_REVIEW_URL,
      fallback: __DEV__ ? null : APP_STORE_WEB_URL,
      store: "app_store",
    };
  }

  if (Platform.OS === "android") {
    return { primary: PLAY_STORE_REVIEW_URL, fallback: PLAY_STORE_WEB_URL, store: "play_store" };
  }

  return { primary: APP_STORE_WEB_URL, fallback: null, store: "web" };
}

function reviewStorageKey(prefix, legacyKey, userId) {
  return userId ? `${prefix}${userId}` : legacyKey;
}

function reviewStorageKeys(userId) {
  return {
    successCount: reviewStorageKey(REVIEW_SUCCESS_COUNT_KEY_PREFIX, LEGACY_SUCCESS_COUNT_KEY, userId),
    promptCount: reviewStorageKey(REVIEW_PROMPT_COUNT_KEY_PREFIX, LEGACY_PROMPT_COUNT_KEY, userId),
    lastPromptAt: reviewStorageKey(REVIEW_LAST_PROMPT_AT_KEY_PREFIX, LEGACY_LAST_PROMPT_AT_KEY, userId),
  };
}

async function readNumber(key) {
  const raw = await AsyncStorage.getItem(key);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function baseProperties(context = {}) {
  return {
    source: context.source || "unknown",
    scan_mode: context.scanMode || null,
    score: context.score ?? null,
    is_pro: !!context.isPro,
    from_cache: context.fromCache ?? null,
    data_source: context.dataSource || null,
  };
}

function isGoodPetFoodResult({ score, scanMode }) {
  return scanMode !== "human_food" && Number(score) >= MIN_GOOD_SCORE;
}

async function recordEligibleSuccess(context) {
  if (!isGoodPetFoodResult(context)) return 0;
  const { successCount } = reviewStorageKeys(context.userId || null);
  const count = await readNumber(successCount) + 1;
  await AsyncStorage.setItem(successCount, String(count));
  return count;
}

export async function maybeShowReviewPrompt(context = {}) {
  if (__DEV__) {
    return { show: false, reason: "development_build" };
  }

  const reviewKeys = reviewStorageKeys(context.userId || null);
  const successCount = await recordEligibleSuccess(context);
  if (successCount < MIN_SUCCESSFUL_RESULTS) {
    return { show: false, reason: "not_enough_successes" };
  }

  if (!context.isPro && Number(context.remainingScans) <= 1) {
    return { show: false, reason: "free_limit_near_paywall" };
  }

  const promptCount = await readNumber(reviewKeys.promptCount);
  if (promptCount >= MAX_PROMPTS) {
    return { show: false, reason: "max_prompts" };
  }

  const lastPromptAt = await readNumber(reviewKeys.lastPromptAt);
  if (lastPromptAt && Date.now() - lastPromptAt < PROMPT_COOLDOWN_MS) {
    return { show: false, reason: "cooldown" };
  }

  const nextPromptCount = promptCount + 1;
  await AsyncStorage.multiSet([
    [reviewKeys.promptCount, String(nextPromptCount)],
    [reviewKeys.lastPromptAt, String(Date.now())],
  ]);

  trackEvent("app_review_prompt_viewed", {
    ...baseProperties(context),
    successful_result_count: successCount,
    prompt_count: nextPromptCount,
    review_state_scoped: !!context.userId,
  });

  return { show: true, promptCount: nextPromptCount, successfulResultCount: successCount };
}

export async function dismissReviewPrompt(context = {}) {
  trackEvent("app_review_prompt_dismissed", baseProperties(context));
}

export async function openStoreReview(context = {}) {
  const { primary, fallback, store } = reviewUrls();
  const properties = {
    ...baseProperties(context),
    store,
  };

  trackEvent("app_review_requested", properties);

  if (__DEV__) {
    trackEvent("app_review_open_failed", {
      ...properties,
      error_name: "development_build",
    });
    return false;
  }

  try {
    await Linking.openURL(primary);
    trackEvent("app_review_opened", { ...properties, method: "primary" });
    return true;
  } catch (err) {
    if (fallback) {
      try {
        await Linking.openURL(fallback);
        trackEvent("app_review_opened", { ...properties, method: "fallback" });
        return true;
      } catch (fallbackErr) {
        trackEvent("app_review_open_failed", {
          ...properties,
          error_name: fallbackErr?.name || err?.name || "unknown",
        });
        return false;
      }
    }

    trackEvent("app_review_open_failed", {
      ...properties,
      error_name: err?.name || "unknown",
    });
    return false;
  }
}

export async function clearReviewPromptStorage(userId = null) {
  const keys = [
    LEGACY_SUCCESS_COUNT_KEY,
    LEGACY_PROMPT_COUNT_KEY,
    LEGACY_LAST_PROMPT_AT_KEY,
  ];

  if (userId) {
    const userKeys = reviewStorageKeys(userId);
    keys.push(userKeys.successCount, userKeys.promptCount, userKeys.lastPromptAt);
  }

  await AsyncStorage.multiRemove([...new Set(keys)]);
}
