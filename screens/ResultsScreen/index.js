import { useEffect, useState, useRef, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
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
import { ChevronLeft, Share2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { getCachedAnalysis } from "../../services/cache";
import * as analysisService from "../../services/analysisService";
import { useAuth } from "../../services/auth";
import { getScoreConfig, Colors } from "../../theme";
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
} from "./components";
import { useStyles } from "./styles";

export default function ResultsScreen({ route, navigation }) {
  const { mode, barcode, base64, uri, cacheKey } = route.params;
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Analyzing product...");
  const [dataSource, setDataSource] = useState("ai");
  const [opffData, setOpffData] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [scanCounted, setScanCounted] = useState(false);
  const { styles, theme } = useStyles();
  const insets = useSafeAreaInsets();
  const { isPro, incrementScanCount, remainingScans } = useAuth();

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

  // Guard against React strict mode double-firing the analysis effect
  const analysisStartedRef = useRef(false);
  const timerRef = useRef({ start: 0 });
  const redirectTimerRef = useRef(null);

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

  useEffect(() => {
    if (analysisStartedRef.current) return;
    analysisStartedRef.current = true;
    timerRef.current.start = Date.now();

    // History mode: simple cache lookup, no background service needed
    if (mode === "history") {
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
        setResult(active.result);
        setDataSource(active.dataSource);
        if (active.opffData) setOpffData(active.opffData);
        setFromCache(true);
        setDone(true);
        return;
      }

      // Layer 2: AsyncStorage (instant, offline-capable)
      // Layer 3: Supabase cache (network, shared)
      (async () => {
        try {
          // Try local result first
          const local = await analysisService.getLocalResult(cacheKey);
          if (local?.analysis) {
            setResult(local.analysis);
            setDataSource(local.dataSource || "ai");
            if (local.opffData) setOpffData(local.opffData);
            setFromCache(true);
            setDone(true);
            return;
          }

          // Fall back to Supabase
          const cached = await getCachedAnalysis(cacheKey);
          if (cached.hit) {
            setResult(cached.analysis);
            setDataSource(cached.dataSource || "ai");
            if (cached.opffData) setOpffData(cached.opffData);
            setFromCache(true);
            setDone(true);
            return;
          }

          setError("This result is no longer available. Cached results expire after 7 days.");
          setDone(true);
        } catch (err) {
          console.log("[RESULTS] Error loading cached result:", err.message);
          setError("Failed to load result. Please try scanning again.");
          setDone(true);
        }
      })();
      return;
    }

    // Photo / barcode mode: delegate to analysis service
    setLoadingStatus(mode === "barcode" ? "Looking up barcode..." : "Analyzing product...");
    setStreaming(true);
    setResult({});

    const key = analysisService.startAnalysis({ mode, base64, barcode, uri });
    serviceKeyRef.current = key;

    // If service already had a completed result (re-scan dedup), apply immediately
    const existing = analysisService.getAnalysis(key);
    if (existing?.status === "complete") {
      setResult(existing.result);
      setDataSource(existing.dataSource);
      if (existing.opffData) setOpffData(existing.opffData);
      setFromCache(false);
      setStreaming(false);
      setDone(true);
    }
  }, [mode, barcode, base64, cacheKey, uri, throttledSetResult]);

  // Subscribe to service events
  useEffect(() => {
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
        setResult(event.result);
        setDataSource(event.dataSource);
        if (event.opffData) setOpffData(event.opffData);
        setFromCache(!!event.fromCache);
        setStreaming(false);
        setDone(true);
      } else if (event.type === "barcode_not_found") {
        // Graceful redirect: show brief message then send user back to photo mode
        setResult(null);
        setStreaming(false);
        setLoadingStatus("Barcode not in database — redirecting to camera...");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        redirectTimerRef.current = setTimeout(() => {
          navigation.reset({
            index: 1,
            routes: [
              { name: "Home" },
              { name: "Scanner", params: { fallbackToPhoto: true } },
            ],
          });
        }, 1500);
      } else if (event.type === "error") {
        setError(event.error);
        setStreaming(false);
        setDone(true);
      }
    });

    return () => {
      unsub();
      if (throttleRef.current.timer) {
        clearTimeout(throttleRef.current.timer);
      }
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [throttledSetResult]);

  const [isSlowLoading, setIsSlowLoading] = useState(false);

  // Progressive loading messages + timeout
  useEffect(() => {
    if (!streaming || done) return;
    setIsSlowLoading(false);
    const timers = [
      setTimeout(() => setLoadingStatus("Reading ingredients..."), 8000),
      setTimeout(() => {
        setLoadingStatus("Still analyzing — complex ingredients take longer...");
        setIsSlowLoading(true);
      }, 15000),
      setTimeout(() => setLoadingStatus("Almost there..."), 25000),
      // Hard timeout after 90 seconds
      setTimeout(() => {
        if (!done) {
          console.log("[RESULTS] Analysis timeout — showing error");
          setError("Analysis is taking too long. Please try again.");
          setStreaming(false);
          setDone(true);
        }
      }, 90000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [streaming, done]);

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

  // Increment scan count for free users when a new analysis completes
  useEffect(() => {
    if (!done || scanCounted || isPro || mode === "history") return;
    setScanCounted(true);
    try {
      incrementScanCount();
    } catch (err) {
      console.log("[RESULTS] Error incrementing scan count:", err.message);
    }
  }, [done, scanCounted, isPro, mode, incrementScanCount]);

  // History saving is now handled by analysisService on completion

  const shareCardRef = useRef();
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [showPostScanPrompt, setShowPostScanPrompt] = useState(false);

  // First scan toast (one-time celebratory message)
  const [showFirstScanToast, setShowFirstScanToast] = useState(false);
  useEffect(() => {
    if (!done || isPro || mode === "history" || !result?.overallScore) return;
    let showTimer, hideTimer;
    AsyncStorage.getItem("@woof_first_scan_toast_shown").then((val) => {
      if (val) return;
      AsyncStorage.setItem("@woof_first_scan_toast_shown", "true").catch(() => {});
      showTimer = setTimeout(() => setShowFirstScanToast(true), 1200);
      hideTimer = setTimeout(() => setShowFirstScanToast(false), 4200);
    }).catch(() => {});
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [done, isPro, mode, result?.overallScore]);

  // Check if post-scan prompt should show (once, after 2+ scans, free users only)
  useEffect(() => {
    if (!done || isPro || mode === "history") return;
    const scansUsed = 3 - remainingScans();
    if (scansUsed < 2) return;
    AsyncStorage.getItem("@woof_post_scan_prompt_shown").then((val) => {
      if (!val) setShowPostScanPrompt(true);
    }).catch(() => {});
  }, [done, isPro, mode]);

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

  const handleScanAnother = () => navigation.popToTop();
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
      } catch (shareErr) {
        console.log("[SHARE] Text share also failed:", shareErr.message);
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
          onRetry={handleScanAnother}
          onScanAnother={mode === "barcode" ? handleTakePhoto : handleScanAnother}
        />
      </View>
    );
  }

  if (!result) return null;

  // --- Derived data ---
  const hasScore = result?.overallScore != null;
  const { nutritionAnalysis, customerRating, categories } = result || {};

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
          <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2} />
        </TouchableOpacity>

        {hasScore ? (
          <Animated.View style={[styles.headerCenter, headerStyle]}>
            <Animated.View
              style={[
                styles.miniScoreBadge,
                { backgroundColor: getScoreConfig(result.overallScore).color },
                miniBadgeStyle,
              ]}
            >
              <Text style={styles.miniScoreText}>
                {result.overallScore}
              </Text>
            </Animated.View>
            <Text style={styles.headerProductName} numberOfLines={1}>
              {result.productName}
            </Text>
          </Animated.View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <TouchableOpacity
          style={[styles.shareButton, !(done && hasScore) && { opacity: 0.3 }]}
          onPress={handleShare}
          activeOpacity={0.7}
          disabled={!(done && hasScore)}
          accessibilityRole="button"
          accessibilityLabel="Share results"
          accessibilityState={{ disabled: !(done && hasScore) }}
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
        {/* 1. Product Name */}
        {result.productName ? (
          <Animated.View entering={FadeInUp.delay(200).duration(400).damping(20).stiffness(300)}>
            <Text style={styles.productName} numberOfLines={2}>
              {streaming && !hasScore ? (
                <StreamingText
                  text={result.productName}
                  streaming
                  done={done}
                  style={styles.productName}
                />
              ) : (
                result.productName
              )}
            </Text>
          </Animated.View>
        ) : streaming ? (
          <View style={{ alignItems: "center", paddingVertical: 8 }}>
            <SkeletonBar width="65%" height={22} />
          </View>
        ) : null}

        {/* 2. Score Ring (hero) */}
        {hasScore ? (
          <StreamSection visible delay={50}>
            <View style={styles.heroSection}>
              <CircularScore score={result.overallScore} />
            </View>
          </StreamSection>
        ) : streaming ? (
          <View style={styles.heroSection}>
            <SkeletonCircle size={180} strokeWidth={12} />
          </View>
        ) : null}

        {/* Scan limit banner (free users, new scans only) */}
        {done && !isPro && mode !== "history" && hasScore && (
          <ScanLimitBanner remaining={remainingScans()} />
        )}

        {/* 3. Quick Stats */}
        <StreamSection visible={!!nutritionAnalysis} delay={100}>
          <QuickStatsGrid nutrition={nutritionAnalysis} />
        </StreamSection>

        {/* 4. AI Verdict */}
        <StreamSection visible={!!result.verdict} delay={200}>
          <VerdictCard
            verdict={result.verdict}
            score={result.overallScore}
            streaming={streaming}
            done={done}
            isPro={isPro}
          />
        </StreamSection>

        {/* 5. Ingredients (pro: 5 + expand, free: 3 + fade) */}
        <StreamSection visible={result.ingredients?.length > 0} delay={250}>
          <IngredientsSection
            ingredients={isPro ? result.ingredients : result.ingredients?.slice(0, 3)}
            onIngredientPress={setSelectedIngredient}
            totalCount={!isPro ? result.ingredients?.length : undefined}
            fadeLastItem={!isPro && result.ingredients?.length > 3}
          />
        </StreamSection>

        {/* First scan toast (free users only) */}
        <FirstScanToast visible={showFirstScanToast} />

        {/* ProGateOverlay — shown for free users when analysis is done */}
        {!isPro && done && hasScore && (
          <ProGateOverlay
            onUpgrade={() => navigatePaywall("results_gate")}
            remainingScans={remainingScans()}
          />
        )}

        {/* Scan Another — below gate for free users */}
        {done && !isPro && (
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
            <StreamSection visible={!!nutritionAnalysis} delay={300}>
              <NutritionFacts nutrition={nutritionAnalysis} />
            </StreamSection>

            {/* 9. Customer Reviews */}
            <StreamSection visible={!!customerRating} delay={350}>
              <ReviewsSection customerRating={customerRating} />
            </StreamSection>

            {/* 10. Recall History */}
            <StreamSection visible={!!result.recallHistory} delay={400}>
              <RecallCard recallHistory={result.recallHistory} />
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

        {/* Scan Another — for Pro users (free users have it above the gate) */}
        {done && isPro && (
          <StreamSection visible delay={450}>
            <ScanAnotherButton onPress={handleScanAnother} />
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
      </Animated.ScrollView>

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
