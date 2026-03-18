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
  withTiming,
  Easing,
  FadeIn,
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
  { key: "weekly", label: "Weekly", hasTrial: true, flex: 0.26 },
  { key: "monthly", label: "Monthly", hasTrial: true, flex: 0.30 },
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
  const { refreshProStatus, isPro } = useAuth();
  const { source, productName, score } = route.params || {};

  const [offerings, setOfferings] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(2);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Auto-dismiss if user is already pro
  useEffect(() => {
    if (isPro) {
      console.log("[PAYWALL] User is already pro, dismissing");
      navigation.goBack();
    }
  }, [isPro, navigation]);

  const ctaScale = useSharedValue(1);
  // Grok-style morph: full width → compact circle on purchase
  const ctaWidthPercent = useSharedValue(100);
  const ctaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
    width: `${ctaWidthPercent.value}%`,
    alignSelf: "center",
    borderRadius: ctaWidthPercent.value < 100 ? 27 : 14,
  }));

  // Unified subtle content fade — Apple-style
  const contentOpacity = useSharedValue(0.85);
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: 200 });
  }, []);

  useEffect(() => {
    console.log("[PAYWALL] viewed", { source, productName, score });
    getOfferings().then((o) => {
      console.log("[PAYWALL] offerings:", o ? `${o.availablePackages?.length} packages` : "NULL - check RevenueCat config & Paid Apps agreement");
      setOfferings(o);
    });
  }, []);

  const weeklyPkg = getWeeklyPackage(offerings);
  const monthlyPkg = getMonthlyPackage(offerings);
  const annualPkg = getAnnualPackage(offerings);

  const pkgByIndex = [weeklyPkg, monthlyPkg, annualPkg];
  const selectedPkg = pkgByIndex[selectedIndex];
  const selectedPlan = PLANS[selectedIndex];

  const weeklyPrice = weeklyPkg?.product?.priceString || "$4.99";
  const monthlyPrice = monthlyPkg?.product?.priceString || "$7.99";
  const annualPrice = annualPkg?.product?.priceString || "$29.99";

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
    if (!selectedPkg) {
      Alert.alert("Not Available", "Subscriptions are loading. Please wait a moment and try again.\n\nIf this persists, check that your Paid Apps agreement is active in App Store Connect.");
      return;
    }
    console.log("[PAYWALL] purchase_started", { plan: selectedPlan.key });
    setPurchasing(true);
    ctaWidthPercent.value = withTiming(18, { duration: 400, easing: Easing.out(Easing.cubic) });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await purchasePackage(selectedPkg);
    ctaWidthPercent.value = withTiming(100, { duration: 300, easing: Easing.out(Easing.cubic) });
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

      {/* Close button — Apple-style, no background circle */}
      <Pressable
        onPress={handleDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={({ pressed }) => [styles.closeButtonApple, { opacity: pressed ? 0.85 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <X size={20} color={theme.textTertiary} strokeWidth={2.5} />
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Drag handle */}
        <View style={[styles.dragHandle, { backgroundColor: Colors.divider }]} />

        {/* Unified content fade */}
        <Animated.View style={contentAnimStyle}>

        {/* ═══════════ ZONE 1: THE PITCH ═══════════ */}

        {/* Headline */}
        <View style={styles.headerSection}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
            {headlineText}
          </Text>
          {source === "results_gate" && scoreConfig && (
            <MiniScoreRing score={score} color={scoreConfig.color} />
          )}
        </View>

        {/* Social proof */}
        <View style={styles.socialProofSection}>
          <Text style={[styles.positioningText, { color: theme.textTertiary }]}>
            Built for pet parents who care about ingredients
          </Text>
        </View>

        {/* Features — inline rows */}
        <View style={styles.featuresList}>
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <View key={i} style={styles.featureRow}>
                <Icon size={20} color={Colors.scoreExcellent} strokeWidth={1.8} />
                <Text style={[styles.featureRowText, { color: theme.textPrimary }]}>
                  {feature.text}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ═══════════ ZONE 2: THE CHOICE ═══════════ */}

        {/* Pricing cards */}
        <View style={styles.cardsRow}>
          {PLANS.map((plan, i) => {
            const isSelected = selectedIndex === i;

            return (
              <View key={plan.key} style={{ flex: plan.flex }}>
                {/* Fixed-height spacer for all cards — badge overlaps into it for popular plan */}
                {plan.popular ? (
                  <View style={[styles.bestValueBadge, { opacity: isSelected ? 1 : 0 }]}>
                    <Text style={styles.bestValueText}>BEST VALUE</Text>
                  </View>
                ) : (
                  <View style={styles.badgeSpacer} />
                )}

                <Pressable
                  onPress={() => handlePlanSelect(i)}
                  style={({ pressed }) => [
                    styles.pricingCard,
                    isSelected ? [
                      styles.pricingCardSelected,
                      { backgroundColor: theme.card },
                    ] : [
                      styles.pricingCardDefault,
                      { backgroundColor: theme.card },
                    ],
                    pressed && { transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <Text style={[styles.planLabel, { color: theme.textSecondary }]}>
                    {plan.label}
                  </Text>

                  {/* Annual: crossed-out anchor price; others get spacer to align prices */}
                  {plan.key === "annual" ? (
                    <Text style={[styles.planStrikethrough, { color: theme.textTertiary }]}>
                      $95.88/yr
                    </Text>
                  ) : (
                    <View style={styles.strikethroughSpacer} />
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
                      <Text style={styles.planMonthly}>$2.50/mo</Text>
                      <View style={styles.saveBadge}>
                        <Text style={styles.saveText}>Save 69%</Text>
                      </View>
                    </>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* ═══════════ ZONE 3: THE ACTION ═══════════ */}

        {/* CTA button — Grok-style morph animation */}
        <View style={styles.ctaSection}>
          <Pressable
            onPress={handlePurchase}
            onPressIn={() => { if (!purchasing) ctaScale.value = withSpring(0.97, { damping: 20, stiffness: 300 }); }}
            onPressOut={() => { if (!purchasing) ctaScale.value = withSpring(1, { damping: 15, stiffness: 150 }); }}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={isTrialPlan ? "Try free for 3 days" : "Subscribe now"}
            accessibilityState={{ disabled: isLoading }}
          >
            <Animated.View
              style={[
                styles.ctaButton,
                { backgroundColor: theme.buttonPrimary, overflow: "hidden" },
                ctaAnimStyle,
              ]}
            >
              {purchasing ? (
                <Animated.View key="loader" entering={FadeIn.duration(200)}>
                  <ActivityIndicator color={theme.buttonText} />
                </Animated.View>
              ) : (
                <Animated.Text
                  key="text"
                  entering={FadeIn.duration(200)}
                  style={[styles.ctaText, { color: theme.buttonText }]}
                  numberOfLines={1}
                >
                  {isTrialPlan ? "Try Free for 3 Days" : "Subscribe Now"}
                </Animated.Text>
              )}
            </Animated.View>
          </Pressable>
        </View>

        {/* Timeline + trust text */}
        <View>
          {isTrialPlan ? (
            <>
              <TrialTimeline theme={theme} />
              <View style={styles.trustRow}>
                <Lock size={11} color={theme.textTertiary} strokeWidth={1.5} />
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
        </View>

        {/* Footer */}
        <View style={styles.footer}>
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
              <Text style={[styles.restoreText, { color: theme.textSecondary }]}>
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
  closeButtonApple: {
    position: "absolute",
    top: 14,
    right: 16,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  dragHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 24,
  },

  // --- Zone 1: Pitch ---

  headerSection: {
    marginTop: 4,
    marginBottom: 12,
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
    marginBottom: 20,
  },
  positioningText: {
    fontSize: 13,
    fontWeight: "400",
    textAlign: "center",
  },

  // Features — inline rows
  featuresList: {
    paddingHorizontal: 36,
    marginBottom: 0,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  featureRowText: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: -0.2,
  },

  // --- Zone 2: Choice ---

  cardsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    alignItems: "stretch",
    marginTop: 24,
  },
  pricingCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  pricingCardDefault: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  pricingCardSelected: {
    borderWidth: 1.5,
    borderColor: Colors.scoreExcellent,
    shadowColor: Colors.scoreExcellent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 0,
  },
  bestValueBadge: {
    alignSelf: "center",
    backgroundColor: Colors.scoreExcellent,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: -11,
    zIndex: 1,
    shadowColor: Colors.scoreExcellent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  bestValueText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  badgeSpacer: {
    height: 11,
  },
  planLabel: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  planPriceHero: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  planPeriod: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: -1,
  },
  planStrikethrough: {
    fontSize: 12,
    fontWeight: "400",
    textDecorationLine: "line-through",
    marginBottom: 2,
  },
  strikethroughSpacer: {
    height: 18, // matches strikethrough text (fontSize 12 lineHeight ~16 + marginBottom 2)
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
    marginTop: 6,
    backgroundColor: "rgba(52, 199, 89, 0.08)",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  saveText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.scoreExcellent,
  },

  // --- Zone 3: Action ---

  ctaSection: {
    marginTop: 22,
    paddingHorizontal: 20,
  },
  ctaButton: {
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },

  // Timeline
  timelineContainer: {
    marginTop: 16,
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
    marginTop: 10,
  },
  trustText: {
    fontSize: 12,
    fontWeight: "400",
    letterSpacing: -0.1,
  },
  trustTextStandalone: {
    fontSize: 12,
    fontWeight: "400",
    textAlign: "center",
    marginTop: 10,
    letterSpacing: -0.1,
  },

  // Footer
  footer: {
    alignItems: "center",
    marginTop: 16,
    gap: 8,
  },
  restoreText: {
    fontSize: 13,
    fontWeight: "400",
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  legalText: {
    fontSize: 11,
    fontWeight: "400",
  },
  legalDot: {
    fontSize: 11,
  },
});
