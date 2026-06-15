import AsyncStorage from "@react-native-async-storage/async-storage";

export const RECENT_SEARCHES_KEY = "@woof_recent_searches";
const MAX_RECENT_SEARCHES = 5;

function normalizeRecentSearch(item) {
  if (!item) return null;
  const cacheKey = String(item.cache_key || item.cacheKey || "").trim();
  const productName = String(item.product_name || item.productName || "").trim();
  if (!cacheKey || !productName) return null;
  return {
    product_name: productName,
    brand: typeof item.brand === "string" && item.brand.trim().length > 0 ? item.brand.trim() : null,
    cache_key: cacheKey,
    image_url: item.image_url || item.imageUrl || null,
    petType: ["dog", "cat"].includes(item.petType || item.pet_type) ? (item.petType || item.pet_type) : null,
  };
}

export async function getRecentSearches() {
  const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeRecentSearch).filter(Boolean).slice(0, MAX_RECENT_SEARCHES);
}

export async function recordRecentSearch(item) {
  const normalized = normalizeRecentSearch(item);
  if (!normalized) return [];
  const current = await getRecentSearches();
  const next = [
    normalized,
    ...current.filter((entry) => entry.cache_key !== normalized.cache_key),
  ].slice(0, MAX_RECENT_SEARCHES);
  await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

export async function removeRecentSearch(cacheKey) {
  if (!cacheKey) return [];
  const current = await getRecentSearches();
  const next = current.filter((entry) => entry.cache_key !== cacheKey);
  await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

export async function clearRecentSearches() {
  await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  return [];
}
