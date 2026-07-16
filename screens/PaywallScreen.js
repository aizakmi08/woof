import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { AppText as Text, MAX_FONT_SIZE_MULTIPLIER } from "../components/AppText";
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
  ChartColumnIncreasing,
  Lock,
  Star,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../services/auth";
import { trackEvent } from "../services/analytics";
import {
  getPaywallOffering,
  purchasePackage,
  restorePurchases,
  getWeeklyPackage,
  getMonthlyPackage,
  getAnnualPackage,
  getRevenueCatConfigStatus,
  getOfferingMetadata,
  getIntroEligibilityByProductId,
  getPackageTrialInfo,
  initializePurchases,
  getRevenueCatResultAnalytics,
} from "../services/purchases";
import { createLogger } from "../services/logger";
import { useTheme, getScoreConfig, Colors, Spacing } from "../theme";
import { PRIVACY_HTML, TERMS_HTML } from "../legal";

const logger = createLogger("PAYWALL");
const LOCAL_PAYWALL_VARIANT = "monthly_default_v1";
const BLOCKED_REMOTE_COPY_PATTERN =
  /dogfoodadvisor|catfoodadvisor|customer reviews?|review summaries|recall alerts?|recall history|veterinary approved|vet approved|guaranteed safe|medical diagnosis/i;
const PAYWALL_PLACEMENT_BY_SOURCE = {
  results_gate: "results_gate",
  scan_limit: "scan_limit",
  post_scan_prompt: "post_scan_prompt",
  home_banner: "home_banner",
  profile: "profile",
};

const DEFAULT_PITCH = {
  key: "default",
  positioning: "Built for pet parents who care about ingredients",
  features: [
    { icon: ShieldCheck, text: "Spot harmful ingredients" },
    { icon: ScanSearch, text: "Unlimited pet & food checks" },
    { icon: ChartColumnIncreasing, text: "Quality & safety scores" },
    { icon: Star, text: "Saved scan history" },
  ],
};

const PITCH_BY_SOURCE = {
  results_gate: {
    key: "results_gate",
    positioning: "Unlock the details behind this scan",
    features: [
      { icon: ShieldCheck, text: "Ingredient concerns explained clearly" },
      { icon: ChartColumnIncreasing, text: "Nutrition and quality breakdowns" },
      { icon: ScanSearch, text: "Unlimited follow-up checks" },
      { icon: Star, text: "Save results for every shopping trip" },
    ],
  },
  scan_limit: {
    key: "scan_limit",
    positioning: "Keep checking labels without waiting",
    features: [
      { icon: ScanSearch, text: "Unlimited pet food and human-food checks" },
      { icon: ShieldCheck, text: "Fast safety flags before you buy" },
      { icon: ChartColumnIncreasing, text: "Quality scores on every scan" },
      { icon: Star, text: "History for products you compare" },
    ],
  },
  post_scan_prompt: {
    key: "post_scan_prompt",
    positioning: "Keep comparing after your free checks",
    features: [
      { icon: ScanSearch, text: "Unlimited pet food and human-food checks" },
      { icon: ShieldCheck, text: "Ingredient concerns explained clearly" },
      { icon: ChartColumnIncreasing, text: "Compare foods by score" },
      { icon: Star, text: "Keep a history of better finds" },
    ],
  },
  home_banner: {
    key: "home_banner",
    positioning: "Make every pet food aisle easier to judge",
    features: [
      { icon: ScanSearch, text: "Unlimited scans while shopping" },
      { icon: ShieldCheck, text: "Spot ingredient red flags quickly" },
      { icon: ChartColumnIncreasing, text: "Compare foods by score" },
      { icon: Star, text: "Build a saved history of trusted picks" },
    ],
  },
  profile: {
    key: "profile",
    positioning: "Upgrade the account you already use",
    features: [
      { icon: ScanSearch, text: "Unlimited checks from this account" },
      { icon: Star, text: "Keep saved scan history" },
      { icon: ShieldCheck, text: "Review ingredient warnings anytime" },
      { icon: ChartColumnIncreasing, text: "Use scores when comparing products" },
    ],
  },
};

const PAYWALL_CONTEXT_BY_SOURCE = {
  results_gate: {
    key: "result_details",
    label: "For this scan",
    detail: "Unlock ingredient notes, score reasons, and saved result history.",
  },
  scan_limit: {
    key: "scan_continuity",
    label: "Free scan limit",
    detail: "Keep checking products now instead of waiting for scans to reset.",
  },
  post_scan_prompt: {
    key: "compare_more",
    label: "After a useful scan",
    detail: "Keep comparing products while the details are fresh.",
  },
  home_banner: {
    key: "shopping_confidence",
    label: "Shopping mode",
    detail: "Use unlimited checks when you are deciding what to buy.",
  },
  profile: {
    key: "account_upgrade",
    label: "Account upgrade",
    detail: "Manage Pro access, restore purchases, and keep history in one place.",
  },
  default: {
    key: "general_upgrade",
    label: "Woof Pro",
    detail: "Unlock unlimited checks and saved product decisions.",
  },
};

const PLANS = [
  { key: "weekly", label: "Weekly", hasTrial: false, flex: 0.26 },
  { key: "monthly", label: "Monthly", hasTrial: false, flex: 0.30, badge: "POPULAR" },
  { key: "annual", label: "Annual", hasTrial: false, flex: 0.44, badge: "BEST VALUE" },
];

function getSourceKey(source) {
  return PITCH_BY_SOURCE[source] ? source : "default";
}

function getPaywallContext(source) {
  return PAYWALL_CONTEXT_BY_SOURCE[source] || PAYWALL_CONTEXT_BY_SOURCE.default;
}

function getPaywallPlacementIdentifier(source) {
  return PAYWALL_PLACEMENT_BY_SOURCE[source] || null;
}

