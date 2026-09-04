import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import { createLogger } from "./logger";
import { BRAND_NAME } from "../config/brand";

const CATALOG_EVIDENCE_CONSENT_KEY = "@woof_catalog_evidence_consent_v1";
const logger = createLogger("CATALOG_EVIDENCE_CONSENT");

export async function getCatalogEvidenceConsentPreference() {
  try {
    const value = await AsyncStorage.getItem(CATALOG_EVIDENCE_CONSENT_KEY);
    if (value === "share") return true;
    if (value === "private") return false;
  } catch (err) {
    logger.debug("[CATALOG_EVIDENCE_CONSENT] Read failed:", err?.message || "Unknown error");
  }
  return null;
}

export async function setCatalogEvidenceConsentPreference(shareForReview) {
  try {
    await AsyncStorage.setItem(
      CATALOG_EVIDENCE_CONSENT_KEY,
      shareForReview === true ? "share" : "private"
    );
  } catch (err) {
    logger.debug("[CATALOG_EVIDENCE_CONSENT] Save failed:", err?.message || "Unknown error");
  }
}

export async function clearCatalogEvidenceConsentPreference() {
  await AsyncStorage.removeItem(CATALOG_EVIDENCE_CONSENT_KEY).catch(() => {});
}

export async function requestCatalogEvidenceConsent() {
  const savedPreference = await getCatalogEvidenceConsentPreference();
  if (typeof savedPreference === "boolean") return savedPreference;

  return new Promise((resolve) => {
    let settled = false;
    const finish = async (value) => {
      if (settled) return;
      settled = true;
      if (typeof value === "boolean") {
        await setCatalogEvidenceConsentPreference(value);
      }
      resolve(value);
    };

    Alert.alert(
      "Help add this product?",
      `Choose how ${BRAND_NAME} handles this scan. Private: scored for you only, not added to the catalog. Share for review: saves the recognized product name and ingredients in a private review queue; nothing is added or scored automatically.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => finish(null) },
        { text: "Scan Privately", onPress: () => finish(false) },
        { text: "Share for Review", onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(null) }
    );
  });
}
