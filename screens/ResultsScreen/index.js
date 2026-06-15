import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Text,
  View,
  Image,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Share,
  Alert,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  FadeInUp,
} from "react-native-reanimated";
import { ChevronLeft, Share2, Utensils, X, AlertTriangle, CheckCircle2, AlertCircle, ShieldCheck, Calendar, Camera, Sparkles, ArrowRight, PawPrint } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { getCachedAnalyses } from "../../services/cache";
import * as analysisService from "../../services/analysisService";
import { classifyError } from "../../services/errors";
import { removeRecentSearch } from "../../services/recentSearches";
import { useAuth } from "../../services/auth";
import { trackEvent, analyticsKeyHash } from "../../services/analytics";
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
  ReviewsSection,
  RecallCard,
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
  FirstScanToast,
  SafetyBadge,
  DataSourceBadge,
  QuickFactsGrid,
  Disclaimer,
  ProcessingMethodChip,
  TrustBadges,
  NutritionAdvisoryCard,
  WoofWordmark,
  HeroImage,
  SummaryRows,
} from "./components";
import { useStyles } from "./styles";

const HISTORY_RESULT_LOAD_TIMEOUT_MS = 10000;
const HISTORY_SHARED_CACHE_TIMEOUT_MS = 2500;
const RESULTS_STREAMING_WATCHDOG_MS = 76000;

// Inline card shown when we identify a product but don't have it in our database.
// Replaces the previous silent auto-redirect to IngredientCapture so the user
// understands what just happened and gets to choose their path.
function NeedsLabelCard({ needsLabel, theme, onCaptureLabel, onUseEstimate }) {
  const displayName = needsLabel.productName || "this product";
  const isIncompleteCatalog = needsLabel.reason === "catalog_unusable";
  const isCatalogLookupError = needsLabel.reason === "catalog_lookup_error";
  const bodyCopy = isIncompleteCatalog
    ? "We found this product, but its catalog ingredient data is incomplete. Snap the ingredient panel and we'll score it from the label data."
    : isCatalogLookupError
      ? "We found this product, but couldn't check the catalog. Snap the ingredient panel and we'll score it from the label data."
    : "We don't have this product in our database yet. Snap the ingredient panel and we'll score it from the label data.";
  return (
    <View style={needsLabelStyles.container}>
      <Animated.View entering={FadeInUp.duration(400).springify()} style={needsLabelStyles.content}>
        {/* Confirm what we found — small win first */}
        <View style={[needsLabelStyles.foundChip, { backgroundColor: "#E4F0E8" }]}>
          <CheckCircle2 size={14} color="#1F7A45" strokeWidth={2.4} />
          <Text style={[needsLabelStyles.foundChipText, { color: "#1F7A45" }]}>Found</Text>
        </View>

        <Text style={[needsLabelStyles.productName, { color: theme.textPrimary }]} numberOfLines={3}>
          {displayName}
        </Text>

        <Text style={[needsLabelStyles.body, { color: theme.textSecondary }]}>{bodyCopy}</Text>

        {/* Primary CTA */}
        <Pressable onPress={onCaptureLabel} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, marginTop: 28 })}>
          <View style={[needsLabelStyles.primaryCta, { backgroundColor: theme.buttonPrimary }]}>
            <Camera size={18} color={theme.buttonText} strokeWidth={2} />
            <Text style={[needsLabelStyles.primaryCtaText, { color: theme.buttonText }]}>
              Flip the bag — take 10 seconds
            </Text>
          </View>
        </Pressable>
        <Text style={[needsLabelStyles.primaryHint, { color: theme.textTertiary }]}>
          Label-based score · helps everyone scanning this product next
        </Text>

        {/* Secondary path */}
        <Pressable onPress={onUseEstimate} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginTop: 24 })}>
          <View style={needsLabelStyles.secondaryCta}>
            <Sparkles size={14} color={theme.textSecondary} strokeWidth={2} />
            <Text style={[needsLabelStyles.secondaryCtaText, { color: theme.textSecondary }]}>
              Use AI estimate instead
            </Text>
            <ArrowRight size={14} color={theme.textTertiary} strokeWidth={2} />
          </View>
        </Pressable>
        <Text style={[needsLabelStyles.secondaryHint, { color: theme.textTertiary }]}>
          Faster, but less accurate than reading the real label
        </Text>
      </Animated.View>
    </View>
  );
}