function getOfferingFetchAnalytics(result, source) {
  const placementIdentifier = result?.placementIdentifier || getPaywallPlacementIdentifier(source);
  const placementRequested = result?.placementRequested ?? Boolean(placementIdentifier);

  return {
    placement_identifier: placementIdentifier,
    placement_requested: placementRequested,
    placement_supported: result?.placementSupported ?? null,
    offering_fetch_mode: result?.fetchMode || "pending",
    placement_offering_returned: result?.placementOfferingReturned === true,
    placement_fallback_used: result?.placementFallbackUsed === true,
  };
}

function safeRemoteCopy(value, maxLength, { allowNewline = false } = {}) {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!normalized || normalized.length > maxLength) return null;
  if (BLOCKED_REMOTE_COPY_PATTERN.test(normalized)) return null;
  if (!allowNewline && normalized.includes("\n")) return null;
  return normalized;
}

function metadataString(metadata, source, field, maxLength, options) {
  if (!metadata || typeof metadata !== "object") return null;
  const sourceKey = getSourceKey(source);
  const candidates = [
    `woof_${sourceKey}_${field}`,
    `${sourceKey}_${field}`,
    `woof_${field}_${sourceKey}`,
    `${field}_${sourceKey}`,
    `woof_default_${field}`,
    `default_${field}`,
  ];

  for (const key of candidates) {
    const safe = safeRemoteCopy(metadata[key], maxLength, options);
    if (safe) return safe;
  }

  return null;
}

function safeMetadataId(value, maxLength = 48) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > maxLength) return null;
  if (!/^[a-z0-9_.-]+$/.test(normalized)) return null;
  return normalized;
}

function getPaywallVariant(metadata = {}) {
  return (
    safeMetadataId(metadata.woof_paywall_variant) ||
    safeMetadataId(metadata.paywall_variant) ||
    LOCAL_PAYWALL_VARIANT
  );
}

function getDefaultPlanKey(metadata = {}) {
  const candidate = safeMetadataId(metadata.woof_default_plan || metadata.default_plan, 16);
  return PLANS.some((plan) => plan.key === candidate) ? candidate : "monthly";
}

function getDefaultPlanIndex(metadata = {}) {
  const targetKey = getDefaultPlanKey(metadata);
  const index = PLANS.findIndex((plan) => plan.key === targetKey);
  return index >= 0 ? index : PLANS.findIndex((plan) => plan.key === "monthly");
}

function hasPaywallMetadata(metadata = {}) {
  return Object.keys(metadata).some((key) => (
    key === "paywall_variant" ||
    key === "default_plan" ||
    key.startsWith("woof_")
  ));
}

function getPaywallMetadataDebug(metadata = {}, source) {
  const keys = Object.keys(metadata || {}).filter(Boolean).sort();
  const sourceKey = getSourceKey(source);
  const sourceKeys = keys.filter((key) => key.includes(sourceKey) || key.includes("default"));
  const blockedValueCount = Object.values(metadata || {}).filter((value) => (
    typeof value === "string" && BLOCKED_REMOTE_COPY_PATTERN.test(value)
  )).length;

  return {
    keys,
    sourceKeys,
    headlineAccepted: Boolean(metadataString(metadata, source, "headline", 64, { allowNewline: true })),
    positioningAccepted: Boolean(metadataString(metadata, source, "positioning", 96)),
    blockedValueCount,
  };
}

function getPackageAvailabilityAnalytics(offering) {
  const packagesByPlan = {
    weekly: getWeeklyPackage(offering),
    monthly: getMonthlyPackage(offering),
    annual: getAnnualPackage(offering),
  };
  const availablePlanKeys = PLANS
    .map((plan) => plan.key)
    .filter((key) => Boolean(packagesByPlan[key]));
  const missingPlanKeys = PLANS
    .map((plan) => plan.key)
    .filter((key) => !packagesByPlan[key]);

  return {
    expected_package_count: PLANS.length,
    available_plan_count: availablePlanKeys.length,
    missing_plan_count: missingPlanKeys.length,
    available_plan_keys: availablePlanKeys,
    missing_plan_keys: missingPlanKeys,
    weekly_package_available: Boolean(packagesByPlan.weekly),
    monthly_package_available: Boolean(packagesByPlan.monthly),
    annual_package_available: Boolean(packagesByPlan.annual),
    weekly_product_identifier: packagesByPlan.weekly?.product?.identifier || null,
    monthly_product_identifier: packagesByPlan.monthly?.product?.identifier || null,
    annual_product_identifier: packagesByPlan.annual?.product?.identifier || null,
  };
}

function getContextualHeadline(source, productName, metadata = {}) {
  if (source === "results_gate") {
    const name = productName || "this product";
    return metadataString(metadata, source, "headline", 64, { allowNewline: true }) || `See what\u2019s really in\n${name}`;
  }
  const localHeadline = source === "scan_limit"
    ? "Unlock unlimited\nscans"
    : source === "post_scan_prompt"
      ? "Keep comparing\npet foods"
      : source === "home_banner"
        ? "Give your pet the\nbest nutrition"
        : "Know exactly what\u2019s\nin every bowl";

  return metadataString(metadata, source, "headline", 64, { allowNewline: true }) || localHeadline;
}

function getContextualPitch(source, metadata = {}) {
  const localPitch = PITCH_BY_SOURCE[source] || DEFAULT_PITCH;
  const remotePositioning = metadataString(metadata, source, "positioning", 96);
  return remotePositioning
    ? { ...localPitch, positioning: remotePositioning }
    : localPitch;
}

function getTrialLabel(trialInfo) {
  return trialInfo?.trialLabel && trialInfo.trialLabel !== "trial"
    ? trialInfo.trialLabel
    : "trial";
}

function getCtaText(plan, trialInfo) {
  if (trialInfo?.canClaimTrial) {
    const trialLabel = getTrialLabel(trialInfo);
    return trialLabel === "trial" ? "Start Free Trial" : `Try ${trialLabel} Free`;
  }
  return `Start ${plan.label}`;
}

