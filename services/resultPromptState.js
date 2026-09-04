import AsyncStorage from "@react-native-async-storage/async-storage";

const LEGACY_FIRST_SCAN_TOAST_KEY = "@woof_first_scan_toast_shown";
const LEGACY_POST_SCAN_PROMPT_KEY = "@woof_post_scan_prompt_shown";
const FIRST_SCAN_TOAST_KEY_PREFIX = "@woof_first_scan_toast_shown:";
const POST_SCAN_PROMPT_KEY_PREFIX = "@woof_post_scan_prompt_shown:";

function resultPromptStorageKey(prefix, legacyKey, userId) {
  return userId ? `${prefix}${userId}` : legacyKey;
}

function resultPromptStorageKeys(userId) {
  return {
    firstScanToast: resultPromptStorageKey(
      FIRST_SCAN_TOAST_KEY_PREFIX,
      LEGACY_FIRST_SCAN_TOAST_KEY,
      userId
    ),
    postScanPrompt: resultPromptStorageKey(
      POST_SCAN_PROMPT_KEY_PREFIX,
      LEGACY_POST_SCAN_PROMPT_KEY,
      userId
    ),
  };
}

async function hasSeenResultPrompt(key) {
  const value = await AsyncStorage.getItem(key);
  return value === "true";
}

async function markResultPromptSeen(key, legacyKey, userId) {
  await AsyncStorage.setItem(key, "true");
  if (userId) {
    await AsyncStorage.removeItem(legacyKey).catch(() => {});
  }
}

export async function hasSeenFirstScanToast(userId = null) {
  const { firstScanToast } = resultPromptStorageKeys(userId);
  return hasSeenResultPrompt(firstScanToast);
}

export async function markFirstScanToastSeen(userId = null) {
  const { firstScanToast } = resultPromptStorageKeys(userId);
  await markResultPromptSeen(firstScanToast, LEGACY_FIRST_SCAN_TOAST_KEY, userId);
}

export async function hasSeenPostScanPrompt(userId = null) {
  const { postScanPrompt } = resultPromptStorageKeys(userId);
  return hasSeenResultPrompt(postScanPrompt);
}

export async function markPostScanPromptSeen(userId = null) {
  const { postScanPrompt } = resultPromptStorageKeys(userId);
  await markResultPromptSeen(postScanPrompt, LEGACY_POST_SCAN_PROMPT_KEY, userId);
}

export async function clearResultPromptState(userId = null) {
  const keys = [
    LEGACY_FIRST_SCAN_TOAST_KEY,
    LEGACY_POST_SCAN_PROMPT_KEY,
  ];

  if (userId) {
    const userKeys = resultPromptStorageKeys(userId);
    keys.push(userKeys.firstScanToast, userKeys.postScanPrompt);
  }

  await AsyncStorage.multiRemove([...new Set(keys)]);
}