function ScoreUnavailableCard({ error, theme, isPro, onRetry, onUpgrade }) {
  const classified = classifyError(error);
  const isQuota = classified.kind === "quota";
  const buttonLabel = isQuota && !isPro ? "See Plans" : "Retry Score";
  const buttonAction = isQuota && !isPro ? onUpgrade : onRetry;

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginTop: 8,
        marginBottom: 16,
        padding: 16,
        borderRadius: 14,
        backgroundColor: theme.fill,
        borderWidth: 1,
        borderColor: theme.separator,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <AlertCircle size={18} color={theme.textSecondary} strokeWidth={2.4} />
        <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: "700" }}>
          Score unavailable
        </Text>
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
        {classified.message || "The product data loaded, but scoring did not finish. Try again."}
      </Text>
      <TouchableOpacity
        onPress={buttonAction}
        activeOpacity={0.82}
        style={{
          alignSelf: "flex-start",
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 10,
          backgroundColor: theme.textPrimary,
        }}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
      >
        <Text style={{ color: theme.background, fontSize: 14, fontWeight: "700" }}>
          {buttonLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function isReplayableHumanFoodHistoryPayload(payload, petType) {
  if (!payload || typeof payload !== "object" || payload.error) return false;
  const hasText = (value) => typeof value === "string" && value.trim().length > 0;
  const resolvedPetType = payload.petType || petType;
  const age = payload.ageGuidance;
  return (
    hasText(payload.foodName) &&
    ["dog", "cat"].includes(resolvedPetType) &&
    ["safe", "caution", "dangerous"].includes(payload.safetyLevel) &&
    hasText(payload.summary) &&
    hasText(payload.explanation) &&
    hasText(payload.symptoms) &&
    hasText(payload.portions) &&
    hasText(payload.preparation) &&
    hasText(payload.disclaimer) &&
    age != null &&
    typeof age === "object" &&
    ["safe", "caution", "avoid"].includes(age.puppiesOrKittens) &&
    ["safe", "caution", "avoid"].includes(age.adults) &&
    ["safe", "caution", "avoid"].includes(age.seniors) &&
    hasText(age.note)
  );
}

function cachedHistoryMatchesPetType(analysis, petType, scanMode) {
  if (scanMode === "human_food") return true;
  if (!petType || !analysis?.petType) return false;
  return analysis.petType === petType;
}

function inferHistoryPetType(cacheKey, historyAnalysis, scanMode) {
  const payloadPetType = historyAnalysis?.petType;
  if (["dog", "cat"].includes(payloadPetType)) return payloadPetType;
  if (scanMode === "human_food") return null;
  const key = typeof cacheKey === "string" ? cacheKey.trim().toLowerCase() : "";
  if (key.endsWith("__dog")) return "dog";
  if (key.endsWith("__cat")) return "cat";
  return null;
}

function historyReplayCacheKeys(cacheKey, petType, scanMode) {
  const key = typeof cacheKey === "string" ? cacheKey.trim() : "";
  if (!key) return [];
  if (scanMode === "human_food" || !["dog", "cat"].includes(petType)) return [key];
  const baseKey = key.replace(/__(dog|cat)$/i, "");
  return [...new Set([`${baseKey}__${petType}`, key])];
}

function historyReplayFromHits(source, hits, replayCacheKeys, petType, scanMode) {
  for (const replayKey of replayCacheKeys) {
    const hit = hits?.get(replayKey);
    const analysis = source === "local"
      ? hit?.analysis
      : hit?.hit
        ? hit.analysis
        : null;
    if (analysis && cachedHistoryMatchesPetType(analysis, petType, scanMode)) {
      return {
        analysis,
        dataSource: hit.dataSource || "ai",
        opffData: hit.opffData || null,
      };
    }
  }
  return null;
}

function runningAnalysisStatus(mode, existing) {
  if (mode === "human_food") return "Checking food safety...";
  if (existing?.result?.scorePending === true) return "Scoring verified ingredients...";
  if (existing?.result?.productName) return `Analyzing ${existing.result.productName}...`;
  return "Analyzing product...";
}

function getHumanFoodExplanationTitle(safetyLevel) {
  switch (safetyLevel) {
    case "safe":
      return "Why It's Likely Safe";
    case "caution":
      return "Why To Use Caution";
    case "dangerous":
      return "Why It's Dangerous";
    default:
      return "Why This Matters";
  }
}

function NeedsPetTypeCard({ needsPetType, theme, onChoosePetType }) {
  const displayName = needsPetType.productName || "this product";
  return (
    <View style={needsLabelStyles.container}>
      <Animated.View entering={FadeInUp.duration(400).springify()} style={needsLabelStyles.content}>
        <View style={[needsLabelStyles.foundChip, { backgroundColor: "#E4F0E8" }]}>
          <CheckCircle2 size={14} color="#1F7A45" strokeWidth={2.4} />
          <Text style={[needsLabelStyles.foundChipText, { color: "#1F7A45" }]}>Found</Text>
        </View>

        <Text style={[needsLabelStyles.productName, { color: theme.textPrimary }]} numberOfLines={3}>
          {displayName}
        </Text>

        <Text style={[needsLabelStyles.body, { color: theme.textSecondary }]}>
          Choose who you're scanning this for so the score uses the right nutrition context.
        </Text>

        <View style={needsLabelStyles.petTypeRow}>
          <Pressable
            onPress={() => onChoosePetType("dog")}
            style={({ pressed }) => [needsLabelStyles.petTypeButton, { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.9 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Analyze for a dog"
          >
            <PawPrint size={18} color={theme.buttonText} strokeWidth={2.2} />
            <Text style={[needsLabelStyles.petTypeButtonText, { color: theme.buttonText }]}>Dog</Text>
          </Pressable>

          <Pressable
            onPress={() => onChoosePetType("cat")}
            style={({ pressed }) => [needsLabelStyles.petTypeButton, { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.9 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Analyze for a cat"
          >
            <PawPrint size={18} color={theme.buttonText} strokeWidth={2.2} />
            <Text style={[needsLabelStyles.petTypeButtonText, { color: theme.buttonText }]}>Cat</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const needsLabelStyles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 28, paddingTop: 16 },
  content: { flex: 1, alignItems: "flex-start", paddingTop: 12 },
  foundChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 18,
  },
  foundChipText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4 },
  productName: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    lineHeight: 34,
    marginBottom: 14,
  },
  body: { fontSize: 15, fontWeight: "400", lineHeight: 22 },
  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryCtaText: { fontSize: 16, fontWeight: "600", letterSpacing: -0.1 },
  primaryHint: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
    textAlign: "center",
    width: "100%",
  },
  secondaryCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  secondaryCtaText: { fontSize: 14, fontWeight: "600" },
  secondaryHint: {
    fontSize: 12,
    fontWeight: "400",
    textAlign: "center",
    width: "100%",
    marginTop: -2,
  },
  petTypeRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 28,
  },
  petTypeButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  petTypeButtonText: { fontSize: 16, fontWeight: "700" },
});

export default function ResultsScreen({ route, navigation }) {
  const { mode, base64, uri, barcode, cacheKey, petType: routePetType, scanMode, ingredientBase64, productName: preProductName, brand: preBrand, foodName: preFoodName, historyAnalysis, catalogSnapshot, proQuotaRecoveryAttempted = false } = route.params || {};
  const isHumanFood = mode === "human_food" || scanMode === "human_food";
  const petType = routePetType || (mode === "history" ? inferHistoryPetType(cacheKey, historyAnalysis, scanMode) : null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Analyzing product...");
  const [dataSource, setDataSource] = useState("ai");
  const [opffData, setOpffData] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [scanCounted, setScanCounted] = useState(false);
  const [committedScanCount, setCommittedScanCount] = useState(null);
  // When set, we've identified a product but have no verified data for it.
  // The UI renders an inline confirmation card with two CTAs (capture label / use estimate).
  const [needsLabel, setNeedsLabel] = useState(null);
  const [needsPetType, setNeedsPetType] = useState(null);
  // Two-stage flow phase tracking
  const [phase, setPhase] = useState(null);
  const [phaseProductName, setPhaseProductName] = useState(null);
  const [phaseDataSource, setPhaseDataSource] = useState(null);
  const [phaseIngredientCount, setPhaseIngredientCount] = useState(null);
  const { styles, theme } = useStyles();
  const insets = useSafeAreaInsets();
  const { isPro, incrementScanCount, incrementHumanFoodCount, remainingScans, refreshProStatus, signOut } = useAuth();

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
    borderBottomColor: Colors.divider,
  }));

  const miniBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(scrollY.value, [200, 260], [0, 1], Extrapolation.CLAMP) }],
  }));

  // Guard against React strict mode double-firing the analysis effect while still
  // allowing navigation.replace/new route keys to start a fresh analysis.
  const analysisStartedRef = useRef(null);
  const timerRef = useRef({ start: 0 });
  const redirectTimerRef = useRef(null);
  // Tracks whether the component is still mounted so trailing throttled timers
  // and late service events never call setState on a torn-down tree.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const doneRef = useRef(false);
  useEffect(() => {
    doneRef.current = done;
  }, [done]);
  const uiTerminalRef = useRef(false);
  const proQuotaAutoRetryRef = useRef(false);
  const isProRef = useRef(isPro);
  const refreshProStatusRef = useRef(refreshProStatus);
  const handleRetryRef = useRef(null);
  isProRef.current = isPro;
  refreshProStatusRef.current = refreshProStatus;

  // Throttled setState from service events
  const throttleRef = useRef({ lastTime: 0, timer: null });
  const clearPendingResultUpdate = useCallback(() => {
    const ref = throttleRef.current;
    if (ref.timer) {
      clearTimeout(ref.timer);
      ref.timer = null;
    }
  }, []);
  const throttledSetResult = useCallback((partial) => {
    if (!mountedRef.current) return;
    const ref = throttleRef.current;
    const now = Date.now();
    const elapsed = now - ref.lastTime;

    if (elapsed >= 100) {
      ref.lastTime = now;
      setResult({ ...partial });
    } else {
      if (ref.timer) clearTimeout(ref.timer);
      ref.timer = setTimeout(() => {
        if (!mountedRef.current) return;
        ref.timer = null;
        ref.lastTime = Date.now();
        setResult({ ...partial });
      }, 100 - elapsed);
    }
  }, []);

  // Track the service cacheKey so we can match events
  const serviceKeyRef = useRef(null);
  const [isSlowLoading, setIsSlowLoading] = useState(false);

  const applyExistingAnalysisState = useCallback((existing, fallbackMode) => {
    if (!existing) return false;

    if (existing.status === "complete") {
      setError(null);
      setNeedsLabel(null);
      setNeedsPetType(null);
      setResult(existing.result);
      setDataSource(existing.dataSource);
      if (existing.opffData) setOpffData(existing.opffData);
      setFromCache(false);
      setStreaming(false);
      setIsSlowLoading(false);
      setDone(true);
      uiTerminalRef.current = true;
      return true;
    }

    if (existing.status === "running") {
      uiTerminalRef.current = false;
      setError(null);
      setNeedsLabel(null);
      setNeedsPetType(null);
      setDone(false);
      setStreaming(true);
      setIsSlowLoading(false);
      setLoadingStatus(runningAnalysisStatus(fallbackMode || existing.mode || mode, existing));
      setResult(existing.result ? { ...existing.result } : {});
      if (existing.opffData) setOpffData(existing.opffData);
      if (existing.dataSource) setDataSource(existing.dataSource);
      return true;
    }

    if (existing.status === "needs_pet_type") {
      const recovery = existing.recovery || {};
      setError(null);
      setDone(false);
      setStreaming(false);
      setIsSlowLoading(false);
      setNeedsLabel(null);
      setNeedsPetType({
        mode: recovery.mode || fallbackMode || existing.mode || mode,
        productName: recovery.productName || preProductName,
        brand: recovery.brand || preBrand,
        barcode: recovery.barcode || barcode,
        cacheKey: recovery.selectedCacheKey || cacheKey,
        catalogSnapshot: recovery.catalogSnapshot || catalogSnapshot,
        variant: recovery.variant,
        confidence: recovery.confidence,
      });
      uiTerminalRef.current = true;
      return true;
    }

    if (existing.status === "needs_ingredient_photo") {
      const recovery = existing.recovery || {};
      setError(null);
      setDone(false);
      setStreaming(false);
      setIsSlowLoading(false);
      setNeedsPetType(null);
      setNeedsLabel({
        productName: recovery.productName || preProductName,
        brand: recovery.brand || preBrand,
        variant: recovery.variant,
        petType: recovery.petType || petType,
        confidence: recovery.confidence,
        reason: recovery.reason,
      });
      uiTerminalRef.current = true;
      return true;
    }

    if (existing.status === "error" && existing.error) {
      setNeedsLabel(null);
      setNeedsPetType(null);
      setError(existing.error);
      setStreaming(false);
      setIsSlowLoading(false);
      setDone(true);
      uiTerminalRef.current = true;
      return true;
    }

    if (existing.status === "not_found") {
      setNeedsLabel(null);
      setNeedsPetType(null);
      setError(fallbackMode === "barcode"
        ? "Barcode not found. Try scanning the front of the package instead."
        : "Product not found in database. Try scanning the product instead.");
      setStreaming(false);
      setIsSlowLoading(false);
      setDone(true);
      uiTerminalRef.current = true;
      return true;
    }

    return false;
  }, [barcode, cacheKey, catalogSnapshot, mode, petType, preBrand, preProductName]);

  const failAnalysisStartup = useCallback((message, err) => {
    if (err) {
      console.log("[RESULTS] Analysis startup failed:", err.message || err);
    }
    clearPendingResultUpdate();
    uiTerminalRef.current = true;
    serviceKeyRef.current = null;
    setNeedsLabel(null);
    setNeedsPetType(null);
    setResult(null);
    setStreaming(false);
    setIsSlowLoading(false);
    setError(message);
    setDone(true);
  }, [clearPendingResultUpdate]);

  useEffect(() => {
    const analysisRunKey = route?.key || [
      mode,
      cacheKey,
      barcode,
      uri,
      preProductName,
      preBrand,
      preFoodName,
      petType,
      scanMode,
    ].filter(Boolean).join(":");
    if (analysisStartedRef.current === analysisRunKey) return;
    analysisStartedRef.current = analysisRunKey;
    const isCurrentRun = () => mountedRef.current && analysisStartedRef.current === analysisRunKey;
    timerRef.current.start = Date.now();
    if (throttleRef.current.timer) {
      clearTimeout(throttleRef.current.timer);
      throttleRef.current.timer = null;
    }
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    serviceKeyRef.current = null;
    uiTerminalRef.current = false;
    proQuotaAutoRetryRef.current = Boolean(proQuotaRecoveryAttempted);
    setError(null);
    setNeedsLabel(null);
    setNeedsPetType(null);
    setDone(false);
    setStreaming(false);
    setIsSlowLoading(false);
    setFromCache(false);
    setOpffData(null);
    setPhase(null);
    setPhaseProductName(null);
    setPhaseDataSource(null);
    setPhaseIngredientCount(null);

    // History mode: simple cache lookup, no background service needed
    if (mode === "history") {
      setLoadingStatus("Loading cached result...");
      const replayCacheKeys = historyReplayCacheKeys(cacheKey, petType, scanMode);
      let active = null;
      let activeKey = null;
      for (const replayKey of replayCacheKeys) {
        const candidate = analysisService.getAnalysis(replayKey);
        if (
          candidate?.status === "running" &&
          (!candidate.result || cachedHistoryMatchesPetType(candidate.result, petType, scanMode))
        ) {
          active = candidate;
          activeKey = replayKey;
          break;
        }
        if (
          candidate?.status === "complete" &&
          cachedHistoryMatchesPetType(candidate.result, petType, scanMode)
        ) {
          active = candidate;
          activeKey = replayKey;
          break;
        }
      }

      if (active && active.status === "running") {
        // Attach to live analysis
        serviceKeyRef.current = activeKey || cacheKey;
        if (active.result) {
          setResult({ ...active.result });
          setStreaming(true);
        } else {
          setResult({});
          setStreaming(true);
        }
        setIsSlowLoading(false);
        setLoadingStatus(runningAnalysisStatus(scanMode || mode, active));
        if (active.opffData) setOpffData(active.opffData);
        setDataSource(active.dataSource);
        return;
      }

      if (active && active.status === "complete" && cachedHistoryMatchesPetType(active.result, petType, scanMode)) {
        setResult(active.result);
        setDataSource(active.dataSource);
        if (active.opffData) setOpffData(active.opffData);
        setFromCache(true);
        setDone(true);
        return;
      }

      if (scanMode === "human_food" && isReplayableHumanFoodHistoryPayload(historyAnalysis, petType)) {
        setResult({ ...historyAnalysis, petType: historyAnalysis.petType || petType });
        setDataSource("ai");
        setFromCache(true);
        setDone(true);
        return;
      }

      // Layer 2: AsyncStorage (instant, offline-capable)
      // Layer 3: Supabase cache (network, shared)
      const historyCacheController = new AbortController();
      let historyTimedOut = false;
      const historyTimeout = setTimeout(() => {
        if (!isCurrentRun() || historyCacheController.signal.aborted) return;
        historyTimedOut = true;
        historyCacheController.abort();
        setError("This saved result is taking too long to load. Scan it again to refresh the analysis.");
        setDone(true);
      }, HISTORY_RESULT_LOAD_TIMEOUT_MS);
      (async () => {
        try {
          const localHitsPromise = analysisService.getLocalResults(replayCacheKeys).catch((err) => {
            console.log("[RESULTS] Local history replay failed:", err.message);
            return new Map();
          });
          const cachedHitsPromise = getCachedAnalyses(replayCacheKeys, {
            signal: historyCacheController.signal,
            timeoutMs: HISTORY_SHARED_CACHE_TIMEOUT_MS,
          }).catch((err) => {
            if (!historyCacheController.signal.aborted) {
              console.log("[RESULTS] Shared history replay failed:", err.message);
            }
            return new Map();
          });

          // Local and shared replay both start immediately; whichever returns
          // a valid saved score first can unblock the screen.
          const pendingReplays = [
            localHitsPromise.then((hits) => ({ source: "local", hits })),
            cachedHitsPromise.then((hits) => ({ source: "shared", hits })),
          ];
          while (pendingReplays.length > 0) {
            const settled = await Promise.race(
              pendingReplays.map((promise, index) => promise.then((value) => ({ ...value, index })))
            );
            pendingReplays.splice(settled.index, 1);
            if (historyCacheController.signal.aborted) return;
            if (!isCurrentRun()) return;
            const replay = historyReplayFromHits(settled.source, settled.hits, replayCacheKeys, petType, scanMode);
            if (replay) {
              setResult(replay.analysis);
              setDataSource(replay.dataSource);
              if (replay.opffData) setOpffData(replay.opffData);
              setFromCache(true);
              setDone(true);
              historyCacheController.abort();
              return;
            }
          }

          setError("This result is no longer available. Scan it again to refresh the analysis.");
          setDone(true);
        } catch (err) {
          if (historyCacheController.signal.aborted) return;
          if (!isCurrentRun()) return;
          console.log("[RESULTS] Error loading cached result:", err.message);
          setError("Failed to load result. Please try scanning again.");
          setDone(true);
        } finally {
          if (!historyTimedOut) clearTimeout(historyTimeout);
        }
      })();
      return () => {
        clearTimeout(historyTimeout);
        historyCacheController.abort();
      };
    }

    // Search mode: product selected from search — use verified DB data
    if (mode === "search") {
      setLoadingStatus("Analyzing " + (preProductName || "product") + "...");
      setStreaming(true);
      setResult({});

      let key = null;
      try {
        key = analysisService.startAnalysis({
          mode: "search",
          productName: preProductName,
          brand: preBrand,
          selectedCacheKey: cacheKey,
          selectedProductData: catalogSnapshot,
          petType,
          isPro,
        });
      } catch (err) {
        failAnalysisStartup("Could not start analysis.", err);
        return;
      }
      serviceKeyRef.current = key;

      if (!key) {
        failAnalysisStartup("Could not start analysis.");
        return;
      }

      const existing = analysisService.getAnalysis(key);
      applyExistingAnalysisState(existing, "search");
      return;
    }

    // Photo mode: delegate to analysis service
    setLoadingStatus(isHumanFood ? "Checking food safety..." : "Analyzing product...");
    setStreaming(true);
    setResult({});

    let key = null;
    try {
      key = analysisService.startAnalysis({ mode, base64, barcode, uri, petType, isPro, ingredientBase64, productName: preProductName, brand: preBrand, foodName: preFoodName });
    } catch (err) {
      failAnalysisStartup("Could not start analysis. Please try scanning again.", err);
      return;
    }
    serviceKeyRef.current = key;

    if (!key) {
      failAnalysisStartup("Could not start analysis. Please try scanning again.");
      return;
    }

    // If service already had a completed result (re-scan dedup), apply immediately
    const existing = analysisService.getAnalysis(key);
    applyExistingAnalysisState(existing, mode);
  }, [route?.key, mode, base64, cacheKey, barcode, uri, petType, scanMode, preProductName, preBrand, preFoodName, ingredientBase64, historyAnalysis, catalogSnapshot, proQuotaRecoveryAttempted, isHumanFood, isPro, throttledSetResult, applyExistingAnalysisState, failAnalysisStartup]);

  // Subscribe to service events
  useEffect(() => {
    const unsub = analysisService.subscribe((event) => {
      // Late events fired after we've navigated away should be dropped.
      if (!mountedRef.current) return;
      const myKey = serviceKeyRef.current;
      if (!myKey) return;

      // Match: both keys must resolve to the same canonical key
      const resolvedMy = analysisService.resolveKey(myKey);
      const resolvedEvent = analysisService.resolveKey(event.cacheKey);
      if (resolvedMy !== resolvedEvent && event.cacheKey !== myKey) return;

      if (event.type === "phase") {
        if (uiTerminalRef.current) return;
        setError(null);
        setNeedsLabel(null);
        setNeedsPetType(null);
        setDone(false);
        setStreaming(true);
        setPhase(event.phase);
        if (event.productName) setPhaseProductName(event.productName);
        if (event.dataSource) setPhaseDataSource(event.dataSource);
        if (event.ingredientCount) setPhaseIngredientCount(event.ingredientCount);
        if (event.message) setLoadingStatus(event.message);
      } else if (event.type === "update") {
        if (uiTerminalRef.current) return;
        setError(null);
        setNeedsLabel(null);
        setNeedsPetType(null);
        setDone(false);
        setStreaming(true);
        throttledSetResult(event.result);
        if (event.opffData) setOpffData(event.opffData);
      } else if (event.type === "complete") {
        clearPendingResultUpdate();
        if (uiTerminalRef.current) return;
        setError(null);
        setNeedsLabel(null);
        setNeedsPetType(null);
        setResult(event.result);
        setDataSource(event.dataSource);
        if (event.opffData) setOpffData(event.opffData);
        setFromCache(!!event.fromCache);
        setStreaming(false);
        setIsSlowLoading(false);
        setDone(true);
        uiTerminalRef.current = true;
        const eventCacheKey = !isHumanFood && event.cacheKey ? String(event.cacheKey) : "";
        const eventProductCacheKey = eventCacheKey.replace(/__(dog|cat)$/i, "");
        trackEvent("analysis_completed", {
          mode: isHumanFood ? "human_food" : mode,
          fromCache: Boolean(event.fromCache),
          dataSource: event.dataSource || "unknown",
          petType: event.result?.petType || petType || "unknown",
          score: Number(event.result?.overallScore) || null,
          safetyLevel: event.result?.safetyLevel || null,
          ingredientCount: Array.isArray(event.result?.ingredients) ? event.result.ingredients.length : 0,
          cacheKeyHash: analyticsKeyHash(eventProductCacheKey),
          analysisCacheKeyHash: analyticsKeyHash(eventCacheKey),
        });
      } else if (event.type === "need_ingredient_photo") {
        clearPendingResultUpdate();
        if (uiTerminalRef.current) return;
        setError(null);
        setDone(false);
        setStreaming(false);
        setIsSlowLoading(false);
        setNeedsPetType(null);
        // Product identified but not in database — show an inline card so the
        // user can provide a label photo or fall through to an estimate.
        setNeedsLabel({
          productName: event.productName,
          brand: event.brand,
          variant: event.variant,
          petType: event.petType || petType,
          confidence: event.confidence,
          reason: event.reason,
        });
        uiTerminalRef.current = true;
        trackEvent("ingredient_label_requested", {
          mode,
          petType: event.petType || petType || "unknown",
          confidence: event.confidence || "unknown",
        });
      } else if (event.type === "need_pet_type") {
        if (uiTerminalRef.current) return;
        clearPendingResultUpdate();
        setError(null);
        setDone(false);
        setStreaming(false);
        setIsSlowLoading(false);
        setNeedsLabel(null);
        setNeedsPetType({
        mode: event.mode || mode,
        productName: event.productName || preProductName,
        brand: event.brand || preBrand,
        barcode: event.barcode || barcode,
        cacheKey: event.selectedCacheKey || cacheKey,
        catalogSnapshot: event.catalogSnapshot || catalogSnapshot,
        variant: event.variant,
        confidence: event.confidence,
      });
        uiTerminalRef.current = true;
        trackEvent("pet_type_requested", {
          mode: event.mode || mode,
          confidence: event.confidence || "unknown",
        });
      } else if (event.type === "barcode_not_found") {
        if (uiTerminalRef.current) return;
        clearPendingResultUpdate();
        setNeedsLabel(null);
        setNeedsPetType(null);
        setError("Barcode not found. Try scanning the front of the package instead.");
        setStreaming(false);
        setIsSlowLoading(false);
        setDone(true);
        uiTerminalRef.current = true;
        trackEvent("analysis_failed", {
          mode: "barcode",
          kind: "product_not_found",
          action: "scan_product",
        });
      } else if (event.type === "error") {
        clearPendingResultUpdate();
        if (uiTerminalRef.current) return;
        setNeedsLabel(null);
        setNeedsPetType(null);
        const classified = classifyError(event.error);
        const currentIsPro = isProRef.current;
        const currentRefreshProStatus = refreshProStatusRef.current;
        const currentHandleRetry = handleRetryRef.current;
        if (classified.kind === "quota" && currentIsPro && currentRefreshProStatus && currentHandleRetry && !proQuotaAutoRetryRef.current) {
          proQuotaAutoRetryRef.current = true;
          setError(null);
          setResult(null);
          setLoadingStatus("Refreshing subscription...");
          setStreaming(true);
          setIsSlowLoading(false);
          setDone(false);
          currentRefreshProStatus()
            .then((refreshed) => {
              if (!mountedRef.current) return;
              if (refreshed === true) {
                currentHandleRetry({ proQuotaRecoveryAttempted: true });
                return;
              }
              setError(event.error);
              setStreaming(false);
              setIsSlowLoading(false);
              setDone(true);
              uiTerminalRef.current = true;
            })
            .catch((err) => {
              if (!mountedRef.current) return;
              console.log("[RESULTS] Auto Pro quota recovery failed:", err.message);
              setError(event.error);
              setStreaming(false);
              setIsSlowLoading(false);
              setDone(true);
              uiTerminalRef.current = true;
            });
          return;
        }
        setError(event.error);
        setStreaming(false);
        setIsSlowLoading(false);
        setDone(true);
        uiTerminalRef.current = true;
        trackEvent("analysis_failed", {
          mode: isHumanFood ? "human_food" : mode,
          kind: classified.kind,
          action: classified.action,
        });
      }
    });

    const currentKey = serviceKeyRef.current;
    let retainedKey = null;
    if (currentKey) {
      retainedKey = analysisService.retainAnalysis(currentKey);
      applyExistingAnalysisState(analysisService.getAnalysis(currentKey), mode);
    }

    return () => {
      const cleanupKey = retainedKey || currentKey;
      unsub();
      if (throttleRef.current.timer) {
        clearTimeout(throttleRef.current.timer);
      }
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
      analysisService.releaseAnalysis(cleanupKey);
      if (!doneRef.current && mode !== "history" && !navigation.isFocused()) {
        analysisService.cancelAnalysis(cleanupKey, "results_unmounted");
      }
    };
  }, [route?.key, mode, navigation, throttledSetResult, clearPendingResultUpdate, isHumanFood, petType, preProductName, preBrand, preFoodName, barcode, cacheKey, base64, uri, ingredientBase64, scanMode, historyAnalysis, catalogSnapshot, applyExistingAnalysisState]);

  // Progressive loading messages (hard timeout handled by analysisService._withTimeout)
  useEffect(() => {
    if (!streaming || done) return;
    setIsSlowLoading(false);
    const timers = [
      setTimeout(() => {
        if (!phase) setLoadingStatus("Reading ingredients...");
      }, 8000),
      setTimeout(() => {
        setIsSlowLoading(true);
      }, 20000),
      setTimeout(() => {
        if (!phase) setLoadingStatus("Almost there...");
      }, 30000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [streaming, done, phase]);

  // Last-resort UI guard. The analysis service owns the real hard timeout,
  // but if a terminal event is missed the Results screen should still leave
  // loading/partial state and give the user a retry path.
  useEffect(() => {
    if (!streaming || done || error || needsLabel || needsPetType) return;
    const watchdog = setTimeout(() => {
      if (!mountedRef.current || doneRef.current) return;
      const currentKey = serviceKeyRef.current;
      const current = currentKey ? analysisService.getAnalysis(currentKey) : null;
      if (current && current.status !== "running" && applyExistingAnalysisState(current, mode)) {
        return;
      }
      if (currentKey && current?.status === "running") {
        analysisService.releaseAnalysis(currentKey);
        analysisService.cancelAnalysis(currentKey, "results_watchdog_timeout");
      }
      clearPendingResultUpdate();
      uiTerminalRef.current = true;
      setNeedsLabel(null);
      setNeedsPetType(null);
      setResult(null);
      setStreaming(false);
      setIsSlowLoading(false);
      setError("Analysis is taking too long. Please try again.");
      setDone(true);
    }, RESULTS_STREAMING_WATCHDOG_MS);
    return () => clearTimeout(watchdog);
  }, [streaming, done, error, needsLabel, needsPetType, mode, applyExistingAnalysisState, clearPendingResultUpdate]);

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
    console.log(`[TIMER] Full analysis complete: ${totalMs}ms (${totalSec}s)`);
  }, [done]);

  // Increment the right counter for free users — only when we actually delivered a result.
  // Pet-food modes hit the lifetime scan_count; human_food hits the per-day human_food_count.
  // Don't burn quota on: errors, history views, pro users, or already-counted sessions.
  useEffect(() => {
    if (!done || scanCounted || isPro) return;
    if (mode === "history") return;
    if (error) return;
    if (!result) return;
    if (result.error) return;
    // Pet food modes need productName; human_food needs foodName.
    if (isHumanFood) {
      if (!result.foodName) return;
    } else {
      if (!result.productName) return;
      const score = Number(result.overallScore);
      if (!Number.isFinite(score) || score < 1 || score > 100) return;
    }
    setScanCounted(true);
    let cancelled = false;
    (async () => {
      try {
        const committedCount = isHumanFood
          ? await incrementHumanFoodCount()
          : await incrementScanCount();
        if (!cancelled && !isHumanFood && typeof committedCount === "number") {
          setCommittedScanCount(committedCount);
        }
      } catch (err) {
        console.log("[RESULTS] Error incrementing quota:", err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [done, scanCounted, isPro, mode, isHumanFood, error, result, incrementScanCount, incrementHumanFoodCount]);

  // History saving is now handled by analysisService on completion

  const shareCardRef = useRef();
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [showPostScanPrompt, setShowPostScanPrompt] = useState(false);

  // First scan toast (one-time celebratory message)
  const [showFirstScanToast, setShowFirstScanToast] = useState(false);
  const firstScanToastScheduledRef = useRef(false);
  useEffect(() => {
    if (!done || isPro || mode === "history" || !result?.overallScore) return;
    if (firstScanToastScheduledRef.current) return;
    let showTimer, hideTimer;
    AsyncStorage.getItem("@woof_first_scan_toast_shown").then((val) => {
      if (val) return;
      firstScanToastScheduledRef.current = true;
      showTimer = setTimeout(() => setShowFirstScanToast(true), 1200);
      hideTimer = setTimeout(() => setShowFirstScanToast(false), 4200);
    }).catch(() => {});
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [done, isPro, mode, result?.overallScore]);

  useEffect(() => {
    if (!showFirstScanToast) return;
    AsyncStorage.setItem("@woof_first_scan_toast_shown", "true").catch(() => {});
  }, [showFirstScanToast]);

  useEffect(() => {
    if (mode !== "search" || !cacheKey || !error) return;
    if (classifyError(error).kind !== "product_not_found") return;
    removeRecentSearch(cacheKey).catch((err) => {
      console.log("[RESULTS] Failed to remove rejected recent search:", err.message);
    });
  }, [mode, cacheKey, error]);

  // Check if post-scan prompt should show (once, after 2+ scans, free users only)
  useEffect(() => {
    if (!done || isPro || mode === "history" || isHumanFood) return;
    if (typeof committedScanCount !== "number") return;
    if (committedScanCount < 2) return;
    AsyncStorage.getItem("@woof_post_scan_prompt_shown").then((val) => {
      if (!val) setShowPostScanPrompt(true);
    }).catch(() => {});
  }, [done, isPro, mode, isHumanFood, committedScanCount]);

  const dismissPostScanPrompt = () => {
    setShowPostScanPrompt(false);
    AsyncStorage.setItem("@woof_post_scan_prompt_shown", "true");
  };

  const navigatePaywall = (source) => {
    navigation.navigate("Paywall", {
      source,
      productName: result?.productName,
      score: result?.overallScore,
    });
  };

  const prestartReplacementAnalysis = useCallback((params, label) => {
    try {
      analysisService.startAnalysis({ ...params, isPro });
    } catch (err) {
      console.log(`[RESULTS] ${label} analysis prestart failed:`, err.message);
    }
  }, [isPro]);

  // True retry — re-mount the screen with the same input so the analysis effect re-runs.
  // Useful when timeouts, transient network errors, or repaired Pro entitlement state
  // stalled the first attempt.
  const handleRetry = useCallback((options = {}) => {
    const retryExtras = options?.proQuotaRecoveryAttempted ? { proQuotaRecoveryAttempted: true } : {};
    if (mode === "history" && cacheKey) {
      navigation.replace("Results", {
        mode,
        cacheKey,
        ...retryExtras,
        ...(scanMode && { scanMode }),
        ...(petType && { petType }),
        ...(historyAnalysis && { historyAnalysis }),
      });
      return;
    }
    if (mode === "barcode" && barcode) {
      prestartReplacementAnalysis({ mode: "barcode", barcode, petType }, "Retry barcode");
      navigation.replace("Results", {
        mode,
        barcode,
        ...retryExtras,
        ...(petType && { petType }),
        ...(preProductName && { productName: preProductName }),
        ...(preBrand && { brand: preBrand }),
        ...(cacheKey && { cacheKey }),
        ...(catalogSnapshot && { catalogSnapshot }),
      });
      return;
    }
    if (mode === "search" && preProductName) {
      prestartReplacementAnalysis({
        mode: "search",
        productName: preProductName,
        brand: preBrand,
        selectedCacheKey: cacheKey,
        selectedProductData: catalogSnapshot,
        petType,
      }, "Retry search");
      navigation.replace("Results", { mode, productName: preProductName, brand: preBrand, cacheKey, catalogSnapshot, petType, ...retryExtras });
      return;
    }
    if (mode === "human_food" && preFoodName && !base64) {
      prestartReplacementAnalysis({ mode: "human_food", foodName: preFoodName, petType }, "Retry human-food text");
      navigation.replace("Results", { mode, foodName: preFoodName, petType, ...retryExtras });
      return;
    }
    if ((mode === "photo" || mode === "human_food" || mode === "photo_with_ingredients") && base64) {
      prestartReplacementAnalysis({
        mode,
        base64,
        uri,
        petType,
        ingredientBase64,
        productName: preProductName,
        brand: preBrand,
        foodName: preFoodName,
      }, "Retry photo");
      navigation.replace("Results", { mode, base64, uri, petType, ingredientBase64, productName: preProductName, brand: preBrand, foodName: preFoodName, ...retryExtras });
      return;
    }
    // No retryable input — fall back to scan another
    navigation.popToTop();
  }, [navigation, mode, cacheKey, scanMode, petType, historyAnalysis, barcode, preProductName, preBrand, preFoodName, base64, uri, ingredientBase64, catalogSnapshot, prestartReplacementAnalysis]);
  handleRetryRef.current = handleRetry;

  const handleLoadingRetry = useCallback(() => {
    const currentKey = serviceKeyRef.current;
    if (currentKey) {
      analysisService.releaseAnalysis(currentKey);
      analysisService.cancelAnalysis(currentKey, "user_loading_retry");
    }
    clearPendingResultUpdate();
    uiTerminalRef.current = false;
    setNeedsLabel(null);
    setNeedsPetType(null);
    setResult(null);
    setError(null);
    setStreaming(false);
    setIsSlowLoading(false);
    setDone(false);
    handleRetry();
  }, [clearPendingResultUpdate, handleRetry]);

  const handleUpgradeFromError = async () => {
    Haptics.selectionAsync();
    if (isPro) {
      const refreshed = await refreshProStatus();
      if (refreshed === false) {
        navigation.navigate("Paywall", {
          source: "quota_error",
          productName: result?.productName || preProductName || preFoodName,
          score: result?.overallScore,
          mode,
        });
        return;
      }
      if (refreshed === true) {
        handleRetry();
        return;
      }
      Alert.alert(
        "Subscription Check Failed",
        "We couldn't refresh your subscription status from RevenueCat. Try again from a development, TestFlight, or App Store build, or restore purchases from the Pro screen."
      );
      return;
    }

    navigation.navigate("Paywall", {
      source: "quota_error",
      productName: result?.productName || preProductName || preFoodName,
      score: result?.overallScore,
      mode,
    });
  };

  const handleSignInAgain = async () => {
    Haptics.selectionAsync();
    try {
      await signOut();
    } catch (err) {
      console.log("[RESULTS] Sign out before re-auth failed:", err.message);
    }
    navigation.navigate("Auth", {
      source: "session_expired",
      returnTo: "Results",
      mode,
    });
  };

  const handleScanAnother = () => navigation.popToTop();
  const handleScanProduct = () => {
    Haptics.selectionAsync();
    navigation.replace("Scanner", { petType });
  };

  const handleChoosePetType = useCallback((selectedPetType) => {
    if (!needsPetType) return;
    Haptics.selectionAsync();
    setNeedsPetType(null);

    if (needsPetType.mode === "search") {
      prestartReplacementAnalysis({
        mode: "search",
        productName: needsPetType.productName || preProductName,
        brand: needsPetType.brand || preBrand,
        selectedCacheKey: needsPetType.cacheKey || cacheKey,
        selectedProductData: needsPetType.catalogSnapshot || catalogSnapshot,
        petType: selectedPetType,
      }, "Pet-type search");
      navigation.replace("Results", {
        mode: "search",
        productName: needsPetType.productName || preProductName,
        brand: needsPetType.brand || preBrand,
        cacheKey: needsPetType.cacheKey || cacheKey,
        catalogSnapshot: needsPetType.catalogSnapshot || catalogSnapshot,
        petType: selectedPetType,
      });
      return;
    }

    if (needsPetType.mode === "barcode") {
      prestartReplacementAnalysis({
        mode: "barcode",
        barcode: needsPetType.barcode || barcode,
        petType: selectedPetType,
      }, "Pet-type barcode");
      navigation.replace("Results", {
        mode: "barcode",
        barcode: needsPetType.barcode || barcode,
        petType: selectedPetType,
      });
      return;
    }

    if (needsPetType.mode === "photo_with_ingredients") {
      prestartReplacementAnalysis({
        mode: "photo_with_ingredients",
        base64,
        uri,
        ingredientBase64,
        productName: needsPetType.productName || preProductName,
        brand: needsPetType.brand || preBrand,
        petType: selectedPetType,
      }, "Pet-type label photo");
      navigation.replace("Results", {
        mode: "photo_with_ingredients",
        base64,
        uri,
        ingredientBase64,
        productName: needsPetType.productName || preProductName,
        brand: needsPetType.brand || preBrand,
        petType: selectedPetType,
      });
      return;
    }

    prestartReplacementAnalysis({
      mode: "photo",
      base64,
      uri,
      petType: selectedPetType,
    }, "Pet-type photo");
    navigation.replace("Results", {
      mode: "photo",
      base64,
      uri,
      petType: selectedPetType,
    });
  }, [needsPetType, navigation, preProductName, preBrand, cacheKey, catalogSnapshot, barcode, base64, uri, ingredientBase64, prestartReplacementAnalysis]);

  // From the inline "we don't have this product" card: take user to the label
  // capture screen with all context preserved.
  const handleCaptureLabel = useCallback(() => {
    if (!needsLabel) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.replace("IngredientCapture", {
      productName: needsLabel.productName,
      brand: needsLabel.brand,
      variant: needsLabel.variant,
      petType: needsLabel.petType,
      confidence: needsLabel.confidence,
      base64,
      uri,
    });
  }, [needsLabel, base64, uri, navigation]);

  // Fall through to knowledge-based analysis using just the front photo.
  // Reuses the existing photo_with_ingredients flow with no ingredientBase64.
  const handleUseEstimate = useCallback(() => {
    if (!needsLabel || !base64) return;
    Haptics.selectionAsync();
    setNeedsLabel(null);
    prestartReplacementAnalysis({
      mode: "photo_with_ingredients",
      base64,
      uri,
      productName: needsLabel.productName,
      brand: needsLabel.brand,
      petType: needsLabel.petType,
    }, "Inline estimate");
    navigation.replace("Results", {
      mode: "photo_with_ingredients",
      base64,
      uri,
      productName: needsLabel.productName,
      brand: needsLabel.brand,
      petType: needsLabel.petType,
    });
  }, [needsLabel, base64, uri, navigation, prestartReplacementAnalysis]);

  const handleTakePhoto = () => navigation.popToTop();
  const handleBack = () => {
    navigation.popToTop();
  };

  const handleShare = async () => {
    if (!result?.productName || !result?.overallScore) return;

    // Share gate for free users
    if (!isPro) {
      Alert.alert(
        "Share with Woof Pro",
        "Upgrade to Pro to share your scan results.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "See Plans",
            onPress: () => navigatePaywall("share_gate"),
          },
        ]
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const config = getScoreConfig(result.overallScore);
    const cleanName = result.productName
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 30)
      .toLowerCase();
    const desiredName = `Woof-${cleanName}-${result.overallScore}`;
    const shareMessage = `${result.productName} scored ${result.overallScore}/100 (${config.label}) on Woof!`;
    let tmpFile = null;
    let cleanFile = null;
    try {
      const tmpUri = await captureRef(shareCardRef, {
        format: "png",
        quality: 1,
        fileName: desiredName,
      });
      tmpFile = new File(tmpUri);
      cleanFile = new File(Paths.cache, `${desiredName}.png`);
      if (cleanFile.exists) cleanFile.delete();
      tmpFile.copy(cleanFile);
      const cleanUri = cleanFile.uri;
      if (Platform.OS === "ios") {
        await Share.share({
          url: cleanUri,
          message: shareMessage,
        });
      } else {
        await Sharing.shareAsync(cleanUri, {
          mimeType: "image/png",
          dialogTitle: `Woof Score: ${result.overallScore}/100`,
        });
      }
    } catch (err) {
      console.log("[SHARE] Image share failed:", err.message);
      // Fallback to text share
      try {
        await Share.share({ message: shareMessage });
        Alert.alert("Shared as Text", "We couldn't attach the score-card image, so we shared the result as text instead.");
      } catch (shareErr) {
        console.log("[SHARE] Text share also failed:", shareErr.message);
      }
    } finally {
      for (const file of [tmpFile, cleanFile]) {
        try {
          if (file?.exists) file.delete();
        } catch (cleanupErr) {
          console.log("[SHARE] Failed to clean up shared image:", cleanupErr.message);
        }
      }
    }
  };

  const isPausedForInput = Boolean(needsPetType || needsLabel);
  const hasRenderableResult = Boolean(result && (
    isHumanFood
      ? (result.foodName || result.summary || result.safetyLevel)
      : (result.productName || result.scorePending === true || result.overallScore != null)
  ));
  const isLoading = !hasRenderableResult && !error && !done && !isPausedForInput;

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
            <ChevronLeft size={20} color={theme.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={styles.shareButton}>
            <Share2 size={24} color={theme.textTertiary} strokeWidth={2} />
          </View>
        </View>
        <LoadingSkeleton
          loadingStatus={loadingStatus}
          isSlowLoading={isSlowLoading}
          phase={phase}
          productName={phaseProductName}
          dataSource={phaseDataSource}
          ingredientCount={phaseIngredientCount}
          onRetry={handleLoadingRetry}
        />
      </View>
    );
  }

  // --- Identified product with ambiguous species: ask before scoring ---
  if (needsPetType) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={20} color={theme.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={styles.shareButton} />
        </View>
        <NeedsPetTypeCard
          needsPetType={needsPetType}
          theme={theme}
          onChoosePetType={handleChoosePetType}
        />
      </View>
    );
  }

  // --- Identified but not in DB: ask the user how to proceed ---
  if (needsLabel) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={20} color={theme.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={styles.shareButton} />
        </View>
        <NeedsLabelCard
          needsLabel={needsLabel}
          theme={theme}
          onCaptureLabel={handleCaptureLabel}
          onUseEstimate={handleUseEstimate}
        />
      </View>
    );
  }

  // --- Error (no meaningful result) ---
  // Also catches the partial-success trap: analysis streamed ingredients but never
  // produced an overallScore (onUpdate set state.result, then Claude errored or
  // the stream was cut). Rendering that half-populated result shows the broken
  // "Standard supplement / additive" placeholders everywhere with no score/verdict.
  // Treat it as an error so the user gets a retry CTA instead of the broken view.
  const hasCatalogPreviewWithoutScore = Boolean(
    error &&
    !isHumanFood &&
    result?.scorePending === true &&
    result?.productName &&
    result?.overallScore == null
  );
  const brokenAnalysis = done && !isHumanFood && !streaming && result && result.overallScore == null && !hasCatalogPreviewWithoutScore;
  if ((error && (!result || !result.productName)) || brokenAnalysis) {
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
            <ChevronLeft size={20} color={theme.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={styles.shareButton} />
        </View>
        <ErrorState
          error={error || "Analysis was interrupted. Please try again."}
          mode={mode}
          onRetry={handleRetry}
          onScanAnother={handleScanAnother}
          onUpgrade={handleUpgradeFromError}
          onScanProduct={handleScanProduct}
          onSignInAgain={handleSignInAgain}
          isPro={isPro}
        />
      </View>
    );
  }

  if (!result) return null;

  // --- Derived data ---
  const hasScore = result?.overallScore != null;
  const scoreUnavailable = Boolean(error && !hasScore && result?.scorePending === true);
  const isScorePending = !hasScore && (streaming || scoreUnavailable) && result?.scorePending === true;
  const scorePendingIngredientPreview = isScorePending && !isPro && Array.isArray(result?.ingredients)
    ? result.ingredients.slice(0, 3)
    : [];
  const { nutritionAnalysis, categories } = result || {};
  // Prefer scraped rating over Claude's generated one
  const customerRating = result?.scrapedRating
    ? { score: result.scrapedRating.score, outOf: result.scrapedRating.outOf, totalReviews: null, sentiment: null }
    : result?.customerRating;

  // --- Success — unified scrollable page ---
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header: back + mini score (fades in on scroll) + share */}
      <Animated.View style={[styles.header, headerBorderStyle]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <ChevronLeft size={20} color={theme.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>

        {!isHumanFood ? (
          <WoofWordmark />
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {!isHumanFood && (
          <TouchableOpacity
            style={[styles.shareButton, !(done && hasScore) && { opacity: 0.3 }]}
            onPress={handleShare}
            activeOpacity={0.7}
            disabled={!(done && hasScore)}
            accessibilityRole="button"
            accessibilityLabel="Share results"
            accessibilityState={{ disabled: !(done && hasScore) }}
          >
            <Share2 size={18} color={theme.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* === Human Food Safety Layout === */}
        {isHumanFood && (() => {
          const safetyVerdictColor = result?.safetyLevel === "safe" ? "#34C759" : result?.safetyLevel === "caution" ? "#FF9F0A" : "#FF3B30";
          return (
          <>
            {/* Safety Hero */}
            {result.safetyLevel ? (
              <StreamSection visible delay={50}>
                <View style={styles.safetyHero}>
                  <SafetyBadge safetyLevel={result.safetyLevel} petType={petType || result.petType} />
                  <Text style={styles.safetyFoodName}>{result.foodName}</Text>
                  <Text style={styles.safetyPetType}>for {(petType || result.petType) === "dog" ? "Dogs" : "Cats"}</Text>
                  {result.summary && <Text style={styles.safetySummary}>{result.summary}</Text>}
                </View>
              </StreamSection>
            ) : streaming ? (
              <View style={styles.heroSection}>
                <SkeletonCircle size={192} strokeWidth={14} />
              </View>
            ) : null}

            {done && result.safetyLevel && (
              <StreamSection visible delay={100}>
                <Disclaimer />
              </StreamSection>
            )}

            {/* Guidance — vertical list */}
            {done && (
              <StreamSection visible delay={150}>
                <View style={[styles.guidanceCard, Shadows.cardSubtle]}>
                  {[
                    { label: "Portion", value: result.portions || "N/A", color: result.portions === "Do not feed" ? "#FF3B30" : theme.textPrimary },
                    { label: "Preparation", value: result.preparation || "Not applicable", color: theme.textPrimary },
                    result.ageGuidance?.note && { label: "Safe for", value: result.ageGuidance.note, color: result.ageGuidance.note === "All ages" ? theme.textPrimary : "#FF3B30" },
                    result.safetyLevel === "dangerous" && { label: "Toxic to", value: "All " + ((petType || result.petType) === "dog" ? "dogs" : "cats"), color: "#FF3B30" },
                  ].filter(Boolean).map((item, i, arr) => (
                    <View key={i}>
                      {i > 0 && <View style={styles.guidanceDivider} />}
                      <View style={styles.guidanceRow}>
                        <Text style={[styles.guidanceLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                        <Text style={[styles.guidanceValue, { color: item.color }]}>{item.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </StreamSection>
            )}

            {/* Toxic Compounds */}
            {done && result.toxicCompounds?.length > 0 && result.toxicCompounds[0] !== "None" && (
              <StreamSection visible delay={200}>
                <View style={styles.toxicSection}>
                  <Text style={styles.toxicTitle}>Toxic Compounds</Text>
                  <View style={styles.toxicCard}>
                    {result.toxicCompounds.map((c, i) => (
                      <React.Fragment key={`t${i}`}>
                        {i > 0 && <View style={styles.toxicDivider} />}
                        <View style={styles.toxicRow}>
                          <View style={styles.toxicDot} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.toxicName, { color: theme.textPrimary }]}>{c}</Text>
                          </View>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              </StreamSection>
            )}

            {/* Explanation */}
            {done && result.explanation && (
              <StreamSection visible delay={300}>
                <View style={styles.explanationSection}>
                  <Text style={styles.explanationTitle}>{getHumanFoodExplanationTitle(result.safetyLevel)}</Text>
                  <View style={styles.explanationCard}>
                    <Text style={[styles.explanationText, { color: theme.textPrimary }]}>{result.explanation}</Text>
                  </View>
                </View>
              </StreamSection>
            )}

            {/* Symptoms to Watch */}
            {done && result.symptoms && result.symptoms !== "N/A" && !result.symptoms.startsWith("N/A") && result.safetyLevel !== "safe" && (
              <StreamSection visible delay={350}>
                <View style={styles.symptomsSection}>
                  <Text style={styles.symptomsTitle}>Symptoms to Watch</Text>
                  <View style={[styles.symptomsCard, result.safetyLevel === "caution" && { backgroundColor: theme.isDark ? "rgba(255,159,10,0.12)" : "rgba(255,159,10,0.06)" }]}>
                    <Text style={styles.symptomsText}>{result.symptoms}</Text>
                    {result.safetyLevel !== "safe" && (
                      <>
                        <View style={styles.symptomsDivider} />
                        <Text style={styles.symptomsEmergency}>
                          If your {(petType || result.petType) === "dog" ? "dog" : "cat"} has eaten this, contact your veterinarian or an emergency animal hospital immediately.
                        </Text>
                      </>
                    )}
                  </View>
                </View>
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
          );
        })()}

        {/* === Pet Food Analysis Layout === */}
        {!isHumanFood && (
          <>
            {/* 1. Hero product image (DB-sourced image_url, falls back to captured photo) */}
            <StreamSection visible delay={40}>
              <HeroImage imageUrl={result.productImageUrl} uri={uri} />
            </StreamSection>

            {/* 2. Title row — product name/brand/chip (left) + compact score ring (right) */}
            {result.productName || hasScore || streaming ? (
              <Animated.View
                entering={FadeInUp.delay(180).duration(400).damping(20).stiffness(300)}
                style={styles.titleRow}
              >
                <View style={styles.titleBlock}>
                  {result.productName ? (
                    <Text style={styles.productNameLeft} numberOfLines={2} ellipsizeMode="tail">
                      {streaming && !hasScore ? (
                        <StreamingText
                          text={result.productName}
                          streaming
                          done={done}
                          style={styles.productNameLeft}
                        />
                      ) : (
                        result.productName
                      )}
                    </Text>
                  ) : streaming ? (
                    <SkeletonBar width="85%" height={24} />
                  ) : null}
                  {result.brand ? (
                    <Text style={styles.productSubtitleLeft} numberOfLines={1}>
                      {result.brand}
                    </Text>
                  ) : null}
                  {result.productSubtitle ? (
                    <View style={styles.categoryChip}>
                      <Text style={styles.categoryChipText} numberOfLines={1}>{result.productSubtitle}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.titleRowRing}>
                  {hasScore ? (
                    <CircularScore score={result.overallScore} size={96} strokeWidth={7} compact />
                  ) : streaming ? (
                    <SkeletonCircle size={96} strokeWidth={7} />
                  ) : null}
                </View>
              </Animated.View>
            ) : null}

            {scoreUnavailable ? (
              <StreamSection visible delay={210}>
                <ScoreUnavailableCard
                  error={error}
                  theme={theme}
                  isPro={isPro}
                  onRetry={handleRetry}
                  onUpgrade={handleUpgradeFromError}
                />
              </StreamSection>
            ) : null}

            {/* 2a. Summary rows (ingredient quality, red flags, beneficial, recall, made by) */}
            {hasScore ? (
              <StreamSection visible delay={220}>
                <SummaryRows result={result} />
              </StreamSection>
            ) : null}

            {/* 2b. Processing Method chip + trust badges (visible to all users).
                    TrustBadges render only when authoritative brand_metadata exists,
                    so the row disappears for brands without a record. */}
            {result.processingMethod ? (
              <StreamSection visible delay={180}>
                <ProcessingMethodChip processingMethod={result.processingMethod} />
                <TrustBadges
                  thirdPartyTested={result.thirdPartyTested}
                  brandCertifications={result.brandCertifications}
                  countryOfManufacture={result.countryOfManufacture}
                />
              </StreamSection>
            ) : null}

            {/* 3. Quick Facts (visible to all users) */}
            <StreamSection visible={!!nutritionAnalysis} delay={100}>
              <QuickStatsGrid nutrition={nutritionAnalysis} />
            </StreamSection>

            {/* 4. AI Verdict (visible to all users) */}
            <StreamSection visible={!!result.verdict} delay={150}>
              <VerdictCard
                verdict={result.verdict}
                score={result.overallScore}
                streaming={streaming}
                done={done}
                isPro={isPro}
              />
            </StreamSection>

            {!isPro && isScorePending && scorePendingIngredientPreview.length > 0 && (
              <StreamSection visible delay={220}>
                <IngredientsSection
                  ingredients={scorePendingIngredientPreview}
                  totalCount={result.ingredients.length}
                  fadeLastItem={result.ingredients.length > scorePendingIngredientPreview.length}
                  onIngredientPress={setSelectedIngredient}
                />
              </StreamSection>
            )}

            {/* === Free user: gate overlay === */}
            {!isPro && done && hasScore && (
              <>
                <ProGateOverlay
                  onUpgrade={() => navigatePaywall("results_gate")}
                  remainingScans={remainingScans()}
                />
                <StreamSection visible delay={300}>
                  <ScanAnotherButton onPress={handleScanAnother} />
                </StreamSection>
              </>
            )}

            {/* === Pro user: full analysis === */}
            {isPro && (
              <>
                {/* 5. Quality Breakdown */}
                <StreamSection visible={categories?.length > 0} delay={250}>
                  {categories?.length > 0 && (
                    <View style={styles.qualitySection}>
                      <Text style={styles.qualityTitle}>Quality Breakdown</Text>
                      <View style={styles.qualityCard}>
                        {categories.map((cat, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <View style={styles.categoryDivider} />}
                            <CategoryBar name={cat.name} score={cat.score} detail={cat.detail} index={i} isLast={i === categories.length - 1} />
                          </React.Fragment>
                        ))}
                      </View>
                    </View>
                  )}
                </StreamSection>

                {/* 5b. Nutrition Advisory (AAFCO + data completeness) */}
                <StreamSection
                  visible={!!(result.aafcoStatement || result.nutrientDataCompleteness)}
                  delay={280}
                >
                  <NutritionAdvisoryCard
                    aafcoStatement={result.aafcoStatement}
                    nutrientDataCompleteness={result.nutrientDataCompleteness}
                  />
                </StreamSection>

                {/* 6. Variety Pack Flavors OR Ingredients */}
                {result.isVarietyPack && result.flavors?.length > 0 ? (
                  <StreamSection visible delay={300}>
                    <View style={styles.qualitySection}>
                      <Text style={styles.qualityTitle}>Recipes in This Pack</Text>
                      <View style={[styles.qualityCard, { paddingVertical: 0 }]}>
                        {result.flavors.map((flavor, i) => {
                          const flavorConfig = getScoreConfig(flavor.score || 50);
                          return (
                            <React.Fragment key={i}>
                              {i > 0 && <View style={styles.categoryDivider} />}
                              <View style={{ paddingVertical: 16, paddingHorizontal: 20 }}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                  <Text style={{ fontSize: 16, fontWeight: "600", color: theme.textPrimary, flex: 1 }}>{flavor.name}</Text>
                                  <Text style={{ fontSize: 20, fontWeight: "700", color: flavorConfig.color }}>{flavor.score}</Text>
                                </View>
                                <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 6 }}>
                                  Primary protein: {flavor.primaryProtein}
                                </Text>
                                {flavor.keyIngredients?.length > 0 && (
                                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                    {flavor.keyIngredients.map((ing, j) => (
                                      <View key={j} style={{ backgroundColor: theme.fill, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                        <Text style={{ fontSize: 12, fontWeight: "500", color: theme.textSecondary }}>{ing}</Text>
                                      </View>
                                    ))}
                                  </View>
                                )}
                                {flavor.concern && (
                                  <Text style={{ fontSize: 13, color: Colors.scoreConcerning, marginTop: 6 }}>{flavor.concern}</Text>
                                )}
                              </View>
                            </React.Fragment>
                          );
                        })}
                      </View>
                      {result.bestFlavor && result.worstFlavor && (
                        <View style={{ marginTop: 12, gap: 4 }}>
                          <Text style={{ fontSize: 13, color: Colors.scoreExcellent, fontWeight: "500" }}>Best: {result.bestFlavor}</Text>
                          <Text style={{ fontSize: 13, color: Colors.scoreConcerning, fontWeight: "500" }}>Weakest: {result.worstFlavor}</Text>
                        </View>
                      )}
                    </View>
                  </StreamSection>
                ) : (
                  <>
                    <StreamSection visible={result.ingredients?.length > 0} delay={300}>
                      <IngredientsSection
                        ingredients={result.ingredients}
                        onIngredientPress={setSelectedIngredient}
                      />
                    </StreamSection>

                    {/* Ingredient source notice */}
                    {done && result.ingredientSource === "knowledge" && (
                      <StreamSection visible delay={310}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: theme.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 12, padding: 14 }}>
                          <AlertCircle size={16} color={theme.textTertiary} strokeWidth={2} style={{ marginTop: 1 }} />
                          <Text style={{ flex: 1, color: theme.textTertiary, fontSize: 13, lineHeight: 19 }}>
                            Ingredients based on AI analysis. Results may vary from the actual label.
                          </Text>
                        </View>
                      </StreamSection>
                    )}
                    {done && ["listing", "scraped", "user_ocr", "catalog"].includes(result.ingredientSource) && (
                      <StreamSection visible delay={310}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: theme.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 12, padding: 14 }}>
                          <AlertCircle size={16} color={theme.textTertiary} strokeWidth={2} style={{ marginTop: 1 }} />
                          <Text style={{ flex: 1, color: theme.textTertiary, fontSize: 13, lineHeight: 19 }}>
                            Ingredients from {result.ingredientSourceLabel || "catalog data"}. Verify against the package label before making feeding decisions.
                          </Text>
                        </View>
                      </StreamSection>
                    )}
                  </>
                )}

                {/* 7. Safety & Reviews */}
                <StreamSection visible={!!result.recallHistory || !!result.recallSeverity || !!customerRating} delay={400}>
                  <View style={styles.safetyReviewsSection}>
                    <Text style={styles.qualityTitle}>Safety & Reviews</Text>
                    <View style={styles.safetyReviewsCard}>
                      {(result.recallHistory || result.recallSeverity) && (
                        <RecallCard
                          recallHistory={result.recallHistory}
                          recallSeverity={result.recallSeverity}
                          testingTransparency={result.testingTransparency}
                          recallSource={result.recallSource}
                          testingDetails={result.testingDetails}
                        />
                      )}
                      {(result.recallHistory || result.recallSeverity) && customerRating && (
                        <View style={styles.safetyReviewsDivider} />
                      )}
                      {customerRating && <ReviewsSection customerRating={customerRating} />}
                    </View>
                  </View>
                </StreamSection>
              </>
            )}

            {/* Streaming footer */}
            {streaming && (
              <View style={styles.streamingFooter}>
                <StreamingDots />
                <Text style={styles.streamingFooterText}>Analyzing...</Text>
              </View>
            )}

            {/* Scan Another + Disclaimer */}
            {done && (
              <StreamSection visible delay={500}>
                <ScanAnotherButton onPress={handleScanAnother} />
                <Disclaimer />
              </StreamSection>
            )}

            {/* Post-scan upgrade prompt (once, after 2+ scans) */}
            {showPostScanPrompt && (
              <PostScanPrompt
                onUpgrade={() => {
                  dismissPostScanPrompt();
                  navigatePaywall("post_scan_prompt");
                }}
                onDismiss={dismissPostScanPrompt}
              />
            )}
          </>
        )}
      </Animated.ScrollView>

      <View
        pointerEvents="none"
        style={[styles.firstScanToastOverlay, { bottom: insets.bottom + 20 }]}
      >
        <FirstScanToast visible={showFirstScanToast} />
      </View>

      {/* Off-screen share card for view-shot capture */}
      {done && hasScore && (
        <View
          style={{ position: "absolute", left: -9999, top: 0 }}
          pointerEvents="none"
          collapsable={false}
        >
          <ShareCard
            ref={shareCardRef}
            result={result}
            nutrition={nutritionAnalysis}
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
