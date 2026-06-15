import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  ScrollView,
  TouchableHighlight,
  Pressable,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  Keyboard,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { User, Shield, X, Utensils, Dog, Cat } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useFocusEffect } from "@react-navigation/native";
import { Camera, ChevronRight, ScanLine, Search } from "lucide-react-native";
import { getHistory, clearHistory, enrichHistoryImages } from "../services/history";
import { supabase } from "../services/supabase";
import { getProductDataByCacheKey, normalizeCacheKey, prefetchAnalyses, prefetchProductDataByCacheKeys, rememberProductDataSnapshots } from "../services/cache";
import {
  clearRecentSearches as clearStoredRecentSearches,
  getRecentSearches,
  removeRecentSearch,
  recordRecentSearch as persistRecentSearch,
} from "../services/recentSearches";
import { hasAcceptedLegalConsent, acceptLegalConsent } from "../services/legalConsent";
import { useAuth } from "../services/auth";
import { reportNetworkError, reportNetworkSuccess, useNetwork } from "../services/network";
import { trackEvent, analyticsKeyHash } from "../services/analytics";
import { PRIVACY_HTML, TERMS_HTML } from "../legal";
import * as analysisService from "../services/analysisService";
import { useTheme, getScoreConfig, Colors, Spacing, Shadows } from "../theme";
import * as Haptics from "expo-haptics";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const THUMB_GRADIENTS = [
  ["#FF6B6B", "#FF453A"],
  ["#FF9F0A", "#FF6B00"],
  ["#30D158", "#34C759"],
  ["#007AFF", "#0040FF"],
  ["#BF5AF2", "#9B59B6"],
  ["#64D2FF", "#007AFF"],
];

// --- Relative time ---

function relativeDate(dateString) {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

// --- Mini Score Ring (36px, staggered fill) ---

const MiniScoreRing = memo(function MiniScoreRing({ score, delay = 0 }) {
  const theme = useTheme();
  const size = 36;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = getScoreConfig(score).color;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(score / 100, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [score, delay]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.separator}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.ringLabel}>
        <Text style={[styles.ringScore, { color }]}>{score}</Text>
      </View>
    </View>
  );
});

// --- Safety color for human food entries ---

function safetyColor(level) {
  if (level === "safe") return Colors.scoreExcellent;
  if (level === "caution") return Colors.scoreDecent;
  return Colors.scoreConcerning;
}

function searchSourceLabel(source) {
  if (source === "opff" || source === "brand" || source === "manufacturer" || source === "verified") {
    return "verified";
  }
  if (source === "web_verified" || source === "dfa" || source === "cfa" || source === "cats") {
    return "listing";
  }
  if (source === "user_ocr") {
    return "label photo";
  }
  if (source === "amazon" || source === "chewy" || source === "web") {
    return "retailer";
  }
  return null;
}

const SEARCH_CAT_BRANDS = [
  "fancy feast", "friskies", "sheba", "tiki cat", "kit & kaboodle",
  "kit and kaboodle", "9 lives", "temptations", "meow mix", "whiskas",
];

const SEARCH_DOG_BRANDS = [
  "pedigree", "kibbles n bits", "kibbles 'n bits", "cesar", "beneful",
  "ol roy", "ol' roy", "milk-bone", "milk bone",
];

function inferSearchPetType(...values) {
  const text = values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return null;

  const hasCat =
    /\b(cat|cats|kitten|kittens|feline)\b/.test(text) ||
    SEARCH_CAT_BRANDS.some((brand) => text.includes(brand));
  const hasDog =
    /\b(dog|dogs|puppy|puppies|canine)\b/.test(text) ||
    SEARCH_DOG_BRANDS.some((brand) => text.includes(brand));

  if (hasCat === hasDog) return null;
  return hasCat ? "cat" : "dog";
}

function normalizeSearchRow(row) {
  if (!row || typeof row !== "object") return null;
  const cacheKey = typeof row.cache_key === "string" ? row.cache_key.trim() : "";
  const productName = typeof row.product_name === "string" ? row.product_name.trim() : "";
  const brand = typeof row.brand === "string" && row.brand.trim().length > 0 ? row.brand.trim() : null;
  const ingredientCount = Number(row.ingredient_count);
  if (!cacheKey || !productName || !Number.isFinite(ingredientCount) || ingredientCount < 5) return null;
  const rowPetType = ["dog", "cat"].includes(row.petType || row.pet_type) ? (row.petType || row.pet_type) : null;
  const petType = rowPetType || inferSearchPetType(productName, brand, cacheKey);

  return {
    ...row,
    cache_key: cacheKey,
    product_name: productName,
    brand,
    ingredient_count: ingredientCount,
    petType,
  };
}

function normalizeSearchPrewarmRow(row) {
  if (!row || typeof row !== "object") return null;
  const cacheKey = typeof row.cache_key === "string"
    ? row.cache_key.trim()
    : (typeof row.cacheKey === "string" ? row.cacheKey.trim() : "");
  const productName = typeof row.product_name === "string"
    ? row.product_name.trim()
    : (typeof row.productName === "string" ? row.productName.trim() : "");
  const brand = typeof row.brand === "string" && row.brand.trim().length > 0 ? row.brand.trim() : null;
  if (!cacheKey || !productName) return null;
  const rowPetType = ["dog", "cat"].includes(row.petType || row.pet_type) ? (row.petType || row.pet_type) : null;
  return {
    cache_key: cacheKey,
    product_name: productName,
    brand,
    petType: rowPetType || inferSearchPetType(productName, brand, cacheKey),
  };
}

