import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import {
  X,
  ShieldCheck,
  ScanSearch,
  Star,
  ChartColumnIncreasing,
  Lock,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../services/auth";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  getWeeklyPackage,
  getMonthlyPackage,
  getAnnualPackage,
} from "../services/purchases";
import { useTheme, getScoreConfig, Colors, Spacing } from "../theme";
import { PRIVACY_HTML, TERMS_HTML } from "../legal";

const FEATURES = [
  { icon: ShieldCheck, text: "Spot harmful ingredients" },
  { icon: ScanSearch, text: "Unlimited scans" },
  { icon: ChartColumnIncreasing, text: "Quality & safety scores" },
  { icon: Star, text: "Reviews, ratings & recalls" },
];

const PLANS = [
  { key: "weekly", label: "Weekly", hasTrial: true, flex: 0.28 },
  { key: "monthly", label: "Monthly", hasTrial: true, flex: 0.28 },
  { key: "annual", label: "Annual", hasTrial: true, flex: 0.44, popular: true },
];

function getContextualHeadline(source, productName) {
  if (source === "results_gate") {
    const name = productName || "this product";
    return `See what\u2019s really in\n${name}`;
  }
  if (source === "scan_limit") return "Unlock unlimited\nscans";
  if (source === "home_banner") return "Give your pet the\nbest nutrition";
  return "Know exactly what\u2019s\nin every bowl";
}

