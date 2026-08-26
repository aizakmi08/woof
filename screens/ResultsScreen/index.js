import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Image,
  Pressable,
  TouchableOpacity,
  Share,
  Platform,
  Alert,
} from "react-native";
import { AppText as Text } from "../../components/AppText";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeInUp,
  useReducedMotion,
} from "react-native-reanimated";
import { ChevronLeft, Share2, Utensils, X, AlertTriangle, CheckCircle2, AlertCircle, ShieldCheck, Calendar, PawPrint } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { getCachedAnalysis } from "../../services/cache";
import * as analysisService from "../../services/analysisService";
import { getHistoryResultSnapshot } from "../../services/history";
import {
  catalogProductToVerifiedProduct,
  findVerifiedCatalogProductByBarcode,
  findVerifiedCatalogProductForLookup,
  getCatalogProduct,
} from "../../services/productCatalog";
import { buildVerifiedPetFoodAnalysis } from "../../services/verifiedScoring";
import { useAuth } from "../../services/auth";
import { trackEvent } from "../../services/analytics";
import { submitCatalogIngredientCapture } from "../../services/catalogCoverage";
import { requestCatalogEvidenceConsent } from "../../services/catalogEvidenceConsent";
import { savePendingCatalogContribution } from "../../services/catalogContributions";
import { createLogger } from "../../services/logger";
import { WOOF_SHARE_URL } from "../../config/env";
import { BRAND_NAME } from "../../config/brand";
import {
  hasSeenGuestSavePrompt,
  markGuestSavePromptSeen,
} from "../../services/guestSavePrompt";
import {
  hasSeenFirstScanToast,
  hasSeenPostScanPrompt,
  markFirstScanToastSeen,
  markPostScanPromptSeen,
} from "../../services/resultPromptState";
import { getScoreConfig, Colors, Spacing, Shadows } from "../../theme";
import {
  StreamSection,
  StreamingText,
  StreamingDots,
  CircularScore,
  QuickStatsGrid,
  VerdictCard,
  SkeletonBar,
  SkeletonCircle,
  CategoryBar,
  NutritionFacts,
  ScanAnotherButton,
  ShareCard,
  IngredientsSection,
  NutriscoreBadge,
  NovaGroupBadge,
  LoadingSkeleton,
  ErrorState,
  IngredientSheet,
  getHeroGrade,
  ScanLimitBanner,
  ProGateOverlay,
  PostScanPrompt,
  GuestSavePrompt,
  FirstScanToast,
  SafetyBadge,
  ReviewPrompt,
} from "./components";
import { useStyles } from "./styles";
import {
  acknowledgeReviewComplete,
  dismissReviewPrompt,
  markReviewPromptVisible,
  maybeShowReviewPrompt,
  openStoreReview,
} from "../../services/reviewPrompt";
import {
  normalizePetProfile,
  personalizePetSafety,
} from "../../services/petProfile";
import {
  logCaptureToResult,
  navigationTimingParams,
} from "../../services/performanceTimings";

const logger = createLogger("RESULTS");
// Longer than the Edge Function timeout so server-side scan reversal can sync
// back before the UI shows a local timeout.
const RESULT_ANALYSIS_TIMEOUT_MS = 60000;
const LOADING_MESSAGE_INTERVAL_MS = 1_800;
const SLOW_LOADING_THRESHOLD_MS = 12_000;

