import React, { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import { Text, View, TouchableOpacity, LayoutAnimation, Platform, UIManager, StyleSheet as RNStyleSheet, Modal, PanResponder, Pressable, ScrollView, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useDerivedValue,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  FadeInUp,
  FadeOut,
  runOnJS,
  cancelAnimation,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Check, X, Star, ChevronRight, ChevronDown, Utensils, Wheat, Calendar, Flame, AlertTriangle, AlertCircle, CheckCircle2, PawPrint, Lock, Shield, ShieldCheck, Camera, Leaf, Heart, Factory, Image as ImageIcon } from "lucide-react-native";
import { Image } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme, getScoreConfig, Colors, Animation, Spacing, Shadows, Typography } from "../../theme";
import { useStyles } from "./styles";
import { classifyError } from "../../services/errors";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// --- ProGate (blur overlay for free users) ---

export function ProGate({ isPro, onUpgrade, children }) {
  const theme = useTheme();
  if (isPro) return children;

  return (
    <View>
      <View pointerEvents="none" style={{ opacity: 0.15 }}>
        {children}
      </View>
      <View style={proGateStyles.overlay}>
        <Lock size={20} color={theme.textTertiary} strokeWidth={2} />
        <Text style={[proGateStyles.text, { color: theme.textSecondary }]}>
          Unlock with Woof Pro
        </Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onUpgrade();
          }}
          accessibilityRole="button"
          accessibilityHint="Opens the Woof Pro upgrade screen."
          style={({ pressed }) => [
            proGateStyles.button,
            { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[proGateStyles.buttonText, { color: theme.buttonText }]}>
            See Plans
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const proGateStyles = RNStyleSheet.create({
  overlay: {
    ...RNStyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

// --- ScanLimitBanner (shown below score for free users) ---

export function ScanLimitBanner({ remaining }) {
  const theme = useTheme();

  if (remaining <= 0) return null;

  const message = remaining === 1
    ? "Last free scan"
    : `${remaining} free scans remaining`;
  const scansUsed = 3 - remaining;

  return (
    <View style={scanBannerStyles.container}>
      <Text style={[scanBannerStyles.text, { color: theme.textTertiary }]}>
        {message}
      </Text>
      <View style={scanBannerStyles.dotsRow}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              scanBannerStyles.dot,
              { backgroundColor: i < scansUsed ? theme.textTertiary : Colors.divider },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const scanBannerStyles = RNStyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: "400",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

// --- ProGateOverlay (standalone gate block for free users) ---

export function ProGateOverlay({ onUpgrade, remainingScans }) {
  const theme = useTheme();
  const ctaScale = useSharedValue(1);
  const ctaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  return (
    <View style={gateStyles.container}>
      {/* Gradient fade from content above */}
      <LinearGradient
        colors={["transparent", theme.bg]}
        style={gateStyles.gradient}
        pointerEvents="none"
      />

      {/* Faded locked content preview */}
      <View style={gateStyles.ghostContainer}>
        {[72, 58, 65].map((w, i) => (
          <View key={i} style={gateStyles.ghostBarRow}>
            <View style={[gateStyles.ghostLabel, { backgroundColor: theme.textTertiary }]} />
            <View style={[gateStyles.ghostTrack, { backgroundColor: Colors.divider }]}>
              <View style={[gateStyles.ghostFill, { width: `${w}%`, backgroundColor: theme.textTertiary }]} />
            </View>
          </View>
        ))}
      </View>

      {/* Upgrade card */}
      <View style={[gateStyles.upgradeCard, { backgroundColor: theme.card }, Shadows.button]}>
        {/* Green lock icon */}
        <LinearGradient
          colors={["#30D158", "#34C759"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={gateStyles.lockIconBox}
        >
          <Lock size={22} color="#FFFFFF" strokeWidth={2.5} />
        </LinearGradient>

        <Text style={[gateStyles.title, { color: theme.textPrimary }]}>
          {remainingScans === 0 ? "You're out of free scans" : "Unlock Full Analysis"}
        </Text>

        <Text style={[gateStyles.subtitle, { color: theme.textSecondary }]}>
          {remainingScans === 0
            ? "Upgrade to keep scanning — plus ingredients, recalls, and category scores."
            : remainingScans === 1
            ? "This is your last free scan. Upgrade for full ingredients, recalls, and unlimited scans."
            : `${remainingScans} free scans left. Upgrade for full ingredients, recalls, and unlimited scans.`}
        </Text>

        {/* CTA button */}
        <Pressable
          onPressIn={() => { ctaScale.value = withSpring(0.97, { damping: 20, stiffness: 300 }); }}
          onPressOut={() => { ctaScale.value = withSpring(1, { damping: 15, stiffness: 150 }); }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onUpgrade();
          }}
          accessibilityRole="button"
          accessibilityHint="Opens the Woof Pro upgrade screen."
          style={{ width: "100%" }}
        >
          <Animated.View
            style={[
              gateStyles.cta,
              { backgroundColor: theme.buttonPrimary },
              ctaAnimStyle,
            ]}
          >
            <Text style={[gateStyles.ctaText, { color: theme.buttonText }]}>
              Try Woof Pro Free
            </Text>
          </Animated.View>
        </Pressable>

        {/* Feature hints */}
        <View style={gateStyles.featureHints}>
          {["Full ingredients", "Recall alerts", "Unlimited scans"].map((f, i) => (
            <View key={i} style={gateStyles.featureHint}>
              <CheckCircle2 size={13} color={Colors.scoreExcellent} strokeWidth={2.5} />
              <Text style={[gateStyles.featureHintText, { color: theme.textTertiary }]}>{f}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const gateStyles = RNStyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: 8,
  },
  gradient: {
    position: "absolute",
    top: -60,
    left: 0,
    right: 0,
    height: 60,
  },
  ghostContainer: {
    marginBottom: 16,
    width: "100%",
    paddingHorizontal: 0,
    gap: 8,
    opacity: 0.3,
  },
  ghostBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ghostLabel: {
    width: 60,
    height: 8,
    borderRadius: 4,
    opacity: 0.15,
  },
  ghostTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    opacity: 0.15,
    overflow: "hidden",
  },
  ghostFill: {
    height: 5,
    borderRadius: 3,
  },
  upgradeCard: {
    width: "100%",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  lockIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 18,
  },
  cta: {
    height: 50,
    borderRadius: Spacing.buttonRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "600",
  },
  featureHints: {
    flexDirection: "row",
    gap: 16,
    marginTop: 14,
  },
  featureHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  featureHintText: {
    fontSize: 11,
    fontWeight: "400",
  },
});

// --- PostScanPrompt (shown once after 2nd scan for free users) ---

export function PostScanPrompt({ onUpgrade, onDismiss }) {
  const theme = useTheme();
  const ctaScale = useSharedValue(1);
  const ctaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  return (
    <View style={[postScanStyles.container, { backgroundColor: Colors.scoreExcellent + "08" }]}>
      <View style={postScanStyles.headerRow}>
        <Shield size={16} color={Colors.scoreExcellent} strokeWidth={2} />
        <Text style={[postScanStyles.title, { color: theme.textPrimary }]}>
          Enjoying Woof?
        </Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginLeft: "auto" })}
        >
          <X size={16} color={theme.textTertiary} strokeWidth={2} />
        </Pressable>
      </View>
      <Text style={[postScanStyles.subtitle, { color: theme.textSecondary }]}>
        Get unlimited scans and full ingredient analysis
      </Text>
      <Pressable
        onPressIn={() => { ctaScale.value = withSpring(0.97, { damping: 20, stiffness: 300 }); }}
        onPressOut={() => { ctaScale.value = withSpring(1, { damping: 15, stiffness: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onUpgrade();
        }}
        accessibilityRole="button"
        accessibilityHint="Opens the Woof Pro upgrade screen."
      >
        <Animated.View
          style={[
            postScanStyles.cta,
            { backgroundColor: theme.buttonPrimary },
            ctaAnimStyle,
          ]}
        >
          <Text style={[postScanStyles.ctaText, { color: theme.buttonText }]}>
            See Plans
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const postScanStyles = RNStyleSheet.create({
  container: {
    borderRadius: Spacing.cardRadius,
    padding: 16,
    marginTop: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "400",
    marginTop: 6,
    marginBottom: 12,
  },
  cta: {
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "600",
  },
});

// --- Re-exports ---

export { getScoreConfig } from "../../theme";

// Legacy aliases
export function getHeroGrade(score) {
  const config = getScoreConfig(score);
  return { label: config.label.toUpperCase(), color: config.color };
}

export function getGrade(score) {
  return getScoreConfig(score);
}

export function getScoreColor(score) {
  return getScoreConfig(score).color;
}

export function getRatingColors(theme) {
  return {
    good: Colors.score.excellent,
    bad: Colors.score.bad,
    neutral: theme.textSecondary,
  };
}

export const RATING_COLORS = {
  good: Colors.score.excellent,
  bad: Colors.score.bad,
  neutral: Colors.light.textSecondary,
};

export const NUTRISCORE_COLORS = {
  a: "#1B8C3A", b: "#85BB2F", c: "#FECB02", d: "#EE8100", e: "#E63E11",
};

// --- useStreamingText hook (character-level ChatGPT-like reveal) ---

export function useStreamingText(rawText, isStreaming, done = false) {
  const [displayText, setDisplayText] = useState("");
  const revealedRef = useRef(0);
  const targetRef = useRef("");
  const intervalRef = useRef(null);

  targetRef.current = rawText || "";

  // When done, instantly reveal all remaining text
  useEffect(() => {
    if (done && rawText) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setDisplayText(rawText);
      revealedRef.current = rawText.length;
    }
  }, [done, rawText]);

  useEffect(() => {
    if (done) return;

    if (!isStreaming) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (rawText) {
        setDisplayText(rawText);
        revealedRef.current = rawText.length;
      } else {
        setDisplayText("");
        revealedRef.current = 0;
      }
      return;
    }

    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      const target = targetRef.current;
      if (revealedRef.current < target.length) {
        const remaining = target.length - revealedRef.current;
        const step = remaining > 40 ? 3 : remaining > 15 ? 2 : 1;
        revealedRef.current = Math.min(revealedRef.current + step, target.length);
        setDisplayText(target.slice(0, revealedRef.current));
      }
    }, 30);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isStreaming, done]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  return {
    displayText: displayText || "",
    isRevealing: !done && displayText.length < (rawText?.length || 0),
  };
}

// --- StreamSection (Reanimated entering animation) ---

export function StreamSection({ visible, delay = 0, children }) {
  if (!visible) return null;

  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(350).springify().damping(20).stiffness(300)}>
      {children}
    </Animated.View>
  );
}

// --- BlinkingCursor (Reanimated withRepeat) ---

export function BlinkingCursor() {
  const theme = useTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 400 }),
        withTiming(1, { duration: 400 })
      ),
      -1
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text style={[animStyle, { color: theme.textPrimary, fontWeight: "300" }]}>
      {"\u258C"}
    </Animated.Text>
  );
}

// --- StreamingText ---

export function StreamingText({ text, streaming, done, style }) {
  const { displayText, isRevealing } = useStreamingText(text, streaming, done);
  if (!displayText && !text) return null;
  return (
    <Text style={style}>
      {displayText}
      {!done && (streaming || isRevealing) && <BlinkingCursor />}
    </Text>
  );
}

// --- StreamingBulletItem ---

function StreamingBulletItem({ text, color, icon, streaming, done }) {
  const { styles } = useStyles();
  const { displayText, isRevealing } = useStreamingText(text, streaming, done);
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletIcon}>
        {icon === "check" ? (
          <Check size={16} color={color} strokeWidth={2.5} />
        ) : icon === "cross" ? (
          <X size={16} color={color} strokeWidth={2.5} />
        ) : (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginTop: 5 }} />
        )}
      </View>
      <Text style={styles.bulletText}>
        {displayText}
        {!done && (streaming || isRevealing) && <BlinkingCursor />}
      </Text>
    </View>
  );
}

