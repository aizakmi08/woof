import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
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
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Check, X, Star, ChevronRight, ChevronDown, Utensils, Wheat, Calendar, Flame, AlertTriangle, AlertCircle, CheckCircle2, PawPrint, Lock, Shield } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme, getScoreConfig, Colors, Animation, Spacing, Shadows, Typography } from "../../theme";
import { useStyles } from "./styles";

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
  const lockOpacity = useSharedValue(0.5);
  const ctaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));
  const lockAnimStyle = useAnimatedStyle(() => ({
    opacity: lockOpacity.value,
  }));

  useEffect(() => {
    lockOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500 }),
        withTiming(0.5, { duration: 1500 })
      ),
      -1
    );
  }, []);

  const scanText = remainingScans <= 0
    ? "No free scans remaining"
    : `${remainingScans} free scan${remainingScans === 1 ? "" : "s"} remaining`;

  return (
    <View style={gateStyles.container}>
      {/* Gradient fade from content above */}
      <LinearGradient
        colors={["transparent", theme.bg]}
        style={gateStyles.gradient}
        pointerEvents="none"
      />

      {/* Lock icon with pulse */}
      <Animated.View style={lockAnimStyle}>
        <Lock size={24} color={theme.textTertiary} strokeWidth={2} />
      </Animated.View>

      {/* Title */}
      <Text style={[gateStyles.title, { color: theme.textPrimary }]}>
        See what's really inside
      </Text>

      {/* Subtitle */}
      <Text style={[gateStyles.subtitle, { color: theme.textSecondary }]}>
        {"Unlock ingredient analysis, quality scores,\nreviews, and recall alerts"}
      </Text>

      {/* Price line */}
      <Text style={[gateStyles.price, { color: theme.textPrimary }]}>
        From $3.33/month
      </Text>

      {/* CTA button */}
      <Pressable
        onPressIn={() => { ctaScale.value = withSpring(0.97, { damping: 20, stiffness: 300 }); }}
        onPressOut={() => { ctaScale.value = withSpring(1, { damping: 15, stiffness: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onUpgrade();
        }}
      >
        <Animated.View
          style={[
            gateStyles.cta,
            { backgroundColor: theme.buttonPrimary },
            ctaAnimStyle,
          ]}
        >
          <Text style={[gateStyles.ctaText, { color: theme.buttonText }]}>
            Unlock Full Report
          </Text>
        </Animated.View>
      </Pressable>

      {/* Scan count */}
      <Text style={[gateStyles.scanCount, { color: theme.textTertiary }]}>
        {scanText}
      </Text>

      {/* Ghost quality bars (recognizable shapes) */}
      <View style={gateStyles.ghostContainer}>
        {[80, 65, 55, 72, 45].map((w, i) => (
          <View key={i} style={gateStyles.ghostBarRow}>
            <View style={[gateStyles.ghostLabel, { backgroundColor: theme.textTertiary }]} />
            <View style={[gateStyles.ghostTrack, { backgroundColor: Colors.divider }]}>
              <View style={[gateStyles.ghostFill, { width: `${w}%`, backgroundColor: theme.textTertiary }]} />
            </View>
          </View>
        ))}
        {/* Ghost card shapes */}
        <View style={[gateStyles.ghostCard, { backgroundColor: theme.textTertiary }]} />
        <View style={[gateStyles.ghostCard, { backgroundColor: theme.textTertiary }]} />
      </View>
    </View>
  );
}

const gateStyles = RNStyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: 20,
  },
  gradient: {
    position: "absolute",
    top: -60,
    left: 0,
    right: 0,
    height: 60,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginTop: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
    textAlign: "center",
    marginTop: 6,
  },
  price: {
    fontSize: 15,
    fontWeight: "500",
    marginTop: 16,
  },
  cta: {
    height: Spacing.buttonHeight,
    borderRadius: Spacing.buttonRadius,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    marginHorizontal: 20,
    paddingHorizontal: 32,
    minWidth: 280,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "600",
  },
  scanCount: {
    fontSize: 13,
    fontWeight: "400",
    marginTop: 10,
  },
  ghostContainer: {
    marginTop: 24,
    width: "100%",
    paddingHorizontal: 20,
    gap: 10,
  },
  ghostBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ghostLabel: {
    width: 60,
    height: 8,
    borderRadius: 4,
    opacity: 0.05,
  },
  ghostTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    opacity: 0.06,
    overflow: "hidden",
  },
  ghostFill: {
    height: 6,
    borderRadius: 3,
  },
  ghostCard: {
    height: 56,
    borderRadius: 14,
    opacity: 0.05,
    marginTop: 2,
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

export function getDataSourceConfig(theme) {
  return {
    verified: { label: "Verified Data", color: Colors.score.excellent, bg: Colors.score.excellent + "26" },
    enriched: { label: "AI + Verified", color: Colors.amber, bg: Colors.amber + "26" },
    ai: { label: "AI Estimated", color: theme.textSecondary, bg: theme.fill },
    cached: { label: "Instant Result", color: Colors.blue, bg: Colors.blue + "26" },
  };
}

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
    <Animated.Text style={[animStyle, { color: Colors.textPrimary, fontWeight: "300" }]}>
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

export function DataSourceBadge({ source }) {
  const theme = useTheme();
  const { styles } = useStyles();
  const configs = getDataSourceConfig(theme);
  const config = configs[source] || configs.ai;
  return (
    <View style={[styles.dataSourceBadge, { backgroundColor: config.bg }]}>
      <View style={[styles.dataSourceDot, { backgroundColor: config.color }]} />
      <Text style={[styles.dataSourceText, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
}

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

// --- CircularScore (SVG, 180px hero ring with Reanimated animated fill) ---

export function CircularScore({ score, size = 180, strokeWidth = 12 }) {
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
          stroke={Colors.divider}
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

      {/* Score number + label */}
      <View style={styles.ringLabelContainer}>
        <Text style={[styles.heroScoreNumber, { color: config.color }]}>
          {displayScore}
        </Text>
        <Text style={[styles.heroGradeLabel, { color: config.color }]}>
          {config.label}
        </Text>
      </View>
    </Animated.View>
  );
}

// --- QuickStatsGrid (2x2 with Lucide icons) ---

export function QuickStatsGrid({ nutrition }) {
  const { styles, theme } = useStyles();
  if (!nutrition) return null;

  const stats = [
    nutrition.primaryProteinSource && {
      Icon: Utensils,
      label: "Protein",
      value: nutrition.primaryProteinSource,
    },
    nutrition.grainFree != null && {
      Icon: Wheat,
      label: "Grain Free",
      value: nutrition.grainFree ? "Yes" : "No",
    },
    nutrition.lifestage && nutrition.lifestage !== "Unknown" && {
      Icon: Calendar,
      label: "Life Stage",
      value: nutrition.lifestage,
    },
    nutrition.caloriesPerCup && nutrition.caloriesPerCup !== "N/A" && {
      Icon: Flame,
      label: "Calories",
      value: nutrition.caloriesPerCup,
    },
  ].filter(Boolean);

  if (stats.length === 0) return null;

  return (
    <View style={styles.statsGrid}>
      {stats.map((s, i) => (
        <View key={i} style={styles.statCell}>
          <s.Icon size={20} color={theme.textTertiary} strokeWidth={1.8} style={styles.statCellIcon} />
          <Text style={styles.statCellLabel}>{s.label.toUpperCase()}</Text>
          <Text style={styles.statCellValue} numberOfLines={1}>
            {shortenDisplayValue(s.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// --- VerdictCard (colored left border accent) ---

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
    <View style={[styles.verdictCard, { borderLeftColor: config.color }]}>
      <Text
        style={styles.verdictText}
        numberOfLines={expanded || streaming ? undefined : 4}
      >
        {streaming ? (
          <StreamingText text={verdict} streaming={streaming} done={done} style={styles.verdictText} />
        ) : (
          displayVerdict
        )}
      </Text>
      {isFreeGated && (
        <LinearGradient
          colors={[Colors.verdictBackground + "00", Colors.verdictBackground]}
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
        <TouchableOpacity onPress={() => setExpanded(true)} hitSlop={8}>
          <Text style={styles.verdictMoreLink}>more</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// --- CategoryBar (refined — gray track, staggered fill, expandable detail) ---

export function CategoryBar({ name, score, detail, index = 0, isLast = false }) {
  const { styles, theme } = useStyles();
  const config = getScoreConfig(score);
  const animWidth = useSharedValue(0);
  const fadeAnim = useSharedValue(0);
  const [expanded, setExpanded] = useState(false);

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

  const toggleExpand = () => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(
      LayoutAnimation.create(250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    setExpanded(!expanded);
  };

  return (
    <TouchableOpacity
      activeOpacity={detail ? 0.7 : 1}
      onPress={detail ? toggleExpand : undefined}
      disabled={!detail}
      accessibilityLabel={`${name}: ${score} out of 100. ${detail || ""}`}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.categoryItem, fadeStyle]}>
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

        {/* Description + more/less toggle */}
        {detail && (
          <View style={styles.categoryDetailRow}>
            <Text
              style={styles.categoryDetail}
              numberOfLines={expanded ? undefined : 1}
            >
              {detail}
            </Text>
            <TouchableOpacity onPress={toggleExpand} hitSlop={8}>
              <Text style={styles.categoryMoreLink}>
                {expanded ? "less" : "more"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Indented divider */}
        {!isLast && <View style={styles.categoryDivider} />}
      </Animated.View>
    </TouchableOpacity>
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
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={styles.collapsibleHeader}>
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

  const rows = [
    [
      { label: "Protein", value: clean(nutrition.proteinPercent), qualifier: nutrition.proteinPercent ? nutrition.proteinLevel : null },
      { label: "Calories", value: clean(nutrition.caloriesPerCup) },
    ],
    [
      { label: "Fat", value: clean(nutrition.fatPercent), qualifier: nutrition.fatPercent ? nutrition.fatLevel : null },
      { label: "Life Stage", value: clean(nutrition.lifestage) },
    ],
    [
      { label: "Fiber", value: clean(nutrition.fiberPercent) },
      { label: "Grain Free", value: nutrition.grainFree != null ? (nutrition.grainFree ? "Yes" : "No") : null },
    ],
  ];

  return (
    <View style={styles.nutritionSection}>
      <Text style={styles.nutritionTitle}>Nutrition Facts</Text>
      {rows.map((row, ri) => (
        <View key={ri}>
          <View style={styles.nutRow}>
            <NutritionCell {...row[0]} isLeft />
            <View style={styles.nutVertDivider} />
            <NutritionCell {...row[1]} isLeft={false} />
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
          isBad && styles.ingRowWarning,
          fadeStyle,
        ]}
      >
        <View style={styles.ingRowMain}>
          {/* Quality dot */}
          <View style={[styles.ingDot, { backgroundColor: dotColor }]} />

          {/* Name */}
          <View style={styles.ingNameArea}>
            <Text style={styles.ingName} numberOfLines={1}>
              {ingredient.name}
            </Text>
          </View>

          {/* 1st badge */}
          {isFirst && (
            <View style={styles.ingFirstBadge}>
              <Text style={styles.ingFirstBadgeText}>1ST</Text>
            </View>
          )}

          {/* Category badge (neutral) */}
          {ingredient.category && <CategoryPill category={ingredient.category} />}

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

export function IngredientsSection({ ingredients, onIngredientPress, totalCount, fadeLastItem }) {
  const { styles, theme } = useStyles();

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

  return (
    <View style={styles.ingredientsSection}>
      <Text style={styles.ingredientsTitle}>Ingredients ({displayTotal})</Text>

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
      </View>

      {/* Rows (natural order — not reordered) */}
      {ingredients.map((ing, i) => {
        const isLast = i === ingredients.length - 1;
        const isFadedLast = fadeLastItem && isLast;

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

  const [modalVisible, setModalVisible] = useState(false);
  const ingredientRef = useRef(null);

  const translateY = useSharedValue(500);
  const backdropOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  // Open when ingredient changes to non-null
  useEffect(() => {
    if (ingredient) {
      ingredientRef.current = ingredient;
      setModalVisible(true);
    }
  }, [ingredient]);

  // Animate in once modal is visible
  useEffect(() => {
    if (modalVisible && ingredientRef.current) {
      translateY.value = withSpring(0, { damping: 15, stiffness: 120 });
      backdropOpacity.value = withTiming(0.3, { duration: 200 });
      contentOpacity.value = withDelay(100, withTiming(1, { duration: 200 }));
    }
  }, [modalVisible]);

  const dismissRef = useRef(null);
  const dismiss = useCallback(() => {
    Haptics.selectionAsync();
    backdropOpacity.value = withTiming(0, { duration: 200 });
    contentOpacity.value = withTiming(0, { duration: 100 });
    translateY.value = withTiming(500, { duration: 300 });
    setTimeout(() => {
      setModalVisible(false);
      translateY.value = 500;
      backdropOpacity.value = 0;
      contentOpacity.value = 0;
      onDismiss();
    }, 300);
  }, [onDismiss]);
  dismissRef.current = dismiss;

  // PanResponder on handle for swipe-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 8,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.value = dy;
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 80 || vy > 0.5) {
          dismissRef.current?.();
        } else {
          translateY.value = withSpring(0, { damping: 15, stiffness: 120 });
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
        <Pressable style={RNStyleSheet.absoluteFill} onPress={dismiss} />

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
                    {/* What is it */}
                    {ing.description ? (
                      <View style={styles.sheetSection}>
                        <Text style={styles.sheetSectionLabel}>What is it</Text>
                        <Text style={styles.sheetSectionBody}>{ing.description}</Text>
                      </View>
                    ) : null}

                    {/* Why this score */}
                    {ing.reason ? (
                      <View style={styles.sheetSection}>
                        <Text style={styles.sheetSectionLabel}>Why this score</Text>
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
  const [expanded, setExpanded] = useState(true);
  const rotation = useSharedValue(0);

  if (!customerRating) return null;

  const accentColor = getReviewAccentColor(customerRating.score, customerRating.outOf || 5);

  const toggle = () => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(
      LayoutAnimation.create(250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    rotation.value = withTiming(expanded ? 1 : 0, { duration: 200 });
    setExpanded(!expanded);
  };

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 180}deg` }],
  }));

  const praises = (customerRating.commonPraises || []).slice(0, 3);
  const complaints = (customerRating.commonComplaints || []).slice(0, 3);

  return (
    <View style={[styles.reviewCard, { borderLeftColor: accentColor }]}>
      {/* Header — title + collapse chevron */}
      <TouchableOpacity onPress={toggle} activeOpacity={0.7} style={styles.reviewHeaderRow}>
        <Text style={styles.reviewTitle}>Customer Reviews</Text>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={20} color={theme.textTertiary} strokeWidth={2} />
        </Animated.View>
      </TouchableOpacity>

      {expanded && (
        <View style={{ marginTop: Spacing.elementGap }}>
          {/* Rating: big number + stars, count below */}
          <View>
            <View style={styles.reviewRatingRow}>
              <Text style={styles.reviewBigScore}>{customerRating.score}</Text>
              <ReviewStars score={customerRating.score} outOf={customerRating.outOf || 5} />
            </View>
            {customerRating.totalReviews && (
              <Text style={styles.reviewCountText}>
                {formatReviewCount(customerRating.totalReviews)} reviews
              </Text>
            )}
          </View>

          {/* Summary text */}
          {customerRating.sentiment && (
            <Text style={styles.reviewSummary} numberOfLines={2}>
              {customerRating.sentiment}
            </Text>
          )}

          {/* Loved pills */}
          {praises.length > 0 && (
            <View style={styles.reviewTagSection}>
              <Text style={[styles.reviewTagLabel, { color: Colors.lovedPillText }]}>Loved</Text>
              <View style={styles.reviewTagsWrap}>
                {praises.map((tag, i) => (
                  <ReviewPill
                    key={i}
                    text={tag}
                    bgColor={Colors.lovedPillBg}
                    textColor={Colors.lovedPillText}
                    index={i}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Watch out pills */}
          {complaints.length > 0 && (
            <View style={styles.reviewTagSection}>
              <Text style={[styles.reviewTagLabel, { color: Colors.watchOutPillText }]}>Watch out</Text>
              <View style={styles.reviewTagsWrap}>
                {complaints.map((tag, i) => (
                  <ReviewPill
                    key={i}
                    text={tag}
                    bgColor={Colors.watchOutPillBg}
                    textColor={Colors.watchOutPillText}
                    index={praises.length + i}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// --- RecallCard (recall: red-tinted, clean: green-tinted — no shadow) ---

export function RecallCard({ recallHistory }) {
  const { styles } = useStyles();
  const [expanded, setExpanded] = useState(false);

  if (!recallHistory) return null;

  const isClean = /^(none|no recalls?)\b/i.test(recallHistory);

  if (isClean) {
    return (
      <View style={styles.recallCardClean}>
        <View style={styles.recallHeaderRow}>
          <CheckCircle2 size={16} color={Colors.ingredientGood} strokeWidth={2} />
          <Text style={styles.recallLabelClean}>NO RECALLS</Text>
        </View>
        <Text style={styles.recallTextClean}>
          No recalls found for this product or brand.
        </Text>
      </View>
    );
  }

  const needsTruncate = recallHistory.length > 120;

  const toggleExpand = () => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(
      LayoutAnimation.create(250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    setExpanded(true);
  };

  return (
    <View style={styles.recallCardWarning}>
      <View style={styles.recallHeaderRow}>
        <AlertTriangle size={16} color="#EF4444" strokeWidth={2} />
        <Text style={styles.recallLabelWarning}>RECALL HISTORY</Text>
      </View>
      <Text
        style={styles.recallTextWarning}
        numberOfLines={expanded ? undefined : 3}
      >
        {recallHistory}
      </Text>
      {needsTruncate && !expanded && (
        <TouchableOpacity onPress={toggleExpand} hitSlop={8}>
          <Text style={styles.recallSeeDetails}>See details</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// --- ScanAnotherButton (outline, Reanimated scale press state) ---

export function ScanAnotherButton({ onPress }) {
  const { styles } = useStyles();
  const scale = useSharedValue(1);
  const fillOpacity = useSharedValue(0);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    opacity: fillOpacity.value,
  }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 20, stiffness: 300 });
        fillOpacity.value = withTiming(1, { duration: 100 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 150 });
        fillOpacity.value = withTiming(0, { duration: 150 });
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <Animated.View style={[styles.scanAnotherButton, scaleStyle]}>
        <Animated.View style={[styles.scanAnotherFill, fillStyle]} />
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
  if (nutrition?.caloriesPerCup && nutrition.caloriesPerCup !== "N/A")
    stats.push({ label: "Calories", value: nutrition.caloriesPerCup });

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

// --- LoadingSkeleton (full page shimmer layout matching results structure) ---

export function LoadingSkeleton({ loadingStatus, isSlowLoading }) {
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

      {/* Loading status */}
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
          <Animated.Text
            entering={FadeInUp.duration(300)}
            style={{
              color: theme.textTertiary,
              ...Typography.caption,
              textAlign: "center",
              paddingHorizontal: 40,
            }}
          >
            Taking longer than usual...{"\n"}Hang tight, we're almost there.
          </Animated.Text>
        )}
      </View>
    </Animated.View>
  );
}

// --- ErrorState (redesigned — AlertCircle, descriptive copy, black CTA) ---

export function ErrorState({ error, mode, onRetry, onScanAnother }) {
  const { styles, theme } = useStyles();

  const title = mode === "history"
    ? "Result Expired"
    : mode === "barcode"
    ? "Barcode Not Found"
    : "Couldn't analyze this label";

  const buttonLabel = mode === "history"
    ? "Back to Home"
    : mode === "barcode"
    ? "Take Photo Instead"
    : "Try Again";

  const onPress = mode === "history" || mode === "barcode"
    ? onScanAnother
    : onRetry;

  return (
    <View style={styles.errorContainer}>
      <View style={styles.errorCircle}>
        <AlertCircle size={48} color={theme.textTertiary} strokeWidth={1.5} />
      </View>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={onPress}
        activeOpacity={0.8}
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
