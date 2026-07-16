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
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { ScanLine } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, getScoreConfig, Colors, Spacing, Shadows, Typography } from "../theme";
import { trackEvent } from "../services/analytics";

const ONBOARDING_KEY = "@woof_onboarding_complete";

// --- Score Ring Illustration (static, screen 2) ---

function ScoreRingIllustration({ theme }) {
  const score = 85;
  const config = getScoreConfig(score);
  const size = 140;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillOffset = circumference * (1 - score / 100);

  return (
    <View style={styles.illustrationContainer}>
      <View style={[styles.ringWrapper, Shadows.scoreGlow(config.color)]}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={Colors.divider}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={config.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={fillOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.ringLabelContainer}>
            <Text style={[styles.ringScore, { color: config.color }]}>
              {score}
            </Text>
            <Text style={[styles.ringGrade, { color: config.color }]}>
              {config.label}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// --- Ingredient List Illustration (static, screen 3) ---

const SAMPLE_INGREDIENTS = [
  { name: "Deboned Chicken", rating: "good" },
  { name: "Brown Rice", rating: "good" },
  { name: "Chicken Meal", rating: "good" },
  { name: "BHA (Preservative)", rating: "bad" },
];

const DOT_COLORS = {
  good: Colors.ingredientGood,
  neutral: Colors.ingredientNeutral,
  bad: Colors.ingredientBad,
};

function IngredientIllustration({ theme }) {
  return (
    <View style={styles.illustrationContainer}>
      <View style={[styles.ingredientCard, { backgroundColor: theme.card }, Shadows.card]}>
        {SAMPLE_INGREDIENTS.map((ing, i) => (
          <View key={i}>
            <View style={styles.ingredientRow}>
              <View
                style={[
                  styles.ingredientDot,
                  { backgroundColor: DOT_COLORS[ing.rating] },
                ]}
              />
              <Text
                style={[styles.ingredientName, { color: theme.textPrimary }]}
                numberOfLines={1}
              >
                {ing.name}
              </Text>
              <Text
                style={[
                  styles.ingredientRating,
                  { color: DOT_COLORS[ing.rating] },
                ]}
              >
                {ing.rating === "good" ? "Good" : "Concerning"}
              </Text>
            </View>
            {i < SAMPLE_INGREDIENTS.length - 1 && (
              <View
                style={[
                  styles.ingredientDivider,
                  { backgroundColor: Colors.divider },
                ]}
              />
            )}
          </View>
        ))}
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
                i === current ? theme.textPrimary : Colors.divider,
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
    title: "Scan the front label",
    body: "Scan first, no account required. Woof reads the product name from the front of the bag or can. No barcode required.",
    highlights: [
      "Product name",
      "Search works too",
      "No barcode needed",
      "3 free scans",
    ],
    Illustration: ScanIllustration,
    button: "Continue",
  },
  {
    key: "score",
    title: "Get the verified breakdown",
    body: "Pet food labels use the verified ingredient list for scores and safety notes. Human-food checks help with everyday foods too.",
    Illustration: ScoreRingIllustration,
    button: "Continue",
  },
  {
    key: "ingredients",
    title: "Help fill missing products",
    body: "If a product is not verified yet, scan the ingredients panel for review. Save results later by adding an account after your scan.",
    Illustration: IngredientIllustration,
    button: "Get Started",
  },
];

// --- Onboarding Screen ---

export default function OnboardingScreen({ onComplete }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
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

  const completeOnboarding = useCallback(async ({ completionMethod, nextRoute = "Home" }) => {
    const page = PAGES[currentIndex];
    trackEvent("onboarding_completed", {
      step_index: currentIndex,
      step_key: page?.key,
      completion_method: completionMethod,
      next_route: nextRoute,
    });
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    onComplete({ nextRoute });
  }, [currentIndex, onComplete]);

  const handleScanNow = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const page = PAGES[currentIndex];
    trackEvent("onboarding_scan_now_tapped", {
      step_index: currentIndex,
      step_key: page?.key,
    });
    await completeOnboarding({
      completionMethod: "scan_now",
      nextRoute: "Scanner",
    });
  }, [completeOnboarding, currentIndex]);

  const handleNext = useCallback(async () => {
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
      await completeOnboarding({
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
  const buttonText = isFirstPage ? "Scan Front Label" : PAGES[currentIndex]?.button || "Continue";

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
          onPress={isFirstPage ? handleScanNow : handleNext}
          onPressIn={() => {
            btnScale.value = withSpring(0.97, { damping: 15, stiffness: 150 });
          }}
          onPressOut={() => {
            btnScale.value = withSpring(1, { damping: 15, stiffness: 150 });
          }}
          accessibilityRole="button"
          accessibilityLabel={buttonText}
          accessibilityHint={isFirstPage ? "Starts a front label scan" : currentIndex === PAGES.length - 1 ? "Finishes onboarding" : "Shows the next onboarding screen"}
        >
          <Animated.View
            style={[
              styles.ctaButton,
              { backgroundColor: theme.buttonPrimary },
              Shadows.button,
              btnStyle,
            ]}
          >
            {isFirstPage && (
              <ScanLine size={18} color={theme.buttonText} strokeWidth={2} />
            )}
            <Animated.Text
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
              key={buttonText}
              entering={FadeIn.duration(200)}
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
            accessibilityLabel="How Woof works"
            accessibilityHint="Shows the next onboarding screen"
          >
            <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>
              How Woof works
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

  // Score ring (screen 2)
  ringWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  ringLabelContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  ringScore: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: 0,
  },
  ringGrade: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0,
    textTransform: "uppercase",
    marginTop: 2,
  },

  // Ingredient list (screen 3)
  ingredientCard: {
    width: 280,
    borderRadius: Spacing.cardRadius,
    paddingVertical: Spacing.cardPadding,
    paddingHorizontal: Spacing.screenPadding,
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  ingredientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  ingredientName: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  ingredientRating: {
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 8,
  },
  ingredientDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.dividerIndent,
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
