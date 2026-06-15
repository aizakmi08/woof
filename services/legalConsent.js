import AsyncStorage from "@react-native-async-storage/async-storage";

export const LEGAL_CONSENT_VERSION = "2026-06-08";
export const LEGAL_CONSENT_KEY = `@woof_legal_consent_${LEGAL_CONSENT_VERSION}`;

export async function hasAcceptedLegalConsent() {
  try {
    return (await AsyncStorage.getItem(LEGAL_CONSENT_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function acceptLegalConsent() {
  await AsyncStorage.setItem(LEGAL_CONSENT_KEY, "true");
}
