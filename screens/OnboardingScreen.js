import { useEffect, useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { AppText as Text, MAX_FONT_SIZE_MULTIPLIER } from "../components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  useReducedMotion,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { PawPrint, ScanLine, ShieldCheck } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, Colors, Spacing, Shadows, Typography } from "../theme";
import { trackEvent } from "../services/analytics";
import { BRAND_NAME } from "../config/brand";
import {
  markColdStartInteractive,
  navigationTimingParams,
} from "../services/performanceTimings";

const ONBOARDING_KEY = "@woof_onboarding_complete";

// --- Verified answer illustration (screen 2) ---

function AnswerIllustration({ theme }) {
  const size = 140;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.illustrationContainer}>
      <View style={[styles.ringWrapper, Shadows.scoreGlow(Colors.scoreExcellent)]}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={Colors.scoreExcellent}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.ringLabelContainer}>
            <ShieldCheck size={46} color={Colors.scoreExcellent} strokeWidth={1.8} />
          </View>
        </View>
      </View>
      <View style={styles.answerPills}>
        <View style={[styles.answerPill, { backgroundColor: theme.surface }]}>
          <ShieldCheck size={14} color={Colors.scoreExcellent} strokeWidth={2} />
          <Text style={[styles.answerPillText, { color: theme.textSecondary }]}>Verified formula</Text>
        </View>
        <View style={[styles.answerPill, { backgroundColor: theme.surface }]}>
          <PawPrint size={14} color={Colors.scoreExcellent} strokeWidth={2} />
          <Text style={[styles.answerPillText, { color: theme.textSecondary }]}>Personal pet fit</Text>
        </View>
      </View>
    </View>
  );
}

// --- Scan Illustration (screen 1) ---

function ScanIllustration({ theme }) {
  return (
    <View style={styles.illustrationContainer}>
      <ScanLine size={80} color={theme.textTertiary} strokeWidth={1.2} />
    </View>
  );
}

// --- Page Dots ---

function PageDots({ count, current, theme }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor:
                i === current ? theme.textPrimary : theme.separator,
            },
          ]}
        />
      ))}
    </View>
  );
}

// --- Page Data ---

const PAGES = [
  {
    key: "scan",
    title: "Scan pet food labels",
    body: `${BRAND_NAME} reads the brand, recipe, and package details from the front. Scan first, no account required. No barcode needed. Search works too.`,
    highlights: [
      "Exact formula",
      "3 free scans",
    ],
    Illustration: ScanIllustration,
    button: "Scan Front Label",
  },
  {
    key: "answer",
    title: "Get one clear answer",
    body: "Scores use the exact verified ingredient list. Human-food checks flag everyday foods for your selected pet. Add pet details any time, and save results later by creating an account.",
    Illustration: AnswerIllustration,
    button: "Scan Front Label",
  },
];

// --- Onboarding Screen ---

