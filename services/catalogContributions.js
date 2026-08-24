import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@woof/catalog_contributions";
const MAX_PENDING = 12;

function clean(value) {
  return String(value || "").trim();
}

function contributionKey(value = {}) {
  return clean(value.cacheKey || value.gtin || value.barcode)
    || [clean(value.brand), clean(value.productName)].filter(Boolean).join(":").toLowerCase();
}

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePendingCatalogContribution(value = {}) {
  const productName = clean(value.productName);
  const brand = clean(value.brand);
  const key = contributionKey(value);
  if (!key || (!productName && !brand)) return null;

  const entry = {
    key,
    productName,
    brand,
    petType: value.petType === "dog" || value.petType === "cat" ? value.petType : null,
    cacheKey: clean(value.cacheKey),
    gtin: clean(value.gtin || value.barcode),
    submittedAt: new Date().toISOString(),
  };
  const existing = await readAll();
  const next = [entry, ...existing.filter((item) => item?.key !== key)].slice(0, MAX_PENDING);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return entry;
}

export async function getPendingCatalogContributions() {
  return readAll();
}

export async function removePendingCatalogContribution(key) {
  const existing = await readAll();
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(existing.filter((item) => item?.key !== key))
  );
}