function MiniScoreRing({ score, color }) {
  const size = 40;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillPercent = (score / 100) * circumference;

  return (
    <View style={styles.miniScoreRingWrap}>
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
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${fillPercent} ${circumference - fillPercent}`}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={[styles.miniScoreNumber, { color }]}>{score}</Text>
    </View>
  );
}

function TrialTimeline({ theme }) {
  return (
    <View style={styles.timelineContainer}>
      <View style={styles.timelineTrack}>
        <View style={styles.timelineStop}>
          <View style={[styles.timelineDot, { backgroundColor: Colors.scoreExcellent }]} />
          <Text style={[styles.timelineDotLabel, { color: Colors.scoreExcellent }]}>Today</Text>
          <Text style={[styles.timelineDotSub, { color: theme.textTertiary }]}>Free access</Text>
        </View>
        <View style={[styles.timelineLineSegment, { borderColor: theme.fillSecondary }]} />
        <View style={styles.timelineStop}>
          <View style={[styles.timelineDot, { backgroundColor: theme.textTertiary }]} />
          <Text style={[styles.timelineDotLabel, { color: theme.textPrimary }]}>Day 3</Text>
          <Text style={[styles.timelineDotSub, { color: theme.textTertiary }]}>Reminder</Text>
        </View>
        <View style={[styles.timelineLineSegment, { borderColor: theme.fillSecondary }]} />
        <View style={styles.timelineStop}>
          <View style={[styles.timelineDot, { backgroundColor: theme.textTertiary }]} />
          <Text style={[styles.timelineDotLabel, { color: theme.textPrimary }]}>Day 4</Text>
          <Text style={[styles.timelineDotSub, { color: theme.textTertiary }]}>Billing</Text>
        </View>
      </View>
    </View>
  );
}

export default function PaywallScreen({ route, navigation }) {
  const theme = useTheme();
  const { refreshProStatus } = useAuth();
  const { source, productName, score } = route.params || {};

  const [offerings, setOfferings] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(2);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const ctaScale = useSharedValue(1);
  const ctaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  useEffect(() => {
    console.log("[PAYWALL] viewed", { source, productName, score });
    getOfferings().then(setOfferings);
  }, []);

  const weeklyPkg = getWeeklyPackage(offerings);
  const monthlyPkg = getMonthlyPackage(offerings);
  const annualPkg = getAnnualPackage(offerings);

  const pkgByIndex = [weeklyPkg, monthlyPkg, annualPkg];
  const selectedPkg = pkgByIndex[selectedIndex];
  const selectedPlan = PLANS[selectedIndex];

  const weeklyPrice = weeklyPkg?.product?.priceString || "$4.99";
  const monthlyPrice = monthlyPkg?.product?.priceString || "$7.99";
  const annualPrice = annualPkg?.product?.priceString || "$39.99";

  const scoreConfig = score ? getScoreConfig(score) : null;
  const headlineText = getContextualHeadline(source, productName);
  const isTrialPlan = selectedPlan.hasTrial;
  const isLoading = purchasing || restoring;

  const handlePlanSelect = (index) => {
    Haptics.selectionAsync();
    console.log("[PAYWALL] plan_selected", { plan: PLANS[index].key });
    setSelectedIndex(index);
  };

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    console.log("[PAYWALL] purchase_started", { plan: selectedPlan.key });
    setPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await purchasePackage(selectedPkg);
    setPurchasing(false);

    if (result.success) {
      console.log("[PAYWALL] purchase_completed", { plan: selectedPlan.key });
      await refreshProStatus();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } else if (result.cancelled) {
      console.log("[PAYWALL] purchase_cancelled", { plan: selectedPlan.key });
    } else if (result.error) {
      console.log("[PAYWALL] purchase_failed", { plan: selectedPlan.key, error: result.error });
      Alert.alert("Purchase Failed", result.error);
    }
  };

  const handleRestore = async () => {
    console.log("[PAYWALL] restore_tapped");
    setRestoring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success) {
      await refreshProStatus();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } else if (result.error) {
      Alert.alert("Restore Failed", result.error);
    } else {
      Alert.alert("No Purchases Found", "We couldn't find any active subscriptions to restore.");
    }
  };

  const handleDismiss = () => {
    console.log("[PAYWALL] dismissed", { source });
    navigation.goBack();
  };

  const prices = [weeklyPrice, monthlyPrice, annualPrice];
  const periods = ["/week", "/month", "/year"];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Subtle warm gradient at top */}
      <LinearGradient
        colors={["rgba(52, 199, 89, 0.03)", "transparent"]}
        style={styles.bgGradient}
        pointerEvents="none"
      />

      {/* Close button */}
      <View style={styles.closeRow}>
        <Pressable
          onPress={handleDismiss}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <View style={[styles.closeButton, { backgroundColor: theme.fill }]}>
            <X size={18} color={theme.textSecondary} strokeWidth={2} />
          </View>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ═══════════ ZONE 1: THE PITCH ═══════════ */}

        {/* Headline */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(350).damping(18).stiffness(200)}
          style={styles.headerSection}
        >
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
            {headlineText}
          </Text>
          {source === "results_gate" && scoreConfig && (
            <MiniScoreRing score={score} color={scoreConfig.color} />
          )}
        </Animated.View>

        {/* Social proof */}
        <Animated.View entering={FadeIn.delay(250).duration(300)} style={styles.socialProofSection}>
          <Text style={[styles.positioningText, { color: theme.textTertiary }]}>
            Built for pet parents who care about ingredients
          </Text>
        </Animated.View>

        {/* Features — inline rows */}
        <View style={styles.featuresList}>
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Animated.View
                key={i}
                entering={FadeInUp.delay(300 + i * 50).duration(250)}
                style={styles.featureRow}
              >
                <Icon size={16} color={Colors.scoreExcellent} strokeWidth={2} />
                <Text style={[styles.featureRowText, { color: theme.textPrimary }]}>
                  {feature.text}
                </Text>
              </Animated.View>
            );
          })}
        </View>

        {/* ═══════════ ZONE 2: THE CHOICE ═══════════ */}

        {/* Pricing cards */}
        <Animated.View
          entering={FadeInUp.delay(700).duration(350).springify().damping(16).stiffness(140)}
          style={styles.cardsRow}
        >
          {PLANS.map((plan, i) => {
            const isSelected = selectedIndex === i;
            const showBadge = plan.popular && isSelected;

            return (
              <View key={plan.key} style={{ flex: plan.flex }}>
                {/* BEST VALUE badge — only visible when annual is selected */}
                {showBadge && (
                  <Animated.View entering={FadeIn.duration(200)} style={styles.bestValueBadge}>
                    <Text style={styles.bestValueText}>BEST VALUE</Text>
                  </Animated.View>
                )}
                {/* Invisible spacer when badge is hidden to keep card alignment */}
                {plan.popular && !showBadge && <View style={styles.badgeSpacer} />}

                <Pressable
                  onPress={() => handlePlanSelect(i)}
                  style={({ pressed }) => [
                    styles.pricingCard,
                    isSelected ? [
                      styles.pricingCardSelected,
                      { backgroundColor: theme.card },
                    ] : [
                      styles.pricingCardDefault,
                      { backgroundColor: theme.card, borderColor: Colors.divider },
                    ],
                    pressed && { transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <Text style={[styles.planLabel, { color: theme.textSecondary }]}>
                    {plan.label}
                  </Text>

                  {/* Annual: crossed-out anchor price */}
                  {plan.key === "annual" && (
                    <Text style={[styles.planStrikethrough, { color: theme.textTertiary }]}>
                      $95.88
                    </Text>
                  )}

                  {/* Price */}
                  <Text
                    style={[
                      plan.key === "annual" ? styles.planPriceHero : styles.planPrice,
                      { color: theme.textPrimary },
                    ]}
                  >
                    {prices[i]}
                  </Text>
                  <Text style={[styles.planPeriod, { color: theme.textTertiary }]}>
                    {periods[i]}
                  </Text>

                  {/* Weekly: equivalent monthly cost */}
                  {plan.key === "weekly" && (
                    <>
                      <View style={[styles.cardDivider, { backgroundColor: Colors.divider }]} />
                      <Text style={[styles.planSubtext, { color: theme.textTertiary }]}>
                        $21.63/mo
                      </Text>
                    </>
                  )}

                  {/* Annual extras */}
                  {plan.key === "annual" && (
                    <>
                      <Text style={styles.planMonthly}>$3.33/mo</Text>
                      <View style={styles.saveBadge}>
                        <Text style={styles.saveText}>Save 58%</Text>
                      </View>
                    </>
                  )}
                </Pressable>
              </View>
            );
          })}
        </Animated.View>

        {/* ═══════════ ZONE 3: THE ACTION ═══════════ */}

        {/* CTA button */}
        <Animated.View entering={FadeInUp.delay(850).duration(350)} style={styles.ctaSection}>
          <Pressable
            onPress={handlePurchase}
            onPressIn={() => { ctaScale.value = withSpring(0.97, { damping: 20, stiffness: 300 }); }}
            onPressOut={() => { ctaScale.value = withSpring(1, { damping: 15, stiffness: 150 }); }}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={isTrialPlan ? "Try free for 3 days" : "Subscribe now"}
            accessibilityState={{ disabled: isLoading }}
          >
            <Animated.View
              style={[
                styles.ctaButton,
                { backgroundColor: theme.buttonPrimary },
                ctaAnimStyle,
              ]}
            >
              {purchasing ? (
                <ActivityIndicator color={theme.buttonText} />
              ) : (
                <Text style={[styles.ctaText, { color: theme.buttonText }]}>
                  {isTrialPlan ? "Try Free for 3 Days" : "Subscribe Now"}
                </Text>
              )}
            </Animated.View>
          </Pressable>
        </Animated.View>

        {/* Timeline + trust text */}
        <Animated.View entering={FadeIn.delay(1100).duration(300)}>
          {isTrialPlan ? (
            <>
              <TrialTimeline theme={theme} />
              <View style={styles.trustRow}>
                <Lock size={10} color={theme.textTertiary} strokeWidth={2} />
                <Text style={[styles.trustText, { color: theme.textTertiary }]}>
                  Cancel before day 3 and you won't be charged
                </Text>
              </View>
            </>
          ) : (
            <Text style={[styles.trustTextStandalone, { color: theme.textTertiary }]}>
              $7.99/month. Cancel anytime.
            </Text>
          )}
        </Animated.View>

        {/* Footer */}
        <Animated.View
          entering={FadeIn.delay(1100).duration(300)}
          style={styles.footer}
        >
          <Pressable
            onPress={handleRestore}
            disabled={isLoading}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
          >
            {restoring ? (
              <ActivityIndicator size="small" color={theme.textTertiary} />
            ) : (
              <Text style={[styles.restoreText, { color: theme.textTertiary }]}>
                Restore Purchases
              </Text>
            )}
          </Pressable>

          <View style={styles.legalRow}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                navigation.navigate("WebView", { title: "Terms of Use", html: TERMS_HTML });
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <Text style={[styles.legalText, { color: theme.textTertiary }]}>Terms</Text>
            </Pressable>
            <Text style={[styles.legalDot, { color: theme.textTertiary }]}> · </Text>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                navigation.navigate("WebView", { title: "Privacy Policy", html: PRIVACY_HTML });
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <Text style={[styles.legalText, { color: theme.textTertiary }]}>Privacy</Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  closeRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.xs,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 12,
  },

  // --- Zone 1: Pitch ---

  headerSection: {
    marginTop: 10,
    marginBottom: 4,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 32,
    letterSpacing: -0.8,
  },
  miniScoreRingWrap: {
    width: 40,
    height: 40,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  miniScoreNumber: {
    position: "absolute",
    fontSize: 14,
    fontWeight: "700",
  },
  socialProofSection: {
    alignItems: "center",
    marginBottom: 10,
  },
  positioningText: {
    fontSize: 12,
    fontWeight: "400",
    textAlign: "center",
  },

  // Features — inline rows
  featuresList: {
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  featureRowText: {
    fontSize: 14,
    fontWeight: "500",
  },

  // --- Zone 2: Choice ---

  cardsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    alignItems: "stretch",
  },
  pricingCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pricingCardDefault: {
    borderWidth: 1.5,
  },
  pricingCardSelected: {
    borderWidth: 2,
    borderColor: Colors.scoreExcellent,
    shadowColor: Colors.scoreExcellent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  bestValueBadge: {
    alignSelf: "center",
    backgroundColor: Colors.scoreExcellent,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: -12,
    zIndex: 1,
    shadowColor: Colors.scoreExcellent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  bestValueText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  badgeSpacer: {
    height: 15,
  },
  planLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  planPriceHero: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  planPeriod: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: -2,
  },
  planStrikethrough: {
    fontSize: 12,
    fontWeight: "400",
    textDecorationLine: "line-through",
    marginBottom: 2,
  },
  planMonthly: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.scoreExcellent,
    marginTop: 3,
  },
  planSubtext: {
    fontSize: 10,
    fontWeight: "400",
  },
  cardDivider: {
    width: 24,
    height: 0.5,
    marginVertical: 6,
  },
  saveBadge: {
    marginTop: 4,
    backgroundColor: "rgba(52, 199, 89, 0.1)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  saveText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.scoreExcellent,
  },

  // --- Zone 3: Action ---

  ctaSection: {
    marginTop: 16,
  },
  ctaButton: {
    height: 54,
    borderRadius: 14,
    marginHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.3,
  },

  // Timeline
  timelineContainer: {
    marginTop: 10,
    paddingHorizontal: 24,
  },
  timelineTrack: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  timelineLineSegment: {
    flex: 1,
    height: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    marginTop: 3,
    marginHorizontal: -4,
  },
  timelineStop: {
    alignItems: "center",
    width: 56,
  },
  timelineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 3,
  },
  timelineDotLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 0,
  },
  timelineDotSub: {
    fontSize: 9,
    fontWeight: "400",
    textAlign: "center",
  },

  // Trust
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 6,
  },
  trustText: {
    fontSize: 11,
    fontWeight: "400",
  },
  trustTextStandalone: {
    fontSize: 11,
    fontWeight: "400",
    textAlign: "center",
    marginTop: 6,
  },

  // Footer
  footer: {
    alignItems: "center",
    marginTop: 10,
    gap: 6,
  },
  restoreText: {
    fontSize: 12,
    fontWeight: "500",
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  legalText: {
    fontSize: 10,
    fontWeight: "400",
  },
  legalDot: {
    fontSize: 10,
  },
});