export default function OnboardingScreen({ onComplete }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Button press animation
  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  useEffect(() => {
    markColdStartInteractive("onboarding");
    trackEvent("onboarding_started");
  }, []);

  useEffect(() => {
    const page = PAGES[currentIndex];
    if (!page) return;
    trackEvent("onboarding_step_viewed", {
      step_index: currentIndex,
      step_key: page.key,
    });
  }, [currentIndex]);

  const completeOnboarding = useCallback(({ completionMethod, nextRoute = "Home", routeParams = null }) => {
    const page = PAGES[currentIndex];
    trackEvent("onboarding_completed", {
      step_index: currentIndex,
      step_key: page?.key,
      completion_method: completionMethod,
      next_route: nextRoute,
    });
    AsyncStorage.setItem(ONBOARDING_KEY, "true").catch(() => {});
    onComplete({ nextRoute, routeParams });
  }, [currentIndex, onComplete]);

  const handleScanNow = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const page = PAGES[currentIndex];
    trackEvent("onboarding_scan_now_tapped", {
      step_index: currentIndex,
      step_key: page?.key,
    });
    completeOnboarding({
      completionMethod: "scan_now",
      nextRoute: "Scanner",
      routeParams: navigationTimingParams("onboarding"),
    });
  }, [completeOnboarding, currentIndex]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const page = PAGES[currentIndex];

    if (currentIndex < PAGES.length - 1) {
      trackEvent("onboarding_continue_tapped", {
        step_index: currentIndex,
        step_key: page?.key,
      });
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      // Final page — mark complete and dismiss
      completeOnboarding({
        completionMethod: "completed_flow",
        nextRoute: "Home",
      });
    }
  }, [completeOnboarding, currentIndex]);

  const renderPage = useCallback(
    ({ item }) => {
      const { Illustration, title, body, highlights } = item;
      return (
        <View style={[styles.page, { width }]}>
          <View style={styles.pageContent}>
            <Illustration theme={theme} />

            <View style={styles.textBlock}>
              <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>
                {title}
              </Text>
              <Text
                style={[styles.pageBody, { color: theme.textSecondary }]}
              >
                {body}
              </Text>
              {Array.isArray(highlights) && highlights.length > 0 && (
                <View style={styles.highlightsGrid}>
                  {highlights.map((highlight) => (
                    <View
                      key={highlight}
                      style={[
                        styles.highlightPill,
                        { backgroundColor: theme.surface },
                      ]}
                    >
                      <Text
                        style={[
                          styles.highlightText,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {highlight}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      );
    },
    [width, theme]
  );

  const isFirstPage = currentIndex === 0;
  const buttonText = PAGES[currentIndex]?.button || "Scan Front Label";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <FlatList
        ref={flatListRef}
        data={PAGES}
        keyExtractor={(item) => item.key}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
      />

      {/* Bottom: button + dots */}
      <View style={styles.bottomArea}>
        <Pressable
          onPress={handleScanNow}
          onPressIn={() => {
            btnScale.value = reduceMotion ? 1 : withSpring(0.97, { damping: 15, stiffness: 150 });
          }}
          onPressOut={() => {
            btnScale.value = reduceMotion ? 1 : withSpring(1, { damping: 15, stiffness: 150 });
          }}
          accessibilityRole="button"
          accessibilityLabel={buttonText}
          accessibilityHint="Starts a front label scan"
        >
          <Animated.View
            style={[
              styles.ctaButton,
              { backgroundColor: theme.buttonPrimary },
              Shadows.button,
              btnStyle,
            ]}
          >
            <ScanLine size={18} color={theme.buttonText} strokeWidth={2} />
            <Animated.Text
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
              key={buttonText}
              entering={reduceMotion ? undefined : FadeIn.duration(200)}
              style={[styles.ctaText, { color: theme.buttonText }]}
            >
              {buttonText}
            </Animated.Text>
          </Animated.View>
        </Pressable>

        {isFirstPage && (
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.secondaryButton,
              { opacity: pressed ? 0.55 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`How ${BRAND_NAME} works`}
            accessibilityHint="Shows the next onboarding screen"
          >
            <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>
              How {BRAND_NAME} works
            </Text>
          </Pressable>
        )}

        {!isFirstPage && (
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.secondaryButton,
              { opacity: pressed ? 0.55 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
            accessibilityHint="Finishes onboarding without starting a scan"
          >
            <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>
              Go to Home
            </Text>
          </Pressable>
        )}

        <PageDots count={PAGES.length} current={currentIndex} theme={theme} />
      </View>
    </SafeAreaView>
  );
}

export { ONBOARDING_KEY };

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Page layout
  page: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.screenPadding,
  },
  pageContent: {
    alignItems: "center",
  },

  // Illustration area
  illustrationContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
  },

  // Verified answer (screen 2)
  ringWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  ringLabelContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  answerPills: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },
  answerPill: {
    minHeight: 34,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  answerPillText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Text block
  textBlock: {
    alignItems: "center",
    paddingHorizontal: 12,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  pageBody: {
    ...Typography.body,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  highlightsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    maxWidth: 320,
    marginTop: Spacing.xl,
  },
  highlightPill: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  highlightText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0,
  },

  // Bottom area
  bottomArea: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 40,
    gap: 20,
  },
  ctaButton: {
    height: Spacing.buttonHeight,
    borderRadius: Spacing.buttonRadius,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  ctaText: {
    ...Typography.button,
  },
  secondaryButton: {
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -8,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0,
  },

  // Dots
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