function isPlausibleCatalogIngredient(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length < 2 || text.length > 200) return false;
  if (/[\\{}]/.test(text)) return false;
  if (/^[\["']/.test(text)) return false;
  if (/:\s*"/.test(text)) return false;
  if (/\bmailto:|https?:\/\//i.test(text)) return false;
  if (/\b(legalLinks|reportAbuseLink|siteSettings|hasChanges|sourceId|tileName)\b/i.test(text)) return false;
  if ((text.match(/[a-zA-Z]/g) || []).length < 2) return false;
  return true;
}

function cleanCatalogIngredients(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(isPlausibleCatalogIngredient);
}

function cacheKeySpellingVariants(cacheKey) {
  const key = typeof cacheKey === "string" ? cacheKey.trim() : "";
  if (!key) return [];
  const variants = new Set([key]);
  const replacements = [
    [/grain free/g, "grainfree"],
    [/grainfree/g, "grain free"],
    [/high protein/g, "highprotein"],
    [/highprotein/g, "high protein"],
    [/multi protein/g, "multiprotein"],
    [/multiprotein/g, "multi protein"],
    [/raw mix/g, "rawmix"],
    [/rawmix/g, "raw mix"],
    [/freeze dried/g, "freezedried"],
    [/freezedried/g, "freeze dried"],
    [/air dried/g, "airdried"],
    [/airdried/g, "air dried"],
  ];
  for (const [pattern, replacement] of replacements) {
    for (const existing of [...variants]) {
      if (variants.size >= 32) break;
      const variant = existing.replace(pattern, replacement).replace(/\s+/g, " ").trim();
      if (variant) variants.add(variant);
    }
  }
  variants.delete(key);
  return [...variants];
}

function normalizedSearchKeyVariants(...values) {
  const normalized = values.map((value) => normalizeCacheKey(value)).filter(Boolean);
  return [...new Set(normalized.flatMap((key) => [key, ...cacheKeySpellingVariants(key)]))];
}

function buildSearchPrewarmBaseKeys(row) {
  const cacheKey = typeof row?.cache_key === "string" ? row.cache_key.trim() : "";
  const productName = typeof row?.product_name === "string" ? row.product_name.trim() : "";
  const brand = typeof row?.brand === "string" ? row.brand.trim() : "";
  return [...new Set([
    cacheKey,
    ...normalizedSearchKeyVariants(productName),
    ...(brand && productName ? normalizedSearchKeyVariants(`${brand} ${productName}`) : []),
  ].filter(Boolean))];
}

function buildSearchPrewarmKeys(rows) {
  const keys = [];
  for (const row of rows || []) {
    const baseKeys = buildSearchPrewarmBaseKeys(row);
    for (const key of baseKeys) {
      keys.push(key);
      if (row.petType === "dog" || row.petType === "cat") {
        keys.push(`${key}__${row.petType}`);
      } else {
        keys.push(`${key}__dog`, `${key}__cat`);
      }
    }
  }
  return [...new Set(keys)];
}

function searchPrewarmSignature(row) {
  const cacheKey = typeof row?.cache_key === "string" ? row.cache_key.trim() : "";
  if (!cacheKey) return null;
  return `${cacheKey}__${row.petType === "dog" || row.petType === "cat" ? row.petType : "unknown"}`;
}

function markSearchPrewarmRowsForRetry(rows) {
  for (const row of rows || []) {
    const signature = searchPrewarmSignature(row);
    if (signature) searchPrewarmTimestamps.delete(signature);
  }
}

function filterRecentlyPrewarmedSearchRows(rows, now = Date.now()) {
  const filtered = [];
  const seen = new Set();
  for (const row of rows || []) {
    const signature = searchPrewarmSignature(row);
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);

    const lastWarmedAt = searchPrewarmTimestamps.get(signature);
    if (lastWarmedAt && now - lastWarmedAt < SEARCH_PREWARM_DEDUPE_TTL_MS) continue;

    searchPrewarmTimestamps.set(signature, now);
    filtered.push(row);
  }

  if (searchPrewarmTimestamps.size > 80) {
    for (const [signature, warmedAt] of searchPrewarmTimestamps.entries()) {
      if (now - warmedAt > SEARCH_PREWARM_DEDUPE_TTL_MS) {
        searchPrewarmTimestamps.delete(signature);
      }
    }
  }

  return filtered;
}

function prewarmSearchRows(rows) {
  const normalizedRows = (rows || [])
    .map((row) => normalizeSearchRow(row) || normalizeSearchPrewarmRow(row))
    .filter(Boolean);
  const prewarmRows = filterRecentlyPrewarmedSearchRows(normalizedRows);
  if (prewarmRows.length === 0) return;
  const remembered = rememberProductDataSnapshots(prewarmRows);
  const productDataPrewarmRows = prewarmRows.filter((row) => !buildSearchRowCatalogSnapshot(row, row.cache_key));
  void Promise.allSettled([
    productDataPrewarmRows.length > 0
      ? prefetchProductDataByCacheKeys(productDataPrewarmRows.map((row) => row.cache_key))
      : Promise.resolve(),
    prefetchAnalyses(buildSearchPrewarmKeys(prewarmRows)),
  ]).then((results) => {
    const rejected = results.filter((result) => result.status === "rejected");
    if (rejected.length > 0) {
      markSearchPrewarmRowsForRetry(prewarmRows);
      console.log("[SEARCH] Prewarm background task failed:", rejected[0].reason?.message || rejected[0].reason);
    } else if (remembered > 0 && productDataPrewarmRows.length === 0) {
      console.log(`[SEARCH] Seeded ${remembered} product-data rows from search snapshots`);
    }
  });
}

function buildCatalogSnapshot(validationResult, cacheKey) {
  if (!validationResult?.found) return null;
  const key = String(validationResult.productCacheKey || cacheKey || "").trim();
  const ingredients = cleanCatalogIngredients(validationResult.ingredients);
  if (!key || ingredients.length < 5) return null;

  return {
    found: true,
    productCacheKey: key,
    productName: validationResult.productName || null,
    brand: validationResult.brand || null,
    ingredients,
    ingredientText: ingredients.join(", "),
    ingredientCount: Number(validationResult.ingredientCount) || ingredients.length,
    nutritionalInfo: validationResult.nutritionalInfo || {},
    nutrientPanel: validationResult.nutrientPanel || null,
    hasPublishedNutrients: !!validationResult.hasPublishedNutrients,
    source: validationResult.source || "product_data",
    sourceUrl: validationResult.sourceUrl || null,
    imageUrl: validationResult.imageUrl || null,
  };
}

function buildSearchRowCatalogSnapshot(item, cacheKey) {
  if (!item || typeof item !== "object") return null;
  const key = String(item.productCacheKey || item.cache_key || cacheKey || "").trim();
  if (!key || normalizeCacheKey(key) !== normalizeCacheKey(cacheKey)) return null;

  return buildCatalogSnapshot({
    found: true,
    productCacheKey: key,
    productName: item.product_name || item.productName || null,
    brand: item.brand || null,
    ingredients: item.ingredients,
    ingredientText: item.ingredient_text || item.ingredientText || null,
    ingredientCount: item.ingredient_count || item.ingredientCount,
    nutritionalInfo: item.nutritional_info || item.nutritionalInfo || {},
    nutrientPanel: item.nutrient_panel || item.nutrientPanel || null,
    hasPublishedNutrients: item.has_published_nutrients || item.hasPublishedNutrients || false,
    source: item.source || "product_data",
    sourceUrl: item.source_url || item.sourceUrl || null,
    imageUrl: item.image_url || item.imageUrl || null,
  }, key);
}

function validationFromCatalogSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    found: true,
    productCacheKey: snapshot.productCacheKey,
    productName: snapshot.productName,
    brand: snapshot.brand,
    ingredients: snapshot.ingredients,
    ingredientText: snapshot.ingredientText,
    ingredientCount: snapshot.ingredientCount,
    nutritionalInfo: snapshot.nutritionalInfo,
    nutrientPanel: snapshot.nutrientPanel,
    hasPublishedNutrients: snapshot.hasPublishedNutrients,
    source: snapshot.source,
    sourceUrl: snapshot.sourceUrl,
    imageUrl: snapshot.imageUrl,
  };
}

// --- History Row ---

const HistoryRow = memo(function HistoryRow({ item, onPressItem, theme, index }) {
  // Stable handler so memo actually skips re-renders when only siblings change.
  const handlePress = useCallback(() => {
    Haptics.selectionAsync();
    onPressItem(item);
  }, [item, onPressItem]);
  return (
    <TouchableHighlight
      onPress={handlePress}
      underlayColor={theme.surface}
      style={styles.historyRow}
      accessibilityRole="button"
      accessibilityLabel={`${item.productName}, score ${item.overallScore}`}
    >
      <View style={styles.historyRowInner}>
        {item.productImageUrl ? (
          <Image
            source={{ uri: item.productImageUrl }}
            style={styles.historyThumb}
          />
        ) : item.photoUri ? (
          <Image
            source={{ uri: item.photoUri }}
            style={styles.historyThumb}
          />
        ) : (
          <LinearGradient
            colors={THUMB_GRADIENTS[index % THUMB_GRADIENTS.length]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.historyThumbPlaceholder}
          >
            <Camera size={16} color="#FFFFFF" strokeWidth={1.5} />
          </LinearGradient>
        )}
        <View style={styles.historyRowLeft}>
          <Text
            style={[styles.historyProductName, { color: theme.textPrimary }]}
            numberOfLines={1}
          >
            {item.productName}
          </Text>
          <Text style={[styles.historyTimeAgo, { color: theme.textTertiary }]}>
            {relativeDate(item.dateScanned)}
          </Text>
        </View>
        <View style={styles.historyRowRight}>
          {item.overallScore != null && item.overallScore > 0 ? (
            <MiniScoreRing score={item.overallScore} delay={index * 100} />
          ) : item.scanMode === "human_food" ? (
            <View
              style={[
                styles.safetyDot,
                { backgroundColor: safetyColor(item.safetyLevel) },
              ]}
            />
          ) : null}
          <ChevronRight size={14} color={theme.textTertiary} strokeWidth={2} />
        </View>
      </View>
    </TouchableHighlight>
  );
});

// --- Empty State ---

function EmptyState({ theme }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconCircle, { backgroundColor: theme.fill }]}>
        <ScanLine size={40} color={theme.textTertiary} strokeWidth={1.2} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>
        No scans yet
      </Text>
      <Text style={[styles.emptySubtext, { color: theme.textTertiary }]}>
        Tap the button above to scan{"\n"}your first pet food
      </Text>
    </View>
  );
}

