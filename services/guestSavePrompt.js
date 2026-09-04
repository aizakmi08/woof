import AsyncStorage from "@react-native-async-storage/async-storage";

const LEGACY_GUEST_SAVE_PROMPT_KEY = "@woof_guest_save_prompt_shown";
const GUEST_SAVE_PROMPT_KEY_PREFIX = "@woof_guest_save_prompt_shown:";

function guestSavePromptStorageKey(userId) {
  return userId ? `${GUEST_SAVE_PROMPT_KEY_PREFIX}${userId}` : LEGACY_GUEST_SAVE_PROMPT_KEY;
}

export async function hasSeenGuestSavePrompt(userId = null) {
  const value = await AsyncStorage.getItem(guestSavePromptStorageKey(userId));
  return value === "true";
}

export async function markGuestSavePromptSeen(userId = null) {
  await AsyncStorage.setItem(guestSavePromptStorageKey(userId), "true");
  if (userId) {
    await AsyncStorage.removeItem(LEGACY_GUEST_SAVE_PROMPT_KEY).catch(() => {});
  }
}

export async function clearGuestSavePromptStorage(userId = null) {
  const keys = [LEGACY_GUEST_SAVE_PROMPT_KEY];
  if (userId) keys.push(guestSavePromptStorageKey(userId));
  await AsyncStorage.multiRemove([...new Set(keys)]);
}