// --- Badges ---

export function NutriscoreBadge({ grade }) {
  const { styles } = useStyles();
  if (!grade) return null;
  const letter = grade.toLowerCase();
  const color = NUTRISCORE_COLORS[letter] || Colors.light.textSecondary;
  return (
    <View style={[styles.nutriscoreBadge, { backgroundColor: color }]}>
      <Text style={styles.nutriscoreLabel}>Nutri-Score</Text>
      <Text style={styles.nutriscoreLetter}>{letter.toUpperCase()}</Text>
    </View>
  );
}

export function NovaGroupBadge({ group }) {
  const { styles, theme } = useStyles();
  if (!group) return null;
  const colors = { 1: Colors.score.excellent, 2: Colors.score.good, 3: Colors.score.decent, 4: Colors.score.bad };
  return (
    <View style={[styles.novaBadge, { borderColor: colors[group] || theme.textSecondary }]}>
      <Text style={styles.novaLabel}>NOVA</Text>
      <Text style={[styles.novaGroup, { color: colors[group] || theme.textSecondary }]}>
        {group}
      </Text>
    </View>
  );
}

// --- CircularScore (SVG, 192px hero ring with Reanimated animated fill) ---

export function CircularScore({ score, size = 192, strokeWidth = 14, compact = false }) {
  const { styles, theme } = useStyles();
  const config = getScoreConfig(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const fill = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const counter = useSharedValue(0);
  const [displayScore, setDisplayScore] = useState(0);

  const updateDisplay = (val) => {
    setDisplayScore(Math.round(val));
  };

  useDerivedValue(() => {
    runOnJS(updateDisplay)(counter.value);
  });

  const fireHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  useEffect(() => {
    // Arc fill: 0→score over 1000ms with easeOutCubic
    fill.value = withTiming(score / 100, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    });
    // Counter counts up in sync
    counter.value = withTiming(score, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    });
    // On completion: scale pulse + haptic
    const timer = setTimeout(() => {
      pulseScale.value = withSequence(
        withSpring(1.02, { damping: 20, stiffness: 400 }),
        withSpring(1, { damping: 15, stiffness: 150 })
      );
      runOnJS(fireHaptic)();
    }, 1000);
    return () => clearTimeout(timer);
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - fill.value),
  }));

  const ringGroupStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.heroRingContainer,
        { width: size, height: size },
        ringGroupStyle,
      ]}
    >
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)"}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Active arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={config.color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Score number */}
      <View style={compact ? styles.titleRowRingLabel : styles.ringLabelContainer}>
        {compact ? (
          <>
            <Text style={styles.titleRowRingScore}>
              {displayScore}
              <Text style={styles.titleRowRingOutOf}>/100</Text>
            </Text>
            <Text style={[styles.titleRowRingGrade, { color: config.color }]}>
              {score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Decent" : score >= 30 ? "Fair" : "Poor"}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.heroScoreNumber, { color: theme.textPrimary }]}>
              {displayScore}
            </Text>
            <Text style={[styles.heroGradeLabel, { color: config.color }]}>
              {score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Decent" : score >= 30 ? "Fair" : "Poor"}
            </Text>
          </>
        )}
      </View>
    </Animated.View>
  );
}

// --- WoofWordmark (centered brand for the header) ---

export function WoofWordmark() {
  const { styles, theme } = useStyles();
  return (
    <View style={styles.wordmarkRow}>
      <PawPrint size={18} color={theme.textPrimary} strokeWidth={2.4} />
      <Text style={styles.wordmarkText}>Woof</Text>
    </View>
  );
}

// --- HeroImage (product photo, falls back to user-captured photo) ---