function getPlanDisclosure(plan, price, period, trialInfo, offeringsLoaded) {
  if (!price) {
    return offeringsLoaded
      ? "This plan is not currently available. Try another plan or restore an existing purchase."
      : "Subscription prices are still loading. Please try again in a moment.";
  }
  if (trialInfo?.canClaimTrial) {
    const trialLabel = getTrialLabel(trialInfo);
    const trialPrefix = trialLabel === "trial" ? "Free trial" : `${trialLabel} free`;
    return `${trialPrefix}, then ${price}${period}. Cancel before the trial ends to avoid being charged.`;
  }
  return `${price}${period}. Cancel anytime.`;
}

function getPlanAccessibilityLabel(plan, price, period, isSelected, trialInfo, offeringsLoaded) {
  if (!price) {
    const selectedText = isSelected ? ", selected" : "";
    const statusText = offeringsLoaded ? "price unavailable" : "price loading";
    return `${plan.label} plan, ${statusText}${selectedText}`;
  }
  const trialLabel = getTrialLabel(trialInfo);
  const trialText = trialInfo?.canClaimTrial
    ? trialLabel === "trial"
      ? ", includes a free trial"
      : `, includes a ${trialLabel} free trial`
    : "";
  const selectedText = isSelected ? ", selected" : "";
  return `${plan.label} plan, ${price}${period}${trialText}${selectedText}`;
}

function numericPackagePrice(pkg) {
  const price = Number(pkg?.product?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function priceAffixes(priceString) {
  const text = typeof priceString === "string" ? priceString.trim() : "";
  const match = text.match(/^([^0-9.,-]*\s*)[0-9.,-]+(\s*[^0-9.,-]*)$/);
  return {
    prefix: match?.[1] || "$",
    suffix: match?.[2] || "",
    decimalSeparator: text.includes(",") && !text.includes(".") ? "," : ".",
  };
}

function formatComparablePrice(amount, referencePriceString) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const { prefix, suffix, decimalSeparator } = priceAffixes(referencePriceString);
  const normalized = amount.toFixed(2);
  const localized = decimalSeparator === ","
    ? normalized.replace(".", ",")
    : normalized;
  return `${prefix}${localized}${suffix}`.trim();
}

function getPriceComparisons({ weeklyPkg, monthlyPkg, annualPkg, weeklyPrice, monthlyPrice, annualPrice }) {
  const weeklyAmount = numericPackagePrice(weeklyPkg);
  const monthlyAmount = numericPackagePrice(monthlyPkg);
  const annualAmount = numericPackagePrice(annualPkg);
  const annualAnchorAmount = monthlyAmount && annualAmount ? monthlyAmount * 12 : null;
  const annualSavings = annualAnchorAmount && annualAnchorAmount > annualAmount
    ? Math.round((1 - (annualAmount / annualAnchorAmount)) * 100)
    : 0;

  return {
    weeklyMonthlyEquivalent: weeklyAmount
      ? formatComparablePrice((weeklyAmount * 52) / 12, weeklyPrice)
      : null,
    annualAnchor: annualSavings > 0
      ? formatComparablePrice(annualAnchorAmount, monthlyPrice)
      : null,
    annualMonthlyEquivalent: annualAmount
      ? formatComparablePrice(annualAmount / 12, annualPrice)
      : null,
    annualSavingsPercent: annualSavings > 0 && annualSavings < 100 ? annualSavings : null,
  };
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
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
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
          <Text style={[styles.timelineDotLabel, { color: theme.textPrimary }]}>Reminder</Text>
          <Text style={[styles.timelineDotSub, { color: theme.textTertiary }]}>Before billing</Text>
        </View>
        <View style={[styles.timelineLineSegment, { borderColor: theme.fillSecondary }]} />
        <View style={styles.timelineStop}>
          <View style={[styles.timelineDot, { backgroundColor: theme.textTertiary }]} />
          <Text style={[styles.timelineDotLabel, { color: theme.textPrimary }]}>After trial</Text>
          <Text style={[styles.timelineDotSub, { color: theme.textTertiary }]}>Paid plan</Text>
        </View>
      </View>
    </View>
  );
}