function shareUrlHost(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function shareUrlDisplay(value) {
  if (!value) return "";
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function titleCaseStatus(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

const DISPLAY_VALUE_LABELS = {
  ai: "AI-assisted",
  verified: "Verified catalog",
  catalog: "Verified catalog",
  manufacturer: "Manufacturer",
  manufacturer_current_exact: "Current manufacturer formula",
  retailer_web_version: "Exact retailer package version",
  web_label_version: "Exact package-label version",
  ready: "Verified",
  verified_ready: "Verified",
  verified_ingredients: "Verified ingredients",
  user_submission: "User submission",
  pending_review: "Pending review",
};

function displayValueLabel(value, fallback = "") {
  const key = String(value || "").trim().toLowerCase();
  return DISPLAY_VALUE_LABELS[key] || (key ? titleCaseStatus(key) : fallback);
}

function dateDisplay(value) {
  if (!value) return "Not dated";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not dated";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shareResultProperties(result = {}) {
  const action = typeof result?.action === "string" ? result.action : null;
  const activityType = typeof result?.activityType === "string"
    ? result.activityType.slice(0, 120)
    : null;

  return {
    share_action: action,
    share_activity_type: activityType,
  };
}

function shareWasDismissed(result = {}) {
  return result?.action === Share.dismissedAction;
}

function hasMeaningfulAnalysisResult(result) {
  if (!result || typeof result !== "object") return false;
  return Boolean(
    result.productName
    || result.foodName
    || result.overallScore != null
    || result.safetyLevel
  );
}

function scanFailureCategory({ errorCode, errorStatus, message } = {}) {
  const code = String(errorCode || "").toUpperCase();
  const text = String(message || "").toLowerCase();

  if (code === "SCAN_LIMIT_REACHED" || errorStatus === 402) return "scan_limit";
  if (code === "ANALYSIS_IMAGE_RETRY_SUPPRESSED") return "upload_retry_suppressed";
  if (code === "ANALYSIS_TIMEOUT" || text.includes("too long") || text.includes("timeout")) return "timeout";
  if (errorStatus === 401 || errorStatus === 403 || text.includes("session expired") || text.includes("not authenticated")) return "auth";
  if (errorStatus === 413 || text.includes("too large")) return "payload_size";
  if (errorStatus === 429 || text.includes("rate limit")) return "rate_limit";
  if (errorStatus >= 500) return "backend";
  if (code === "ANALYSIS_RESULT_ERROR" || code === "EMPTY_ANALYSIS_RESULT" || text.includes("missing") || text.includes("invalid") || text.includes("parse")) return "ai_validation";
  if (text.includes("network") || text.includes("fetch") || text.includes("offline")) return "network";
  return "unknown";
}

function scanFailureProperties({ mode, scan_mode: scanMode, event = {}, extra = {} }) {
  const errorStatus = Number.isFinite(event.errorStatus) ? event.errorStatus : null;
  const errorCode = event.errorCode || null;
  const message = event.error || null;

  return {
    mode,
    scan_mode: scanMode,
    scan_id: event.scanId || event.scanUsage?.scan_id || null,
    message,
    error_code: errorCode,
    http_status: errorStatus,
    failure_category: scanFailureCategory({ errorCode, errorStatus, message }),
    scan_usage_reason: event.scanUsage?.reason || null,
    scan_usage_reversed: event.scanUsage?.reversed ?? null,
    ...extra,
  };
}

function scanIdFromAnalysis(key) {
  if (!key) return null;
  return analysisService.getAnalysis(key)?.scanId || null;
}

function compactUrl(value) {
  const text = String(value || "").trim();
  if (!text || /^data:/i.test(text)) return null;
  return text;
}

function productImageUri({ result, opffData, uri }) {
  return (
    compactUrl(opffData?.imageUrl) ||
    compactUrl(opffData?.image_url) ||
    compactUrl(opffData?.image_front_url) ||
    compactUrl(result?.imageUrl) ||
    compactUrl(result?.productImageUrl) ||
    compactUrl(uri)
  );
}

function productVariantSummary(result = {}, productName = "") {
  const product = result || {};
  const normalizedName = String(productName || "").toLowerCase();
  const seen = new Set();
  const rawPackageSizes = [
    ...(Array.isArray(product.availablePackageSizes) ? product.availablePackageSizes : []),
    product.packageSize,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const packageSizes = rawPackageSizes.flatMap((value) => {
    if (!value.includes(",")) return [value];
    const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
    return parts.length > 1 && parts.every((part) => (
      /^\d+(?:\.\d+)?(?:\s*(?:lb|lbs|oz|kg|g|ct|count))?$/i.test(part)
    )) ? parts : [value];
  }).filter((value, index, values) => (
    values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index
  ));
  const packageSize = packageSizes.length > 1 ? "Multiple sizes" : packageSizes[0];

  return [
    product.productLine,
    product.flavor,
    product.lifeStage,
    product.foodForm,
    packageSize,
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => value && value.toLowerCase() !== "other")
    .filter((value) => !normalizedName.includes(value.toLowerCase()))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((value) => (
      value === "Multiple sizes"
        ? value
        : value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    ))
    .join(" • ");
}

export default function ResultsScreen({ route, navigation }) {
  const {
    mode,
    barcode,
    base64,
    uri,
    cacheKey,
    petType: routePetType,
    petName: routePetName,
    scanMode,
    catalogProduct,
    acquisitionQuery,
    candidateProduct,
    labelIdentification,
    sourceSurface,
    catalogEvidenceConsent,
    historyEntryId,
    historyProductName,
    historyResultSnapshot,
    captureStartedAt,
    captureTimingMode,
    devFixtureResult,
    devFixtureError,
    devFixtureLoadingStatus,
    devFixtureHoldStreaming,
    devFixtureIsPro,
    devPetProfile,
    devPrompt,
  } = route.params;
  const isHumanFood = mode === "human_food" || scanMode === "human_food";
  const isIngredientCapture = mode === "ingredient_capture";
  const petType = routePetType; // May also come from result.petType for history
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Analyzing product...");
  const [dataSource, setDataSource] = useState("ai");
  const [opffData, setOpffData] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [scanCounted, setScanCounted] = useState(false);
  const [scanUsage, setScanUsage] = useState(null);
  const [scanLimitReached, setScanLimitReached] = useState(false);
  const [ingredientSubmission, setIngredientSubmission] = useState({ status: "idle", reason: null });
  const reusableResultKey = mode === "barcode"
    ? barcode
    : mode === "catalog" ? catalogProduct?.cacheKey : null;
  const [analysisPreflightState, setAnalysisPreflightState] = useState(
    reusableResultKey ? "checking" : "ready"
  );
  const displayProductName = String(opffData?.productName || result?.productName || "").trim();
  const displayResult = result && displayProductName
    ? { ...result, productName: displayProductName }
    : result;
  const variantSummary = productVariantSummary(result, displayProductName);
  const { styles, theme } = useStyles();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const {
    isPro: authenticatedIsPro,
    isAnonymous,
    user,
    incrementScanCount,
    canScan,
    remainingScans,
    refreshProStatus,
    signInWithApple,
    signInWithGoogle,
    profile,
  } = useAuth();
  const isPro = authenticatedIsPro || (__DEV__ && devFixtureIsPro === true);
  const isDevFixture = __DEV__ && Boolean(
    devFixtureResult || devFixtureError || devFixtureLoadingStatus || devFixtureHoldStreaming
  );

  // Reanimated scroll
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Sticky header: mini badge + name fade in as product name scrolls out
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [200, 260], [0, 1], Extrapolation.CLAMP),
  }));

  const headerBorderStyle = useAnimatedStyle(() => ({
    borderBottomWidth: interpolate(scrollY.value, [200, 260], [0, 0.5], Extrapolation.CLAMP),
    borderBottomColor: theme.separator,
  }));

  const miniBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(scrollY.value, [200, 260], [0, 1], Extrapolation.CLAMP) }],
  }));

  // Guard against React strict mode double-firing the analysis effect
  const analysisStartedRef = useRef(false);
  const timerRef = useRef({ start: 0 });
  const redirectTimerRef = useRef(null);
  const scanLimitRecoveryRef = useRef(false);
  const ingredientSubmissionRef = useRef(false);

  // Throttled setState from service events
  const throttleRef = useRef({ lastTime: 0, timer: null });
  const throttledSetResult = useCallback((partial) => {
    const ref = throttleRef.current;
    const now = Date.now();
    const elapsed = now - ref.lastTime;

    if (elapsed >= 100) {
      ref.lastTime = now;
      setResult({ ...partial });
    } else {
      if (ref.timer) clearTimeout(ref.timer);
      ref.timer = setTimeout(() => {
        ref.lastTime = Date.now();
        setResult({ ...partial });
      }, 100 - elapsed);
    }
  }, []);

  // Track the service cacheKey so we can match events
  const serviceKeyRef = useRef(null);
  const cancelRequestedRef = useRef(false);
  const reviewPromptCheckedRef = useRef(false);

  const cancelRunningAnalysis = useCallback((source) => {
    if (mode === "history" || done || cancelRequestedRef.current) return;

    const key = serviceKeyRef.current;
    const cancelled = analysisService.cancelAnalysis(key, source);
    if (!cancelled) return;

    cancelRequestedRef.current = true;
    trackEvent("scan_analysis_cancelled", {
      mode,
      scan_mode: isHumanFood ? "human_food" : mode,
      scan_id: scanIdFromAnalysis(key),
      source,
    });
  }, [mode, done, isHumanFood]);

  const retryAfterEntitlementRefresh = useCallback(async () => {
    if (scanLimitRecoveryRef.current || mode === "history") return false;
    scanLimitRecoveryRef.current = true;

    setLoadingStatus("Refreshing Pro access...");
    setStreaming(true);
    setDone(false);
    setError(null);
    setScanLimitReached(false);
    setScanUsage(null);

    trackEvent("scan_limit_recovery_started", {
      mode,
      scan_mode: isHumanFood ? "human_food" : mode,
    });

    const pro = await refreshProStatus({ source: "scan_limit_recovery" });
    if (!pro) {
      trackEvent("scan_limit_recovery_not_pro", {
        mode,
        scan_mode: isHumanFood ? "human_food" : mode,
      });
      return false;
    }

    const key = analysisService.startAnalysis({ mode, base64, barcode, uri, petType, catalogProduct });
    if (!key) {
      trackEvent("scan_limit_recovery_retry_unavailable", {
        mode,
        scan_mode: isHumanFood ? "human_food" : mode,
      });
      return false;
    }

    timerRef.current.start = Date.now();
    serviceKeyRef.current = key;
    const retryScanId = scanIdFromAnalysis(key);
    setResult(null);
    trackEvent("scan_limit_recovery_retried", {
      mode,
      scan_mode: isHumanFood ? "human_food" : mode,
      scan_id: retryScanId,
    });
    trackEvent("scan_analysis_started", {
      mode,
      scan_mode: isHumanFood ? "human_food" : mode,
      pet_type: petType,
      has_barcode: !!barcode,
      has_photo: !!base64,
      scan_id: retryScanId,
      recovery_retry: true,
    });
    return true;
  }, [mode, isHumanFood, refreshProStatus, base64, barcode, uri, petType, catalogProduct]);

  useEffect(() => {
    if (analysisPreflightState !== "checking" || !reusableResultKey) return;
    let active = true;
    analysisService.getLocalResult(reusableResultKey).then((saved) => {
      if (!active) return;
      if (!hasMeaningfulAnalysisResult(saved?.analysis)) {
        setAnalysisPreflightState("ready");
        return;
      }
      Alert.alert(
        "You scanned this before",
        "View the saved result for free, or scan it again to refresh the analysis.",
        [
          {
            text: "View Saved Result",
            onPress: () => {
              setResult(saved.analysis);
              setDataSource(saved.dataSource || "verified");
              if (saved.opffData) setOpffData(saved.opffData);
              setFromCache(true);
              setScanCounted(true);
              setStreaming(false);
              setDone(true);
              setAnalysisPreflightState("viewed");
              trackEvent("saved_result_viewed_before_rescan", {
                mode,
                scan_mode: mode,
              });
            },
          },
          {
            text: "Scan Again",
            onPress: () => setAnalysisPreflightState("ready"),
          },
        ],
        { cancelable: false }
      );
    }).catch(() => {
      if (active) setAnalysisPreflightState("ready");
    });
    return () => {
      active = false;
    };
  }, [analysisPreflightState, mode, reusableResultKey]);

  useEffect(() => {
    if (analysisPreflightState !== "ready") return;
    if (analysisStartedRef.current) return;
    analysisStartedRef.current = true;
    timerRef.current.start = Date.now();

    if (__DEV__ && devFixtureLoadingStatus) {
      setLoadingStatus(devFixtureLoadingStatus);
      setStreaming(true);
      setResult(null);
      return;
    }

    if (__DEV__ && devFixtureError) {
      setError(devFixtureError);
      setStreaming(false);
      setDone(true);
      return;
    }

    if (__DEV__ && devFixtureResult) {
      setResult(devFixtureResult);
      setDataSource("verified");
      setStreaming(devFixtureHoldStreaming === true);
      setDone(devFixtureHoldStreaming !== true);
      return;
    }

    // History mode: simple cache lookup, no background service needed
    if (mode === "history") {
      trackEvent("history_result_requested", {
        mode,
        scan_mode: isHumanFood ? "human_food" : mode,
        pet_type: petType,
        has_barcode: !!barcode,
        has_photo: !!base64,
      });
      setLoadingStatus("Loading cached result...");

      // Check if there's a running analysis for this cacheKey
      const active = analysisService.getAnalysis(cacheKey);
      if (active && active.status === "running") {
        // Attach to live analysis
        serviceKeyRef.current = cacheKey;
        if (active.result) {
          setResult({ ...active.result });
          setStreaming(true);
        } else {
          setResult({});
          setStreaming(true);
        }
        if (active.opffData) setOpffData(active.opffData);
        setDataSource(active.dataSource);
        return;
      }

      if (active && active.status === "complete") {
        if (!hasMeaningfulAnalysisResult(active.result)) {
          setResult(null);
          setError("Analysis finished without a usable result. Please try again.");
          setDone(true);
          return;
        }
        setResult(active.result);
        setDataSource(active.dataSource);
        if (active.opffData) setOpffData(active.opffData);
        setFromCache(true);
        setDone(true);
        return;
      }

      // Layer 2: AsyncStorage (instant, offline-capable)
      // Layer 3: user-owned history snapshot or verified catalog rebuild
      // Layer 4: Supabase cache (network, shared)
      (async () => {
        try {
          const applyHistoryResult = ({ analysis, source, nextDataSource = "ai", nextOpffData = null }) => {
            if (!analysis || typeof analysis !== "object" || !(analysis.productName || analysis.foodName)) {
              return false;
            }
            setResult(analysis);
            setDataSource(nextDataSource);
            if (nextOpffData) setOpffData(nextOpffData);
            setFromCache(true);
            setDone(true);
            trackEvent("history_result_loaded", {
              source,
              scan_mode: scanMode || mode,
            });
            return true;
          };

          // Try local result first
          const local = await analysisService.getLocalResult(cacheKey);
          if (local?.analysis) {
            if (applyHistoryResult({
              analysis: local.analysis,
              source: "local",
              nextDataSource: local.dataSource || "ai",
              nextOpffData: local.opffData || null,
            })) return;
          }

          if (isHumanFood && applyHistoryResult({
            analysis: historyResultSnapshot,
            source: "local_history_snapshot",
            nextDataSource: "ai",
          })) {
            return;
          }

          if (isHumanFood && historyEntryId) {
            const durableSnapshot = await getHistoryResultSnapshot(historyEntryId);
            if (applyHistoryResult({
              analysis: durableSnapshot,
              source: "supabase_history_snapshot",
              nextDataSource: "ai",
            })) return;
          }

          if (!isHumanFood) {
            let catalogMatch = await getCatalogProduct(cacheKey);
            if (!catalogMatch && /^\d{8,14}$/.test(String(cacheKey || ""))) {
              catalogMatch = await findVerifiedCatalogProductByBarcode(cacheKey);
            }
            if (!catalogMatch && historyProductName) {
              catalogMatch = await findVerifiedCatalogProductForLookup({
                productName: historyProductName,
                petType,
              });
            }

            if (catalogMatch) {
              const verifiedProduct = catalogProductToVerifiedProduct(catalogMatch);
              const rebuilt = buildVerifiedPetFoodAnalysis(verifiedProduct);
              if (applyHistoryResult({
                analysis: rebuilt,
                source: "verified_catalog_rebuild",
                nextDataSource: "verified",
                nextOpffData: verifiedProduct,
              })) return;
            }
          }

          // Fall back to Supabase
          const cached = await getCachedAnalysis(cacheKey);
          if (cached.hit) {
            if (applyHistoryResult({
              analysis: cached.analysis,
              source: "supabase_cache",
              nextDataSource: cached.dataSource || "ai",
              nextOpffData: cached.opffData || null,
            })) return;
          }

          setError("This older saved result could not be restored. Scan it again to refresh your saved result.");
          setDone(true);
          trackEvent("history_result_unavailable", { scan_mode: scanMode || mode });
        } catch (err) {
          logger.debug("[RESULTS] Error loading cached result:", err.message);
          setError("Failed to load result. Please try scanning again.");
          setDone(true);
          trackEvent("history_result_failed", {
            scan_mode: scanMode || mode,
            message: err.message,
          });
        }
      })();
      return;
    }

    // Photo / barcode mode: delegate to analysis service
    setLoadingStatus(
      isHumanFood
        ? "Checking food safety..."
        : (mode === "barcode"
          ? "Looking up product..."
          : (mode === "catalog"
            ? "Scoring product..."
            : (isIngredientCapture ? "Reading ingredients..." : "Analyzing product...")))
    );
    setStreaming(true);
    setResult(null);

    const key = analysisService.startAnalysis({ mode, base64, barcode, uri, petType, catalogProduct });
    serviceKeyRef.current = key;
    if (!key) {
      setError("Could not start this scan. Please try again.");
      setStreaming(false);
      setDone(true);
      trackEvent("scan_analysis_failed", {
        mode,
        scan_mode: isHumanFood ? "human_food" : mode,
        failure_category: "start_unavailable",
        has_barcode: !!barcode,
        has_photo: !!base64,
        has_catalog_product: !!catalogProduct,
      });
      return;
    }
    const scanId = scanIdFromAnalysis(key);
    trackEvent("scan_analysis_started", {
      mode,
      scan_mode: isHumanFood ? "human_food" : mode,
      pet_type: petType,
      has_barcode: !!barcode,
      has_photo: !!base64,
      has_catalog_product: !!catalogProduct,
      scan_id: scanId,
    });

    // If service already had a completed result (re-scan dedup), apply immediately
    const existing = analysisService.getAnalysis(key);
    if (existing?.status === "complete") {
      if (!hasMeaningfulAnalysisResult(existing.result)) {
        setResult(null);
        setError("Analysis finished without a usable result. Please try again.");
        setStreaming(false);
        setDone(true);
        trackEvent("scan_analysis_failed", scanFailureProperties({
          mode,
          scan_mode: isHumanFood ? "human_food" : mode,
          event: {
            error: "Analysis finished without a usable result. Please try again.",
            errorCode: "EMPTY_ANALYSIS_RESULT",
            scanId: existing.scanId || null,
          },
        }));
        return;
      }
      setResult(existing.result);
      setDataSource(existing.dataSource);
      if (existing.opffData) setOpffData(existing.opffData);
      setFromCache(false);
      setStreaming(false);
      setDone(true);
    }
  }, [analysisPreflightState, mode, barcode, base64, cacheKey, uri, petType, isHumanFood, isIngredientCapture, scanMode, catalogProduct, throttledSetResult, historyEntryId, historyProductName, historyResultSnapshot, devFixtureError, devFixtureHoldStreaming, devFixtureLoadingStatus, devFixtureResult]);

  useEffect(() => {
    if (!isIngredientCapture || !done || error || !result || ingredientSubmissionRef.current) return;
    ingredientSubmissionRef.current = true;
    const scanId = scanIdFromAnalysis(serviceKeyRef.current);
    setIngredientSubmission({ status: "submitting", reason: null });

    submitCatalogIngredientCapture({
      analysis: result,
      query: acquisitionQuery,
      candidateProduct,
      identification: labelIdentification,
      source: "ingredient_capture_result",
      sourceSurface,
      scanId,
      userConsent: catalogEvidenceConsent === true,
    }).then((submission) => {
      if (submission?.reason === "not_authenticated") {
        setShowGuestSavePrompt(true);
      }
      const submissionStatus = submission?.submitted === true
        ? "submitted"
        : submission?.reason === "explicit_consent_required"
          ? "private"
          : "failed";
      setIngredientSubmission({
        status: submissionStatus,
        reason: submission?.reason || null,
      });
      if (submission?.submitted === true) {
        savePendingCatalogContribution({
          productName: candidateProduct?.productName || result?.productName || acquisitionQuery,
          brand: candidateProduct?.brand || result?.brand,
          petType: candidateProduct?.petType || result?.petType || petType,
          cacheKey: candidateProduct?.cacheKey || cacheKey,
          gtin: candidateProduct?.gtin || candidateProduct?.barcode || barcode,
        }).catch(() => {});
      }
      if (submission?.reason === "rpc_error") {
        Alert.alert(
          "Submission not sent",
          `Your scan was scored, but ${BRAND_NAME} couldn't send it to the catalog review queue. Your result remains private on this device.`
        );
      }
      trackEvent("catalog_ingredient_capture_submitted", {
        submitted: submission?.submitted === true,
        reason: submission?.reason || null,
        scan_id: scanId,
        source_surface: sourceSurface || null,
        product_name_present: !!result?.productName,
        ingredient_count: Array.isArray(result?.ingredients) ? result.ingredients.length : 0,
      });
    }).catch((err) => {
      setIngredientSubmission({ status: "failed", reason: "unexpected_error" });
      trackEvent("catalog_ingredient_capture_submit_failed", {
        message: err.message,
        scan_id: scanId,
      });
    });
  }, [
    isIngredientCapture,
    done,
    error,
    result,
    acquisitionQuery,
    candidateProduct,
    labelIdentification,
    sourceSurface,
    catalogEvidenceConsent,
    petType,
    cacheKey,
    barcode,
  ]);

  // Subscribe to service events
  useEffect(() => {
    let subscribed = true;
    const unsub = analysisService.subscribe((event) => {
      const myKey = serviceKeyRef.current;
      if (!myKey) return;

      // Match by direct key or resolved alias
      const resolvedKey = analysisService.resolveKey(myKey);
      if (event.cacheKey !== myKey && event.cacheKey !== resolvedKey) return;

      if (event.type === "update") {
        throttledSetResult(event.result);
        if (event.opffData) setOpffData(event.opffData);
      } else if (event.type === "complete") {
        if (!hasMeaningfulAnalysisResult(event.result)) {
          setResult(null);
          setError("Analysis finished without a usable result. Please try again.");
          setStreaming(false);
          setDone(true);
          trackEvent("scan_analysis_failed", scanFailureProperties({
            mode,
            scan_mode: isHumanFood ? "human_food" : mode,
            event: {
              ...event,
              error: "Analysis finished without a usable result. Please try again.",
              errorCode: "EMPTY_ANALYSIS_RESULT",
            },
          }));
          return;
        }
        setResult(event.result);
        setDataSource(event.dataSource);
        if (event.opffData) setOpffData(event.opffData);
        setFromCache(!!event.fromCache);
        if (event.scanUsage) setScanUsage(event.scanUsage);
        setStreaming(false);
        setDone(true);
        trackEvent("scan_analysis_completed", {
          mode,
          scan_mode: isHumanFood ? "human_food" : mode,
          scan_id: event.scanId || event.scanUsage?.scan_id || null,
          data_source: event.dataSource,
          from_cache: !!event.fromCache,
          score: event.result?.overallScore ?? null,
          safety_level: event.result?.safetyLevel,
          ingredient_count: event.result?.ingredients?.length || 0,
          scan_usage_reason: event.scanUsage?.reason || null,
          scan_usage_reversed: event.scanUsage?.reversed ?? null,
        });
      } else if (event.type === "barcode_not_found") {
        // Graceful redirect: show brief message then send user back to photo mode
        const needsVerification = event.reason === "verification_required";
        setResult(null);
        setStreaming(false);
        setLoadingStatus(needsVerification
          ? "Ingredients not verified yet — scan the ingredient label..."
          : "Barcode not in database — redirecting to camera...");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        trackEvent("barcode_not_found", {
          mode,
          scan_mode: "barcode",
          scan_id: event.scanId || null,
          failure_category: needsVerification ? "verification_required" : "product_not_found",
          reason: event.reason || null,
          product_name_present: !!event.productName,
          brand_present: !!event.brand,
        });
        redirectTimerRef.current = setTimeout(() => {
          if (needsVerification) {
            requestCatalogEvidenceConsent().then((catalogEvidenceConsent) => {
              if (catalogEvidenceConsent == null) {
                navigation.reset({ index: 0, routes: [{ name: "Home" }] });
                return;
              }
              const resolvedName = [event.brand, event.productName].filter(Boolean).join(" ").trim();
              navigation.reset({
                index: 1,
                routes: [
                  { name: "Home" },
                  {
                    name: "Scanner",
                    params: {
                      mode: "ingredient_capture",
                      acquisitionQuery: resolvedName,
                      candidateProduct: {
                        productName: event.productName || resolvedName,
                        brand: event.brand || null,
                        gtin: event.barcode || barcode || null,
                      },
                      sourceSurface: "barcode_verification",
                      catalogEvidenceConsent,
                      verificationMessage: `Found ${resolvedName || "this product"} — scan its ingredient panel to verify.`,
                      ...navigationTimingParams("barcode_verification"),
                    },
                  },
                ],
              });
            });
            return;
          }
          navigation.reset({
            index: 1,
            routes: [
              { name: "Home" },
              {
                name: "Scanner",
                params: {
                  fallbackToPhoto: true,
                  failedBarcode: barcode || event.barcode || null,
                  ...navigationTimingParams("barcode_not_found"),
                },
              },
            ],
          });
        }, 1500);
      } else if (event.type === "error") {
        if (event.errorCode === "SCAN_LIMIT_REACHED") {
          retryAfterEntitlementRefresh().then((recovered) => {
            if (!subscribed) return;
            if (recovered) return;
            if (event.scanUsage) setScanUsage(event.scanUsage);
            setScanLimitReached(true);
            setError(event.error);
            setStreaming(false);
            setDone(true);
            trackEvent("scan_analysis_failed", scanFailureProperties({
              mode,
              scan_mode: isHumanFood ? "human_food" : mode,
              event,
              extra: {
                scan_id: event.scanId || event.scanUsage?.scan_id || null,
                entitlement_recovery_attempted: scanLimitRecoveryRef.current,
              },
            }));
          });
          return;
        }

        if (event.scanUsage) setScanUsage(event.scanUsage);
        setScanLimitReached(false);
        setError(event.error);
        setStreaming(false);
        setDone(true);
        trackEvent("scan_analysis_failed", scanFailureProperties({
          mode,
          scan_mode: isHumanFood ? "human_food" : mode,
          event,
        }));
      }
    });

    return () => {
      subscribed = false;
      unsub();
      if (throttleRef.current.timer) {
        clearTimeout(throttleRef.current.timer);
      }
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [throttledSetResult, retryAfterEntitlementRefresh, mode, isHumanFood]);

  const [isSlowLoading, setIsSlowLoading] = useState(false);

  // Progressive loading messages + timeout. Keep visible feedback changing
  // throughout long server work instead of leaving a static spinner.
  useEffect(() => {
    if (!streaming || done) return;
    if (__DEV__ && devFixtureLoadingStatus) {
      setLoadingStatus(devFixtureLoadingStatus);
      return;
    }
    setIsSlowLoading(false);
    const messages = isHumanFood
      ? [
        "Identifying the food...",
        "Checking pet safety guidance...",
        "Reviewing portion and preparation...",
        "Checking age guidance...",
      ]
      : [
        "Reading exact ingredients...",
        "Checking ingredient roles...",
        "Calculating the quality score...",
        "Checking your pet profile...",
        "Preparing the verified breakdown...",
      ];
    let messageIndex = 0;
    const messageInterval = setInterval(() => {
      setLoadingStatus(messages[messageIndex]);
      messageIndex += 1;
      if (messageIndex >= messages.length) {
        clearInterval(messageInterval);
      }
    }, LOADING_MESSAGE_INTERVAL_MS);
    const slowLoadingTimeout = setTimeout(() => {
      setIsSlowLoading(true);
    }, SLOW_LOADING_THRESHOLD_MS);
    const timeout = setTimeout(() => {
      if (!done) {
        logger.debug("[RESULTS] Analysis timeout — showing error");
        setError("Analysis is taking too long. Please try again.");
        setStreaming(false);
        setDone(true);
        trackEvent("scan_analysis_timeout", scanFailureProperties({
          mode,
          scan_mode: isHumanFood ? "human_food" : mode,
          event: {
            error: "Analysis is taking too long. Please try again.",
            errorCode: "RESULT_ANALYSIS_TIMEOUT",
            scanId: scanIdFromAnalysis(serviceKeyRef.current),
          },
        }));
      }
    }, RESULT_ANALYSIS_TIMEOUT_MS);
    return () => {
      clearInterval(messageInterval);
      clearTimeout(slowLoadingTimeout);
      clearTimeout(timeout);
    };
  }, [devFixtureLoadingStatus, done, isHumanFood, mode, streaming]);

  // Error haptic
  useEffect(() => {
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [error]);

  // Log total analysis time
  useEffect(() => {
    if (!done || !timerRef.current.start) return;
    const totalMs = Date.now() - timerRef.current.start;
    const totalSec = (totalMs / 1000).toFixed(1);
    logger.debug(`[TIMER] Full analysis complete: ${totalMs}ms (${totalSec}s)`);
  }, [done]);

  useEffect(() => {
    if (!done) return;
    logCaptureToResult({
      captureStartedAt,
      mode: captureTimingMode || (isHumanFood ? "human_food" : mode),
      outcome: error ? "error" : "success",
    });
  }, [captureStartedAt, captureTimingMode, done, error, isHumanFood, mode]);

  // Increment scan count for free users when a new analysis completes
  useEffect(() => {
    if (!done || error || !result || scanCounted || isPro || isDevFixture || mode === "history") return;
    setScanCounted(true);
    try {
      incrementScanCount(scanUsage);
      trackEvent(scanUsage ? "free_scan_count_synced" : "free_scan_count_incremented", {
        mode,
        scan_mode: isHumanFood ? "human_food" : mode,
        scan_count: scanUsage?.scan_count,
        remaining: scanUsage?.remaining,
        source: scanUsage ? "server" : "legacy_client",
      });
    } catch (err) {
      logger.debug("[RESULTS] Error incrementing scan count:", err.message);
    }
  }, [done, error, result, scanCounted, isPro, isDevFixture, mode, incrementScanCount, scanUsage]);

  // Sync server scan count on failures too, including reversed scans.
  useEffect(() => {
    if (!done || !error || !scanUsage || scanCounted || isPro || isDevFixture || mode === "history") return;
    setScanCounted(true);
    try {
      incrementScanCount(scanUsage);
      trackEvent("free_scan_count_synced_after_failure", {
        mode,
        scan_mode: isHumanFood ? "human_food" : mode,
        scan_count: scanUsage.scan_count,
        remaining: scanUsage.remaining,
        reason: scanUsage.reason,
        reversed: !!scanUsage.reversed,
      });
    } catch (err) {
      logger.debug("[RESULTS] Error syncing failed scan count:", err.message);
    }
  }, [done, error, scanUsage, scanCounted, isPro, isDevFixture, mode, incrementScanCount, isHumanFood]);

  // History saving is now handled by analysisService on completion

  const shareCardRef = useRef();
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [showPostScanPrompt, setShowPostScanPrompt] = useState(false);
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const [reviewPromptEligibility, setReviewPromptEligibility] = useState(null);
  const [showGuestSavePrompt, setShowGuestSavePrompt] = useState(false);
  const [savingGuestProvider, setSavingGuestProvider] = useState(null);
  const hasCompletedResultForPrompt = hasMeaningfulAnalysisResult(result);

  // First scan toast (one-time celebratory message)
  const [showFirstScanToast, setShowFirstScanToast] = useState(false);
  useEffect(() => {
    if (!done || isPro || mode === "history" || !result?.overallScore) return;
    let showTimer, hideTimer;
    hasSeenFirstScanToast(user?.id || null).then((seen) => {
      if (seen) return;
      markFirstScanToastSeen(user?.id || null).catch(() => {});
      showTimer = setTimeout(() => setShowFirstScanToast(true), 1200);
      hideTimer = setTimeout(() => setShowFirstScanToast(false), 4200);
    }).catch(() => {});
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [done, isPro, mode, result?.overallScore, user?.id]);

  // The upgrade card appears only after the third free scan so it does not
  // compete with the first-use guidance.
  useEffect(() => {
    if (!done || isPro || mode === "history") return;
    const scansUsed = 3 - remainingScans();
    if (scansUsed < 3) return;
    hasSeenPostScanPrompt(user?.id || null).then((seen) => {
      if (!seen) {
        setShowPostScanPrompt(true);
        trackEvent("post_scan_prompt_viewed", {
          scans_used: scansUsed,
          prompt_state_scoped: !!user?.id,
        });
      }
    }).catch(() => {});
  }, [done, isPro, mode, remainingScans, user?.id]);

  const dismissPostScanPrompt = () => {
    setShowPostScanPrompt(false);
    markPostScanPromptSeen(user?.id || null).catch(() => {});
    trackEvent("post_scan_prompt_dismissed", {
      prompt_state_scoped: !!user?.id,
    });
  };

  useEffect(() => {
    if (
      !done ||
      error ||
      streaming ||
      mode === "history" ||
      (user?.id && !isAnonymous) ||
      !hasCompletedResultForPrompt ||
      showFirstScanToast ||
      showPostScanPrompt ||
      showReviewPrompt
    ) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      hasSeenGuestSavePrompt(user?.id || null)
        .then((seen) => {
          if (cancelled || seen) return;
          setShowGuestSavePrompt(true);
          trackEvent("guest_save_prompt_viewed", {
            source: "results",
            scan_mode: isHumanFood ? "human_food" : mode,
            score: result?.overallScore ?? null,
            safety_level: result?.safetyLevel || null,
            remaining_scans: remainingScans(),
            prompt_state_scoped: !!user?.id,
          });
        })
        .catch(() => {});
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    done,
    error,
    streaming,
    mode,
    isAnonymous,
    user?.id,
    isHumanFood,
    hasCompletedResultForPrompt,
    result?.overallScore,
    result?.safetyLevel,
    remainingScans,
    user?.id,
    showFirstScanToast,
    showPostScanPrompt,
    showReviewPrompt,
  ]);

  const dismissGuestSavePrompt = () => {
    setShowGuestSavePrompt(false);
    markGuestSavePromptSeen(user?.id || null).catch(() => {});
    trackEvent("guest_save_prompt_dismissed", {
      source: "results",
      scan_mode: isHumanFood ? "human_food" : mode,
      prompt_state_scoped: !!user?.id,
    });
  };

  const handleGuestSave = async (provider) => {
    const signIn = provider === "apple" ? signInWithApple : signInWithGoogle;
    setSavingGuestProvider(provider);
    trackEvent("guest_save_prompt_provider_tapped", {
      provider,
      source: "results",
      scan_mode: isHumanFood ? "human_food" : mode,
    });

    try {
      await signIn();
      await markGuestSavePromptSeen(user?.id || null);
      setShowGuestSavePrompt(false);
      trackEvent("guest_save_prompt_completed", {
        provider,
        source: "results",
        scan_mode: isHumanFood ? "human_food" : mode,
        prompt_state_scoped: !!user?.id,
      });
    } catch (err) {
      if (err.code === "ERR_REQUEST_CANCELED") {
        trackEvent("guest_save_prompt_cancelled", {
          provider,
          source: "results",
          scan_mode: isHumanFood ? "human_food" : mode,
        });
      } else {
        trackEvent("guest_save_prompt_failed", {
          provider,
          source: "results",
          scan_mode: isHumanFood ? "human_food" : mode,
          code: err.code,
          message: err.message,
        });
        Alert.alert(
          "Could Not Save Account",
          err.message || "Please try again in a moment."
        );
      }
    } finally {
      setSavingGuestProvider(null);
    }
  };

  const navigatePaywall = (source) => {
    trackEvent("paywall_requested", {
      source,
      mode,
      scan_mode: isHumanFood ? "human_food" : mode,
      score: result?.overallScore ?? null,
    });
    navigation.navigate("Paywall", {
      source,
      productName: result?.productName,
      score: result?.overallScore,
    });
  };

  const reviewContext = useCallback(() => ({
    source: "results",
    score: result?.overallScore ?? null,
    scanMode: isHumanFood ? "human_food" : mode,
    isPro,
    userId: user?.id || null,
    remainingScans: remainingScans(),
    fromCache,
    dataSource,
  }), [result?.overallScore, isHumanFood, mode, isPro, user?.id, remainingScans, fromCache, dataSource]);

  useEffect(() => {
    if (
      reviewPromptCheckedRef.current ||
      !done ||
      error ||
      streaming ||
      mode === "history" ||
      isHumanFood ||
      !result?.overallScore ||
      showFirstScanToast ||
      showPostScanPrompt ||
      showGuestSavePrompt
    ) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      reviewPromptCheckedRef.current = true;
      maybeShowReviewPrompt(reviewContext())
        .then((eligibility) => {
          if (!cancelled && eligibility.show) {
            setReviewPromptEligibility(eligibility);
            setShowReviewPrompt(true);
          }
        })
        .catch(() => {});
    }, 4800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    done,
    error,
    streaming,
    mode,
    isHumanFood,
    result?.overallScore,
    showFirstScanToast,
    showPostScanPrompt,
    showGuestSavePrompt,
    reviewContext,
  ]);

  const handleReviewDismiss = () => {
    setShowReviewPrompt(false);
    dismissReviewPrompt(reviewContext());
  };

  const handleReviewVisible = useCallback(() => {
    if (!reviewPromptEligibility) return;
    markReviewPromptVisible(reviewContext(), reviewPromptEligibility).catch(() => {});
    setReviewPromptEligibility(null);
  }, [reviewContext, reviewPromptEligibility]);

  const handleReviewRate = async () => {
    setShowReviewPrompt(false);
    const opened = await openStoreReview(reviewContext());
    if (!opened) {
      Alert.alert(
        "Could Not Open App Store",
        `Ratings are available from the App Store version of ${BRAND_NAME}. Please try again later.`
      );
    }
  };

  const handleReviewAlreadyCompleted = async () => {
    setShowReviewPrompt(false);
    await acknowledgeReviewComplete(reviewContext());
  };

  const handleScanAnother = () => {
    trackEvent("scan_another_tapped", { mode });
    navigation.popToTop();
  };

  const handleHistoryRecovery = () => {
    const savedProfile = normalizePetProfile(profile?.pet_profile);
    trackEvent("history_result_rescan_tapped", {
      scan_mode: scanMode || "pet_food",
      pet_type: petType || savedProfile.petType || null,
    });

    if (isHumanFood) {
      resetToScanner({
        mode: "human_food",
        petType: petType || savedProfile.petType || "dog",
        petName: savedProfile.name || undefined,
      });
      return;
    }

    resetToScanner({ mode: "label_lookup" });
  };

  const handleHistorySearch = () => {
    const query = String(historyProductName || "").trim();
    trackEvent("history_result_search_tapped", {
      query_present: !!query,
      scan_mode: scanMode || "pet_food",
    });
    navigation.reset({
      index: 1,
      routes: [
        { name: "Home" },
        { name: "ProductSearch", params: { initialQuery: query, sourceSurface: "history_recovery" } },
      ],
    });
  };

  const resetToScanner = (params = {}) => {
    navigation.reset({
      index: 1,
      routes: [
        { name: "Home" },
        { name: "Scanner", params: { ...params, ...navigationTimingParams("results_retry") } },
      ],
    });
  };

  const handleRetry = () => {
    trackEvent("scan_retry_tapped", {
      mode,
      scan_mode: isHumanFood ? "human_food" : mode,
      pet_type: petType,
    });

    if (!canScan()) {
      trackEvent("scan_retry_blocked_by_limit", {
        mode,
        scan_mode: isHumanFood ? "human_food" : mode,
      });
      navigatePaywall("scan_limit");
      return;
    }

    if (isHumanFood) {
      resetToScanner({ mode: "human_food", petType });
      return;
    }

    if (isIngredientCapture) {
      resetToScanner({
        mode: "ingredient_capture",
        acquisitionQuery,
        candidateProduct,
        labelIdentification,
        sourceSurface,
        catalogEvidenceConsent,
      });
      return;
    }

    resetToScanner(mode === "barcode" ? { fallbackToPhoto: true } : {});
  };

  const handleTakePhoto = () => {
    trackEvent("take_photo_again_tapped", { mode });
    resetToScanner({ fallbackToPhoto: true });
  };
  const handleBack = () => {
    cancelRunningAnalysis("back_button");
    if (__DEV__ && route.params?.devReturnToQa && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    if (mode === "catalog" && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.popToTop();
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      cancelRunningAnalysis("navigation_leave");
    });
    return unsubscribe;
  }, [navigation, cancelRunningAnalysis]);

  const handleShare = async () => {
    const shareDisplayName = isHumanFood
      ? String(result?.foodName || result?.productName || "Food safety check").trim()
      : displayProductName;
    if (!shareDisplayName || (!isHumanFood && !result?.overallScore) || (isHumanFood && !result?.safetyLevel)) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const shareUrl = typeof WOOF_SHARE_URL === "string" ? WOOF_SHARE_URL.trim() : "";
    const shareProperties = {
      score: result.overallScore ?? null,
      is_pro: isPro,
      scan_mode: mode,
      data_source: dataSource,
      share_url_attached: Boolean(shareUrl),
      share_url_host: shareUrlHost(shareUrl),
    };
    trackEvent("share_started", shareProperties);
    const config = !isHumanFood ? getScoreConfig(result.overallScore) : null;
    const cleanName = shareDisplayName
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 30)
      .toLowerCase();
    const desiredName = `${BRAND_NAME}-${cleanName}-${isHumanFood ? result.safetyLevel : result.overallScore}`;
    const shareMessage = [
      isHumanFood
        ? `${shareDisplayName}: ${String(result.safetyLevel).toUpperCase()} for ${humanFoodPetName || petType || "my pet"} on ${BRAND_NAME}.`
        : `${shareDisplayName} scored ${result.overallScore}/100 (${config.label}) on ${BRAND_NAME}!`,
      shareUrl ? `Check pet food and everyday foods with ${BRAND_NAME}: ${shareUrl}` : null,
    ].filter(Boolean).join("\n\n");
    try {
      const tmpUri = await captureRef(shareCardRef, {
        format: "png",
        quality: 1,
        fileName: desiredName,
      });
      // captureRef often returns a UUID-named temp file — rename for a clean share sheet
      const cleanUri = `${FileSystem.cacheDirectory}${desiredName}.png`;
      await FileSystem.copyAsync({ from: tmpUri, to: cleanUri });
      if (Platform.OS === "ios") {
        const shareResult = await Share.share({
          url: cleanUri,
          message: shareMessage,
        });
        const resultProperties = shareResultProperties(shareResult);
        if (shareWasDismissed(shareResult)) {
          trackEvent("share_dismissed", { ...shareProperties, ...resultProperties, method: "image" });
          return;
        }
        trackEvent("share_completed", { ...shareProperties, ...resultProperties, method: "image" });
      } else {
        await Sharing.shareAsync(cleanUri, {
          mimeType: "image/png",
          dialogTitle: isHumanFood
            ? `${BRAND_NAME} Food Safety: ${String(result.safetyLevel).toUpperCase()}`
            : `${BRAND_NAME} Score: ${result.overallScore}/100`,
        });
        trackEvent("share_completed", { ...shareProperties, method: "image" });
      }
    } catch (err) {
      logger.debug("[SHARE] Image share failed:", err.message);
      trackEvent("share_image_failed", {
        ...shareProperties,
        error_name: err?.name || "unknown",
      });
      // Fallback to text share
      try {
        const shareResult = await Share.share({ message: shareMessage });
        const resultProperties = shareResultProperties(shareResult);
        if (shareWasDismissed(shareResult)) {
          trackEvent("share_dismissed", { ...shareProperties, ...resultProperties, method: "text" });
          return;
        }
        trackEvent("share_completed", { ...shareProperties, ...resultProperties, method: "text" });
      } catch (shareErr) {
        logger.debug("[SHARE] Text share also failed:", shareErr.message);
        trackEvent("share_failed", {
          ...shareProperties,
          error_name: shareErr?.name || "unknown",
        });
      }
    }
  };

  const isLoading = result === null && !error && !done;

  // --- Loading (skeleton layout matching results page) ---
  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header: back arrow + grayed share */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={styles.shareButton}>
            <Share2 size={24} color={theme.textTertiary} strokeWidth={2} />
          </View>
        </View>
        <LoadingSkeleton
          loadingStatus={loadingStatus}
          isSlowLoading={isSlowLoading}
        />
      </View>
    );
  }

  // --- Error (no meaningful result) ---
  if (error && (!result || !result.productName)) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header: back arrow */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={styles.shareButton} />
        </View>
        <ErrorState
          error={error}
          mode={mode}
          isScanLimit={scanLimitReached}
          onUpgrade={() => navigatePaywall("scan_limit")}
          onRetry={handleRetry}
          onScanAnother={mode === "history"
            ? handleHistoryRecovery
            : (mode === "barcode" ? handleTakePhoto : handleScanAnother)}
          onHistorySearch={mode === "history" && !isHumanFood ? handleHistorySearch : undefined}
          historyProductName={historyProductName}
          historyScanMode={scanMode}
          scanReversed={scanUsage?.reversed === true}
        />
      </View>
    );
  }

  if (!result) return null;

  // --- Derived data ---
  const hasScore = result?.overallScore != null;
  const hasShareableResult = done && (hasScore || (isHumanFood && !!result?.safetyLevel));
  const { nutritionAnalysis, categories } = result || {};
  const hasGuaranteedAnalysis = nutritionAnalysis?.hasPublishedNutrients === true;
  const remainingScanCount = remainingScans();
  const hasFullResultAccess = isPro || !Number.isFinite(remainingScanCount);
  const petFoodImageUri = !isHumanFood ? productImageUri({ result, opffData, uri }) : null;
  const userPhotoWhileIdentifying = Boolean(
    streaming
    && !displayProductName
    && uri
    && (mode === "photo" || isIngredientCapture)
  );
  const identityImageUri = userPhotoWhileIdentifying ? uri : petFoodImageUri;
  const ingredientVerification = result?.ingredientVerification || {};
  const savedPetProfile = normalizePetProfile(
    __DEV__ && devPetProfile ? devPetProfile : profile?.pet_profile
  );
  const petSafety = !isHumanFood ? personalizePetSafety({ ...result, dataSource }, savedPetProfile) : null;
  const nutrientConcern = !isHumanFood ? nutritionAnalysis?.nutrientConcern || null : null;
  const humanFoodPetName = routePetName || (
    savedPetProfile.petType === (petType || result?.petType)
      ? savedPetProfile.name
      : ""
  );
  const petSafetyColor = petSafety?.personalized === false
    ? theme.textSecondary
    : petSafety?.level === "avoid"
      ? Colors.scoreConcerning
      : petSafety?.level === "caution"
        ? Colors.scoreDecent
        : Colors.scoreExcellent;
  const showProminentPetSafety = petSafety?.personalized === true
    && petSafety.level !== "safe" && !nutrientConcern;
  const verificationSource = isIngredientCapture
    ? "User submission"
    : displayValueLabel(
      ingredientVerification.sourceQuality ||
      ingredientVerification.source ||
      dataSource
    );
  const ingredientStatus = isIngredientCapture
    ? "Pending review"
    : displayValueLabel(ingredientVerification.status || result?.verificationState?.ingredientVerificationStatus, "Not verified");
  const imageStatus = isIngredientCapture
    ? "User photo"
    : displayValueLabel(ingredientVerification.imageStatus || result?.verificationState?.imageVerificationStatus, "Not verified");
  const sourceHost = shareUrlHost(ingredientVerification.sourceUrl || result?.sourceUrl);
  const formulaEvidenceTier = ingredientVerification.formulaEvidenceTier || "";
  const formulaVersionLabel = formulaEvidenceTier === "manufacturer_current_exact"
    ? "Current manufacturer formula"
    : formulaEvidenceTier === "retailer_web_version"
      ? "Exact retailer package version"
      : formulaEvidenceTier === "web_label_version"
        ? "Exact package-label version"
        : "";
  const hasVerifiedCatalogEvidence = Boolean(
    !isIngredientCapture &&
    ingredientStatus &&
    imageStatus &&
    sourceHost &&
    !/unverified|candidate|missing|pending/i.test(`${ingredientStatus} ${imageStatus}`)
  );
  const scoreConfig = hasScore ? getScoreConfig(result.overallScore) : null;
  const identityEvidenceColor = hasVerifiedCatalogEvidence
    ? Colors.scoreExcellent
    : theme.textTertiary;
  const identityEvidenceLabel = formulaVersionLabel
    || (hasVerifiedCatalogEvidence ? "Exact ingredients and photo verified" : ingredientStatus)
    || "Catalog evidence";
  const ingredientSubmissionCopy = ingredientSubmission.status === "submitted"
    ? `${BRAND_NAME} sent the recognized product name and ingredients to a private catalog review queue. It is not verified or added automatically.`
    : ingredientSubmission.status === "private"
      ? "This scan was scored for you only. It was not submitted to or added to the catalog."
      : ingredientSubmission.status === "failed"
        ? `This scan was scored, but ${BRAND_NAME} could not send it for catalog review. Your result remains private.`
        : ingredientSubmission.status === "submitting"
          ? "Your result is ready. Sending the recognized product name and ingredients to the private review queue…"
          : "This result uses the ingredients scanned from your photo. Catalog verification has not completed.";

  // --- Success — unified scrollable page ---
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header: back + mini score (fades in on scroll) + share */}
      <Animated.View style={[styles.header, headerBorderStyle]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
        >
          <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2} />
        </TouchableOpacity>

        {!isHumanFood && hasScore ? (
          <Animated.View style={[styles.headerCenter, headerStyle]}>
            <Animated.View
              style={[
                styles.miniScoreBadge,
                {
                  backgroundColor: showProminentPetSafety
                    ? petSafetyColor
                    : getScoreConfig(result.overallScore).color,
                },
                miniBadgeStyle,
              ]}
            >
              <Text style={styles.miniScoreText}>
                {result.overallScore}
              </Text>
            </Animated.View>
            <Text style={styles.headerProductName} numberOfLines={1}>
              {displayProductName}
            </Text>
          </Animated.View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <TouchableOpacity
            style={[styles.shareButton, !hasShareableResult && { opacity: 0.3 }]}
            onPress={handleShare}
            activeOpacity={0.7}
            disabled={!hasShareableResult}
            accessibilityRole="button"
            accessibilityLabel="Share results"
            accessibilityHint={`Shares a ${BRAND_NAME} result card`}
            accessibilityState={{ disabled: !hasShareableResult }}
          >
            <Share2 size={24} color={theme.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* === Human Food Safety Layout === */}
        {isHumanFood && (
          <>
            {/* Safety badge — hero */}
            {result.safetyLevel ? (
              <StreamSection visible delay={50}>
                <SafetyBadge
                  safetyLevel={result.safetyLevel}
                  petType={petType || result.petType}
                  petName={humanFoodPetName}
                />
              </StreamSection>
            ) : streaming ? (
              <View style={styles.heroSection}>
                <SkeletonCircle size={180} strokeWidth={12} />
              </View>
            ) : null}

            {/* Food name */}
            {result.foodName ? (
              <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(200).duration(400).damping(20).stiffness(300)}>
                <Text style={[styles.productName, { marginTop: 0, marginBottom: 4 }]} numberOfLines={2}>
                  {result.foodName}
                </Text>
              </Animated.View>
            ) : streaming ? (
              <View style={{ alignItems: "center", paddingVertical: 8 }}>
                <SkeletonBar width="65%" height={22} />
              </View>
            ) : null}

            {/* Summary */}
            {result.summary ? (
              <StreamSection visible delay={100}>
                <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center", paddingHorizontal: 20, marginBottom: 20 }}>
                  {result.summary}
                </Text>
              </StreamSection>
            ) : null}

            {/* Quick stats row — 3 columns */}
            {done && (
              <StreamSection visible delay={150}>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                  {/* Portions */}
                  <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 14, alignItems: "center", ...Shadows.card }}>
                    <Utensils size={18} color={result.portions === "Do not feed" ? Colors.scoreConcerning : Colors.scoreExcellent} strokeWidth={1.8} />
                    <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: "600", marginTop: 8, textTransform: "uppercase", letterSpacing: 0 }}>Portion</Text>
                    <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "500", marginTop: 4, textAlign: "center" }} numberOfLines={2}>
                      {result.portions || "N/A"}
                    </Text>
                  </View>
                  {/* Preparation */}
                  <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 14, alignItems: "center", ...Shadows.card }}>
                    <ShieldCheck size={18} color={Colors.blue} strokeWidth={1.8} />
                    <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: "600", marginTop: 8, textTransform: "uppercase", letterSpacing: 0 }}>Prep</Text>
                    <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "500", marginTop: 4, textAlign: "center" }} numberOfLines={2}>
                      {result.preparation || "N/A"}
                    </Text>
                  </View>
                  {/* Age */}
                  <View style={{ flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 14, alignItems: "center", ...Shadows.card }}>
                    <Calendar size={18} color={Colors.amber} strokeWidth={1.8} />
                    <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: "600", marginTop: 8, textTransform: "uppercase", letterSpacing: 0 }}>Ages</Text>
                    <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: "500", marginTop: 4, textAlign: "center" }} numberOfLines={2}>
                      {result.ageGuidance?.note || "All ages"}
                    </Text>
                  </View>
                </View>
              </StreamSection>
            )}

            {/* Age guidance detail — visual row */}
            {done && result.ageGuidance && (
              <StreamSection visible delay={200}>
                <View style={{ backgroundColor: theme.card, borderRadius: Spacing.cardRadius, padding: 16, marginBottom: 12, ...Shadows.card }}>
                  <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 0, textTransform: "uppercase", marginBottom: 12 }}>
                    Age Suitability
                  </Text>
                  {[
                    { label: (petType || result.petType) === "dog" ? "Puppies" : "Kittens", value: result.ageGuidance.puppiesOrKittens },
                    { label: "Adults", value: result.ageGuidance.adults },
                    { label: "Seniors", value: result.ageGuidance.seniors },
                  ].map((row) => {
                    const ageColor = row.value === "safe" ? Colors.scoreExcellent : row.value === "caution" ? Colors.scoreDecent : Colors.scoreConcerning;
                    const ageLabel = row.value === "safe" ? "Safe" : row.value === "caution" ? "Caution" : "Avoid";
                    return (
                      <View key={row.label} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: row.label !== (petType === "dog" ? "Puppies" : "Kittens") ? 0.5 : 0, borderTopColor: theme.divider }}>
                        <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "500" }}>{row.label}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ageColor }} />
                          <Text style={{ color: ageColor, fontSize: 14, fontWeight: "600" }}>{ageLabel}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </StreamSection>
            )}

            {/* Benefits & risks pills */}
            {done && (
              <StreamSection visible delay={250}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {result.toxicCompounds && result.toxicCompounds.length > 0 && result.toxicCompounds[0] !== "None" && (
                    result.toxicCompounds.map((c, i) => (
                      <View key={`t${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: theme.dangerSurface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 }}>
                        <AlertTriangle size={12} color={Colors.scoreConcerning} strokeWidth={2} />
                        <Text style={{ color: Colors.scoreConcerning, fontSize: 12, fontWeight: "600" }}>{c}</Text>
                      </View>
                    ))
                  )}
                  {result.benefits && result.benefits.length > 0 && result.safetyLevel !== "dangerous" && (
                    result.benefits.slice(0, 4).map((b, i) => (
                      <View key={`b${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(52,199,89,0.08)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 }}>
                        <CheckCircle2 size={12} color={Colors.scoreExcellent} strokeWidth={2} />
                        <Text style={{ color: Colors.scoreExcellent, fontSize: 12, fontWeight: "600" }}>{b}</Text>
                      </View>
                    ))
                  )}
                </View>
              </StreamSection>
            )}

            {/* Explanation */}
            {done && result.explanation ? (
              <StreamSection visible delay={300}>
                <View style={{ backgroundColor: theme.card, borderRadius: Spacing.cardRadius, padding: 16, ...Shadows.card }}>
                  <Text style={{ color: theme.textTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 0, textTransform: "uppercase", marginBottom: 8 }}>
                    Why?
                  </Text>
                  <Text style={{ color: theme.textPrimary, fontSize: 15, lineHeight: 23 }}>
                    {result.explanation}
                  </Text>
                </View>
              </StreamSection>
            ) : null}

            {/* Symptoms warning */}
            {done && result.symptoms && result.symptoms !== "N/A" ? (
              <StreamSection visible delay={350}>
                <View style={{ backgroundColor: theme.dangerSurface, borderRadius: Spacing.cardRadius, padding: 16, marginTop: 12, borderLeftWidth: 3, borderLeftColor: Colors.scoreConcerning }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <AlertCircle size={16} color={Colors.scoreConcerning} strokeWidth={2} />
                    <Text style={{ color: Colors.scoreConcerning, fontSize: 11, fontWeight: "700", letterSpacing: 0, textTransform: "uppercase" }}>
                      Symptoms to Watch
                    </Text>
                  </View>
                  <Text style={{ color: theme.textPrimary, fontSize: 15, lineHeight: 23 }}>
                    {result.symptoms}
                  </Text>
                </View>
              </StreamSection>
            ) : null}

            {/* Disclaimer */}
            {done && (
              <StreamSection visible delay={400}>
                <Text style={{ color: theme.textTertiary, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 24, paddingHorizontal: 20 }}>
                  AI-powered analysis may contain errors. Not veterinary advice. Pets may have individual allergies. Consult your vet.
                </Text>
              </StreamSection>
            )}

            {/* Streaming footer */}
            {streaming && (
              <View style={styles.streamingFooter}>
                <StreamingDots />
                <Text style={styles.streamingFooterText}>Checking...</Text>
              </View>
            )}

            {/* Scan Another */}
            {done && (
              <StreamSection visible delay={450}>
                <ScanAnotherButton onPress={handleScanAnother} />
              </StreamSection>
            )}
          </>
        )}

        {/* === Pet Food Analysis Layout === */}
        {!isHumanFood && (
          <>
            {/* 1. Exact product identity and evidence */}
            {displayProductName || userPhotoWhileIdentifying ? (
              <StreamSection visible delay={40}>
                <View
                  style={[
                    styles.productIdentityCard,
                    { backgroundColor: theme.card, borderColor: theme.separator },
                  ]}
                >
                  {identityImageUri ? (
                    <View style={styles.productImageHero}>
                      <Image
                        source={{ uri: identityImageUri }}
                        style={styles.productImage}
                        resizeMode="contain"
                        accessibilityLabel={`${displayProductName || "Product"} package image`}
                      />
                    </View>
                  ) : null}
                  {displayProductName ? <View style={styles.productIdentityCopy}>
                    <Text style={[styles.productEyebrow, { color: theme.textTertiary }]}>
                      {hasVerifiedCatalogEvidence ? "VERIFIED FORMULA" : "PET FOOD ANALYSIS"}
                    </Text>
                    <Text style={styles.productName} numberOfLines={4}>
                      {streaming && !hasScore ? (
                        <StreamingText
                          text={displayProductName}
                          streaming
                          done={done}
                          style={styles.productName}
                        />
                      ) : (
                        displayProductName
                      )}
                    </Text>
                    {variantSummary ? (
                      <Text style={styles.productVariant} numberOfLines={3}>
                        {variantSummary}
                      </Text>
                    ) : null}
                    <View style={styles.productEvidenceLine}>
                      <ShieldCheck size={14} color={identityEvidenceColor} strokeWidth={2.2} />
                      <Text
                        style={[styles.productEvidenceText, { color: identityEvidenceColor }]}
                        numberOfLines={2}
                      >
                        {identityEvidenceLabel}
                      </Text>
                    </View>
                  </View> : null}
                </View>
              </StreamSection>
            ) : streaming ? (
              <View style={{ alignItems: "center", paddingVertical: 8 }}>
                <SkeletonBar width="65%" height={22} />
              </View>
            ) : null}

            {/* A personalized warning must never depend on score availability. */}
            {showProminentPetSafety ? (
              <StreamSection visible delay={45}>
                <View
                  style={[
                    styles.personalizedWarning,
                    {
                      backgroundColor: petSafety.level === "avoid"
                        ? theme.dangerSurface
                        : theme.cautionSurface,
                      borderColor: petSafetyColor,
                    },
                  ]}
                  accessible
                  accessibilityRole="alert"
                  accessibilityLabel={`${petSafety.level === "avoid" ? "Do not feed" : "Check before feeding"}. ${petSafety.label}. ${petSafety.summary}`}
                >
                  <View style={[styles.personalizedWarningIcon, { backgroundColor: petSafetyColor + "18" }]}>
                    {petSafety.level === "avoid" ? (
                      <AlertCircle size={24} color={petSafetyColor} strokeWidth={2.5} />
                    ) : (
                      <AlertTriangle size={24} color={petSafetyColor} strokeWidth={2.5} />
                    )}
                  </View>
                  <View style={styles.personalizedWarningCopy}>
                    <Text style={[styles.personalizedWarningEyebrow, { color: petSafetyColor }]}>
                      {petSafety.level === "avoid"
                        ? `DO NOT FEED TO ${savedPetProfile.name || "THIS PET"}`
                        : `CHECK BEFORE FEEDING ${savedPetProfile.name || "THIS PET"}`}
                    </Text>
                    <Text style={[styles.personalizedWarningTitle, { color: theme.textPrimary }]}>
                      {petSafety.label}
                    </Text>
                    <Text style={[styles.personalizedWarningSummary, { color: theme.textSecondary }]}>
                      {petSafety.summary}
                    </Text>
                  </View>
                </View>
              </StreamSection>
            ) : null}

            {nutrientConcern ? (
              <StreamSection visible delay={45}>
                <View
                  style={[styles.personalizedWarning, { backgroundColor: nutrientConcern.level === "avoid" ? theme.dangerSurface : theme.cautionSurface, borderColor: nutrientConcern.level === "avoid" ? Colors.scoreConcerning : Colors.scoreDecent }]}
                  accessible
                  accessibilityRole="alert"
                  accessibilityLabel={`Nutrient safety concern. ${nutrientConcern.summary}`}
                >
                  <View style={[styles.personalizedWarningIcon, { backgroundColor: theme.fill }]}>
                    <AlertCircle size={24} color={nutrientConcern.level === "avoid" ? Colors.scoreConcerning : Colors.scoreDecent} strokeWidth={2.5} />
                  </View>
                  <View style={styles.personalizedWarningCopy}>
                    <Text style={[styles.personalizedWarningEyebrow, { color: nutrientConcern.level === "avoid" ? Colors.scoreConcerning : Colors.scoreDecent }]}>NUTRIENT SAFETY CHECK</Text>
                    <Text style={[styles.personalizedWarningTitle, { color: theme.textPrimary }]}>{nutrientConcern.code === "calcium_above_profile_maximum" ? "Calcium exceeds the profile maximum" : "Mineral balance needs review"}</Text>
                    <Text style={[styles.personalizedWarningSummary, { color: theme.textSecondary }]}>{nutrientConcern.summary}</Text>
                  </View>
                </View>
              </StreamSection>
            ) : null}

            {/* 2. Score overview */}
            {hasScore ? (
              <StreamSection visible delay={50}>
                <View
                  style={[
                    styles.scoreOverviewCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: petSafety?.personalized ? petSafetyColor : theme.separator,
                      borderWidth: petSafety?.level === "avoid" && petSafety?.personalized ? 2 : 1,
                    },
                  ]}
                  accessible
                  accessibilityRole="summary"
                  accessibilityLabel={`Ingredient quality score ${result.overallScore} out of 100, ${scoreConfig.label}. ${petSafety?.label || "General ingredient check"}. ${petSafety?.summary || ""}`}
                >
                  <CircularScore score={result.overallScore} size={132} strokeWidth={10} />
                  <View style={styles.scoreOverviewCopy}>
                    <Text style={[styles.scoreOverviewEyebrow, { color: theme.textTertiary }]}>
                      INGREDIENT QUALITY
                    </Text>
                    <Text style={[styles.scoreOverviewTitle, { color: scoreConfig.color }]}>
                      {titleCaseStatus(scoreConfig.label)}
                    </Text>
                    <Text style={[styles.scoreOverviewText, { color: theme.textSecondary }]}>
                      {hasFullResultAccess
                        ? "Based on this formula’s exact ingredient list. Open the breakdown below to see what shaped it."
                        : "Based on this formula’s exact ingredient list. Upgrade to unlock the full quality breakdown and nutrition details."}
                    </Text>
                    {petSafety?.personalized && petSafety.level === "safe" ? (
                      <View
                        style={[
                          styles.petVerdictHero,
                          {
                            backgroundColor: petSafety.level === "avoid"
                              ? theme.dangerSurface
                              : petSafety.level === "caution"
                                ? theme.cautionSurface
                                : theme.successSurface,
                            borderColor: petSafetyColor,
                          },
                        ]}
                      >
                        <CheckCircle2 size={18} color={petSafetyColor} strokeWidth={2.4} />
                        <View style={styles.petVerdictHeroCopy}>
                          <Text style={[styles.petVerdictHeroEyebrow, { color: petSafetyColor }]}>
                            PET FIT
                          </Text>
                          <Text style={[styles.petVerdictHeroTitle, { color: theme.textPrimary }]}>
                            {petSafety.label}
                          </Text>
                          <Text style={[styles.petVerdictHeroSummary, { color: theme.textSecondary }]}>
                            {petSafety.summary}
                          </Text>
                        </View>
                      </View>
                    ) : !petSafety?.personalized ? (
                      <Pressable
                        onPress={() => navigation.navigate("Profile", {
                          openPetEditor: true,
                          returnAfterPetSave: true,
                        })}
                        style={({ pressed }) => [
                          styles.petVerdictHero,
                          {
                            backgroundColor: theme.surface,
                            borderColor: theme.separator,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Add pet details to personalize this result"
                      >
                        <PawPrint size={18} color={theme.textSecondary} strokeWidth={2.2} />
                        <Text style={[styles.petVerdictHeroPrompt, { color: theme.textPrimary }]}>
                          Add pet details for a personalized fit check
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </StreamSection>
            ) : streaming ? (
              <View style={styles.heroSection}>
                <SkeletonCircle size={180} strokeWidth={12} />
              </View>
            ) : null}

            {!isHumanFood && nutritionAnalysis ? (
              <StreamSection visible delay={75}>
                <View style={{ backgroundColor: theme.card, borderColor: theme.separator, borderWidth: 1, borderRadius: Spacing.cardRadius, padding: 16, marginTop: 12 }} accessible accessibilityRole="summary">
                  <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: "700" }}>
                    {nutritionAnalysis.hasPublishedNutrients ? [nutritionAnalysis.analysisTypeLabel || "Nutrient analysis", nutritionAnalysis.analysisBasisLabel !== "Basis not stated" ? nutritionAnalysis.analysisBasisLabel : null].filter(Boolean).join(" · ") : "Nutrient details not published"}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 6 }}>
                    {nutritionAnalysis.transparencyNote || "Nutritional Balance is scored conservatively when source-backed nutrient values are unavailable."}
                  </Text>
                </View>
              </StreamSection>
            ) : null}

            {/* Scan limit banner (free users, new scans only) */}
            {!isPro && mode !== "history" ? (
              <View style={{ minHeight: 54 }}>
                {done
                  && !hasFullResultAccess
                  && hasScore
                  && !(showFirstScanToast || (__DEV__ && devPrompt === "first_scan")) ? (
                  <ScanLimitBanner remaining={remainingScanCount} />
                ) : null}
              </View>
            ) : null}

            {/* 3. Quick Stats */}
            <StreamSection visible={!!nutritionAnalysis} delay={100}>
              <QuickStatsGrid nutrition={nutritionAnalysis} />
            </StreamSection>

            {/* 4. Verification and pet safety */}
            <StreamSection visible={isIngredientCapture || !!ingredientVerification.status} delay={150}>
              <View style={{ backgroundColor: theme.card, borderRadius: Spacing.cardRadius, padding: 16, marginTop: 12, borderWidth: 1, borderColor: theme.separator }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <ShieldCheck size={18} color={petSafetyColor} strokeWidth={2.2} />
                  <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: "700", flex: 1 }}>
                    {isIngredientCapture
                      ? ingredientSubmission.status === "submitted" ? "Submitted for catalog review" : "Scanned ingredients"
                      : "Verification details"}
                  </Text>
                </View>
                <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 12 }}>
                  {isIngredientCapture
                    ? ingredientSubmissionCopy
                    : "Scored only from source-backed catalog ingredients for this exact formula."}
                </Text>
                {petSafety?.personalized ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
                    <PawPrint size={14} color={theme.textTertiary} strokeWidth={1.8} />
                    <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: "600", flex: 1 }}>
                      {petSafety.profileLabel}
                    </Text>
                    <Pressable
                      onPress={() => navigation.navigate("Profile", {
                        openPetEditor: true,
                        returnAfterPetSave: true,
                      })}
                      accessibilityRole="button"
                      accessibilityLabel="Edit pet details"
                    >
                      <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "700" }}>Edit</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => navigation.navigate("Profile", {
                      openPetEditor: true,
                      returnAfterPetSave: true,
                    })}
                    style={({ pressed }) => ({
                      minHeight: 40,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: theme.separator,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                      opacity: pressed ? 0.65 : 1,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel="Add pet details"
                    accessibilityHint="Opens Profile to set personalized ingredient checks"
                  >
                    <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: "600" }}>Add Pet Details</Text>
                  </Pressable>
                )}
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: "600" }}>Ingredients</Text>
                    <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "700", flexShrink: 1, textAlign: "right" }}>
                      {ingredientStatus || "Not available"}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: "600" }}>Image</Text>
                    <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "700", flexShrink: 1, textAlign: "right" }}>
                      {imageStatus || "Not available"}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: "600" }}>Source</Text>
                    <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "700", flexShrink: 1, textAlign: "right" }}>
                      {[verificationSource, isIngredientCapture ? "" : sourceHost].filter(Boolean).join(" • ") || "Catalog"}
                    </Text>
                  </View>
                  {!isIngredientCapture && formulaVersionLabel ? (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                      <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: "600" }}>Formula version</Text>
                      <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "700", flexShrink: 1, textAlign: "right" }}>
                        {formulaVersionLabel}
                      </Text>
                    </View>
                  ) : null}
                  {!isIngredientCapture ? (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Calendar size={13} color={theme.textTertiary} strokeWidth={2} />
                        <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: "600" }}>Verified</Text>
                      </View>
                      <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: "700", flexShrink: 1, textAlign: "right" }}>
                        {dateDisplay(ingredientVerification.verifiedAt)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </StreamSection>

            {/* 5. Verdict */}
            <StreamSection visible={!!result.verdict} delay={200}>
              <VerdictCard
                verdict={result.verdict}
                score={result.overallScore}
                streaming={streaming}
                done={done}
                isPro={isPro}
              />
            </StreamSection>

            {/* 6. Exact source-backed ingredients stay available to every user. */}
            <StreamSection visible={result.ingredients?.length > 0} delay={250}>
              <IngredientsSection
                ingredients={result.ingredients}
                onIngredientPress={setSelectedIngredient}
              />
            </StreamSection>

            {/* ProGateOverlay — shown for free users when analysis is done */}
            {!hasFullResultAccess && done && hasScore && (
              <ProGateOverlay
                onUpgrade={() => navigatePaywall("results_gate")}
              />
            )}

            {/* Scan Another — below gate for free users */}
            {done && !hasFullResultAccess && (
              <StreamSection visible delay={300}>
                <ScanAnotherButton onPress={handleScanAnother} />
              </StreamSection>
            )}

            {/* Pro-only sections */}
            {isPro && (
              <>
                {/* 6. Quality Breakdown */}
                <StreamSection visible={categories?.length > 0} delay={200}>
                  {categories?.length > 0 && (
                    <View style={styles.qualitySection}>
                      <Text style={styles.qualityTitle}>Quality Breakdown</Text>
                      <View style={styles.qualityHeaderDivider} />
                      {categories.map((cat, i) => (
                        <CategoryBar
                          key={i}
                          name={cat.name}
                          score={cat.score}
                          detail={cat.detail}
                          index={i}
                          isLast={i === categories.length - 1}
                        />
                      ))}
                    </View>
                  )}
                </StreamSection>

                {/* 7. Nutrition Facts */}
                <StreamSection visible={hasGuaranteedAnalysis} delay={300}>
                  <NutritionFacts nutrition={nutritionAnalysis} />
                </StreamSection>

              </>
            )}

            {/* Streaming footer */}
            {streaming && (
              <View style={{ minHeight: !isPro ? 360 : 100, justifyContent: "flex-start" }}>
                <View style={styles.streamingFooter}>
                  <StreamingDots />
                  <Text style={styles.streamingFooterText}>{loadingStatus}</Text>
                </View>
              </View>
            )}

            {/* Scan Another — for Pro users (free users have it above the gate) */}
            {done && isPro && (
              <StreamSection visible delay={450}>
                <ScanAnotherButton onPress={handleScanAnother} />
              </StreamSection>
            )}

            {/* Post-scan upgrade prompt (once, after the third free scan) */}
            {(showPostScanPrompt || (__DEV__ && devPrompt === "post_scan")) && (
              <PostScanPrompt
                onUpgrade={() => {
                  dismissPostScanPrompt();
                  navigatePaywall("post_scan_prompt");
                }}
                onDismiss={dismissPostScanPrompt}
              />
            )}

            {/* Result disclosure */}
            {done && (
              <Text style={{ color: theme.textTertiary, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 24, marginBottom: 8, paddingHorizontal: 20 }}>
                {hasVerifiedCatalogEvidence
                  ? "Ingredient list and product image are source-backed catalog data. Scores are informational, not veterinary advice."
                  : "AI-assisted analysis may contain errors. Not a substitute for professional veterinary advice."}
              </Text>
            )}
          </>
        )}

        {(showGuestSavePrompt || (__DEV__ && devPrompt === "guest_save")) && (
          <GuestSavePrompt
            onSave={handleGuestSave}
            onDismiss={dismissGuestSavePrompt}
            savingProvider={savingGuestProvider}
            showApple={Platform.OS === "ios"}
          />
        )}
      </Animated.ScrollView>

      <FirstScanToast visible={!hasFullResultAccess && (showFirstScanToast || (__DEV__ && devPrompt === "first_scan"))} />

      {(showReviewPrompt || (__DEV__ && devPrompt === "review")) ? (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 12, zIndex: 30 }}>
          <ReviewPrompt
            onVisible={handleReviewVisible}
            onRate={handleReviewRate}
            onDismiss={handleReviewDismiss}
            onAlreadyReviewed={handleReviewAlreadyCompleted}
          />
        </View>
      ) : null}

      {/* Off-screen share card for view-shot capture */}
      {hasShareableResult && (
        <View
          style={{ position: "absolute", left: -9999, top: 0, pointerEvents: "none" }}
          collapsable={false}
        >
          <ShareCard
            ref={shareCardRef}
            result={displayResult}
            nutrition={nutritionAnalysis}
            shareUrl={shareUrlDisplay(WOOF_SHARE_URL)}
            humanFood={isHumanFood}
            petType={petType || result?.petType}
            petName={humanFoodPetName}
            petSafety={petSafety}
          />
        </View>
      )}

      {/* Ingredient detail bottom sheet */}
      <IngredientSheet
        ingredient={selectedIngredient}
        onDismiss={() => setSelectedIngredient(null)}
        isPro={isPro}
        onUpgrade={() => navigatePaywall("ingredient_gate")}
      />
    </View>
  );
}