// --- Home Screen ---

const BANNER_DISMISS_KEY = "@woof_banner_dismissed";
const BANNER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SEARCH_REQUEST_TIMEOUT_MS = 6000;
const SEARCH_TAP_VALIDATION_TIMEOUT_MS = 2500;
const SEARCH_TAP_PREWARM_AWAIT_MS = 1200;
const SEARCH_PREWARM_DEDUPE_TTL_MS = 60 * 1000;
const searchPrewarmTimestamps = new Map();

// LayoutAnimation needs an opt-in on Android; iOS works out-of-the-box.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HomeScreen({ navigation }) {
  const [history, setHistory] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showPetPicker, setShowPetPicker] = useState(false);
  const [showLegalConsent, setShowLegalConsent] = useState(false);
  const [legalDocument, setLegalDocument] = useState(null);
  const [legalConsentAccepted, setLegalConsentAccepted] = useState(false);
  const [pendingLegalAction, setPendingLegalAction] = useState(null);
  const [safetyPetType, setSafetyPetType] = useState("dog");
  const [safetyFoodText, setSafetyFoodText] = useState("");
  const [safetyFocused, setSafetyFocused] = useState(false);
  const theme = useTheme();
  const { profile, canScan, isPro, isGuest, remainingScans, canCheckHumanFood, remainingHumanFoodChecks } = useAuth();
  const { isOnline } = useNetwork();
  const searchTapInFlightRef = useRef(null);
  const searchTapReleaseTimerRef = useRef(null);
  const searchTapAbortRef = useRef(null);

  const clearSearchTapLock = useCallback(() => {
    searchTapAbortRef.current?.abort();
    searchTapAbortRef.current = null;
    searchTapInFlightRef.current = null;
    if (searchTapReleaseTimerRef.current) {
      clearTimeout(searchTapReleaseTimerRef.current);
      searchTapReleaseTimerRef.current = null;
    }
  }, []);

  const releaseSearchTap = useCallback((tapKey) => {
    if (!tapKey || searchTapInFlightRef.current === tapKey) {
      clearSearchTapLock();
    }
  }, [clearSearchTapLock]);

  useEffect(() => clearSearchTapLock, [clearSearchTapLock]);

  useEffect(() => {
    let cancelled = false;
    hasAcceptedLegalConsent().then((accepted) => {
      if (!cancelled) setLegalConsentAccepted(accepted);
    });
    return () => { cancelled = true; };
  }, []);

  const runWithLegalConsent = useCallback((action) => {
    if (legalConsentAccepted) {
      action();
      return;
    }
    setPendingLegalAction(() => action);
    setShowLegalConsent(true);
  }, [legalConsentAccepted]);

  const handleAcceptLegalConsent = useCallback(async () => {
    await acceptLegalConsent();
    setLegalConsentAccepted(true);
    setLegalDocument(null);
    setShowLegalConsent(false);
    const action = pendingLegalAction;
    setPendingLegalAction(null);
    if (typeof action === "function") action();
  }, [pendingLegalAction]);

  const handleDismissLegalConsent = useCallback(() => {
    setLegalDocument(null);
    setShowLegalConsent(false);
    setPendingLegalAction(null);
    clearSearchTapLock();
  }, [clearSearchTapLock]);

  // Check if upgrade banner should show (free users, 7-day cooldown)
  useEffect(() => {
    if (isPro) return;
    AsyncStorage.getItem(BANNER_DISMISS_KEY).then((val) => {
      if (!val) {
        setShowBanner(true);
        return;
      }
      const dismissedAt = parseInt(val, 10);
      if (Date.now() - dismissedAt > BANNER_COOLDOWN_MS) {
        setShowBanner(true);
      }
    });
  }, [isPro]);

  const dismissBanner = () => {
    setShowBanner(false);
    AsyncStorage.setItem(BANNER_DISMISS_KEY, String(Date.now()));
  };

  // Scan button press animation
  const scanScale = useSharedValue(1);
  const scanAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scanScale.value }],
  }));

  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyLoadSeqRef = useRef(0);
  const historyLoadAbortRef = useRef(null);
  const historyImageEnrichAbortRef = useRef(null);

  // Product search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchEmpty, setSearchEmpty] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [recentSearchError, setRecentSearchError] = useState(null);
  const searchTimerRef = useRef(null);
  const searchAbortRef = useRef(null);
  const searchSeqRef = useRef(0);
  const searchQueryRef = useRef("");
  const searchResultsRef = useRef([]);

  useEffect(() => {
    searchResultsRef.current = searchResults;
  }, [searchResults]);

  const handleSearch = useCallback((text) => {
    const trimmed = text.trim();
    searchQueryRef.current = text;
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    // Cancel any in-flight query so older results never overwrite newer ones.
    if (searchAbortRef.current) searchAbortRef.current.abort();

    if (trimmed.length < 2) {
      searchSeqRef.current += 1;
      setSearchResults([]);
      setSearchEmpty(false);
      setSearchError(null);
      setRecentSearchError(null);
      setSearchLoading(false);
      return;
    }

    if (!isOnline) {
      searchSeqRef.current += 1;
      setSearchResults([]);
      setSearchEmpty(false);
      setSearchError("You're offline. Connect to Wi-Fi or cellular data to search products.");
      setRecentSearchError(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setSearchEmpty(false);
    setSearchError(null);
    setRecentSearchError(null);
    setSearchResults([]);
    const seq = ++searchSeqRef.current;
    searchTimerRef.current = setTimeout(async () => {
      const ctl = new AbortController();
      let searchTimedOut = false;
      const searchTimeout = setTimeout(() => {
        searchTimedOut = true;
        ctl.abort();
      }, SEARCH_REQUEST_TIMEOUT_MS);
      searchAbortRef.current = ctl;
      try {
        // Smart fuzzy search via search_products RPC (migration 021).
        // Handles typos via pg_trgm similarity + exact-substring boost + brand match.
        const { data, error } = await supabase
          .rpc("search_products", { q: trimmed, max_results: 10 })
          .abortSignal(ctl.signal);

        // Drop stale responses (user typed again before this returned).
        if (seq !== searchSeqRef.current || searchQueryRef.current.trim() !== trimmed) return;

        if (error) {
          console.log("[SEARCH] RPC error:", error.message);
          reportNetworkError(error);
          setSearchResults([]);
          setSearchEmpty(false);
          setSearchError("Search is unavailable. Check your connection and try again.");
          return;
        }

        reportNetworkSuccess();
        const rows = (data || []).map(normalizeSearchRow).filter(Boolean);
        setSearchResults(rows);
        setSearchEmpty(rows.length === 0);
        setSearchError(null);
        // Pre-warm exact product rows and analysis cache so tap → results is instant.
        // Fire-and-forget; subsequent getCachedAnalysis() calls hit the warm cache.
        prewarmSearchRows(rows);
      } catch (err) {
        if (err.name === "AbortError" && !searchTimedOut) return;
        console.log("[SEARCH] Error:", err.message);
        reportNetworkError(searchTimedOut ? new Error("SEARCH_TIMEOUT") : err);
        if (seq === searchSeqRef.current && searchQueryRef.current.trim() === trimmed) {
          setSearchResults([]);
          setSearchEmpty(false);
          setSearchError("Search is unavailable. Check your connection and try again.");
        }
      } finally {
        clearTimeout(searchTimeout);
        if (searchAbortRef.current === ctl) searchAbortRef.current = null;
        if (seq === searchSeqRef.current) setSearchLoading(false);
      }
    }, 250);
  }, [isOnline]);

  const searchInputRef = useRef(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);

  const hydrateRecentSearches = useCallback(() => {
    getRecentSearches()
      .then(setRecentSearches)
      .catch((err) => console.log("[SEARCH] Failed to hydrate recent searches:", err.message));
  }, []);

  // Hydrate recent searches from disk once and again whenever Home regains focus.
  useEffect(() => {
    hydrateRecentSearches();
  }, [hydrateRecentSearches]);

  useEffect(() => {
    prewarmSearchRows(recentSearches);
  }, [recentSearches]);

  const recordRecentSearch = useCallback((item) => {
    const cacheKey = String(item.cache_key || item.cacheKey || "").trim();
    const productName = String(item.product_name || item.productName || "").trim();
    if (!cacheKey || !productName) return;
    const normalized = {
      product_name: productName,
      brand: typeof item.brand === "string" && item.brand.trim().length > 0 ? item.brand.trim() : null,
      cache_key: cacheKey,
      ingredient_count: Number(item.ingredient_count || item.ingredientCount) || null,
      image_url: item.image_url || item.imageUrl || null,
      petType: item.petType || null,
    };
    setRecentSearches((prev) => {
      const next = [
        normalized,
        ...prev.filter((p) => p.cache_key !== cacheKey),
      ].slice(0, 5);
      return next;
    });
    persistRecentSearch(normalized)
      .then(setRecentSearches)
      .catch((err) => console.log("[SEARCH] Failed to save recent search:", err.message));
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    clearStoredRecentSearches().catch((err) => console.log("[SEARCH] Failed to clear recent searches:", err.message));
  }, []);

  const clearSearch = useCallback(() => {
    clearSearchTapLock();
    searchSeqRef.current += 1;
    searchQueryRef.current = "";
    if (searchAbortRef.current) searchAbortRef.current.abort();
    searchAbortRef.current = null;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = null;
    setSearchQuery("");
    setSearchResults([]);
    setSearchEmpty(false);
    setSearchError(null);
    setRecentSearchError(null);
    setSearchLoading(false);
  }, [clearSearchTapLock]);

  const cancelSearch = useCallback(() => {
    clearSearch();
    setSearchFocused(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  }, [clearSearch]);

  const handleSearchResultPress = useCallback(async (item) => {
    // Snapshot the navigation params BEFORE clearing state so a later state
    // update never races the row-tap handler.
    const cacheKey = String(item.cache_key || "").trim() || normalizeCacheKey(item.brand ? `${item.brand} ${item.product_name}` : item.product_name);
    const productName = typeof item.product_name === "string" ? item.product_name.trim() : item.product_name;
    const brand = typeof item.brand === "string" && item.brand.trim().length > 0 ? item.brand.trim() : item.brand;
    const isRecent = item.fromRecent === true;
    const tapSearchSeq = searchSeqRef.current;
    const tapSearchQuery = searchQueryRef.current;
    const tapKey = cacheKey ? `${isRecent ? "recent" : "search"}:${cacheKey}` : null;

    if (searchTapInFlightRef.current) return;
    searchTapInFlightRef.current = tapKey;
    if (searchTapReleaseTimerRef.current) clearTimeout(searchTapReleaseTimerRef.current);
    searchTapReleaseTimerRef.current = setTimeout(() => releaseSearchTap(tapKey), 12000);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();

    setRecentSearchError(null);
    setSearchError(null);

    const handleRejectedValidation = (validationResult) => {
      if (!validationResult.found) {
        if (validationResult.reason === "lookup_error") {
          if (isRecent) {
            setRecentSearchError("Could not verify this recent product. Check your connection and try again.");
          } else {
            setSearchError("Could not verify this product. Check your connection and try again.");
          }
          return true;
        }

        if (isRecent) {
          setRecentSearches((prev) => prev.filter((entry) => entry.cache_key !== cacheKey));
          removeRecentSearch(cacheKey)
            .then(setRecentSearches)
            .catch((err) => console.log("[SEARCH] Failed to remove stale recent search:", err.message));
          setRecentSearchError(`${productName || "This product"} is no longer in the searchable database. Search or scan it again.`);
        } else {
          const nextSearchResults = searchResultsRef.current.filter((entry) => entry.cache_key !== cacheKey);
          searchResultsRef.current = nextSearchResults;
          setSearchResults(nextSearchResults);
          setSearchEmpty(nextSearchResults.length === 0);
          setSearchError(`${productName || "This product"} is no longer in the searchable database. Try another result or scan it.`);
        }
        return true;
      }
      return false;
    };

    const buildValidatedItem = (validationResult) => ({
      ...item,
      product_name: validationResult.productName || productName,
      brand: validationResult.brand || brand,
      ingredient_count: validationResult.ingredientCount,
      source: validationResult.source,
      image_url: validationResult.imageUrl || item.image_url,
    });

    runWithLegalConsent(() => {
      (async () => {
        try {
          if (!canScan()) {
            navigation.navigate("Paywall", { source: "scan_limit" });
            setTimeout(() => releaseSearchTap(tapKey), 600);
            return;
          }

          let catalogSnapshot = buildSearchRowCatalogSnapshot(item, cacheKey);
          let validation = validationFromCatalogSnapshot(catalogSnapshot);
          if (!validation) {
            const validationCtl = new AbortController();
            searchTapAbortRef.current = validationCtl;
            validation = await getProductDataByCacheKey(cacheKey, {
              timeoutMs: SEARCH_TAP_VALIDATION_TIMEOUT_MS,
              prewarmWaitMs: SEARCH_TAP_PREWARM_AWAIT_MS,
              signal: validationCtl.signal,
            });
            if (searchTapAbortRef.current === validationCtl) searchTapAbortRef.current = null;
            if (validationCtl.signal.aborted) {
              releaseSearchTap(tapKey);
              return;
            }
          }
          if (!isRecent && (tapSearchSeq !== searchSeqRef.current || tapSearchQuery !== searchQueryRef.current)) {
            releaseSearchTap(tapKey);
            return;
          }
          if (handleRejectedValidation(validation)) {
            releaseSearchTap(tapKey);
            return;
          }

          const validatedCacheKey = String(validation.productCacheKey || cacheKey).trim() || cacheKey;
          const finalItem = {
            ...buildValidatedItem(validation),
            cache_key: validatedCacheKey,
          };
          const finalPetType = finalItem.petType || inferSearchPetType(
            finalItem.product_name,
            finalItem.brand,
            productName,
            brand,
            validatedCacheKey,
            cacheKey,
          );
          if (finalPetType) finalItem.petType = finalPetType;

          trackEvent("search_result_tapped", {
            hasBrand: Boolean(finalItem.brand || brand),
            hasImage: Boolean(finalItem.image_url),
            ingredientCount: Number(finalItem.ingredient_count) || 0,
            source: finalItem.source || "unknown",
            petType: finalPetType || "unknown",
            cacheKeyHash: analyticsKeyHash(validatedCacheKey),
            analysisCacheKeyHash: finalPetType ? analyticsKeyHash(`${validatedCacheKey}__${finalPetType}`) : "",
          });
          catalogSnapshot = catalogSnapshot || buildCatalogSnapshot(validation, validatedCacheKey);
          try {
            analysisService.startAnalysis({
              mode: "search",
              productName: finalItem.product_name || productName,
              brand: finalItem.brand || brand,
              selectedCacheKey: validatedCacheKey,
              selectedProductData: catalogSnapshot,
              petType: finalPetType,
              isPro,
            });
          } catch (err) {
            console.log("[SEARCH] Background search analysis start failed:", err.message);
          }
          recordRecentSearch({ ...finalItem, cache_key: validatedCacheKey });
          clearSearch();
          setSearchFocused(false);
          navigation.navigate("Results", {
            mode: "search",
            productName: finalItem.product_name || productName,
            brand: finalItem.brand || brand,
            cacheKey: validatedCacheKey,
            catalogSnapshot,
            ...(finalPetType && { petType: finalPetType }),
          });
          setTimeout(() => releaseSearchTap(tapKey), 600);
        } catch (err) {
          console.log("[SEARCH] Tap handler error:", err.message);
          if (isRecent) {
            setRecentSearchError("Could not open this recent product. Try searching again.");
          } else {
            setSearchError("Could not open this product. Try again.");
          }
          releaseSearchTap(tapKey);
        }
      })();
    });
  }, [canScan, navigation, clearSearch, recordRecentSearch, runWithLegalConsent, releaseSearchTap, isPro]);

  const loadHistory = useCallback(async () => {
    historyLoadAbortRef.current?.abort();
    historyImageEnrichAbortRef.current?.abort();
    const seq = ++historyLoadSeqRef.current;
    const historyController = new AbortController();
    historyLoadAbortRef.current = historyController;
    historyImageEnrichAbortRef.current = null;
    setHistoryError(false);
    setHistoryLoading(true);

    try {
      // Add timeout to prevent infinite loading
      const timeoutMs = 8000;
      const timeout = setTimeout(() => {
        const err = new Error("HISTORY_TIMEOUT");
        err.name = "AbortError";
        historyController.abort(err);
      }, timeoutMs);

      const historyData = await getHistory({ signal: historyController.signal, enrichImages: false }).finally(() => {
        clearTimeout(timeout);
      });

      if (seq !== historyLoadSeqRef.current) return;
      setHistory(historyData);
      setHistoryError(false);

      if (historyData.some((item) => !item.productImageUrl && item.cacheKey) && typeof AbortController !== "undefined") {
        const enrichController = new AbortController();
        historyImageEnrichAbortRef.current = enrichController;
        enrichHistoryImages(historyData, { signal: enrichController.signal })
          .then((enrichedHistory) => {
            if (seq !== historyLoadSeqRef.current || historyImageEnrichAbortRef.current !== enrichController) return;
            setHistory(enrichedHistory);
          })
          .catch((err) => {
            if (err?.name !== "AbortError") {
              console.log("[HOME] History image enrichment failed:", err.message);
            }
          })
          .finally(() => {
            if (historyImageEnrichAbortRef.current === enrichController) {
              historyImageEnrichAbortRef.current = null;
            }
          });
      }
    } catch (err) {
      if (seq !== historyLoadSeqRef.current) return;
      console.log("[HOME] History load error:", err.message);
      reportNetworkError(err);
      setHistoryError(true);
      setHistory([]); // Clear stale data
    } finally {
      if (historyLoadAbortRef.current === historyController) {
        historyLoadAbortRef.current = null;
      }
      if (seq === historyLoadSeqRef.current) setHistoryLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      hydrateRecentSearches();
      loadHistory();
      return () => {
        historyLoadSeqRef.current += 1;
        historyLoadAbortRef.current?.abort();
        historyImageEnrichAbortRef.current?.abort();
        historyLoadAbortRef.current = null;
        historyImageEnrichAbortRef.current = null;
        setHistoryLoading(false);
      };
    }, [hydrateRecentSearches, loadHistory])
  );

  // Subscribe to background analysis completions for real-time history updates
  useEffect(() => {
    const unsub = analysisService.subscribe((event) => {
      if (event.type === "complete") {
        loadHistory();
      }
    });
    return unsub;
  }, [loadHistory]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory().finally(() => setRefreshing(false));
  }, [loadHistory]);

  const navInFlightRef = useRef(false);
  const handleScan = () => {
    // Prevent double-tap: if a navigation is already happening, drop subsequent taps.
    if (navInFlightRef.current) return;
    navInFlightRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    runWithLegalConsent(() => {
      if (!canScan()) {
        navigation.navigate("Paywall", { source: "scan_limit" });
      } else {
        navigation.navigate("Scanner");
      }
    });
    // Release the lock once navigation has had time to settle.
    setTimeout(() => { navInFlightRef.current = false; }, 600);
  };

  const closeSafetyModal = useCallback(() => {
    setShowPetPicker(false);
    setSafetyFoodText("");
    setSafetyFocused(false);
    Keyboard.dismiss();
  }, []);

  const handleSafetyTextSubmit = useCallback(() => {
    const text = safetyFoodText.trim();
    if (text.length < 2) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();
    runWithLegalConsent(() => {
      closeSafetyModal();
      // Human-food has its own daily quota — distinct from pet-food scan count.
      if (!canCheckHumanFood()) {
        navigation.navigate("Paywall", { source: "human_food_limit" });
        return;
      }
      try {
        analysisService.startAnalysis({
          mode: "human_food",
          foodName: text,
          petType: safetyPetType,
          isPro,
        });
      } catch (err) {
        console.log("[HUMAN_FOOD] Background text analysis start failed:", err.message);
      }
      navigation.navigate("Results", {
        mode: "human_food",
        foodName: text,
        petType: safetyPetType,
      });
    });
  }, [safetyFoodText, safetyPetType, canCheckHumanFood, navigation, closeSafetyModal, runWithLegalConsent, isPro]);

  const handleSafetyPhoto = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    runWithLegalConsent(() => {
      closeSafetyModal();
      if (!canCheckHumanFood()) {
        navigation.navigate("Paywall", { source: "human_food_limit" });
        return;
      }
      navigation.navigate("Scanner", { mode: "human_food", petType: safetyPetType });
    });
  }, [safetyPetType, canCheckHumanFood, navigation, closeSafetyModal, runWithLegalConsent]);

  // Stable across renders so memoized HistoryRow can actually skip work.
  const handleHistoryPress = useCallback((item) => {
    const cacheKey = String(item.cacheKey || "").trim();
    const cacheKeyPetType = cacheKey.endsWith("__dog")
      ? "dog"
      : cacheKey.endsWith("__cat")
        ? "cat"
        : null;
    const itemPetType = ["dog", "cat"].includes(item.petType) ? item.petType : cacheKeyPetType;
    navigation.navigate("Results", {
      mode: "history",
      cacheKey,
      ...(item.scanMode && { scanMode: item.scanMode }),
      ...(itemPetType && { petType: itemPetType }),
      ...(item.scanMode === "human_food" && {
        historyAnalysis: item.analysisPayload,
      }),
    });
  }, [navigation]);

  const handleClearHistory = () => {
    Alert.alert(
      "Clear all scan history?",
      "This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await clearHistory();
              setHistory([]);
              setHistoryError(false);
            } catch (err) {
              console.log("[HOME] Failed to clear history:", err.message);
              Alert.alert("Could Not Clear History", "Some scan history may still be saved. Please try again.");
              loadHistory();
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, history.length === 0 && styles.listContentEmpty]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.textTertiary}
          />
        }
      >
        <View style={styles.listHeader}>
          {/* Dev mode banner */}
          {__DEV__ && (
            <View style={[styles.devBanner, { backgroundColor: Colors.scoreExcellent + '15', borderColor: Colors.scoreExcellent + '40' }]}>
              <Text style={[styles.devText, { color: Colors.scoreExcellent }]}>
                DEV MODE • Unlimited scans
              </Text>
            </View>
          )}

          {/* Title + profile */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={{ flexDirection: "column", gap: 2 }}>
                <Text style={[styles.title, { color: theme.textPrimary }]}>Woof</Text>
                <Text style={[styles.titleSub, { color: theme.textTertiary }]}>For dogs &amp; cats</Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  navigation.navigate("Profile");
                }}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                accessibilityRole="button"
                accessibilityLabel="Profile"
              >
                <View style={[styles.profileButton, { backgroundColor: theme.surface }]}>
                  {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.profileAvatar} />
                  ) : (
                    <User size={16} color={theme.textSecondary} strokeWidth={2} />
                  )}
                </View>
              </Pressable>
            </View>
            <Text style={[styles.tagline, { color: theme.textTertiary }]}>
              Know what's in the bowl
            </Text>
          </View>

          {/* Scan button — card style */}
          <Pressable
            onPress={handleScan}
            onPressIn={() => {
              scanScale.value = withSpring(0.97, { damping: 15, stiffness: 150 });
            }}
            onPressOut={() => {
              scanScale.value = withSpring(1, { damping: 15, stiffness: 150 });
            }}
            accessibilityRole="button"
            accessibilityLabel="Scan a product"
          >
            <Animated.View
              style={[
                styles.scanCard,
                { backgroundColor: theme.isDark ? "#2C2C2E" : theme.buttonPrimary },
                Shadows.button,
                scanAnimStyle,
              ]}
            >
              <View style={styles.scanCardLeft}>
                <Text style={[styles.scanCardTitle, { color: "#FFFFFF" }]}>
                  Scan Pet Food
                </Text>
                <Text style={[styles.scanCardSub, { color: "rgba(255,255,255,0.7)" }]}>
                  {isPro
                    ? "Scan any pet food package"
                    : (() => {
                        const left = remainingScans();
                        if (left === Infinity) return "Scan any pet food package";
                        if (left <= 0) return "Tap to unlock unlimited scans";
                        if (left === 1) return "1 free scan left · then upgrade";
                        return `${left} free scans left`;
                      })()}
                </Text>
              </View>
              <View style={[styles.scanCardIcon, { backgroundColor: theme.isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.95)" }]}>
                <Camera size={20} color={theme.isDark ? "#FFFFFF" : theme.buttonPrimary} strokeWidth={2} />
              </View>
            </Animated.View>
          </Pressable>

          {/* Product search bar */}
          <View style={styles.searchBlock}>
            <View
              style={[
                styles.searchContainer,
                { backgroundColor: theme.card, borderColor: searchFocused ? theme.buttonPrimary : "transparent" },
                Shadows.card,
              ]}
            >
              <Search size={16} color={theme.textTertiary} strokeWidth={2} style={{ marginRight: 10 }} />
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, { color: theme.textPrimary }]}
                placeholder="Search by brand or product..."
                placeholderTextColor={theme.textTertiary}
                value={searchQuery}
                onChangeText={handleSearch}
                onFocus={() => setSearchFocused(true)}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {searchLoading ? (
                <ActivityIndicator size="small" color={theme.textTertiary} />
              ) : searchQuery.length > 0 ? (
                <Pressable
                  onPress={clearSearch}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.6, padding: 2 })}
                >
                  <X size={16} color={theme.textTertiary} strokeWidth={2.5} />
                </Pressable>
              ) : null}
            </View>
            {searchFocused && (
              <Pressable
                onPress={cancelSearch}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Cancel search"
                style={({ pressed }) => [styles.searchCancel, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Text style={[styles.searchCancelText, { color: theme.buttonPrimary }]}>Cancel</Text>
              </Pressable>
            )}
          </View>

          {/* Search results */}
          {!searchLoading && searchQuery.trim().length >= 2 && searchResults.length > 0 && (
            <View style={[styles.searchResults, { backgroundColor: theme.card }, Shadows.card]}>
              {searchResults.map((item, idx) => (
                <TouchableHighlight
                  key={(item.cache_key || item.product_name) + idx}
                  onPress={() => handleSearchResultPress(item)}
                  underlayColor={theme.surface}
                  style={[
                    styles.searchResultRow,
                    idx < searchResults.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.brand ? item.brand + " " : ""}${item.product_name}`}
                >
                  <View style={styles.searchResultRowInner}>
                    {item.image_url ? (
                      <Image
                        source={{ uri: item.image_url }}
                        style={[styles.searchResultThumb, { backgroundColor: theme.surface }]}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.searchResultThumbPlaceholder, { backgroundColor: theme.surface }]}>
                        <Camera size={16} color={theme.textTertiary} strokeWidth={1.5} />
                      </View>
                    )}
                    <View style={styles.searchResultContent}>
                      <Text style={[styles.searchResultName, { color: theme.textPrimary }]} numberOfLines={2}>
                        {item.product_name}
                      </Text>
                      <View style={styles.searchResultMetaRow}>
                        {item.brand ? (
                          <Text style={[styles.searchResultMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                            {item.brand}
                          </Text>
                        ) : null}
                        {item.brand ? <View style={[styles.searchMetaDot, { backgroundColor: theme.textTertiary }]} /> : null}
                        <Text style={[styles.searchResultMeta, { color: theme.textTertiary }]}>
                          {item.ingredient_count} ingredients
                        </Text>
                        {searchSourceLabel(item.source) ? (
                          <View style={[styles.searchVerifiedPill, { backgroundColor: theme.surface }]}>
                            <Text style={[styles.searchVerifiedText, { color: theme.textSecondary }]}>
                              {searchSourceLabel(item.source)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2} />
                  </View>
                </TouchableHighlight>
              ))}
            </View>
          )}

          {/* Search error */}
          {searchError && !searchLoading && searchQuery.trim().length >= 2 && (
            <View style={[styles.searchEmpty, { backgroundColor: theme.card }, Shadows.card]}>
              <Text style={[styles.searchEmptyTitle, { color: theme.textPrimary }]}>
                Couldn't search products
              </Text>
              <Text style={[styles.searchEmptyHint, { color: theme.textTertiary }]}>
                {searchError}
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleSearch(searchQuery);
                }}
                style={({ pressed }) => [
                  styles.searchRetryButton,
                  { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.85 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Retry product search"
              >
                <Text style={[styles.searchRetryText, { color: theme.buttonText }]}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Empty state — searched but nothing matched */}
          {searchEmpty && !searchError && !searchLoading && searchQuery.length >= 2 && (
            <View style={[styles.searchEmpty, { backgroundColor: theme.card }, Shadows.card]}>
              <Text style={[styles.searchEmptyTitle, { color: theme.textPrimary }]}>
                No matches for "{searchQuery}"
              </Text>
              <Text style={[styles.searchEmptyHint, { color: theme.textTertiary }]}>
                Try a different spelling, or scan the product to add it.
              </Text>
            </View>
          )}

          {/* Recent searches — show only when input is focused, empty, and we have history */}
          {searchFocused && searchQuery.length === 0 && recentSearches.length > 0 && (
            <View style={[styles.searchResults, { backgroundColor: theme.card }, Shadows.card]}>
              <View style={styles.recentsHeader}>
                <Text style={[styles.recentsHeaderText, { color: theme.textTertiary }]}>RECENT</Text>
                <Pressable onPress={clearRecentSearches} hitSlop={6}>
                  <Text style={[styles.recentsClearText, { color: theme.textTertiary }]}>Clear</Text>
                </Pressable>
              </View>
              {recentSearches.map((item, idx) => (
                <TouchableHighlight
                  key={(item.cache_key || item.product_name) + "_recent_" + idx}
                  onPress={() => handleSearchResultPress({ ...item, fromRecent: true })}
                  underlayColor={theme.surface}
                  style={[
                    styles.searchResultRow,
                    idx < recentSearches.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.divider },
                  ]}
                  accessibilityRole="button"
                >
                  <View style={styles.searchResultRowInner}>
                    {item.image_url ? (
                      <Image
                        source={{ uri: item.image_url }}
                        style={[styles.searchResultThumb, { backgroundColor: theme.surface }]}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.searchResultThumbPlaceholder, { backgroundColor: theme.surface }]}>
                        <Camera size={16} color={theme.textTertiary} strokeWidth={1.5} />
                      </View>
                    )}
                    <View style={styles.searchResultContent}>
                      <Text style={[styles.searchResultName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {item.product_name}
                      </Text>
                      {item.brand ? (
                        <Text style={[styles.searchResultMeta, { color: theme.textTertiary }]} numberOfLines={1}>
                          {item.brand}
                        </Text>
                      ) : null}
                    </View>
                    <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2} />
                  </View>
                </TouchableHighlight>
              ))}
            </View>
          )}

          {searchFocused && searchQuery.length === 0 && recentSearchError && (
            <View style={[styles.searchEmpty, { backgroundColor: theme.card }, Shadows.card]}>
              <Text style={[styles.searchEmptyTitle, { color: theme.textPrimary }]}>
                Recent search updated
              </Text>
              <Text style={[styles.searchEmptyHint, { color: theme.textTertiary }]}>
                {recentSearchError}
              </Text>
            </View>
          )}

          {/* Human food safety check — card style */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              runWithLegalConsent(() => {
                if (!canCheckHumanFood()) {
                  navigation.navigate("Paywall", { source: "human_food_limit" });
                  return;
                }
                setShowPetPicker(true);
              });
            }}
            accessibilityRole="button"
            accessibilityLabel="Check if human food is safe for your pet"
          >
            <View style={[styles.humanFoodCard, { backgroundColor: theme.card }, Shadows.card]}>
              <View style={styles.humanFoodCardLeft}>
                <Text style={[styles.humanFoodCardTitle, { color: theme.textPrimary }]}>
                  Is This Safe for My Pet?
                </Text>
                <Text style={[styles.humanFoodCardSub, { color: theme.textTertiary }]}>
                  Check any human food item
                </Text>
                <Text style={[styles.humanFoodCardDisclaimer, { color: theme.textTertiary }]}>
                  AI estimate, not veterinary advice
                </Text>
              </View>
              <Utensils size={20} color={theme.textSecondary} strokeWidth={1.8} />
            </View>
          </Pressable>

          {/* Upgrade banner (free users, 7-day cooldown) */}
          {showBanner && !isPro && (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                navigation.navigate("Paywall", { source: "home_banner" });
              }}
              style={({ pressed }) => [
                styles.upgradeCard,
                { backgroundColor: theme.card, opacity: pressed ? 0.8 : 1 },
                Shadows.card,
              ]}
            >
              <View style={styles.upgradeIconWrap}>
                <Shield size={18} color={Colors.scoreExcellent} strokeWidth={1.8} />
              </View>
              <View style={styles.upgradeCardLeft}>
                <Text style={[styles.upgradeCardTitle, { color: theme.textPrimary }]}>
                  Unlock Woof Pro
                </Text>
                <Text style={[styles.upgradeCardSub, { color: theme.textTertiary }]} numberOfLines={1}>
                  Full ingredient analysis · Unlimited scans
                </Text>
              </View>
              <ChevronRight size={16} color={theme.textTertiary} strokeWidth={2} />
            </Pressable>
          )}

          {/* Section header */}
          {history.length > 0 && (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Recent Scans
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  handleClearHistory();
                }}
                hitSlop={12}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Text style={[styles.seeAllText, { color: theme.textTertiary }]}>
                  Clear all
                </Text>
              </Pressable>
            </View>
          )}

          {/* History card */}
          {history.length > 0 && (
            <>
              <View style={[styles.historyCard, { backgroundColor: theme.card }, Shadows.card]}>
                {history.slice(0, showAllHistory ? history.length : 3).map((item, index, arr) => (
                  <View key={item.id}>
                    <HistoryRow
                      item={item}
                      theme={theme}
                      index={index}
                      onPressItem={handleHistoryPress}
                    />
                    {index < arr.length - 1 && (
                      <View style={[styles.rowDivider, { backgroundColor: theme.separator, marginLeft: 76 }]} />
                    )}
                  </View>
                ))}
              </View>
              {history.length > 3 && (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    // Smooth height + fade transition instead of an instant snap.
                    LayoutAnimation.configureNext({
                      duration: 220,
                      create: { type: "easeInEaseOut", property: "opacity" },
                      update: { type: "easeInEaseOut" },
                    });
                    setShowAllHistory((prev) => !prev);
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, alignSelf: "center", paddingVertical: 8 })}
                >
                  <Text style={{ color: theme.textTertiary, fontSize: 14, fontWeight: "500" }}>
                    {showAllHistory ? "Show less" : `Show all (${history.length})`}
                  </Text>
                </Pressable>
              )}
            </>
          )}

          {/* Empty/error state */}
          {historyError && (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>Couldn't load history</Text>
              <Text style={[styles.emptySubtext, { color: theme.textTertiary }]}>Check your connection and try again.</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  loadHistory();
                }}
                style={({ pressed }) => [
                  styles.historyRetryButton,
                  { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.historyRetryText, { color: theme.buttonText }]}>Retry</Text>
              </Pressable>
            </View>
          )}
          {!historyError && history.length === 0 && <EmptyState theme={theme} />}
        </View>
      </ScrollView>
      <Modal visible={showLegalConsent} transparent animationType="fade" onRequestClose={handleDismissLegalConsent}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.legalConsentCard, legalDocument && styles.legalDocumentCard, { backgroundColor: theme.card }]}>
            {legalDocument ? (
              <>
                <View style={styles.legalDocumentHeader}>
                  <Pressable
                    onPress={() => setLegalDocument(null)}
                    hitSlop={10}
                    style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
                  >
                    <Text style={[styles.legalDocumentBack, { color: theme.textPrimary }]}>Back</Text>
                  </Pressable>
                  <Text style={[styles.legalDocumentTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                    {legalDocument.title}
                  </Text>
                  <View style={{ width: 38 }} />
                </View>
                <WebView
                  source={{ html: legalDocument.html, baseUrl: "" }}
                  style={styles.legalDocumentWebView}
                  showsVerticalScrollIndicator={false}
                  javaScriptEnabled={false}
                  domStorageEnabled={false}
                  originWhitelist={["about:blank"]}
                  setSupportMultipleWindows={false}
                />
              </>
            ) : (
              <>
                <Text style={[styles.legalConsentTitle, { color: theme.textPrimary }]}>
                  Before your first check
                </Text>
                <Text style={[styles.legalConsentBody, { color: theme.textSecondary }]}>
                  Woof uses photos, search terms, and AI providers to analyze pet food and human-food safety. By continuing, you agree to the Terms and Privacy Policy.
                </Text>
                <View style={styles.legalConsentLinks}>
                  <Pressable
                    onPress={() => setLegalDocument({ title: "Terms", html: TERMS_HTML })}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
                  >
                    <Text style={[styles.legalConsentLink, { color: theme.textPrimary }]}>Terms</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setLegalDocument({ title: "Privacy Policy", html: PRIVACY_HTML })}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
                  >
                    <Text style={[styles.legalConsentLink, { color: theme.textPrimary }]}>Privacy Policy</Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={handleAcceptLegalConsent}
                  style={({ pressed }) => [
                    styles.legalConsentPrimary,
                    { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={[styles.legalConsentPrimaryText, { color: theme.buttonText }]}>
                    Agree and Continue
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleDismissLegalConsent}
                  style={({ pressed }) => [styles.legalConsentSecondary, { opacity: pressed ? 0.55 : 1 }]}
                >
                  <Text style={[styles.legalConsentSecondaryText, { color: theme.textTertiary }]}>
                    Not now
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal visible={showPetPicker} transparent animationType="fade" onRequestClose={() => setShowPetPicker(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => { setShowPetPicker(false); setSafetyPetType("dog"); setSafetyFoodText(""); }}>
          <View style={[styles.safetyCard, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.safetyTitle, { color: theme.textPrimary }]}>
              Can my pet eat that?
            </Text>
            <Text style={[styles.safetySub, { color: theme.textSecondary }]}>
              Pick your pet, then type the food or snap a photo.
            </Text>
            <Text style={[styles.safetyDisclaimer, { color: theme.textTertiary }]}>
              AI estimate, not veterinary advice. If your pet ate something concerning, contact your vet or pet poison control.
            </Text>
            {!isPro && (
              <Text style={[styles.safetyQuotaNote, { color: remainingHumanFoodChecks() === 0 ? Colors.scoreConcerning : theme.textTertiary }]}>
                {remainingHumanFoodChecks() === 0
                  ? isGuest
                    ? "You've used your free guest safety check. Try again later, sign in, or upgrade for unlimited."
                    : "You've used today's free safety check. Resets tomorrow UTC — or upgrade for unlimited."
                  : isGuest
                    ? "1 free guest safety check. Sign in for a daily check, or upgrade for unlimited."
                    : "1 free safety check per UTC day on the free plan."}
              </Text>
            )}

            {/* Pet segmented control */}
            <View style={[styles.safetySegment, { backgroundColor: theme.surface }]}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setSafetyPetType("dog"); }}
                style={[
                  styles.safetySegmentOption,
                  safetyPetType === "dog" && { backgroundColor: theme.card, ...Shadows.card },
                ]}
              >
                <Dog size={18} color={theme.textPrimary} strokeWidth={2} />
                <Text style={[styles.safetySegmentLabel, { color: theme.textPrimary, fontWeight: safetyPetType === "dog" ? "700" : "500" }]}>Dog</Text>
              </Pressable>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setSafetyPetType("cat"); }}
                style={[
                  styles.safetySegmentOption,
                  safetyPetType === "cat" && { backgroundColor: theme.card, ...Shadows.card },
                ]}
              >
                <Cat size={18} color={theme.textPrimary} strokeWidth={2} />
                <Text style={[styles.safetySegmentLabel, { color: theme.textPrimary, fontWeight: safetyPetType === "cat" ? "700" : "500" }]}>Cat</Text>
              </Pressable>
            </View>

            {/* Text entry */}
            <View style={[styles.safetyInputWrap, { backgroundColor: theme.surface, borderColor: safetyFocused ? theme.buttonPrimary : "transparent" }]}>
              <Search size={16} color={theme.textTertiary} strokeWidth={2} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.safetyInput, { color: theme.textPrimary }]}
                placeholder="e.g. avocado, grapes, cheese…"
                placeholderTextColor={theme.textTertiary}
                value={safetyFoodText}
                onChangeText={setSafetyFoodText}
                onFocus={() => setSafetyFocused(true)}
                onBlur={() => setSafetyFocused(false)}
                onSubmitEditing={() => {
                  if (safetyFoodText.trim().length >= 2) handleSafetyTextSubmit();
                }}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            {/* Primary submit (text path) */}
            <Pressable
              onPress={handleSafetyTextSubmit}
              disabled={safetyFoodText.trim().length < 2}
              style={({ pressed }) => [
                styles.safetyPrimary,
                {
                  backgroundColor: theme.buttonPrimary,
                  opacity: safetyFoodText.trim().length < 2 ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.safetyPrimaryLabel, { color: theme.buttonText }]}>Check</Text>
            </Pressable>

            {/* OR divider */}
            <View style={styles.safetyDividerRow}>
              <View style={[styles.safetyDividerLine, { backgroundColor: theme.divider }]} />
              <Text style={[styles.safetyDividerText, { color: theme.textTertiary }]}>OR</Text>
              <View style={[styles.safetyDividerLine, { backgroundColor: theme.divider }]} />
            </View>

            {/* Photo path */}
            <Pressable
              onPress={handleSafetyPhoto}
              style={({ pressed }) => [
                styles.safetySecondary,
                { backgroundColor: pressed ? theme.surface : "transparent", borderColor: theme.divider },
              ]}
            >
              <Camera size={18} color={theme.textPrimary} strokeWidth={2} />
              <Text style={[styles.safetySecondaryLabel, { color: theme.textPrimary }]}>Snap a photo instead</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listHeader: {
    paddingHorizontal: Spacing.screenPadding,
  },

  // Header
  header: {
    paddingTop: 20,
    paddingBottom: 28,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  titleSub: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tagline: {
    fontSize: 15,
    fontWeight: "400",
    marginTop: 8,
  },

  // Search bar
  searchBlock: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Spacing.cardRadius,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "400",
    padding: 0,
  },
  searchCancel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchCancelText: {
    fontSize: 15,
    fontWeight: "500",
  },
  searchResults: {
    borderRadius: Spacing.cardRadius,
    marginTop: 8,
    overflow: "hidden",
  },
  searchResultRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 60,
    justifyContent: "center",
  },
  searchResultRowInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchResultThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 12,
  },
  searchResultThumbPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  recentsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  recentsHeaderText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  recentsClearText: {
    fontSize: 12,
    fontWeight: "500",
  },
  searchResultContent: {
    flex: 1,
    minWidth: 0,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 3,
  },
  searchResultMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  searchResultMeta: {
    fontSize: 12,
    fontWeight: "400",
  },
  searchMetaDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    marginHorizontal: 6,
    opacity: 0.6,
  },
  searchVerifiedPill: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  searchVerifiedText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  searchEmpty: {
    marginTop: 8,
    borderRadius: Spacing.cardRadius,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  searchEmptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  searchEmptyHint: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 17,
  },
  searchRetryButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  searchRetryText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Scan card
  scanCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    paddingVertical: 20,
    paddingLeft: 22,
    paddingRight: 18,
  },
  scanCardLeft: {
    flex: 1,
  },
  scanCardTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 3,
  },
  scanCardSub: {
    fontSize: 13,
    fontWeight: "400",
    opacity: 0.7,
  },
  scanCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 16,
  },

  // Human food card
  humanFoodCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    paddingVertical: 18,
    paddingLeft: 22,
    paddingRight: 18,
    marginTop: 12,
    borderWidth: 0,
  },
  humanFoodCardLeft: {
    flex: 1,
  },
  humanFoodCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 3,
  },
  humanFoodCardSub: {
    fontSize: 13,
    fontWeight: "400",
  },
  humanFoodCardDisclaimer: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
    marginTop: 4,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 40,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: "400",
  },

  // History card
  historyCard: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
  },

  // History rows
  historyRow: {
    paddingHorizontal: 16,
  },
  historyRowInner: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.rowHeight,
  },
  historyThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 12,
  },
  historyThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  historyRowLeft: {
    flex: 1,
    marginRight: 16,
    justifyContent: "center",
  },
  historyProductName: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 21,
    marginBottom: 2,
  },
  historyTimeAgo: {
    fontSize: 12,
  },
  historyRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowDivider: {
    height: 0.5,
    marginLeft: Spacing.dividerIndent,
  },

  // Mini score ring
  ringLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ringScore: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Upgrade card
  upgradeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginTop: 16,
  },
  upgradeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(48,209,88,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeCardLeft: {
    flex: 1,
  },
  upgradeCardTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  upgradeCardSub: {
    fontSize: 12,
    fontWeight: "400",
  },

  // Dev banner
  devBanner: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  devText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingTop: 40,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
    textAlign: "center",
  },
  historyRetryButton: {
    marginTop: 18,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  historyRetryText: {
    fontSize: 15,
    fontWeight: "600",
  },

  // Safety dot for human food entries
  safetyDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  // Pet picker modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  legalConsentCard: {
    width: "88%",
    maxWidth: 380,
    borderRadius: 18,
    padding: 22,
    shadowColor: "#3C3C43",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 12,
  },
  legalDocumentCard: {
    height: "78%",
    maxHeight: 620,
    padding: 14,
  },
  legalDocumentHeader: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  legalDocumentBack: {
    fontSize: 14,
    fontWeight: "700",
  },
  legalDocumentTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
  legalDocumentWebView: {
    flex: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  legalConsentTitle: {
    fontSize: 21,
    fontWeight: "700",
    marginBottom: 8,
  },
  legalConsentBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  legalConsentLinks: {
    flexDirection: "row",
    gap: 18,
    marginBottom: 18,
  },
  legalConsentLink: {
    fontSize: 14,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  legalConsentPrimary: {
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  legalConsentPrimaryText: {
    fontSize: 16,
    fontWeight: "700",
  },
  legalConsentSecondary: {
    alignItems: "center",
    paddingTop: 14,
  },
  legalConsentSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
  },
  safetyCard: {
    width: "88%",
    maxWidth: 380,
    borderRadius: 24,
    padding: 24,
    shadowColor: "#3C3C43",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 12,
  },
  safetyTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.02,
    marginBottom: 6,
  },
  safetySub: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    marginBottom: 6,
  },
  safetyDisclaimer: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
    marginBottom: 8,
  },
  safetyQuotaNote: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
    marginBottom: 16,
  },
  safetySegment: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    marginBottom: 16,
    gap: 4,
  },
  safetySegmentOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 9,
  },
  safetySegmentLabel: {
    fontSize: 14,
  },
  safetyInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  safetyInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    padding: 0,
  },
  safetyPrimary: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  safetyPrimaryLabel: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.01,
  },
  safetyDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 16,
  },
  safetyDividerLine: {
    flex: 1,
    height: 1,
  },
  safetyDividerText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
  safetySecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
  },
  safetySecondaryLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});
