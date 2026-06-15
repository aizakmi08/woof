import { useEffect, useRef, useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import {
  X,
  Check,
  Star,
  Lock,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../services/auth";
import {
  getOfferings,
  getPurchaseConfigurationIssue,
  purchasePackage,
  restorePurchases,
  getWeeklyPackage,
  getMonthlyPackage,
  getAnnualPackage,
} from "../services/purchases";
import { trackEvent } from "../services/analytics";
import { useTheme, getScoreConfig, Colors, Spacing } from "../theme";
import { PRIVACY_HTML, TERMS_HTML } from "../legal";

const FEATURES = [
  "Unlimited scans per day",
  "Human food safety estimates",
  "Detailed ingredient breakdown",
  "Full scan history & sync",
];

const SUPPORT_EMAIL = "woofapp.help@gmail.com";

const PLANS = [
  { key: "weekly", label: "Weekly", flex: 0.26 },
  { key: "monthly", label: "Monthly", flex: 0.30 },
  { key: "annual", label: "Annual", flex: 0.44, popular: true },
];

function unitLabel(unit, count) {
  const normalized = String(unit || "").toLowerCase();
  const base = normalized === "day"
    ? "day"
    : normalized === "week"
      ? "week"
      : normalized === "month"
        ? "month"
        : normalized === "year"
          ? "year"
          : "period";
  return count === 1 ? base : `${base}s`;
}

function formatIntroDuration(introPrice) {
  if (!introPrice) return null;
  const units = Number(introPrice.periodNumberOfUnits || 1);
  const cycles = Number(introPrice.cycles || 1);
  const count = Math.max(1, units * cycles);
  const unit = unitLabel(introPrice.periodUnit, count);
  return `${count} ${unit}`;
}

function getFreeTrialInfo(pkg) {
  const introPrice = pkg?.product?.introPrice;
  if (!introPrice || Number(introPrice.price) !== 0) return null;
  const durationLabel = formatIntroDuration(introPrice);
  if (!durationLabel) return null;
  return { durationLabel, introPrice };
}

function purchaseConfigMessage(error) {
  const diagnostics = error?.diagnostics || {};
  const platform = diagnostics.platform || "this platform";
  const expectedPrefix = diagnostics.expectedPrefix || "the RevenueCat public SDK key prefix";
  if (error?.code === "missing_revenuecat_api_key") {
    return `Purchases are not configured for ${platform}. Add the RevenueCat public SDK key for this build and restart Expo.`;
  }
  if (error?.code === "invalid_revenuecat_api_key_prefix") {
    return `The RevenueCat key configured for ${platform} has the wrong prefix. It should start with ${expectedPrefix}.`;
  }
  if (error?.code === "expo_go_revenuecat_unavailable") {
    return "Purchases are unavailable in Expo Go with App Store keys. Open this project in a Woof development build, TestFlight, or the App Store build, or configure REVENUECAT_TEST_STORE_API_KEY for local Expo Go testing.";
  }
  if (error?.code === "revenuecat_operation_timeout") {
    return "Subscriptions are taking too long to load. Check your connection and try again.";
  }
  if (/invalid api key/i.test(error?.message || "")) {
    return `RevenueCat rejected the ${platform} public SDK key. Check that the key belongs to the RevenueCat app for this bundle ID, then restart Expo with a cleared cache.`;
  }
  return error?.message || "Subscriptions are unavailable right now. Restore still works for active purchases.";
}

function purchaseConfigDetail(error) {
  const diagnostics = error?.diagnostics;
  if (!diagnostics) return null;
  const configured = diagnostics.hasKey
    ? `${diagnostics.keyPrefix || "key"}... (${diagnostics.keyLength} chars)`
    : "missing";
  const runtime = diagnostics.isExpoGo ? " Expo Go runtime detected." : "";
  return `Platform: ${diagnostics.platform}. Expected prefix: ${diagnostics.expectedPrefix}. Configured key: ${configured}.${runtime}`;
}

function blocksRestorePurchases(error) {
  const code = error?.code || "";
  const message = error?.message || "";
  return (
    code === "expo_go_revenuecat_unavailable" ||
    code === "missing_revenuecat_api_key" ||
    code === "invalid_revenuecat_api_key_prefix" ||
    /invalid api key/i.test(message) ||
    /native store is not available/i.test(message) ||
    /issue with your configuration/i.test(message)
  );
}

function formatCurrency(value, currencyCode) {
  if (!Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function annualMonthlyEquivalent(pkg, offeringsResolved) {
  if (!pkg && offeringsResolved) return "Unavailable in this build";
  const product = pkg?.product;
  if (!product) return "Billed yearly";
  if (product.pricePerMonthString) return `${product.pricePerMonthString} / month`;
  const derived = formatCurrency(Number(product.price) / 12, product.currencyCode);
  return derived ? `${derived} / month` : "Billed yearly";
}

function periodNoun(subscriptionPeriod) {
  switch (subscriptionPeriod) {
    case "P1W":
      return "week";
    case "P1M":
      return "month";
    case "P1Y":
      return "year";
    default:
      return "period";
  }
}

function billingCopy(pkg) {
  const product = pkg?.product;
  if (!product?.priceString) return "Cancel anytime.";
  return `${product.priceString} per ${periodNoun(product.subscriptionPeriod)}. Cancel anytime.`;
}

function displayPrice(pkg, offeringsResolved) {
  if (pkg?.product?.priceString) return pkg.product.priceString;
  return offeringsResolved ? "Unavailable" : "Loading";
}

function planSubtitle(pkg, fallback, offeringsResolved = false) {
  if (!pkg && offeringsResolved) return "Unavailable in this build";
  const trial = getFreeTrialInfo(pkg);
  if (trial) return `${trial.durationLabel} free trial`;
  return fallback;
}

function planPeriodLabel(pkg, fallback, offeringsResolved) {
  return !pkg && offeringsResolved ? "not available" : fallback;
}

function TrialTimeline({ theme, trialInfo }) {
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
          <Text style={[styles.timelineDotLabel, { color: theme.textPrimary }]}>
            {trialInfo.durationLabel}
          </Text>
          <Text style={[styles.timelineDotSub, { color: theme.textTertiary }]}>Trial period</Text>
        </View>
        <View style={[styles.timelineLineSegment, { borderColor: theme.fillSecondary }]} />
        <View style={styles.timelineStop}>
          <View style={[styles.timelineDot, { backgroundColor: theme.textTertiary }]} />
          <Text style={[styles.timelineDotLabel, { color: theme.textPrimary }]}>Then</Text>
          <Text style={[styles.timelineDotSub, { color: theme.textTertiary }]}>Billing</Text>
        </View>
      </View>
    </View>
  );
}

export default function PaywallScreen({ route, navigation }) {
  const theme = useTheme();
  const pt = {
    ...theme,
    bg: "#1C1C1E",
    card: "rgba(255,255,255,0.08)",
    textPrimary: "#FFFFFF",
    textSecondary: "rgba(255,255,255,0.7)",
    textTertiary: "rgba(255,255,255,0.4)",
    separator: "rgba(255,255,255,0.1)",
    buttonPrimary: "#30D158",
    buttonText: "#FFFFFF",
    fill: "rgba(255,255,255,0.06)",
    fillSecondary: "rgba(255,255,255,0.12)",
  };
  const { refreshProStatus, isPro, user } = useAuth();
  const { source, productName, score } = route.params || {};
  const isQuotaSyncMismatch = isPro && source === "quota_error";

  const [offerings, setOfferings] = useState(null);
  const [offeringsError, setOfferingsError] = useState(() => getPurchaseConfigurationIssue());
  const [selectedIndex, setSelectedIndex] = useState(2);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Auto-dismiss if user is already pro. Guard against double-fire when isPro
  // flips while the screen is mid-mount (race between Paywall → goBack → focus reuse).
  const dismissedRef = useRef(false);
  const mountedRef = useRef(true);
  const offeringsRequestRef = useRef(0);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const isLoading = purchasing || restoring;
  const safeGoBack = () => {
    if (!mountedRef.current || dismissedRef.current) return;
    dismissedRef.current = true;
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  useEffect(() => {
    if (isPro && !isQuotaSyncMismatch && !dismissedRef.current && !isLoading && navigation.canGoBack()) {
      console.log("[PAYWALL] User is already pro, dismissing");
      safeGoBack();
    }
  }, [isPro, isQuotaSyncMismatch, isLoading, navigation]);

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
    trackEvent("paywall_viewed", {
      source: source || "unknown",
      hasProduct: Boolean(productName),
      score: Number(score) || null,
    });
    const requestId = ++offeringsRequestRef.current;
    const purchaseUserId = user?.id || null;
    const configurationIssue = getPurchaseConfigurationIssue();
    if (configurationIssue) {
      if (!mountedRef.current) return;
      console.log("[PAYWALL] offerings skipped:", configurationIssue.code, configurationIssue.diagnostics);
      setOfferings(null);
      setOfferingsError(configurationIssue);
      return;
    }
    getOfferings(purchaseUserId).then(({ offering, error }) => {
      if (!mountedRef.current || requestId !== offeringsRequestRef.current) return;
      console.log("[PAYWALL] offerings:", offering ? `${offering.availablePackages?.length} packages` : "NULL - check RevenueCat config & Paid Apps agreement");
      setOfferings(offering);
      setOfferingsError(error || null);
    });
  }, [user?.id]);

  const weeklyPkg = getWeeklyPackage(offerings);
  const monthlyPkg = getMonthlyPackage(offerings);
  const annualPkg = getAnnualPackage(offerings);
  const offeringsResolved = Boolean(offerings || offeringsError);

  const pkgByIndex = [weeklyPkg, monthlyPkg, annualPkg];
  const selectedPkg = pkgByIndex[selectedIndex];
  const selectedPlan = PLANS[selectedIndex];

  useEffect(() => {
    if (!offerings || selectedPkg) return;
    const nextIndex = [2, 1, 0].find((index) => pkgByIndex[index]);
    if (typeof nextIndex === "number") setSelectedIndex(nextIndex);
  }, [offerings, selectedPkg, weeklyPkg, monthlyPkg, annualPkg]);

  const weeklyPrice = displayPrice(weeklyPkg, offeringsResolved);
  const monthlyPrice = displayPrice(monthlyPkg, offeringsResolved);
  const annualPrice = displayPrice(annualPkg, offeringsResolved);

  const scoreConfig = score ? getScoreConfig(score) : null;
  const selectedTrial = getFreeTrialInfo(selectedPkg);
  const isTrialPlan = Boolean(selectedTrial);
  const ctaDisabled = isLoading || (!isQuotaSyncMismatch && !selectedPkg);
  const restoreDisabled = isLoading || blocksRestorePurchases(offeringsError);
  const ctaLabel = isQuotaSyncMismatch
    ? "Refresh Subscription"
    : offeringsError
    ? "Plans Unavailable"
    : !offeringsResolved
    ? "Loading Plans..."
    : !selectedPkg
      ? "Plan Unavailable"
      : isTrialPlan
        ? `Try Free for ${selectedTrial.durationLabel}`
        : "Subscribe Now";

  const handlePlanSelect = (index) => {
    if (isLoading || !pkgByIndex[index]) return;
    Haptics.selectionAsync();
    console.log("[PAYWALL] plan_selected", { plan: PLANS[index].key });
    trackEvent("paywall_plan_selected", { plan: PLANS[index].key });
    setSelectedIndex(index);
  };

  const handlePurchase = async () => {
    if (isLoading) return;
    if (isQuotaSyncMismatch) {
      setPurchasing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const refreshed = await refreshProStatus();
        if (!mountedRef.current) return;
        if (refreshed === true) {
          Alert.alert(
            "Subscription Refreshed",
            "Woof Pro is active on this device. Go back and retry the scan so the server can re-check your access."
          );
          return;
        }
        Alert.alert(
          "Subscription Check Failed",
          "We couldn't confirm Woof Pro from RevenueCat. Restore purchases below, then retry the scan."
        );
      } finally {
        if (mountedRef.current) setPurchasing(false);
      }
      return;
    }
    if (!selectedPkg) {
      const detail = purchaseConfigDetail(offeringsError);
      Alert.alert(
        "Not Available",
        [purchaseConfigMessage(offeringsError), detail].filter(Boolean).join("\n\n")
      );
      return;
    }
    console.log("[PAYWALL] purchase_started", { plan: selectedPlan.key });
    trackEvent("purchase_started", {
      plan: selectedPlan.key,
      packageId: selectedPkg?.identifier || null,
    });
    setPurchasing(true);
    ctaWidthPercent.value = withTiming(18, { duration: 400, easing: Easing.out(Easing.cubic) });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await purchasePackage(selectedPkg, user?.id || null);
      if (!mountedRef.current) return;

      if (result.success) {
        console.log("[PAYWALL] purchase_completed", { plan: selectedPlan.key });
        trackEvent("purchase_completed", {
          plan: selectedPlan.key,
          packageId: selectedPkg?.identifier || null,
        });
        await refreshProStatus();
        if (!mountedRef.current) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeGoBack();
      } else if (result.cancelled) {
        console.log("[PAYWALL] purchase_cancelled", { plan: selectedPlan.key });
        trackEvent("purchase_cancelled", { plan: selectedPlan.key });
      } else if (result.code === "no_entitlement") {
        console.log("[PAYWALL] purchase_no_entitlement", {
          plan: selectedPlan.key,
          packageId: result.packageId,
          productId: result.productId,
          expectedEntitlementId: result.expectedEntitlementId,
          activeEntitlementIds: result.activeEntitlementIds,
          allEntitlementIds: result.allEntitlementIds,
        });
        trackEvent("purchase_no_entitlement", {
          plan: selectedPlan.key,
          packageId: result.packageId || null,
          entitlementCount: Array.isArray(result.activeEntitlementIds) ? result.activeEntitlementIds.length : 0,
        });
        Alert.alert(
          "Purchase Received",
          `${result.error}\n\nSupport: ${SUPPORT_EMAIL}`,
          [
            { text: "Restore Purchase", onPress: () => setTimeout(handleRestore, 0) },
            { text: "OK", style: "cancel" },
          ]
        );
      } else if (result.error) {
        console.log("[PAYWALL] purchase_failed", { plan: selectedPlan.key, error: result.error });
        trackEvent("purchase_failed", { plan: selectedPlan.key });
        Alert.alert("Purchase Failed", result.error);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.log("[PAYWALL] purchase_failed", { plan: selectedPlan.key, error: err.message });
      trackEvent("purchase_failed", { plan: selectedPlan.key });
      Alert.alert("Purchase Failed", err.message || "Something went wrong. Please try again.");
    } finally {
      if (mountedRef.current) {
        ctaWidthPercent.value = withTiming(100, { duration: 300, easing: Easing.out(Easing.cubic) });
        setPurchasing(false);
      }
    }
  };

  const handleRestore = async () => {
    if (isLoading) return;
    if (blocksRestorePurchases(offeringsError)) {
      Alert.alert("Restore Unavailable", purchaseConfigMessage(offeringsError));
      return;
    }
    console.log("[PAYWALL] restore_tapped");
    trackEvent("restore_started", { source: source || "unknown" });
    setRestoring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await restorePurchases(user?.id || null);
      if (!mountedRef.current) return;

      if (result.success) {
        trackEvent("restore_completed", { source: source || "unknown" });
        await refreshProStatus();
        if (!mountedRef.current) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        safeGoBack();
      } else if (result.code === "no_entitlement") {
        console.log("[PAYWALL] restore_no_entitlement", {
          expectedEntitlementId: result.expectedEntitlementId,
          activeEntitlementIds: result.activeEntitlementIds,
          allEntitlementIds: result.allEntitlementIds,
        });
        trackEvent("restore_no_entitlement", {
          entitlementCount: Array.isArray(result.activeEntitlementIds) ? result.activeEntitlementIds.length : 0,
        });
        Alert.alert("Restore Needs Help", `${result.error}\n\nSupport: ${SUPPORT_EMAIL}`);
      } else if (result.error) {
        trackEvent("restore_failed", { source: source || "unknown" });
        Alert.alert("Restore Failed", result.error);
      } else {
        trackEvent("restore_failed", { source: source || "unknown", reason: "none_found" });
        Alert.alert("No Purchases Found", "We couldn't find any active subscriptions to restore.");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      trackEvent("restore_failed", { source: source || "unknown" });
      Alert.alert("Restore Failed", err.message || "Something went wrong. Please try again.");
    } finally {
      if (mountedRef.current) {
        setRestoring(false);
      }
    }
  };

  const handleDismiss = () => {
    if (isLoading) return;
    console.log("[PAYWALL] dismissed", { source });
    safeGoBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: pt.bg }]}>
      {/* Green glow gradient at top */}
      <LinearGradient
        colors={["rgba(48, 209, 88, 0.15)", "transparent"]}
        style={styles.bgGradient}
        pointerEvents="none"
      />

      {/* Close button — Apple-style, no background circle */}
      <Pressable
        onPress={handleDismiss}
        disabled={isLoading}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={({ pressed }) => [styles.closeButtonApple, { opacity: isLoading ? 0.25 : pressed ? 0.85 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityState={{ disabled: isLoading }}
      >
        <X size={20} color={pt.textTertiary} strokeWidth={2.5} />
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

        {/* Hero icon */}
        <View style={styles.heroIconSection}>
          <LinearGradient
            colors={["#30D158", "#34C759"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroIconBox}
          >
            <Star size={30} color="#FFFFFF" strokeWidth={2} />
          </LinearGradient>
        </View>

        {/* Headline */}
        <View style={styles.headerSection}>
          <Text style={[styles.headerTitle, { color: pt.textPrimary }]}>
            Unlock Woof Pro
          </Text>
          <Text style={[styles.headerSub, { color: pt.textTertiary }]}>
            Full access, no limits
          </Text>
        </View>

        {/* Features — green checkmark circles */}
        <View style={styles.featuresList}>
          {FEATURES.map((text, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureCheckCircle}>
                <Check size={12} color={Colors.scoreExcellent} strokeWidth={3} />
              </View>
              <Text style={[styles.featureRowText, { color: "rgba(255,255,255,0.8)" }]}>
                {text}
              </Text>
            </View>
          ))}
        </View>

        {/* ═══════════ ZONE 2: THE CHOICE ═══════════ */}

        {/* Pricing cards — stacked vertical */}
        <View style={styles.pricingStack}>
          {/* Annual — highlighted */}
          <Pressable
            onPress={() => handlePlanSelect(2)}
            disabled={isLoading || (offeringsResolved && !annualPkg)}
            style={({ pressed }) => [
              styles.pricingRow,
              selectedIndex === 2 ? styles.pricingRowSelected : styles.pricingRowDefault,
              offeringsResolved && !annualPkg && styles.pricingRowUnavailable,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Annual plan"
            accessibilityState={{ selected: selectedIndex === 2, disabled: Boolean(isLoading || (offeringsResolved && !annualPkg)) }}
          >
            {selectedIndex === 2 && (
              <View style={styles.bestValueBadge}>
                <Text style={styles.bestValueText}>BEST VALUE</Text>
              </View>
            )}
            <View style={styles.pricingRowInner}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.planRowLabel, { color: "#FFFFFF" }]}>Annual</Text>
                <Text style={[styles.planRowSub, { color: "rgba(255,255,255,0.5)" }]}>
                  {annualMonthlyEquivalent(annualPkg, offeringsResolved)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.planRowPrice, { color: "#FFFFFF" }]}>{annualPrice}</Text>
                <Text style={[styles.planRowPeriod, { color: "rgba(255,255,255,0.4)" }]}>
                  {planPeriodLabel(annualPkg, "per year", offeringsResolved)}
                </Text>
              </View>
            </View>
          </Pressable>

          {/* Monthly */}
          <Pressable
            onPress={() => handlePlanSelect(1)}
            disabled={isLoading || (offeringsResolved && !monthlyPkg)}
            style={({ pressed }) => [
              styles.pricingRow,
              selectedIndex === 1 ? styles.pricingRowSelected : styles.pricingRowDefault,
              offeringsResolved && !monthlyPkg && styles.pricingRowUnavailable,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Monthly plan"
            accessibilityState={{ selected: selectedIndex === 1, disabled: Boolean(isLoading || (offeringsResolved && !monthlyPkg)) }}
          >
            <View style={styles.pricingRowInner}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.planRowLabel, { color: "#FFFFFF" }]}>Monthly</Text>
                <Text style={[styles.planRowSub, { color: "rgba(255,255,255,0.4)" }]}>
                  {planSubtitle(monthlyPkg, "Billed monthly", offeringsResolved)}
                </Text>
              </View>
              <Text style={[styles.planRowPrice, { color: "#FFFFFF" }]}>{monthlyPrice}</Text>
            </View>
          </Pressable>

          {/* Weekly */}
          <Pressable
            onPress={() => handlePlanSelect(0)}
            disabled={isLoading || (offeringsResolved && !weeklyPkg)}
            style={({ pressed }) => [
              styles.pricingRow,
              selectedIndex === 0 ? styles.pricingRowSelected : styles.pricingRowDefault,
              offeringsResolved && !weeklyPkg && styles.pricingRowUnavailable,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Weekly plan"
            accessibilityState={{ selected: selectedIndex === 0, disabled: Boolean(isLoading || (offeringsResolved && !weeklyPkg)) }}
          >
            <View style={styles.pricingRowInner}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.planRowLabel, { color: "#FFFFFF" }]}>Weekly</Text>
                <Text style={[styles.planRowSub, { color: "rgba(255,255,255,0.4)" }]}>
                  {planSubtitle(weeklyPkg, "Billed weekly", offeringsResolved)}
                </Text>
              </View>
              <Text style={[styles.planRowPrice, { color: "#FFFFFF" }]}>{weeklyPrice}</Text>
            </View>
          </Pressable>
        </View>

        {/* ═══════════ ZONE 3: THE ACTION ═══════════ */}

        {/* CTA button — Grok-style morph animation */}
        <View style={styles.ctaSection}>
          <Pressable
            onPress={handlePurchase}
            onPressIn={() => { if (!purchasing) ctaScale.value = withSpring(0.97, { damping: 20, stiffness: 300 }); }}
            onPressOut={() => { if (!purchasing) ctaScale.value = withSpring(1, { damping: 15, stiffness: 150 }); }}
            disabled={ctaDisabled}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            accessibilityState={{ disabled: ctaDisabled }}
          >
            <Animated.View
              style={[
                styles.ctaButton,
                { backgroundColor: ctaDisabled ? pt.fillSecondary : pt.buttonPrimary, overflow: "hidden" },
                ctaAnimStyle,
              ]}
            >
              {purchasing ? (
                <Animated.View key="loader" entering={FadeIn.duration(200)}>
                  <ActivityIndicator color={pt.buttonText} />
                </Animated.View>
              ) : (
                <Animated.Text
                  key="text"
                  entering={FadeIn.duration(200)}
                  style={[styles.ctaText, { color: pt.buttonText }]}
                  numberOfLines={1}
                >
                  {ctaLabel}
                </Animated.Text>
              )}
            </Animated.View>
          </Pressable>
        </View>

        {/* Timeline + trust text */}
        <View>
          {isTrialPlan ? (
            <>
              <TrialTimeline theme={pt} trialInfo={selectedTrial} />
              <View style={styles.trustRow}>
                <Lock size={11} color={pt.textTertiary} strokeWidth={1.5} />
                <Text style={[styles.trustText, { color: pt.textTertiary }]}>
                  Cancel before the trial ends and you won't be charged
                </Text>
              </View>
            </>
          ) : (
            <Text style={[styles.trustTextStandalone, { color: pt.textTertiary }]}>
              {isQuotaSyncMismatch
                ? "Your Pro access is active on this device, but the scan server returned a free-limit response. Refresh or restore purchases, then retry the scan."
                : selectedPkg ? billingCopy(selectedPkg) : purchaseConfigMessage(offeringsError)}
            </Text>
          )}
          {offeringsError ? (
            <Text style={[styles.configDetailText, { color: pt.textTertiary }]}>
              {purchaseConfigDetail(offeringsError)}
            </Text>
          ) : null}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleRestore}
            disabled={restoreDisabled}
            style={({ pressed }) => ({ opacity: restoreDisabled ? 0.45 : pressed ? 0.5 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            accessibilityState={{ disabled: restoreDisabled }}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={pt.textTertiary} />
            ) : (
              <Text style={[styles.restoreText, { color: pt.textSecondary }]}>
                {blocksRestorePurchases(offeringsError) ? "Restore Unavailable" : "Restore Purchases"}
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
              <Text style={[styles.legalText, { color: pt.textTertiary }]}>Terms</Text>
            </Pressable>
            <Text style={[styles.legalDot, { color: pt.textTertiary }]}> · </Text>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                navigation.navigate("WebView", { title: "Privacy Policy", html: PRIVACY_HTML });
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <Text style={[styles.legalText, { color: pt.textTertiary }]}>Privacy</Text>
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

  heroIconSection: {
    alignItems: "center",
    marginBottom: 12,
  },
  heroIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#30D158",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 6,
  },
  headerSection: {
    marginBottom: 16,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 14,
    fontWeight: "400",
    marginTop: 6,
    textAlign: "center",
  },

  // Features — green checkmark circles
  featuresList: {
    paddingHorizontal: 32,
    marginBottom: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  featureCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(48,209,88,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureRowText: {
    fontSize: 14,
    fontWeight: "400",
  },

  // --- Zone 2: Choice (stacked vertical) ---

  pricingStack: {
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 24,
  },
  pricingRow: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    position: "relative",
  },
  pricingRowDefault: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  pricingRowSelected: {
    backgroundColor: "rgba(48,209,88,0.12)",
    borderWidth: 2,
    borderColor: "#30D158",
  },
  pricingRowUnavailable: {
    opacity: 0.45,
  },
  pricingRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bestValueBadge: {
    position: "absolute",
    top: -10,
    right: 16,
    backgroundColor: Colors.scoreExcellent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
    zIndex: 1,
    shadowColor: Colors.scoreExcellent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  bestValueText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  planRowLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  planRowSub: {
    fontSize: 12,
    marginTop: 1,
  },
  planRowPrice: {
    fontSize: 18,
    fontWeight: "700",
  },
  planRowPeriod: {
    fontSize: 11,
    marginTop: 1,
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
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginTop: 4,
    marginHorizontal: -2,
  },
  timelineStop: {
    alignItems: "center",
    width: 64,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  timelineDotLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 1,
  },
  timelineDotSub: {
    fontSize: 10,
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
  configDetailText: {
    fontSize: 11,
    fontWeight: "400",
    textAlign: "center",
    marginTop: 6,
    letterSpacing: 0,
  },

  // Footer
  footer: {
    alignItems: "center",
    marginTop: 24,
    gap: 12,
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