export default function PaywallScreen({ route, navigation }) {
  const theme = useTheme();
  const { refreshProStatus, isPro, user } = useAuth();
  const { source, productName, score } = route.params || {};

  const [offerings, setOfferings] = useState(null);
  const [offeringsLoaded, setOfferingsLoaded] = useState(false);
  const [offeringMetadata, setOfferingMetadata] = useState({});
  const [offeringFetchAnalytics, setOfferingFetchAnalytics] = useState(() => (
    getOfferingFetchAnalytics(null, source)
  ));
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [trialEligibilityByProductId, setTrialEligibilityByProductId] = useState({});
  const [selectedIndex, setSelectedIndex] = useState(() => getDefaultPlanIndex());
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const userSelectedPlanRef = useRef(false);
  const paywallOpenedAtRef = useRef(Date.now());
  const paywallExitTrackedRef = useRef(false);
  const paywallCloseReasonRef = useRef("navigation");
  const paywallCloseOutcomeRef = useRef("dismissed");

  const paywallVariant = getPaywallVariant(offeringMetadata);
  const defaultPlanIndex = getDefaultPlanIndex(offeringMetadata);
  const defaultPlanKey = PLANS[defaultPlanIndex]?.key || "monthly";
  const pitch = getContextualPitch(source, offeringMetadata);
  const sourceContext = getPaywallContext(source);

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
    let isActive = true;
    const requestedPlacementIdentifier = getPaywallPlacementIdentifier(source);
    logger.debug("[PAYWALL] viewed", { source, productName, score });
    const revenueCatConfig = getRevenueCatConfigStatus();
    (async () => {
      const purchasesInitialized = user?.id
        ? await initializePurchases(user.id)
        : false;
      const offeringResult = await getPaywallOffering(requestedPlacementIdentifier);
      const o = offeringResult.offering;
      const fetchAnalytics = getOfferingFetchAnalytics(offeringResult, source);
      const metadata = getOfferingMetadata(o);
      const appliedVariant = getPaywallVariant(metadata);
      const appliedDefaultPlanIndex = getDefaultPlanIndex(metadata);
      const appliedDefaultPlan = PLANS[appliedDefaultPlanIndex] || PLANS[getDefaultPlanIndex()];
      const appliedPitch = getContextualPitch(source, metadata);
      const appliedSourceContext = getPaywallContext(source);
      const metadataPresent = hasPaywallMetadata(metadata);
      const packageAvailability = getPackageAvailabilityAnalytics(o);
      const productIds = (o?.availablePackages || [])
        .map((pkg) => pkg?.product?.identifier)
        .filter(Boolean);

      logger.debug("[PAYWALL] offerings:", o ? `${o.availablePackages?.length} packages` : "NULL - check RevenueCat config & Paid Apps agreement");
      if (!isActive) return;
      setOfferingMetadata(metadata);
      setOfferingFetchAnalytics(fetchAnalytics);
      if (!userSelectedPlanRef.current) {
        setSelectedIndex(appliedDefaultPlanIndex);
      }
      setOfferings(o);
      setOfferingsLoaded(true);

      trackEvent("paywall_variant_assigned", {
        source: source || "unknown",
        source_intent: appliedSourceContext.key,
        source_context_label: appliedSourceContext.label,
        paywall_variant: appliedVariant,
        pitch_key: appliedPitch.key,
        default_plan: appliedDefaultPlan.key,
        trial_policy: "store_eligibility_detected",
        revenuecat_metadata_present: metadataPresent,
        ...fetchAnalytics,
      });
      trackEvent("paywall_viewed", {
        source: source || "unknown",
        source_intent: appliedSourceContext.key,
        source_context_label: appliedSourceContext.label,
        paywall_variant: appliedVariant,
        pitch_key: appliedPitch.key,
        default_plan: appliedDefaultPlan.key,
        trial_policy: "store_eligibility_detected",
        has_product_context: !!productName,
        score: score ?? null,
        revenuecat_metadata_present: metadataPresent,
        ...fetchAnalytics,
      });
      if (metadataPresent) {
        trackEvent("paywall_metadata_applied", {
          source: source || "unknown",
          source_intent: appliedSourceContext.key,
          source_context_label: appliedSourceContext.label,
          paywall_variant: appliedVariant,
          pitch_key: appliedPitch.key,
          default_plan: appliedDefaultPlan.key,
          headline_overridden: !!metadataString(metadata, source, "headline", 64, { allowNewline: true }),
          positioning_overridden: !!metadataString(metadata, source, "positioning", 96),
          ...fetchAnalytics,
        });
      }
      trackEvent("paywall_offerings_loaded", {
        source: source || "unknown",
        source_intent: appliedSourceContext.key,
        source_context_label: appliedSourceContext.label,
        paywall_variant: appliedVariant,
        pitch_key: appliedPitch.key,
        default_plan: appliedDefaultPlan.key,
        package_count: o?.availablePackages?.length || 0,
        success: !!o,
        revenuecat_configured: revenueCatConfig.configured,
        purchases_initialized: purchasesInitialized,
        platform: revenueCatConfig.platform,
        revenuecat_metadata_present: metadataPresent,
        offering_identifier: o?.identifier,
        ...fetchAnalytics,
        ...packageAvailability,
      });

      const trialEligibility = await getIntroEligibilityByProductId(productIds);
      if (!isActive) return;
      setTrialEligibilityByProductId(trialEligibility);
      const annualTrialInfo = getPackageTrialInfo(getAnnualPackage(o), trialEligibility);
      trackEvent("paywall_trial_eligibility_loaded", {
        source: source || "unknown",
        source_intent: appliedSourceContext.key,
        source_context_label: appliedSourceContext.label,
        paywall_variant: appliedVariant,
        pitch_key: appliedPitch.key,
        default_plan: appliedDefaultPlan.key,
        product_count: productIds.length,
        checked_product_count: Object.keys(trialEligibility || {}).length,
        annual_trial_configured: annualTrialInfo.configured,
        annual_trial_can_claim: annualTrialInfo.canClaimTrial,
        annual_trial_eligibility_status: annualTrialInfo.eligibilityStatus,
        annual_trial_label: annualTrialInfo.trialLabel,
        ...fetchAnalytics,
      });
    })().catch((err) => {
      logger.debug("[PAYWALL] offerings load failed:", err?.message || "Unavailable");
      if (!isActive) return;
      const fetchAnalytics = getOfferingFetchAnalytics({
        placementIdentifier: requestedPlacementIdentifier,
        placementRequested: Boolean(requestedPlacementIdentifier),
        placementSupported: null,
        fetchMode: "error",
        placementOfferingReturned: false,
        placementFallbackUsed: false,
      }, source);
      setOfferings(null);
      setOfferingsLoaded(true);
      setOfferingFetchAnalytics(fetchAnalytics);
      trackEvent("paywall_offerings_loaded", {
        source: source || "unknown",
        source_intent: getPaywallContext(source).key,
        source_context_label: getPaywallContext(source).label,
        paywall_variant: LOCAL_PAYWALL_VARIANT,
        pitch_key: getContextualPitch(source, {}).key,
        default_plan: "monthly",
        package_count: 0,
        success: false,
        revenuecat_configured: revenueCatConfig.configured,
        purchases_initialized: false,
        platform: revenueCatConfig.platform,
        revenuecat_metadata_present: false,
        message: err?.message || "offerings_unavailable",
        ...fetchAnalytics,
        ...getPackageAvailabilityAnalytics(null),
      });
    });

    return () => {
      isActive = false;
    };
  }, [productName, score, source, user?.id]);

  const weeklyPkg = getWeeklyPackage(offerings);
  const monthlyPkg = getMonthlyPackage(offerings);
  const annualPkg = getAnnualPackage(offerings);

  const pkgByIndex = [weeklyPkg, monthlyPkg, annualPkg];
  const selectedPkg = pkgByIndex[selectedIndex];
  const selectedPlan = PLANS[selectedIndex];
  const trialInfoByIndex = pkgByIndex.map((pkg) => (
    getPackageTrialInfo(pkg, trialEligibilityByProductId)
  ));
  const selectedTrialInfo = trialInfoByIndex[selectedIndex]
    || getPackageTrialInfo(selectedPkg, trialEligibilityByProductId);

  const weeklyPrice = weeklyPkg?.product?.priceString || null;
  const monthlyPrice = monthlyPkg?.product?.priceString || null;
  const annualPrice = annualPkg?.product?.priceString || null;
  const prices = [weeklyPrice, monthlyPrice, annualPrice];
  const displayPrices = prices.map((price) => price || (offeringsLoaded ? "Unavailable" : "Loading"));
  const periods = ["/week", "/month", "/year"];
  const selectedPrice = prices[selectedIndex];
  const selectedPeriod = periods[selectedIndex];
  const priceComparisons = getPriceComparisons({
    weeklyPkg,
    monthlyPkg,
    annualPkg,
    weeklyPrice,
    monthlyPrice,
    annualPrice,
  });

  const scoreConfig = score ? getScoreConfig(score) : null;
  const headlineText = getContextualHeadline(source, productName, offeringMetadata);
  const isTrialPlan = selectedTrialInfo.canClaimTrial;
  const controlsBusy = purchasing || restoring;
  const purchaseDisabled = controlsBusy || !selectedPkg;
  const revenueCatConfig = getRevenueCatConfigStatus();
  const requiresDevelopmentBuild = Boolean(
    __DEV__
    && offeringsLoaded
    && !offerings
    && revenueCatConfig.requiresDevelopmentBuild
  );
  const ctaText = !selectedPkg
    ? offeringsLoaded
      ? requiresDevelopmentBuild ? "Development Build Required" : "Plan Unavailable"
      : "Loading Plans..."
    : getCtaText(selectedPlan, selectedTrialInfo);
  const planDisclosure = requiresDevelopmentBuild
    ? "Expo Go cannot load App Store products. Test purchases in a development build or TestFlight."
    : getPlanDisclosure(selectedPlan, selectedPrice, selectedPeriod, selectedTrialInfo, offeringsLoaded);

  const getPlanAnalytics = (index = selectedIndex) => {
    const plan = PLANS[index];
    const pkg = pkgByIndex[index];
    const trialInfo = trialInfoByIndex[index] || getPackageTrialInfo(pkg, trialEligibilityByProductId);
    return {
      source: source || "unknown",
      source_intent: sourceContext.key,
      source_context_label: sourceContext.label,
      paywall_variant: paywallVariant,
      pitch_key: pitch.key,
      plan: plan.key,
      default_plan: defaultPlanKey,
      has_trial_claim: trialInfo.canClaimTrial,
      trial_configured: trialInfo.configured,
      trial_eligible: trialInfo.eligible,
      trial_eligibility_status: trialInfo.eligibilityStatus,
      trial_label: trialInfo.trialLabel,
      package_identifier: pkg?.identifier,
      package_type: pkg?.packageType,
      product_identifier: pkg?.product?.identifier,
      price: pkg?.product?.price,
      price_string: pkg?.product?.priceString,
      plan_available: Boolean(pkg),
      selected_by_default: index === defaultPlanIndex,
      revenuecat_metadata_present: hasPaywallMetadata(offeringMetadata),
      annual_savings_percent: priceComparisons.annualSavingsPercent,
      offering_identifier: offerings?.identifier,
      ...offeringFetchAnalytics,
    };
  };

  const getRestoreAnalytics = (extra = {}) => ({
    source: source || "unknown",
    source_intent: sourceContext.key,
    source_context_label: sourceContext.label,
    paywall_variant: paywallVariant,
    pitch_key: pitch.key,
    default_plan: defaultPlanKey,
    ...extra,
  });

  const getPaywallExitAnalytics = (reason, outcome) => {
    const durationMs = Math.max(
      0,
      Math.min(Date.now() - paywallOpenedAtRef.current, 30 * 60 * 1000)
    );
    const selectedAnalytics = getPlanAnalytics(selectedIndex);

    return {
      ...selectedAnalytics,
      exit_reason: reason || "unknown",
      close_outcome: outcome || "dismissed",
      duration_ms: durationMs,
      offerings_loaded: offeringsLoaded,
      package_count: offerings?.availablePackages?.length || 0,
      selected_package_available: !!selectedPkg,
      controls_busy: controlsBusy,
      has_product_context: !!productName,
      score: score ?? null,
    };
  };

  const trackPaywallExit = (reason = "navigation", outcome = "dismissed") => {
    if (paywallExitTrackedRef.current) return;
    paywallExitTrackedRef.current = true;

    const analytics = getPaywallExitAnalytics(reason, outcome);
    trackEvent("paywall_closed", analytics);
    if (outcome === "dismissed") {
      trackEvent("paywall_dismissed", analytics);
    }
  };

  // Auto-dismiss if user is already pro
  useEffect(() => {
    if (isPro) {
      logger.debug("[PAYWALL] User is already pro, dismissing");
      paywallCloseReasonRef.current = "already_pro";
      paywallCloseOutcomeRef.current = "already_pro";
      trackPaywallExit("already_pro", "already_pro");
      navigation.goBack();
    }
  }, [isPro, navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      trackPaywallExit(paywallCloseReasonRef.current, paywallCloseOutcomeRef.current);
    });

    return unsubscribe;
  }, [
    navigation,
    source,
    paywallVariant,
    pitch.key,
    defaultPlanKey,
    selectedIndex,
    offeringsLoaded,
    selectedPkg,
    controlsBusy,
  ]);

  const handlePlanSelect = (index) => {
    userSelectedPlanRef.current = true;
    Haptics.selectionAsync();
    logger.debug("[PAYWALL] plan_selected", { plan: PLANS[index].key });
    trackEvent("paywall_plan_selected", getPlanAnalytics(index));
    setSelectedIndex(index);
  };

  const handlePurchase = async () => {
    if (!selectedPkg) {
      trackEvent("purchase_unavailable", {
        ...getPlanAnalytics(),
      });
      Alert.alert("Not Available", "Subscriptions are loading. Please wait a moment and try again.\n\nIf this persists, check that your App Store Connect or Google Play Console subscription setup is active.");
      return;
    }
    logger.debug("[PAYWALL] purchase_started", { plan: selectedPlan.key });
    trackEvent("purchase_started", getPlanAnalytics());
    setPurchasing(true);
    ctaWidthPercent.value = withTiming(18, { duration: 400, easing: Easing.out(Easing.cubic) });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await purchasePackage(selectedPkg);
    ctaWidthPercent.value = withTiming(100, { duration: 300, easing: Easing.out(Easing.cubic) });
    const resultAnalytics = getRevenueCatResultAnalytics(result);

    if (result.success) {
      logger.debug("[PAYWALL] purchase_completed", { plan: selectedPlan.key });
      trackEvent("purchase_completed", {
        ...getPlanAnalytics(),
        ...resultAnalytics,
      });
      const proAfterRefresh = await refreshProStatus({ source: "purchase_success" });
      trackEvent("purchase_entitlement_refreshed", {
        ...getPlanAnalytics(),
        ...resultAnalytics,
        is_pro: proAfterRefresh,
      });
      setPurchasing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (proAfterRefresh) {
        paywallCloseReasonRef.current = "purchase_success";
        paywallCloseOutcomeRef.current = "purchase_success";
        trackPaywallExit("purchase_success", "purchase_success");
        navigation.goBack();
      } else {
        Alert.alert(
          "Purchase Received",
          "Your purchase went through, but Pro access is still syncing. Please try Restore Purchases in a moment."
        );
      }
    } else if (result.cancelled) {
      setPurchasing(false);
      logger.debug("[PAYWALL] purchase_cancelled", { plan: selectedPlan.key });
      trackEvent("purchase_cancelled", {
        ...getPlanAnalytics(),
        ...resultAnalytics,
      });
    } else if (result.pending) {
      setPurchasing(false);
      logger.debug("[PAYWALL] purchase_pending", { plan: selectedPlan.key });
      trackEvent("purchase_pending", {
        ...getPlanAnalytics(),
        ...resultAnalytics,
      });
      Alert.alert(
        "Purchase Pending",
        result.error || "Your payment is pending approval. You'll get access once it's confirmed."
      );
    } else if (result.error) {
      setPurchasing(false);
      logger.debug("[PAYWALL] purchase_failed", { plan: selectedPlan.key, error: result.error });
      trackEvent("purchase_failed", {
        ...getPlanAnalytics(),
        ...resultAnalytics,
        message: result.error,
      });
      Alert.alert("Purchase Failed", result.error);
    } else {
      setPurchasing(false);
      logger.debug("[PAYWALL] purchase_no_entitlement", { plan: selectedPlan.key });
      trackEvent("purchase_no_entitlement", {
        ...getPlanAnalytics(),
        ...resultAnalytics,
      });
      Alert.alert(
        "Purchase Pending",
        "The purchase finished, but Pro access was not activated yet. Please try Restore Purchases in a moment."
      );
    }
  };

  const handleRestore = async () => {
    logger.debug("[PAYWALL] restore_tapped");
    trackEvent("restore_started", getRestoreAnalytics());
    setRestoring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await restorePurchases();
    const resultAnalytics = getRevenueCatResultAnalytics(result);

    if (result.success) {
      trackEvent("restore_completed", getRestoreAnalytics(resultAnalytics));
      const proAfterRefresh = await refreshProStatus({ source: "restore_success" });
      trackEvent("restore_entitlement_refreshed", getRestoreAnalytics({
        ...resultAnalytics,
        is_pro: proAfterRefresh,
      }));
      setRestoring(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (proAfterRefresh) {
        paywallCloseReasonRef.current = "restore_success";
        paywallCloseOutcomeRef.current = "restore_success";
        trackPaywallExit("restore_success", "restore_success");
        navigation.goBack();
      } else {
        Alert.alert(
          "Restore Received",
          "Your purchase was found, but Pro access is still syncing. Please try again in a moment."
        );
      }
    } else if (result.error) {
      setRestoring(false);
      trackEvent("restore_failed", getRestoreAnalytics({
        ...resultAnalytics,
        message: result.error,
      }));
      Alert.alert("Restore Failed", result.error);
    } else if (resultAnalytics.active_entitlement_count > 0 || resultAnalytics.active_subscription_count > 0) {
      setRestoring(false);
      trackEvent("restore_no_entitlement", getRestoreAnalytics(resultAnalytics));
      Alert.alert(
        "Restore Found",
        "We found purchase activity, but Pro access was not activated. Please contact support if Restore Purchases does not resolve this shortly."
      );
    } else {
      setRestoring(false);
      trackEvent("restore_no_purchases", getRestoreAnalytics(resultAnalytics));
      Alert.alert("No Purchases Found", "We couldn't find any active subscriptions to restore.");
    }
  };

  const handleDismiss = () => {
    logger.debug("[PAYWALL] dismissed", { source });
    paywallCloseReasonRef.current = "close_button";
    paywallCloseOutcomeRef.current = "dismissed";
    trackPaywallExit("close_button", "dismissed");
    navigation.goBack();
  };

  const debugRevenueCatStatus = getRevenueCatConfigStatus();
  const debugMetadata = getPaywallMetadataDebug(offeringMetadata, source);
  const debugPackageAvailability = getPackageAvailabilityAnalytics(offerings);
  const debugRows = [
    ["Configured", debugRevenueCatStatus.configured ? "yes" : "no"],
    ["Platform", debugRevenueCatStatus.platform],
    ["Apple Ads attribution", debugRevenueCatStatus.apple_search_ads_attribution_status || "unknown"],
    ["Source", source || "unknown"],
    ["Placement", offeringFetchAnalytics.placement_identifier || "none"],
    ["Fetch mode", offeringFetchAnalytics.offering_fetch_mode || "pending"],
    ["Placement support", offeringFetchAnalytics.placement_supported == null ? "unknown" : (offeringFetchAnalytics.placement_supported ? "yes" : "no")],
    ["Placement returned", offeringFetchAnalytics.placement_offering_returned ? "yes" : "no"],
    ["Fallback used", offeringFetchAnalytics.placement_fallback_used ? "yes" : "no"],
    ["Offering", offerings?.identifier || "none"],
    ["Variant", paywallVariant],
    ["Default plan", defaultPlanKey],
    ["Pitch", pitch.key],
    ["Missing plans", String(debugPackageAvailability.missing_plan_count)],
    ["Metadata keys", debugMetadata.keys.length ? debugMetadata.keys.join(", ") : "none"],
    ["Source metadata", debugMetadata.sourceKeys.length ? debugMetadata.sourceKeys.join(", ") : "none"],
    ["Headline accepted", debugMetadata.headlineAccepted ? "yes" : "no"],
    ["Positioning accepted", debugMetadata.positioningAccepted ? "yes" : "no"],
    ["Blocked values ignored", String(debugMetadata.blockedValueCount)],
  ];
  const debugPackageRows = PLANS.map((plan, index) => {
    const pkg = pkgByIndex[index];
    const product = pkg?.product;
    return `${plan.key}: ${pkg?.identifier || "missing"} | ${product?.identifier || "no product"} | ${product?.priceString || "no price"}`;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Subtle warm gradient at top */}
      <LinearGradient
        colors={["rgba(52, 199, 89, 0.03)", "transparent"]}
        style={[styles.bgGradient, { pointerEvents: "none" }]}
      />

      {/* Close button — Apple-style, no background circle */}
      <Pressable
        onPress={handleDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={({ pressed }) => [styles.closeButtonApple, { opacity: pressed ? 0.85 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityHint="Dismisses the Woof Pro offer"
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
            {pitch.positioning}
          </Text>
        </View>

        <View
          style={[
            styles.sourceContextStrip,
            { backgroundColor: theme.fillSecondary, borderColor: Colors.divider },
          ]}
          accessible
          accessibilityRole="summary"
          accessibilityLabel={`${sourceContext.label}: ${sourceContext.detail}`}
        >
          <Text style={[styles.sourceContextLabel, { color: Colors.scoreExcellent }]}>
            {sourceContext.label}
          </Text>
          <Text style={[styles.sourceContextDetail, { color: theme.textSecondary }]}>
            {sourceContext.detail}
          </Text>
        </View>

        {/* Features — inline rows */}
        <View style={styles.featuresList}>
          {pitch.features.map((feature, i) => {
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
            const trialInfo = trialInfoByIndex[i] || getPackageTrialInfo(pkgByIndex[i], trialEligibilityByProductId);
            const hasPrice = Boolean(prices[i]);

            return (
              <View key={plan.key} style={{ flex: plan.flex }}>
                {/* Fixed-height spacer for all cards — badge overlaps into it for popular plan */}
                {plan.badge ? (
                  <View style={[styles.bestValueBadge, { opacity: isSelected ? 1 : 0 }]}>
                    <Text style={styles.bestValueText}>{plan.badge}</Text>
                  </View>
                ) : (
                  <View style={styles.badgeSpacer} />
                )}

                <Pressable
                  onPress={() => handlePlanSelect(i)}
                  accessibilityRole="button"
                  accessibilityLabel={getPlanAccessibilityLabel(plan, prices[i], periods[i], isSelected, trialInfo, offeringsLoaded)}
                  accessibilityHint="Selects this subscription plan"
                  accessibilityState={{ selected: isSelected }}
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

                  {/* Annual: crossed-out monthly-equivalent anchor; others get spacer to align prices */}
                  {plan.key === "annual" && priceComparisons.annualAnchor ? (
                    <Text style={[styles.planStrikethrough, { color: theme.textTertiary }]}>
                      {priceComparisons.annualAnchor}/yr
                    </Text>
                  ) : (
                    <View style={styles.strikethroughSpacer} />
                  )}

                  {/* Price */}
                  <Text
                    style={[
                      plan.key === "annual" ? styles.planPriceHero : styles.planPrice,
                      !hasPrice && styles.planPriceUnavailable,
                      { color: theme.textPrimary },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                  >
                    {displayPrices[i]}
                  </Text>
                  {hasPrice ? (
                    <Text style={[styles.planPeriod, { color: theme.textTertiary }]}>
                      {periods[i]}
                    </Text>
                  ) : (
                    <View style={styles.periodSpacer} />
                  )}

                  {/* Weekly: equivalent monthly cost */}
                  {plan.key === "weekly" && priceComparisons.weeklyMonthlyEquivalent && (
                    <>
                      <View style={[styles.cardDivider, { backgroundColor: Colors.divider }]} />
                      <Text style={[styles.planSubtext, { color: theme.textTertiary }]}>
                        {priceComparisons.weeklyMonthlyEquivalent}/mo
                      </Text>
                    </>
                  )}

                  {/* Annual extras */}
                  {plan.key === "annual" && (
                    <>
                      {priceComparisons.annualMonthlyEquivalent && (
                        <Text style={styles.planMonthly}>{priceComparisons.annualMonthlyEquivalent}/mo</Text>
                      )}
                      {priceComparisons.annualSavingsPercent && (
                        <View style={styles.saveBadge}>
                          <Text style={styles.saveText}>Save {priceComparisons.annualSavingsPercent}%</Text>
                        </View>
                      )}
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
            onPressIn={() => { if (!purchaseDisabled) ctaScale.value = withSpring(0.97, { damping: 20, stiffness: 300 }); }}
            onPressOut={() => { if (!purchaseDisabled) ctaScale.value = withSpring(1, { damping: 15, stiffness: 150 }); }}
            disabled={purchaseDisabled}
            accessibilityRole="button"
            accessibilityLabel={ctaText}
            accessibilityHint={selectedPkg
              ? `Purchases the ${selectedPlan.label} plan`
              : offeringsLoaded
                ? "This subscription plan is not currently available"
                : "Waits for subscription plans to load"}
            accessibilityState={{ disabled: purchaseDisabled }}
          >
            <Animated.View
              style={[
                styles.ctaButton,
                {
                  backgroundColor: theme.buttonPrimary,
                  opacity: !selectedPkg && !purchasing ? 0.58 : 1,
                  overflow: "hidden",
                },
                ctaAnimStyle,
              ]}
            >
              {purchasing ? (
                <Animated.View key="loader" entering={FadeIn.duration(200)}>
                  <ActivityIndicator color={theme.buttonText} />
                </Animated.View>
              ) : (
                <Animated.Text
                  maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
                  key="text"
                  entering={FadeIn.duration(200)}
                  style={[styles.ctaText, { color: theme.buttonText }]}
                  numberOfLines={1}
                >
                  {ctaText}
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
                <Text
                  style={[styles.trustText, { color: theme.textTertiary }]}
                >
                  {planDisclosure}
                </Text>
              </View>
            </>
          ) : (
            <Text
              style={[styles.trustTextStandalone, { color: theme.textTertiary }]}
            >
              {planDisclosure}
            </Text>
          )}
        </View>

        {__DEV__ && (
          <View
            style={[
              styles.debugPanel,
              { backgroundColor: theme.card, borderColor: Colors.divider },
            ]}
          >
            <Pressable
              onPress={() => setDebugExpanded((value) => !value)}
              style={({ pressed }) => [styles.debugHeader, { opacity: pressed ? 0.72 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={debugExpanded ? "Hide RevenueCat debug details" : "Show RevenueCat debug details"}
              accessibilityState={{ expanded: debugExpanded }}
            >
              <View>
                <Text style={[styles.debugTitle, { color: theme.textPrimary }]}>
                  RevenueCat Debug
                </Text>
                <Text style={[styles.debugSubtitle, { color: theme.textTertiary }]}>
                  {offeringFetchAnalytics.offering_fetch_mode || "pending"} · {offerings?.identifier || "no offering"}
                </Text>
              </View>
              <Text style={[styles.debugToggle, { color: Colors.scoreExcellent }]}>
                {debugExpanded ? "Hide" : "Show"}
              </Text>
            </Pressable>

            {debugExpanded && (
              <View style={styles.debugBody}>
                {debugRows.map(([label, value]) => (
                  <View key={label} style={styles.debugRow}>
                    <Text style={[styles.debugLabel, { color: theme.textTertiary }]}>
                      {label}
                    </Text>
                    <Text
                      style={[styles.debugValue, { color: theme.textPrimary }]}
                      numberOfLines={3}
                    >
                      {value}
                    </Text>
                  </View>
                ))}
                <View style={[styles.debugDivider, { backgroundColor: Colors.divider }]} />
                {debugPackageRows.map((line) => (
                  <Text
                    key={line}
                    style={[styles.debugPackageLine, { color: theme.textSecondary }]}
                    numberOfLines={2}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleRestore}
            disabled={controlsBusy}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            accessibilityHint="Checks App Store or Google Play purchases for an active Woof Pro subscription"
            accessibilityState={{ disabled: controlsBusy }}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={theme.textTertiary} />
            ) : (
              <Text style={[styles.restoreText, { color: theme.textSecondary }]}>
                Restore Purchases
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleDismiss}
            disabled={controlsBusy}
            style={({ pressed }) => [
              styles.footerDismissButton,
              { opacity: pressed ? 0.55 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            accessibilityHint="Dismisses the Woof Pro offer"
            accessibilityState={{ disabled: controlsBusy }}
          >
            <Text style={[styles.footerDismissText, { color: theme.textSecondary }]}>
              Not Now
            </Text>
          </Pressable>

          <View style={styles.legalRow}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                navigation.navigate("WebView", { title: "Terms of Use", html: TERMS_HTML });
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              accessibilityRole="link"
              accessibilityLabel="Terms of Use"
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
              accessibilityRole="link"
              accessibilityLabel="Privacy Policy"
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
    letterSpacing: 0,
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
  sourceContextStrip: {
    marginHorizontal: 24,
    marginBottom: 18,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sourceContextLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sourceContextDetail: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    letterSpacing: 0,
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
    letterSpacing: 0,
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
    boxShadow: `0 0 16px ${Colors.scoreExcellent}14`,
  },
  bestValueBadge: {
    alignSelf: "center",
    backgroundColor: Colors.scoreExcellent,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: -11,
    zIndex: 1,
    boxShadow: `0 2px 4px ${Colors.scoreExcellent}40`,
  },
  bestValueText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0,
  },
  badgeSpacer: {
    height: 11,
  },
  planLabel: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0,
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0,
  },
  planPriceHero: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0,
  },
  planPriceUnavailable: {
    fontSize: 12,
    fontWeight: "600",
  },
  planPeriod: {
    fontSize: 11,
    fontWeight: "400",
    marginTop: -1,
  },
  periodSpacer: {
    height: 12,
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
    boxShadow: "0 6px 16px rgba(0, 0, 0, 0.12)",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0,
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
    letterSpacing: 0,
  },
  trustTextStandalone: {
    fontSize: 12,
    fontWeight: "400",
    textAlign: "center",
    marginTop: 10,
    letterSpacing: 0,
  },

  // Dev-only RevenueCat QA
  debugPanel: {
    marginTop: 14,
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  debugHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
  },
  debugSubtitle: {
    fontSize: 10,
    fontWeight: "400",
    letterSpacing: 0,
    marginTop: 2,
  },
  debugToggle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
  },
  debugBody: {
    marginTop: 8,
    gap: 5,
  },
  debugRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  debugLabel: {
    width: 112,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0,
  },
  debugValue: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0,
    textAlign: "right",
  },
  debugDivider: {
    height: 1,
    marginVertical: 4,
  },
  debugPackageLine: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0,
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
  footerDismissButton: {
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  footerDismissText: {
    fontSize: 13,
    fontWeight: "600",
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