export function HeroImage({ imageUrl, uri }) {
  const { styles, theme } = useStyles();
  const src = imageUrl || uri || null;
  if (!src) {
    return (
      <Animated.View
        entering={FadeInUp.duration(400).damping(20).stiffness(280)}
        style={styles.heroImagePlaceholder}
      >
        <ImageIcon size={36} color={theme.textTertiary} strokeWidth={1.6} />
      </Animated.View>
    );
  }
  return (
    <Animated.View
      entering={FadeInUp.duration(450).damping(20).stiffness(280)}
      style={styles.heroImageContainer}
    >
      <Image
        source={{ uri: src }}
        style={styles.heroImage}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

// --- SummaryRows (5-row card: ingredient quality / red flags / beneficial / recall / made by) ---

export function SummaryRows({ result }) {
  const { styles, theme } = useStyles();
  if (!result) return null;

  const ingredients = Array.isArray(result.ingredients) ? result.ingredients : [];
  const concerning = ingredients.filter(i => i?.quality === "concerning" || i?.rating === "bad").length;
  const beneficial = ingredients.filter(i => i?.quality === "good" || i?.rating === "good").length;

  // Map category scores by name if present (Quality Breakdown has them)
  const categories = Array.isArray(result.categories) ? result.categories : [];
  const ingQualityCat = categories.find(c => /ingredient/i.test(c?.name || ""));

  const recallCount = result.recallCount
    ?? (Array.isArray(result.recalls) ? result.recalls.length : null);
  const hasRecalls = typeof recallCount === "number" ? recallCount > 0 : null;

  const madeBy = result.manufacturer || result.parentCompany || result.brand || null;

  // Quality label from score config (fall back to numeric)
  const qualityLabel = ingQualityCat?.score != null
    ? getScoreConfig(ingQualityCat.score).label
    : ingredients.length > 0
      ? (concerning === 0 ? "Good" : concerning <= 2 ? "Moderate" : "Low")
      : "—";
  const qualityColor = ingQualityCat?.score != null
    ? getScoreConfig(ingQualityCat.score).color
    : concerning === 0 ? Colors.scoreExcellent : concerning <= 2 ? Colors.scoreDecent : Colors.scoreConcerning;

  const rows = [
    {
      key: "quality",
      icon: <Leaf size={18} color={theme.textPrimary} strokeWidth={2} />,
      label: "Ingredient quality",
      value: qualityLabel,
      dot: qualityColor,
    },
    {
      key: "flags",
      icon: <AlertTriangle size={18} color={theme.textPrimary} strokeWidth={2} />,
      label: "Red flags",
      value: concerning > 0 ? String(concerning) : "None",
      dot: concerning === 0 ? Colors.scoreExcellent : concerning <= 2 ? Colors.scoreDecent : Colors.scoreConcerning,
    },
    {
      key: "beneficial",
      icon: <Heart size={18} color={theme.textPrimary} strokeWidth={2} />,
      label: "Beneficial ingredients",
      value: beneficial > 0 ? String(beneficial) : "—",
      dot: beneficial >= 5 ? Colors.scoreExcellent : beneficial > 0 ? Colors.scoreDecent : Colors.textTertiary,
    },
    hasRecalls != null && {
      key: "recall",
      icon: <Shield size={18} color={theme.textPrimary} strokeWidth={2} />,
      label: "Recall history",
      value: hasRecalls ? (recallCount === 1 ? "1 recall" : `${recallCount} recalls`) : "None",
      dot: hasRecalls ? Colors.scoreConcerning : Colors.scoreExcellent,
    },
    madeBy && {
      key: "made-by",
      icon: <Factory size={18} color={theme.textPrimary} strokeWidth={2} />,
      label: "Made by",
      value: madeBy,
      dot: null,
    },
  ].filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <View style={styles.summaryRowsCard}>
      {rows.map((r, i) => (
        <React.Fragment key={r.key}>
          {i > 0 && <View style={styles.summaryRowDivider} />}
          <View style={styles.summaryRow}>
            <View style={styles.summaryRowIconSlot}>{r.icon}</View>
            <Text style={styles.summaryRowLabel} numberOfLines={1}>{r.label}</Text>
            <View style={styles.summaryRowRight}>
              <Text style={styles.summaryRowValue} numberOfLines={1}>{r.value}</Text>
              {r.dot && <View style={[styles.summaryRowDot, { backgroundColor: r.dot }]} />}
            </View>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

// --- QuickFactsGrid (2x2 card grid — no icons, label + value pairs) ---

export function QuickFactsGrid({ nutrition }) {
  const { styles, theme } = useStyles();
  if (!nutrition) return null;

  const facts = [
    nutrition.primaryProteinSource && { label: "Protein", value: nutrition.primaryProteinSource },
    nutrition.grainFree != null && { label: "Grain", value: nutrition.grainFree ? "Free" : "Inclusive" },
    nutrition.lifestage && nutrition.lifestage !== "Unknown" && { label: "Life Stage", value: nutrition.lifestage },
  ].filter(Boolean);

  if (facts.length === 0) return null;

  // Pad to even number for 2-column grid
  while (facts.length < 4 && facts.length % 2 !== 0) facts.push(null);

  const rows = [];
  for (let i = 0; i < facts.length; i += 2) {
    rows.push(facts.slice(i, i + 2));
  }

  return (
    <View style={styles.quickFactsCard}>
      {rows.map((row, ri) => (
        <View key={ri}>
          {ri > 0 && <View style={styles.quickFactsDividerH} />}
          <View style={styles.quickFactsRow}>
            {row.map((fact, ci) => (
              <React.Fragment key={ci}>
                {ci > 0 && <View style={styles.quickFactsDividerV} />}
                <View style={styles.quickFactsCell}>
                  {fact ? (
                    <>
                      <Text style={[styles.quickFactsLabel, { color: theme.textSecondary }]}>{fact.label}</Text>
                      <Text style={[styles.quickFactsValue, { color: theme.textPrimary }]}>{fact.value}</Text>
                    </>
                  ) : null}
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// Legacy alias so existing imports don't break
export { QuickFactsGrid as QuickStatsGrid };

// --- VerdictCard (tinted background accent) ---

export function VerdictCard({ verdict, score, streaming, done, isPro = true }) {
  const { styles } = useStyles();
  const [expanded, setExpanded] = useState(false);
  if (!verdict) return null;
  const config = getScoreConfig(score || 0);

  // Free user truncation: show first 2 sentences when done
  const isFreeGated = !isPro && !streaming && done;
  let displayVerdict = verdict;
  if (isFreeGated) {
    const sentences = verdict.split(". ");
    if (sentences.length > 2) {
      displayVerdict = sentences.slice(0, 2).join(". ") + ".";
    }
  }

  const needsTruncate = !isFreeGated && !streaming && verdict.length > 200;

  return (
    <View style={[styles.verdictCard, { backgroundColor: config.bg || "rgba(52,199,89,0.06)" }]}>
      <Text
        style={styles.verdictText}
        numberOfLines={expanded || streaming ? undefined : 4}
      >
        {displayVerdict}
      </Text>
      {isFreeGated && (
        <LinearGradient
          colors={[( config.bg || "rgba(52,199,89,0.06)") + "00", config.bg || "rgba(52,199,89,0.06)"]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 48,
            borderBottomLeftRadius: Spacing.cardRadius,
            borderBottomRightRadius: Spacing.cardRadius,
          }}
          pointerEvents="none"
        />
      )}
      {needsTruncate && !expanded && (
        <TouchableOpacity
          onPress={() => setExpanded(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Show full verdict"
          accessibilityState={{ expanded }}
        >
          <Text style={styles.verdictMoreLink}>more</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// --- CategoryBar (refined — gray track, staggered fill, detail text) ---

export function CategoryBar({ name, score, detail, index = 0, isLast = false }) {
  const { styles, theme } = useStyles();
  const config = getScoreConfig(score);
  const animWidth = useSharedValue(0);
  const fadeAnim = useSharedValue(0);

  useEffect(() => {
    const stagger = 200 + index * 150;
    fadeAnim.value = withDelay(stagger, withTiming(1, { duration: 300 }));
    animWidth.value = withDelay(stagger, withTiming(score, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    }));
  }, [score]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: `${animWidth.value}%`,
  }));

  return (
    <Animated.View
      style={[styles.categoryItem, fadeStyle]}
      accessibilityLabel={`${name}: ${score} out of 100. ${detail || ""}`}
    >
      {/* Label row: name (left) + score (right) */}
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryName}>{name}</Text>
        <Text style={[styles.categoryScore, { color: config.color }]}>{score}</Text>
      </View>

      {/* Progress bar with gray track */}
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            { backgroundColor: config.color },
            barStyle,
          ]}
        />
      </View>

      {/* Detail text */}
      {detail && (
        <Text style={styles.categoryDetail} numberOfLines={3}>
          {detail}
        </Text>
      )}
    </Animated.View>
  );
}

// --- StarRating ---

export function StarRating({ score, outOf }) {
  const { styles, theme } = useStyles();
  const fullStars = Math.floor(score);
  const halfStar = score - fullStars >= 0.3;
  const stars = [];
  for (let i = 0; i < outOf; i++) {
    const filled = i < fullStars || (i === fullStars && halfStar);
    stars.push(
      <Star
        key={i}
        size={16}
        color={theme.amber}
        fill={filled ? theme.amber : "none"}
        strokeWidth={1.5}
      />
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      {stars}
      <Text style={[styles.stars, { marginLeft: 6 }]}>
        {score}/{outOf}
      </Text>
    </View>
  );
}

// --- CollapsibleSection (Oasis-style — Reanimated chevron rotation) ---

export function CollapsibleSection({ title, accentColor, defaultOpen = true, children }) {
  const { styles, theme } = useStyles();
  const [expanded, setExpanded] = useState(defaultOpen);
  const rotation = useSharedValue(defaultOpen ? 1 : 0);

  const toggle = () => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(
      LayoutAnimation.create(250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    rotation.value = withTiming(expanded ? 0 : 1, { duration: 200 });
    setExpanded(!expanded);
  };

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 90}deg` }],
  }));

  return (
    <View style={styles.sectionCard}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.collapsibleHeader}
      >
        <View style={styles.collapsibleHeaderLeft}>
          {accentColor && (
            <View style={[styles.sectionAccent, { backgroundColor: accentColor }]} />
          )}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Animated.View style={chevronStyle}>
          <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2} />
        </Animated.View>
      </TouchableOpacity>
      {expanded && <View style={{ marginTop: 14 }}>{children}</View>}
    </View>
  );
}

// --- BulletList ---

export function BulletList({ items, color, icon, streaming, done, showCursorOnLast }) {
  const { styles } = useStyles();
  if (!items || items.length === 0) return null;
  return items.map((item, i) => {
    const isLast = i === items.length - 1;
    if (isLast && streaming && showCursorOnLast) {
      return <StreamingBulletItem key={i} text={item} color={color} icon={icon} streaming done={done} />;
    }
    return (
      <View key={i} style={styles.bulletRow}>
        <View style={styles.bulletIcon}>
          {icon === "check" ? (
            <Check size={16} color={color} strokeWidth={2.5} />
          ) : icon === "cross" ? (
            <X size={16} color={color} strokeWidth={2.5} />
          ) : (
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginTop: 5 }} />
          )}
        </View>
        <Text style={styles.bulletText}>{item}</Text>
      </View>
    );
  });
}

// --- NutritionRow (legacy — kept for compat) ---

export function NutritionRow({ label, value }) {
  const { styles } = useStyles();
  if (!value) return null;
  return (
    <View style={styles.nutritionRow}>
      <Text style={styles.nutritionLabel}>{label}</Text>
      <Text style={styles.nutritionValue}>{String(value)}</Text>
    </View>
  );
}

// --- NutritionFacts (2-column, 3-row grid — reference data) ---

// Shorten long display values (lifestage, protein source, etc.)
function shortenDisplayValue(value) {
  if (!value || typeof value !== "string") return String(value ?? "");
  if (value.length <= 16) return value;
  // Remove parenthetical info: "Adult Dogs (1+ years)" → "Adult Dogs"
  let short = value.replace(/\s*\(.*?\)/g, "").trim();
  if (short.length <= 16) return short;
  // 3+ words → first 2 words
  const words = short.split(/\s+/);
  if (words.length > 2) return words.slice(0, 2).join(" ");
  // 2 words still too long → first word only
  if (short.length > 16 && words.length === 2) return words[0];
  return short;
}

const QUALIFIER_DOT_COLORS = {
  high: Colors.ingredientGood,
  moderate: Colors.ingredientNeutral,
  low: Colors.scoreDecent,
};

function NutritionCell({ label, value, qualifier, isLeft }) {
  const { styles } = useStyles();

  if (!value && value !== 0) {
    return <View style={[styles.nutCell, isLeft ? styles.nutCellLeft : styles.nutCellRight]} />;
  }

  const dotColor = qualifier
    ? QUALIFIER_DOT_COLORS[qualifier.toLowerCase()] || Colors.ingredientNeutral
    : null;

  return (
    <View style={[styles.nutCell, isLeft ? styles.nutCellLeft : styles.nutCellRight]}>
      <Text style={styles.nutLabel}>{label}</Text>
      <View style={styles.nutValueArea}>
        <Text style={styles.nutValue} numberOfLines={1}>{shortenDisplayValue(String(value))}</Text>
        {qualifier && (
          <View style={styles.nutQualifierRow}>
            <View style={[styles.nutQualifierDot, { backgroundColor: dotColor }]} />
            <Text style={styles.nutQualifierText}>({qualifier})</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function NutritionFacts({ nutrition }) {
  const { styles } = useStyles();
  if (!nutrition) return null;

  const clean = (v) => (v && v !== "N/A" && v !== "Unknown") ? v : null;

  // Build a flat list of cells with data, then pair them into 2-col rows.
  // Skips cells with missing data so the grid never renders empty slots.
  const cells = [
    { label: "Protein", value: clean(nutrition.proteinPercent), qualifier: nutrition.proteinPercent ? nutrition.proteinLevel : null },
    { label: "Fat", value: clean(nutrition.fatPercent), qualifier: nutrition.fatPercent ? nutrition.fatLevel : null },
    { label: "Fiber", value: clean(nutrition.fiberPercent) },
    { label: "Life Stage", value: clean(nutrition.lifestage) },
    { label: "Grain Free", value: nutrition.grainFree != null ? (nutrition.grainFree ? "Yes" : "No") : null },
  ].filter(c => c.value);

  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push([cells[i], cells[i + 1] || null]);
  }
  if (rows.length === 0) return null;

  return (
    <View style={styles.nutritionSection}>
      <Text style={styles.nutritionTitle}>Nutrition Facts</Text>
      {rows.map((row, ri) => (
        <View key={ri}>
          <View style={styles.nutRow}>
            <NutritionCell {...row[0]} isLeft />
            {row[1] ? (
              <>
                <View style={styles.nutVertDivider} />
                <NutritionCell {...row[1]} isLeft={false} />
              </>
            ) : (
              <View style={{ flex: 1 }} />
            )}
          </View>
          {ri < rows.length - 1 && <View style={styles.nutHorizDivider} />}
        </View>
      ))}
    </View>
  );
}

// --- Category pill (neutral — metadata only, no quality judgment) ---

function CategoryPill({ category }) {
  const { styles } = useStyles();
  return (
    <View style={styles.ingCatPill}>
      <Text style={styles.ingCatText}>{category}</Text>
    </View>
  );
}

// --- IngredientRow (tappable → opens bottom sheet) ---

const ingBadgeStyles = RNStyleSheet.create({
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
  },
});

const ING_DOT_COLORS = {
  good: Colors.ingredientGood,
  neutral: Colors.ingredientNeutral,
  bad: Colors.ingredientBad,
};

function IngredientRow({ ingredient, isFirst, isLast, index, onPress }) {
  const { styles, theme } = useStyles();
  const isBad = ingredient.rating === "bad";
  const dotColor = ING_DOT_COLORS[ingredient.rating] || ING_DOT_COLORS.neutral;

  const handlePress = () => {
    Haptics.selectionAsync();
    onPress(ingredient);
  };

  // Staggered fade-in
  const fadeAnim = useSharedValue(0);
  useEffect(() => {
    fadeAnim.value = withDelay(index * 50, withTiming(1, { duration: 300 }));
  }, []);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
  }));

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityLabel={`${ingredient.name}${ingredient.rating === "bad" ? ", concerning" : ""}. ${ingredient.reason || ""}`}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.ingRow,
          fadeStyle,
        ]}
      >
        <View style={styles.ingRowMain}>
          {/* Quality dot (10px) */}
          <View style={[styles.ingDot, { width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }]} />

          {/* Name + description */}
          <View style={styles.ingNameArea}>
            <Text style={styles.ingName} numberOfLines={1}>
              {ingredient.name}
            </Text>
            {ingredient.description || ingredient.reason ? (
              <Text style={[styles.ingDescription, { color: theme.textSecondary }]} numberOfLines={2}>
                {ingredient.description || ingredient.reason}
              </Text>
            ) : null}
          </View>

          {/* Chevron */}
          <ChevronRight
            size={14}
            color={theme.textTertiary}
            strokeWidth={2}
            style={styles.ingChevron}
          />
        </View>

        {/* Divider */}
        {!isLast && <View style={styles.ingDivider} />}
      </Animated.View>
    </TouchableOpacity>
  );
}

// --- IngredientsSection (summary bar + flat list, taps open sheet) ---

const COLLAPSED_COUNT = 5;

export function IngredientsSection({ ingredients, onIngredientPress, totalCount, fadeLastItem }) {
  const { styles, theme } = useStyles();
  const [expanded, setExpanded] = useState(false);

  if (!ingredients || ingredients.length === 0) return null;

  const good = ingredients.filter((i) => i.rating === "good").length;
  const neutral = ingredients.filter((i) => i.rating === "neutral").length;
  const bad = ingredients.filter((i) => i.rating === "bad").length;
  const total = ingredients.length;
  const displayTotal = totalCount || total;

  const segments = [];
  if (good > 0) segments.push({ color: Colors.ingredientGood, opacity: 1, flex: good / total, label: `${good} Good` });
  if (neutral > 0) segments.push({ color: Colors.ingredientNeutral, opacity: 0.4, flex: neutral / total, label: `${neutral} Neutral` });
  if (bad > 0) segments.push({ color: Colors.ingredientBad, opacity: 0.85, flex: bad / total, label: `${bad} Concerning` });

  // Free users: show all passed ingredients (caller slices to 3 with fadeLastItem)
  // Pro users: show first 5 collapsed, all when expanded
  const canExpand = !fadeLastItem && total > COLLAPSED_COUNT;
  const visibleIngredients = canExpand && !expanded
    ? ingredients.slice(0, COLLAPSED_COUNT)
    : ingredients;

  const toggleExpand = () => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(
      LayoutAnimation.create(250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    setExpanded(!expanded);
  };

  return (
    <View style={styles.ingredientsSection}>
      <Text style={styles.ingredientsTitle}>{`Ingredients (${displayTotal})`}</Text>

      {/* Summary bar */}
      <View style={styles.ingSummaryBar}>
        {segments.map((seg, i) => (
          <View
            key={i}
            style={[
              styles.ingSummarySegment,
              {
                backgroundColor: seg.color,
                opacity: seg.opacity,
                flex: seg.flex,
              },
            ]}
          />
        ))}
      </View>

      {/* Legend */}
      <View style={styles.ingSummaryLabels}>
        {segments.map((seg, i) => (
          <View key={i} style={styles.ingSummaryLabelRow}>
            <View style={[styles.ingSummaryDot, { backgroundColor: seg.color, opacity: seg.opacity }]} />
            <Text style={styles.ingSummaryLabelText}>{seg.label}</Text>
          </View>
        ))}
        {totalCount != null && totalCount > total && (
          <Text style={styles.ingSummaryLabelText}>· {totalCount - total} more</Text>
        )}
      </View>

      {/* Rows (natural order — not reordered) */}
      {visibleIngredients.map((ing, i) => {
        const isLast = i === visibleIngredients.length - 1 && !canExpand;
        const isFadedLast = fadeLastItem && i === visibleIngredients.length - 1;

        if (isFadedLast) {
          return (
            <View key={i} pointerEvents="none">
              <IngredientRow
                ingredient={ing}
                isFirst={i === 0}
                isLast={true}
                index={i}
                onPress={() => {}}
              />
              <LinearGradient
                colors={["transparent", theme.bg]}
                locations={[0, 0.7]}
                style={RNStyleSheet.absoluteFill}
                pointerEvents="none"
              />
            </View>
          );
        }

        return (
          <IngredientRow
            key={i}
            ingredient={ing}
            isFirst={i === 0}
            isLast={isLast}
            index={i}
            onPress={onIngredientPress}
          />
        );
      })}

      {/* Expand / collapse toggle (pro users only, >5 ingredients) */}
      {canExpand && (
        <TouchableOpacity
          onPress={toggleExpand}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <View style={styles.ingExpandButton}>
            <Text style={styles.ingExpandText}>
              {expanded ? "Show less" : `Show all ${total} ingredients`}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

// --- IngredientSummary (legacy, kept for compat) ---

export function IngredientSummary({ ingredients }) {
  return <IngredientsSection ingredients={ingredients} />;
}

// --- IngredientSheet (bottom sheet detail view) ---

const QUALITY_LABELS = {
  good: "Good ingredient",
  neutral: "Neutral ingredient",
  bad: "Concerning ingredient",
};

export function IngredientSheet({ ingredient, onDismiss, isPro = true, onUpgrade }) {
  const { styles, theme } = useStyles();
  const { height: screenHeight } = useWindowDimensions();
  const maxSheetHeight = screenHeight * 0.6;
  const offScreenY = screenHeight;

  const [modalVisible, setModalVisible] = useState(false);
  const ingredientRef = useRef(null);
  const dismissingRef = useRef(false);

  const translateY = useSharedValue(offScreenY);
  const backdropOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  // Open when ingredient changes to non-null
  useEffect(() => {
    if (ingredient && !dismissingRef.current) {
      ingredientRef.current = ingredient;
      // Reset to off-screen before showing modal to prevent flash
      translateY.value = offScreenY;
      backdropOpacity.value = 0;
      contentOpacity.value = 0;
      setModalVisible(true);
    }
  }, [ingredient]);

  // Animate in once modal is visible
  useEffect(() => {
    if (modalVisible && ingredientRef.current) {
      // Use requestAnimationFrame to ensure Modal is rendered before animating
      requestAnimationFrame(() => {
        translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
        backdropOpacity.value = withTiming(0.3, { duration: 250 });
        contentOpacity.value = withDelay(100, withTiming(1, { duration: 200 }));
      });
    }
  }, [modalVisible]);

  const dismissRef = useRef(null);
  const dismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    Haptics.selectionAsync();
    backdropOpacity.value = withTiming(0, { duration: 200 });
    contentOpacity.value = withTiming(0, { duration: 100 });
    translateY.value = withTiming(offScreenY, { duration: 250, easing: Easing.in(Easing.cubic) });
    setTimeout(() => {
      setModalVisible(false);
      translateY.value = offScreenY;
      backdropOpacity.value = 0;
      contentOpacity.value = 0;
      dismissingRef.current = false;
      onDismiss();
    }, 280);
  }, [onDismiss, offScreenY]);
  dismissRef.current = dismiss;

  // PanResponder on handle for swipe-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dy }) => !dismissingRef.current && dy > 8,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0 && !dismissingRef.current) translateY.value = dy;
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dismissingRef.current) return;
        if (dy > 80 || vy > 0.5) {
          dismissRef.current?.();
        } else {
          translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        }
      },
    })
  ).current;

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  if (!modalVisible) return null;

  const ing = ingredientRef.current;
  if (!ing) return null;

  const dotColor = ING_DOT_COLORS[ing.rating] || ING_DOT_COLORS.neutral;
  const qualityLabel = QUALITY_LABELS[ing.rating] || QUALITY_LABELS.neutral;
  const showAlternatives = ing.rating !== "good" && ing.alternatives?.length > 0;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={{ flex: 1 }}>
        {/* Backdrop */}
        <Animated.View
          style={[RNStyleSheet.absoluteFill, { backgroundColor: "#000" }, backdropAnimStyle]}
          pointerEvents="none"
        />
        <Pressable
          style={RNStyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        {/* Sheet — anchored to bottom */}
        <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
          <Animated.View
            style={[
              {
                backgroundColor: theme.card,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.08,
                shadowRadius: 20,
                elevation: 10,
              },
              sheetAnimStyle,
            ]}
          >
            {/* Handle — swipeable */}
            <View {...panResponder.panHandlers}>
              <View style={styles.sheetHandleArea}>
                <View style={styles.sheetHandle} />
              </View>
            </View>

            {/* Content */}
            <Animated.View style={contentAnimStyle}>
              <ScrollView
                style={{ maxHeight: maxSheetHeight }}
                contentContainerStyle={styles.sheetContent}
                bounces={false}
                showsVerticalScrollIndicator={false}
              >
                {/* Header: dot + name + category */}
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetHeaderLeft}>
                    <View style={[styles.sheetDot, { backgroundColor: dotColor }]} />
                    <Text style={styles.sheetIngName} numberOfLines={2}>
                      {ing.name}
                    </Text>
                  </View>
                  {ing.category && (
                    <View style={styles.ingCatPill}>
                      <Text style={styles.ingCatText}>{ing.category}</Text>
                    </View>
                  )}
                </View>

                {/* Quality label */}
                <Text style={[styles.sheetQualityLabel, { color: dotColor }]}>
                  {qualityLabel}
                </Text>

                {/* Divider */}
                <View style={styles.sheetDivider} />

                {!isPro ? (
                  /* Gated content for free users */
                  <View style={sheetGateStyles.container}>
                    <View style={[sheetGateStyles.blurPlaceholder, { backgroundColor: theme.fill }]}>
                      <Lock size={20} color={theme.textTertiary} strokeWidth={2} />
                      <Text style={[sheetGateStyles.lockText, { color: theme.textSecondary }]}>
                        Unlock ingredient details
                      </Text>
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          dismiss();
                          onUpgrade?.();
                        }}
                        accessibilityRole="button"
                        accessibilityHint="Opens the Woof Pro upgrade screen."
                        style={({ pressed }) => [
                          sheetGateStyles.button,
                          { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.8 : 1 },
                        ]}
                      >
                        <Text style={[sheetGateStyles.buttonText, { color: theme.buttonText }]}>
                          See Plans
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    {/* What is it (verified mode emits combined info under "reason" — show it once) */}
                    {ing.description ? (
                      <View style={styles.sheetSection}>
                        <Text style={styles.sheetSectionLabel}>What is it</Text>
                        <Text style={styles.sheetSectionBody}>{ing.description}</Text>
                      </View>
                    ) : null}

                    {/* Why this score */}
                    {ing.reason && ing.reason !== ing.description ? (
                      <View style={styles.sheetSection}>
                        <Text style={styles.sheetSectionLabel}>{ing.description ? "Why this score" : "About this ingredient"}</Text>
                        <Text style={styles.sheetSectionBody}>{ing.reason}</Text>
                      </View>
                    ) : null}

                    {/* Better alternatives (only for neutral/bad) */}
                    {showAlternatives ? (
                      <View style={styles.sheetSection}>
                        <Text style={styles.sheetSectionLabel}>Better alternatives</Text>
                        <View style={styles.sheetAltsRow}>
                          {ing.alternatives.map((alt, i) => (
                            <View key={i} style={styles.sheetAltPill}>
                              <Text style={styles.sheetAltText}>{alt}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const sheetGateStyles = RNStyleSheet.create({
  container: {
    paddingVertical: 24,
  },
  blurPlaceholder: {
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  lockText: {
    fontSize: 15,
    fontWeight: "600",
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

// --- ReviewsSection (card with accent border, collapsible, pill tags) ---

const STAR_GOLD = "#F59E0B";

function formatReviewCount(count) {
  if (!count) return null;
  if (typeof count === "string") return count;
  if (count >= 1000) return `${(count / 1000).toFixed(count % 1000 === 0 ? 0 : 1)}K`;
  return String(count);
}

function getReviewAccentColor(score, outOf = 5) {
  if (score >= outOf) return Colors.scoreExcellent;
  if (score >= outOf * 0.8) return Colors.scoreDecent;
  if (score >= outOf * 0.6) return Colors.scoreFair;
  return Colors.scoreConcerning;
}

function ReviewStars({ score, outOf = 5 }) {
  const fullStars = Math.floor(score);
  const hasHalf = score - fullStars >= 0.3;
  const stars = [];

  for (let i = 0; i < outOf; i++) {
    if (i < fullStars) {
      stars.push(
        <Star key={i} size={14} color={STAR_GOLD} fill={STAR_GOLD} strokeWidth={1.5} />
      );
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <View key={i} style={{ width: 14, height: 14 }}>
          <Star
            size={14}
            color={Colors.divider}
            fill={Colors.divider}
            strokeWidth={1.5}
            style={{ position: "absolute" }}
          />
          <View style={{ width: 7, height: 14, overflow: "hidden" }}>
            <Star size={14} color={STAR_GOLD} fill={STAR_GOLD} strokeWidth={1.5} />
          </View>
        </View>
      );
    } else {
      stars.push(
        <Star key={i} size={14} color={Colors.divider} fill={Colors.divider} strokeWidth={1.5} />
      );
    }
  }

  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {stars}
    </View>
  );
}

// Truncate pill text at last complete word before 35 chars (no ellipsis)
function truncatePillText(text) {
  if (!text || text.length <= 35) return text;
  const truncated = text.substring(0, 35);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
}

function ReviewPill({ text, bgColor, textColor, index }) {
  const { styles } = useStyles();
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    opacity.value = withDelay(index * 80, withTiming(1, { duration: 250 }));
    scale.value = withDelay(index * 80, withSpring(1, { damping: 15, stiffness: 150 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.reviewPill, { backgroundColor: bgColor }, animStyle]}>
      <Text style={[styles.reviewPillText, { color: textColor }]} numberOfLines={1}>
        {truncatePillText(text)}
      </Text>
    </Animated.View>
  );
}

export function ReviewsSection({ customerRating }) {
  const { styles, theme } = useStyles();
  if (!customerRating) return null;

  const rating = customerRating.score || customerRating.rating;
  const count = customerRating.count || customerRating.reviewCount || customerRating.totalReviews;

  return (
    <View style={styles.safetyReviewsRow}>
      <View style={[styles.safetyReviewsIcon, { backgroundColor: "rgba(255,214,10,0.12)" }]}>
        <Star size={18} color="#FFD60A" fill="#FFD60A" strokeWidth={1} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.recallRowTitle, { color: theme.textPrimary }]}>
          {rating ? `${rating} out of 5` : "Customer Reviews"}
        </Text>
        <Text style={[styles.recallRowSubtitle, { color: theme.textSecondary }]}>
          {count ? `Based on ${typeof count === 'number' ? count.toLocaleString() : count} reviews` : "Reviews available"}
        </Text>
      </View>
      <ChevronRight size={14} color={theme.textTertiary} strokeWidth={2} />
    </View>
  );
}

// --- RecallCard (severity-aware + testing transparency) ---
// Backwards-compatible: if recallSeverity isn't present on older analyses we
// derive a coarse tier from the text so pre-v2 cached entries still render.

const RECALL_CONFIG = {
  none:    { bgKey: "good",    Icon: CheckCircle2,  title: "No Recalls" },
  minor:   { bgKey: "warn",    Icon: AlertCircle,   title: "Minor Recall History" },
  major:   { bgKey: "bad",     Icon: AlertTriangle, title: "Major Recall History" },
  active:  { bgKey: "bad",     Icon: AlertTriangle, title: "Active Safety Concern" },
  unknown: { bgKey: "neutral", Icon: AlertCircle,   title: "Recall Info Unavailable" },
};

const RECALL_BG = {
  good:    { bg: "rgba(52,199,89,0.1)",  color: Colors.ingredientGood },
  warn:    { bg: "rgba(232,163,23,0.12)", color: "#E8A317" },
  bad:     { bg: "rgba(239,68,68,0.1)",  color: "#EF4444" },
  neutral: { bg: "rgba(142,142,147,0.1)", color: "#8E8E93" },
};

const TESTING_LABEL = {
  high:     "Third-party tested",
  moderate: "Some testing disclosed",
  low:      "Limited testing info",
};

export function RecallCard({ recallHistory, recallSeverity, testingTransparency, recallSource, testingDetails }) {
  const { styles, theme } = useStyles();

  if (!recallHistory && !recallSeverity) return null;

  // Derive severity for legacy analyses that only carry the text field.
  let sev = recallSeverity;
  if (!sev) sev = /^(none|no recalls?)\b/i.test(recallHistory || "") ? "none" : "unknown";

  const cfg = RECALL_CONFIG[sev] || RECALL_CONFIG.unknown;
  const palette = RECALL_BG[cfg.bgKey];
  const subtitle = sev === "none"
    ? "No recalls found for this product or brand."
    : recallHistory || "Recall record could not be verified.";
  const testingLabel = TESTING_LABEL[testingTransparency];
  const isFdaVerified = recallSource === "fda_verified";

  return (
    <View style={styles.recallRow}>
      <View style={[styles.recallRowIcon, { backgroundColor: palette.bg }]}>
        <cfg.Icon size={18} color={palette.color} strokeWidth={2} />
      </View>
      <View style={styles.recallRowText}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={[styles.recallRowTitle, { color: theme.textPrimary }]}>{cfg.title}</Text>
          {isFdaVerified ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
                backgroundColor: "rgba(56,120,255,0.12)",
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
              }}
            >
              <ShieldCheck size={10} color="#1E63C7" strokeWidth={2.4} />
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#1E63C7", letterSpacing: 0.4 }}>
                FDA VERIFIED
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.recallRowSubtitle, { color: theme.textSecondary }]} numberOfLines={4}>
          {subtitle}
        </Text>
        {testingLabel || testingDetails ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 6 }}>
            <ShieldCheck size={12} color={theme.textTertiary} strokeWidth={2} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, fontWeight: "500", color: theme.textTertiary }}>
              {testingDetails || testingLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// --- ProcessingMethodChip (compact pill under the product name) ---
// Visualizes the cooking/processing method flagged by the analyzer. Tier color
// maps to scoring bucket — green = low-heat/nutrient-preserving, orange =
// high-heat extrusion, yellow = moderate/unknown.

const PROCESSING_LABEL = {
  "freeze-dried": "Freeze-dried",
  "air-dried":    "Air-dried",
  "raw":          "Raw",
  "cold-pressed": "Cold-pressed",
  "baked":        "Baked",
  "extruded":     "Extruded",
  "canned":       "Canned",
  "unknown":      "Processing Unknown",
};

const PROCESSING_TIER = {
  "freeze-dried": "good",
  "air-dried":    "good",
  "raw":          "good",
  "cold-pressed": "good",
  "baked":        "mid",
  "canned":       "mid",
  "extruded":     "bad",
  "unknown":      "neutral",
};

const PROCESSING_PALETTE = {
  good:    { bg: "rgba(52,199,89,0.12)",  color: "#1F7A45" },
  mid:     { bg: "rgba(232,163,23,0.12)", color: "#B87A0A" },
  bad:     { bg: "rgba(249,115,22,0.12)", color: "#C2501A" },
  neutral: { bg: "rgba(142,142,147,0.14)", color: "#6B7280" },
};

export function ProcessingMethodChip({ processingMethod }) {
  if (!processingMethod) return null;
  const label = PROCESSING_LABEL[processingMethod];
  if (!label) return null;
  const palette = PROCESSING_PALETTE[PROCESSING_TIER[processingMethod] || "neutral"];

  return (
    <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 10 }}>
      <View
        style={{
          backgroundColor: palette.bg,
          paddingHorizontal: 12,
          paddingVertical: 5,
          borderRadius: 999,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 0.8,
            color: palette.color,
          }}
        >
          {label.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

// --- TrustBadges (supplementary chip row under ProcessingMethodChip) ---
// Surfaces authoritative brand-level data that comes from brand_metadata:
// third-party testing, country of manufacture, key certifications. Renders
// only the chips that have data — so the row disappears for brands with no
// authoritative record (graceful degradation).

const CERT_PALETTE = { bg: "rgba(56,120,255,0.1)", color: "#1E63C7" };
const TESTED_PALETTE = { bg: "rgba(52,199,89,0.12)", color: "#1F7A45" };
const COUNTRY_PALETTE = { bg: "rgba(142,142,147,0.14)", color: "#5C6470" };

function TrustChip({ label, palette, bold = true }) {
  return (
    <View
      style={{
        backgroundColor: palette.bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: bold ? "700" : "600",
          letterSpacing: 0.6,
          color: palette.color,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

export function TrustBadges({
  thirdPartyTested,
  brandCertifications,
  countryOfManufacture,
}) {
  const chips = [];

  if (thirdPartyTested === true) {
    chips.push({ key: "tested", label: "✓ 3rd-Party Tested", palette: TESTED_PALETTE });
  }

  // Surface up to 2 certifications (keep the row visually tight)
  if (Array.isArray(brandCertifications)) {
    for (const cert of brandCertifications.slice(0, 2)) {
      chips.push({ key: `cert-${cert}`, label: cert, palette: CERT_PALETTE });
    }
  }

  if (countryOfManufacture) {
    chips.push({
      key: "country",
      label: `Made in ${countryOfManufacture}`,
      palette: COUNTRY_PALETTE,
    });
  }

  if (chips.length === 0) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 6,
        marginTop: 8,
      }}
    >
      {chips.map((c) => (
        <TrustChip key={c.key} label={c.label} palette={c.palette} />
      ))}
    </View>
  );
}

// --- NutritionAdvisoryCard (AAFCO + nutrient panel completeness) ---
// Universal (not personalized by pet). Shown only when there's something
// specific for the user to know — renders nothing when everything checks out.

const ADVISORY_MESSAGES = {
  aafco_all_stages: {
    title: "Formulated for All Life Stages",
    body: "This food is formulated to meet puppy growth minimums, which run higher in calcium and phosphorus than adult dogs need. For adults and seniors, a life-stage-specific formula is typically a better fit.",
  },
  aafco_supplemental: {
    title: "Not a complete and balanced diet",
    body: "This product is labeled for supplemental or intermittent feeding and should not be the only food in your pet's diet.",
  },
  aafco_missing: {
    title: "No AAFCO statement found",
    body: "Without an AAFCO statement we can't verify this meets complete-and-balanced standards. Worth double-checking the packaging before making this a staple.",
  },
  data_incomplete: {
    title: "Only guaranteed analysis is published",
    body: "This brand publishes minimums and maximums but not a full nutrient panel. A dry-matter-basis breakdown would reveal true nutrient density — brands that publish it stand on firmer ground.",
  },
};

export function NutritionAdvisoryCard({ aafcoStatement, nutrientDataCompleteness }) {
  const { theme } = useStyles();

  const keys = [];
  if (aafcoStatement === "All Life Stages") keys.push("aafco_all_stages");
  else if (aafcoStatement === "Supplemental/Intermittent") keys.push("aafco_supplemental");
  else if (aafcoStatement === "None visible" || aafcoStatement === "Unknown") keys.push("aafco_missing");
  if (nutrientDataCompleteness === "incomplete") keys.push("data_incomplete");

  if (keys.length === 0) return null;

  return (
    <View style={{ marginTop: 24 }}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: theme.textPrimary,
          letterSpacing: -0.4,
          marginBottom: 12,
        }}
      >
        Heads Up
      </Text>
      <View style={{ backgroundColor: theme.card, borderRadius: 16, overflow: "hidden" }}>
        {keys.map((k, i) => {
          const msg = ADVISORY_MESSAGES[k];
          return (
            <React.Fragment key={k}>
              {i > 0 ? (
                <View
                  style={{
                    height: RNStyleSheet.hairlineWidth,
                    backgroundColor: theme.separator,
                    marginLeft: 20,
                  }}
                />
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 20,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "rgba(232,163,23,0.12)",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 2,
                  }}
                >
                  <AlertCircle size={14} color="#B87A0A" strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: theme.textPrimary,
                      marginBottom: 3,
                      letterSpacing: -0.1,
                    }}
                  >
                    {msg.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      lineHeight: 19,
                      color: theme.textSecondary,
                    }}
                  >
                    {msg.body}
                  </Text>
                </View>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

// --- ScanAnotherButton (outline, Reanimated scale press state) ---

export function ScanAnotherButton({ onPress }) {
  const { styles } = useStyles();
  const scale = useSharedValue(1);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 20, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.scanAnotherButton, scaleStyle]}>
        <Text style={styles.scanAnotherText}>Scan Another Product</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// --- ShareCard (static render for view-shot capture — always light mode) ---

const shareCardStyles = RNStyleSheet.create({
  card: {
    width: 375,
    height: 500,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
    alignItems: "center",
  },
  productName: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.textPrimary,
    textAlign: "center",
    lineHeight: 26,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  ringContainer: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  ringLabel: {
    ...RNStyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
  },
  scoreGradeLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  statPill: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "center",
    minWidth: 70,
  },
  statPillLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  statPillValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  watermark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 16,
  },
  watermarkText: {
    fontSize: 11,
    fontWeight: "400",
    color: Colors.textTertiary,
  },
});

export const ShareCard = forwardRef(function ShareCard({ result, nutrition }, ref) {
  if (!result?.overallScore) return null;

  const score = result.overallScore;
  const config = getScoreConfig(score);
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillOffset = circumference * (1 - score / 100);

  const stats = [];
  if (nutrition?.primaryProteinSource)
    stats.push({ label: "Protein", value: nutrition.primaryProteinSource });
  if (nutrition?.grainFree != null)
    stats.push({ label: "Grain Free", value: nutrition.grainFree ? "Yes" : "No" });
  if (nutrition?.lifestage && nutrition.lifestage !== "Unknown")
    stats.push({ label: "Life Stage", value: nutrition.lifestage });

  return (
    <View ref={ref} collapsable={false} style={shareCardStyles.card}>
      {/* Product name */}
      <Text style={shareCardStyles.productName} numberOfLines={2}>
        {result.productName}
      </Text>

      {/* Center: ring + stats */}
      <View style={shareCardStyles.centerContent}>
        <View style={shareCardStyles.ringContainer}>
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
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          </Svg>
          <View style={shareCardStyles.ringLabel}>
            <Text style={[shareCardStyles.scoreNumber, { color: config.color }]}>
              {score}
            </Text>
            <Text style={[shareCardStyles.scoreGradeLabel, { color: config.color }]}>
              {config.label}
            </Text>
          </View>
        </View>

        {stats.length > 0 && (
          <View style={shareCardStyles.statsRow}>
            {stats.slice(0, 4).map((s, i) => (
              <View key={i} style={shareCardStyles.statPill}>
                <Text style={shareCardStyles.statPillLabel}>{s.label}</Text>
                <Text style={shareCardStyles.statPillValue} numberOfLines={1}>
                  {s.value}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Watermark */}
      <View style={shareCardStyles.watermark}>
        <PawPrint size={12} color={Colors.textTertiary} strokeWidth={2} />
        <Text style={shareCardStyles.watermarkText}>Scanned with Woof</Text>
      </View>
    </View>
  );
});

// --- FirstScanToast (floating pill for first-time scan) ---

export function FirstScanToast({ visible }) {
  const theme = useTheme();
  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      exiting={FadeOut.duration(300)}
      style={[toastStyles.container, { backgroundColor: theme.card, ...Shadows.card }]}
    >
      <PawPrint size={14} color={Colors.scoreExcellent} strokeWidth={2} />
      <Text style={[toastStyles.text, { color: theme.textPrimary }]}>
        Your first scan! 2 more free scans available
      </Text>
    </Animated.View>
  );
}

const toastStyles = RNStyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 12,
  },
  text: {
    fontSize: 13,
    fontWeight: "500",
  },
});

// --- Shimmer skeleton components (LinearGradient sweep) ---

function ShimmerOverlay() {
  const translateX = useSharedValue(-375);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(375, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[RNStyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View style={[{ width: 375, height: "100%" }, shimmerStyle]}>
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.6)", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ width: 375, height: "100%" }}
        />
      </Animated.View>
    </Animated.View>
  );
}

export function SkeletonBar({ width = "100%", height = 14, style }) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: theme.fillSecondary,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <ShimmerOverlay />
    </View>
  );
}

export function SkeletonCircle({ size = 180, strokeWidth = 12 }) {
  const theme = useTheme();

  return (
    <View
      style={{
        width: size,
        height: size,
        alignSelf: "center",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={(size - strokeWidth) / 2}
          stroke={theme.fillSecondary}
          strokeWidth={strokeWidth}
          fill="none"
        />
      </Svg>
    </View>
  );
}

// --- DataSourceBadge (shows where ingredient data came from) ---

function ingredientSourceDisplay(dataSource) {
  const authoritative = new Set(["opff", "brand", "manufacturer", "verified"]);
  const reviewedListings = new Set(["web_verified", "dfa", "cfa", "cats"]);
  const scrapedListings = new Set(["amazon", "chewy", "web"]);

  if (dataSource === "dfa" || dataSource === "cfa" || dataSource === "cats") {
    const siteNames = { dfa: "Dog Food Advisor", cfa: "Cat Food Advisor", cats: "Cats.com" };
    return {
      trusted: false,
      label: `Ingredient data from ${siteNames[dataSource] || "expert review"}`,
    };
  }
  if (authoritative.has(dataSource)) {
    return { trusted: true, label: "Verified ingredients from product database" };
  }
  if (reviewedListings.has(dataSource)) {
    return { trusted: false, label: "Ingredients from product listing" };
  }
  if (dataSource === "user_ocr") {
    return { trusted: false, label: "Ingredients from label photo" };
  }
  if (scrapedListings.has(dataSource)) {
    return { trusted: false, label: "Ingredients from retailer listing" };
  }
  if (dataSource === "enriched") {
    return { trusted: true, label: "Enriched with product data" };
  }
  return null;
}

export function DataSourceBadge({ dataSource }) {
  const theme = useTheme();
  const display = ingredientSourceDisplay(dataSource);
  if (!display) return null;

  const Icon = display.trusted ? ShieldCheck : AlertCircle;
  const color = display.trusted ? Colors.scoreExcellent : theme.textTertiary;

  return (
    <Animated.View
      entering={FadeInUp.delay(150).duration(300)}
      style={dataSourceStyles.container}
    >
      <Icon size={14} color={color} strokeWidth={2} />
      <Text style={[dataSourceStyles.text, { color }]}>{display.label}</Text>
    </Animated.View>
  );
}

const dataSourceStyles = RNStyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
    justifyContent: "center",
  },
  text: {
    fontSize: 11,
    fontWeight: "500",
  },
});

// --- ProgressSteps (multi-step loading indicator for two-stage flow) ---

function ProgressStep({ completed, active, children, theme }) {
  return (
    <View style={progressStyles.step}>
      <View style={[
        progressStyles.dot,
        completed && { backgroundColor: Colors.scoreExcellent },
        active && { backgroundColor: theme.textSecondary },
        !completed && !active && { backgroundColor: theme.fill },
      ]}>
        {completed && <Check size={8} color="#FFFFFF" strokeWidth={3} />}
      </View>
      <Text style={[
        progressStyles.label,
        { color: active ? theme.textPrimary : completed ? theme.textSecondary : theme.textTertiary },
        active && { fontWeight: "600" },
      ]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

function progressIngredientLabel(dataSource, ingredientCount) {
  const prefix = `Found ${ingredientCount || ""}`.trim();
  const display = ingredientSourceDisplay(dataSource);
  if (!display) return `${prefix} ingredient data`;
  const label = display.trusted
    ? "verified ingredients"
    : display.label.replace(/^Ingredients from /, "").toLowerCase() + " ingredients";
  return `${prefix} ${label}`;
}

export function ProgressSteps({ phase, productName, dataSource, ingredientCount }) {
  const theme = useTheme();

  return (
    <View style={progressStyles.container}>
      <ProgressStep
        completed={phase !== "identifying"}
        active={phase === "identifying"}
        theme={theme}
      >
        {phase === "identifying"
          ? "Identifying product..."
          : productName || "Product identified"}
      </ProgressStep>

      {phase !== "identifying" && (
        <Animated.View entering={FadeInUp.duration(200)}>
          <ProgressStep
            completed={phase === "analyzing" || phase === "analyzing_photo"}
            active={phase === "looking_up" || phase === "identified"}
            theme={theme}
          >
            {phase === "looking_up" || phase === "identified"
              ? "Fetching ingredient data..."
              : phase === "analyzing"
                ? progressIngredientLabel(dataSource, ingredientCount)
                : "Reading from photo"}
          </ProgressStep>
        </Animated.View>
      )}

      {(phase === "analyzing" || phase === "analyzing_photo") && (
        <Animated.View entering={FadeInUp.duration(200)}>
          <ProgressStep active theme={theme}>
            Analyzing safety & quality...
          </ProgressStep>
        </Animated.View>
      )}

      <View style={{ alignItems: "center", marginTop: 16 }}>
        <StreamingDots />
      </View>
    </View>
  );
}

const progressStyles = RNStyleSheet.create({
  container: {
    gap: 12,
    paddingHorizontal: 40,
    paddingTop: 24,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    flex: 1,
  },
});

// --- LoadingSkeleton (full page shimmer layout matching results structure) ---

export function LoadingSkeleton({ loadingStatus, isSlowLoading, phase, productName, dataSource, ingredientCount, onRetry }) {
  const { styles, theme } = useStyles();

  return (
    <Animated.View
      exiting={FadeOut.duration(200)}
      style={styles.scrollContent}
    >
      {/* Name placeholder */}
      <View style={{ alignItems: "center", paddingVertical: 8, gap: 8, marginTop: 16 }}>
        <SkeletonBar width="60%" height={22} />
        <SkeletonBar width="40%" height={16} />
      </View>

      {/* Score ring placeholder */}
      <View style={styles.heroSection}>
        <SkeletonCircle size={180} strokeWidth={12} />
      </View>

      {/* Quick stats grid placeholder */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={{
              backgroundColor: theme.fill,
              borderRadius: Spacing.cardRadius,
              paddingVertical: 20,
              paddingHorizontal: 14,
              alignItems: "center",
              flexBasis: "47%",
              flexGrow: 1,
              overflow: "hidden",
            }}
          >
            <SkeletonBar width={20} height={20} style={{ borderRadius: 4, marginBottom: 8 }} />
            <SkeletonBar width="50%" height={10} style={{ marginBottom: 6 }} />
            <SkeletonBar width="70%" height={14} />
          </View>
        ))}
      </View>

      {/* Verdict placeholder */}
      <View style={{
        backgroundColor: theme.fill,
        borderRadius: Spacing.cardRadius,
        padding: Spacing.cardPadding,
        marginTop: Spacing.subsectionGap,
        borderLeftWidth: 3,
        borderLeftColor: theme.fillSecondary,
        overflow: "hidden",
        gap: 8,
      }}>
        <SkeletonBar width="90%" height={14} />
        <SkeletonBar width="75%" height={14} />
        <SkeletonBar width="50%" height={14} />
      </View>

      {/* Loading status — show progress steps if phase info available */}
      {phase ? (
        <ProgressSteps
          phase={phase}
          productName={productName}
          dataSource={dataSource}
          ingredientCount={ingredientCount}
        />
      ) : (
        <View style={{ alignItems: "center", marginTop: 32, gap: 12 }}>
          <StreamingDots />
          <Text style={{
            color: theme.textSecondary,
            ...Typography.caption,
            fontWeight: "500",
          }}>
            {loadingStatus}
          </Text>
          {isSlowLoading && (
            <Animated.View
              entering={FadeInUp.duration(300)}
              style={{ alignItems: "center", gap: 14, paddingHorizontal: 40 }}
            >
              <Text
                style={{
                  color: theme.textTertiary,
                  ...Typography.caption,
                  textAlign: "center",
                }}
              >
                Taking longer than usual...{"\n"}Hang tight, we're almost there.
              </Text>
              {onRetry && (
                <TouchableOpacity
                  onPress={onRetry}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel="Retry analysis"
                  style={{
                    backgroundColor: theme.buttonPrimary,
                    borderRadius: Spacing.buttonRadius,
                    paddingHorizontal: 22,
                    paddingVertical: 11,
                    minWidth: 132,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: theme.buttonText, ...Typography.button }}>
                    Try Again
                  </Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

// --- ErrorState (redesigned — AlertCircle, descriptive copy, black CTA) ---

export function ErrorState({ error, mode, onRetry, onScanAnother, onUpgrade, onScanProduct, onSignInAgain, isPro = false }) {
  const { styles, theme } = useStyles();

  // Route every error through the classifier so the user always sees specific,
  // actionable copy — not just "Something went wrong".
  const classified = classifyError(error);

  // Mode-specific overrides
  let title = classified.title;
  let message = classified.message;
  let buttonLabel = "Try Again";
  let buttonAction = onRetry;

  if (classified.kind === "auth" || classified.action === "sign_in") {
    buttonLabel = "Sign In Again";
    buttonAction = onSignInAgain || onScanAnother;
  } else if (mode === "history" && classified.kind === "unknown") {
    title = "Result Expired";
    message = "This saved result is no longer available. Scan it again to refresh the analysis.";
    buttonLabel = "Back to Home";
    buttonAction = onScanAnother;
  } else if (classified.kind === "quota" || classified.action === "upgrade") {
    if (isPro) {
      title = "Subscription Sync Needed";
      message = "Your Woof Pro subscription looks active on this device, but the scan server still returned a free-limit response.";
      buttonLabel = "Refresh & Retry";
    } else {
      buttonLabel = "Upgrade to Pro";
    }
    buttonAction = onUpgrade;
  } else if (classified.kind === "product_not_found" || classified.action === "scan_product") {
    buttonLabel = "Scan Product";
    buttonAction = onScanProduct || onScanAnother;
  } else if (classified.kind === "image" || classified.action === "retake") {
    buttonLabel = "Try Another Photo";
    buttonAction = onScanAnother;
  }

  return (
    <View style={styles.errorContainer}>
      <View style={styles.errorCircle}>
        <AlertCircle size={48} color={theme.textTertiary} strokeWidth={1.5} />
      </View>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorText}>{message}</Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={buttonAction}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Text style={styles.retryButtonText}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

// --- StreamingDots (Reanimated withRepeat + staggered) ---

export function StreamingDots() {
  const { styles } = useStyles();
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    const pulse = withRepeat(
      withSequence(
        withTiming(1, { duration: 500 }),
        withTiming(0.3, { duration: 500 })
      ),
      -1
    );
    dot1.value = pulse;
    dot2.value = withDelay(200, withRepeat(
      withSequence(
        withTiming(1, { duration: 500 }),
        withTiming(0.3, { duration: 500 })
      ),
      -1
    ));
    dot3.value = withDelay(400, withRepeat(
      withSequence(
        withTiming(1, { duration: 500 }),
        withTiming(0.3, { duration: 500 })
      ),
      -1
    ));
    // Cancel infinite animations on unmount so they don't keep ticking on the
    // UI thread after the user navigates away.
    return () => {
      cancelAnimation(dot1);
      cancelAnimation(dot2);
      cancelAnimation(dot3);
    };
  }, []);

  const style1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const style2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const style3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.streamDot, style1]} />
      <Animated.View style={[styles.streamDot, style2]} />
      <Animated.View style={[styles.streamDot, style3]} />
    </View>
  );
}

// --- Safety Badge (human food mode — 80x80 circle, icon, label) ---

export function SafetyBadge({ safetyLevel, petType }) {
  const theme = useTheme();
  const isDark = theme.isDark;
  const config = {
    safe: { label: "Safe", color: Colors.scoreExcellent, bg: isDark ? "rgba(52,199,89,0.18)" : "rgba(52,199,89,0.1)", Icon: CheckCircle2 },
    caution: { label: "Caution", color: Colors.scoreDecent, bg: isDark ? "rgba(255,159,10,0.18)" : "rgba(232,163,23,0.1)", Icon: AlertTriangle },
    dangerous: { label: "Dangerous", color: Colors.scoreConcerning, bg: isDark ? "rgba(255,59,48,0.18)" : "rgba(239,68,68,0.1)", Icon: X },
  }[safetyLevel] || { label: "Unknown", color: theme.textTertiary, bg: theme.surface, Icon: AlertCircle };

  return (
    <View style={{ alignItems: "center", paddingVertical: 24 }}>
      <View style={{
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: config.bg,
        alignItems: "center", justifyContent: "center",
        marginBottom: 12,
      }}>
        <config.Icon size={36} color={config.color} strokeWidth={1.8} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: "700", color: config.color }}>
        {config.label}
      </Text>
    </View>
  );
}

// --- Disclaimer (AI-powered notice) ---

export function Disclaimer() {
  const { styles } = useStyles();
  return (
    <Text style={styles.disclaimer}>
      AI estimate, not veterinary advice. Contact your vet or pet poison control for ingestion concerns.
    </Text>
  );
}
