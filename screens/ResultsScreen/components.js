import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import { View, TouchableOpacity, LayoutAnimation, Platform, UIManager, StyleSheet as RNStyleSheet, Modal, PanResponder, Pressable, ScrollView, useWindowDimensions, ActivityIndicator } from "react-native";
import { AppText as Text, MAX_FONT_SIZE_MULTIPLIER } from "../../components/AppText";
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
import { Check, X, Star, ChevronRight, ChevronDown, Utensils, Wheat, Calendar, Flame, AlertTriangle, AlertCircle, CheckCircle2, PawPrint, Lock, Shield, UserPlus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTheme, getScoreConfig, Colors, Animation, Spacing, Shadows, Typography } from "../../theme";
import { useStyles } from "./styles";
import { supabase } from "../../services/supabase";
import { createLogger } from "../../services/logger";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const logger = createLogger("RESULTS");

// --- ProGate (blur overlay for free users) ---

export function ProGate({ isPro, onUpgrade, children }) {
  const theme = useTheme();
  if (isPro) return children;

  return (
    <View>
      <View style={{ opacity: 0.15, pointerEvents: "none" }}>
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
          accessibilityLabel="See Woof Pro plans"
          accessibilityHint="Opens subscription options"
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

  if (!Number.isFinite(remaining) || remaining <= 0) return null;

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

  const scanText = !Number.isFinite(remainingScans)
    ? "Unlimited scans active"
    : remainingScans <= 0
    ? "No free scans remaining"
    : `${remainingScans} free scan${remainingScans === 1 ? "" : "s"} remaining`;

  return (
    <View style={gateStyles.container}>
      {/* Lock icon with pulse */}
      <Animated.View style={lockAnimStyle}>
        <Lock size={24} color={theme.textTertiary} strokeWidth={2} />
      </Animated.View>

      {/* Title */}
      <Text style={[gateStyles.title, { color: theme.textPrimary }]}>
        Go deeper with Woof Pro
      </Text>

      {/* Subtitle */}
      <Text style={[gateStyles.subtitle, { color: theme.textSecondary }]}>
        {"Unlimited scans, ingredient explanations,\nnutrition, and quality breakdowns"}
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
        accessibilityLabel="Unlock full report"
        accessibilityHint="Opens Woof Pro plans"
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
    </View>
  );
}

const gateStyles = RNStyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: 28,
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
  cta: {
    height: Spacing.buttonHeight,
    borderRadius: Spacing.buttonRadius,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
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
          accessibilityRole="button"
          accessibilityLabel="Dismiss Pro prompt"
        >
          <X size={16} color={theme.textTertiary} strokeWidth={2} />
        </Pressable>
      </View>
      <Text style={[postScanStyles.subtitle, { color: theme.textSecondary }]}>
        Get unlimited scans and detailed ingredient explanations
      </Text>
      <Pressable
        onPressIn={() => { ctaScale.value = withSpring(0.97, { damping: 20, stiffness: 300 }); }}
        onPressOut={() => { ctaScale.value = withSpring(1, { damping: 15, stiffness: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onUpgrade();
        }}
        accessibilityRole="button"
        accessibilityLabel="See Woof Pro plans"
        accessibilityHint="Opens subscription options"
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

// --- GuestSavePrompt (shown after value for anonymous users) ---

export function GuestSavePrompt({ onSave, onDismiss, savingProvider, showApple }) {
  const theme = useTheme();
  const buttonDisabled = Boolean(savingProvider);

  const renderSaveButton = ({ provider, label, primary = false }) => {
    const isSaving = savingProvider === provider;
    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSave(provider);
        }}
        disabled={buttonDisabled}
        style={({ pressed }) => [
          guestSaveStyles.button,
          primary
            ? { backgroundColor: theme.buttonPrimary }
            : {
                backgroundColor: theme.card,
                borderColor: theme.separator,
                borderWidth: 1,
              },
          { opacity: pressed ? 0.85 : buttonDisabled && !isSaving ? 0.6 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Links this guest scan history to a sign-in"
        accessibilityState={{ disabled: buttonDisabled, busy: isSaving }}
      >
        {isSaving ? (
          <ActivityIndicator color={primary ? theme.buttonText : theme.textPrimary} />
        ) : (
          <Text style={[
            guestSaveStyles.buttonText,
            { color: primary ? theme.buttonText : theme.textPrimary },
          ]}>
            {label}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={[guestSaveStyles.container, { backgroundColor: theme.surface, borderColor: theme.separator }]}>
      <View style={guestSaveStyles.headerRow}>
        <UserPlus size={17} color={theme.textPrimary} strokeWidth={2} />
        <Text style={[guestSaveStyles.title, { color: theme.textPrimary }]}>
          Save this scan history
        </Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginLeft: "auto" })}
          accessibilityRole="button"
          accessibilityLabel="Dismiss save account prompt"
        >
          <X size={16} color={theme.textTertiary} strokeWidth={2} />
        </Pressable>
      </View>
      <Text style={[guestSaveStyles.subtitle, { color: theme.textSecondary }]}>
        Add Apple or Google so your scans, Pro access, and product submissions can move with you.
      </Text>
      <View style={guestSaveStyles.buttons}>
        {showApple && renderSaveButton({
          provider: "apple",
          label: "Save with Apple",
          primary: true,
        })}
        {renderSaveButton({
          provider: "google",
          label: "Save with Google",
          primary: !showApple,
        })}
      </View>
    </View>
  );
}

const guestSaveStyles = RNStyleSheet.create({
  container: {
    borderRadius: Spacing.cardRadius,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 12,
  },
  buttons: {
    gap: 10,
  },
  button: {
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0,
  },
});

// --- ReviewPrompt (shown sparingly after repeat successful scans) ---

export function ReviewPrompt({ onRate, onDismiss }) {
  const theme = useTheme();
  const ctaScale = useSharedValue(1);
  const ctaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  return (
    <View style={[reviewPromptStyles.container, { backgroundColor: theme.surface }]}>
      <View style={reviewPromptStyles.headerRow}>
        <Star size={16} color={Colors.scoreExcellent} strokeWidth={2} />
        <Text style={[reviewPromptStyles.title, { color: theme.textPrimary }]}>
          Help more pet parents find Woof
        </Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginLeft: "auto" })}
          accessibilityRole="button"
          accessibilityLabel="Dismiss rating prompt"
        >
          <X size={16} color={theme.textTertiary} strokeWidth={2} />
        </Pressable>
      </View>
      <Text style={[reviewPromptStyles.subtitle, { color: theme.textSecondary }]}>
        If Woof helped with this scan, a quick rating supports the app.
      </Text>
      <Pressable
        onPressIn={() => { ctaScale.value = withSpring(0.97, { damping: 20, stiffness: 300 }); }}
        onPressOut={() => { ctaScale.value = withSpring(1, { damping: 15, stiffness: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onRate();
        }}
        accessibilityRole="button"
        accessibilityLabel="Rate Woof"
        accessibilityHint="Opens the store rating page"
      >
        <Animated.View
          style={[
            reviewPromptStyles.cta,
            { backgroundColor: theme.buttonPrimary },
            ctaAnimStyle,
          ]}
        >
          <Text style={[reviewPromptStyles.ctaText, { color: theme.buttonText }]}>
            Rate Woof
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const reviewPromptStyles = RNStyleSheet.create({
  container: {
    borderRadius: Spacing.cardRadius,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  cta: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    borderRadius: Spacing.buttonRadius,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "700",
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
    <Animated.Text
      maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      style={[animStyle, { color: Colors.textPrimary, fontWeight: "300" }]}
    >
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
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
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
            pointerEvents: "none",
          }}
        />
      )}
      {needsTruncate && !expanded && (
        <TouchableOpacity
          onPress={() => setExpanded(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Show more verdict text"
        >
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
  const [needsTruncation, setNeedsTruncation] = useState(false);

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

        {/* Description + more/less */}
        {detail && (
          <View style={styles.categoryDetailRow}>
            <Text
              style={styles.categoryDetail}
              numberOfLines={expanded ? undefined : 1}
              onTextLayout={(e) => {
                if (!needsTruncation && e.nativeEvent.lines.length > 1) setNeedsTruncation(true);
              }}
            >
              {detail}
            </Text>
            {needsTruncation && (
              <TouchableOpacity
                onPress={toggleExpand}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={expanded ? `Show less ${name} detail` : `Show more ${name} detail`}
              >
                <Text style={styles.categoryMoreLink}>
                  {expanded ? "less" : "more"}
                </Text>
              </TouchableOpacity>
            )}
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
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        style={styles.collapsibleHeader}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title}`}
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
  if (!nutrition?.hasPublishedNutrients) return null;

  const clean = (v) => (v && v !== "N/A" && v !== "Unknown") ? v : null;

  const facts = [
    { label: "Protein", value: clean(nutrition.proteinPercent), qualifier: nutrition.proteinPercent ? nutrition.proteinLevel : null },
    { label: "Fat", value: clean(nutrition.fatPercent), qualifier: nutrition.fatPercent ? nutrition.fatLevel : null },
    { label: "Fiber", value: clean(nutrition.fiberPercent) },
  ].filter((fact) => fact.value != null);

  if (facts.length === 0) return null;

  return (
    <View style={styles.nutritionSection}>
      <Text style={styles.nutritionTitle}>Guaranteed Analysis</Text>
      {facts.map((fact, index) => (
        <View key={fact.label}>
          <View style={styles.nutRow}>
            <NutritionCell {...fact} isLeft />
          </View>
          {index < facts.length - 1 && <View style={styles.nutHorizDivider} />}
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

const COLLAPSED_COUNT = 5;

export function IngredientsSection({ ingredients, onIngredientPress }) {
  const { styles } = useStyles();
  const [expanded, setExpanded] = useState(false);

  if (!ingredients || ingredients.length === 0) return null;

  const good = ingredients.filter((i) => i.rating === "good").length;
  const neutral = ingredients.filter((i) => i.rating === "neutral").length;
  const bad = ingredients.filter((i) => i.rating === "bad").length;
  const total = ingredients.length;

  const segments = [];
  if (good > 0) segments.push({ color: Colors.ingredientGood, opacity: 1, flex: good / total, label: `${good} Good` });
  if (neutral > 0) segments.push({ color: Colors.ingredientNeutral, opacity: 0.4, flex: neutral / total, label: `${neutral} Neutral` });
  if (bad > 0) segments.push({ color: Colors.ingredientBad, opacity: 0.85, flex: bad / total, label: `${bad} Concerning` });

  const canExpand = total > COLLAPSED_COUNT;
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
      <Text style={styles.ingredientsTitle}>{`Ingredients (${total})`}</Text>

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
      {visibleIngredients.map((ing, i) => {
        const isLast = i === visibleIngredients.length - 1 && !canExpand;

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

      {/* Keep long exact lists compact without hiding them behind a paywall. */}
      {canExpand && (
        <TouchableOpacity
          onPress={toggleExpand}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Show fewer ingredients" : `Show all ${total} ingredients`}
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
          style={[
            RNStyleSheet.absoluteFill,
            { backgroundColor: "#000", pointerEvents: "none" },
            backdropAnimStyle,
          ]}
        />
        <Pressable
          style={RNStyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Close ingredient detail"
        />

        {/* Sheet — anchored to bottom */}
        <View style={{ flex: 1, justifyContent: "flex-end", pointerEvents: "box-none" }}>
          <Animated.View
            style={[
              {
                backgroundColor: theme.card,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.08)",
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
                        accessibilityLabel="Unlock ingredient details"
                        accessibilityHint="Opens Woof Pro plans"
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
      accessibilityLabel="Scan another product"
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
    letterSpacing: 0,
  },
  scoreGradeLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0,
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
    letterSpacing: 0,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  statPillValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  watermark: {
    alignItems: "center",
    paddingTop: 16,
  },
  watermarkBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  watermarkText: {
    fontSize: 11,
    fontWeight: "400",
    color: Colors.textTertiary,
  },
  shareLinkText: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: "500",
    color: Colors.textSecondary,
    textAlign: "center",
  },
});

export const ShareCard = forwardRef(function ShareCard({ result, nutrition, shareUrl }, ref) {
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
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
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
        <View style={shareCardStyles.watermarkBrand}>
          <PawPrint size={12} color={Colors.textTertiary} strokeWidth={2} />
          <Text style={shareCardStyles.watermarkText}>Scanned with Woof</Text>
        </View>
        {!!shareUrl && (
          <Text style={shareCardStyles.shareLinkText} numberOfLines={1}>
            Get Woof: {shareUrl}
          </Text>
        )}
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
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
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

function scanPhotoErrorMessage(error, mode) {
  const message = String(error || "").trim();
  const normalized = message.toLowerCase();

  if (normalized.includes("network") || normalized.includes("connection")) {
    return "The connection was interrupted. Check your internet and try again.";
  }
  if (
    normalized.includes("validation")
    || normalized.includes("invalid response")
    || normalized.includes("parse")
  ) {
    if (mode === "ingredient_capture") {
      return "We couldn't read a complete ingredients list from that photo. Retake it in good light with the full list centered.";
    }
    return "We couldn't read enough food details from that photo. Retake it in good light with the food centered.";
  }
  if (message) return message;
  return mode === "ingredient_capture"
    ? "We couldn't read the ingredients list. Retake it in good light with the full list centered."
    : "We couldn't read this photo. Retake it in good light with the food centered.";
}

export function ErrorState({
  error,
  mode,
  isScanLimit,
  onUpgrade,
  onRetry,
  onScanAnother,
  historyScanMode,
}) {
  const { styles, theme } = useStyles();

  // Check if this is a session expiry error
  const isSessionError = error?.includes("Session expired") || error?.includes("session expired");

  const title = isScanLimit
    ? "Free Scans Used"
    : isSessionError
    ? "Session Expired"
    : mode === "history"
    ? "Saved Result Unavailable"
    : mode === "barcode"
    ? "Barcode Not Found"
    : mode === "ingredient_capture"
    ? "Couldn't read ingredients"
    : mode === "human_food"
    ? "Couldn't check this food"
    : "Couldn't analyze this label";

  const buttonLabel = isScanLimit
    ? "Upgrade to Pro"
    : isSessionError
    ? "Sign In Again"
    : mode === "history"
    ? (historyScanMode === "human_food" ? "Scan Food Again" : "Scan Product Again")
    : mode === "barcode"
    ? "Take Photo Instead"
    : mode === "ingredient_capture"
    ? "Try Ingredients Again"
    : mode === "human_food"
    ? "Try Food Again"
    : "Try Again";

  const onPress = isScanLimit
    ? onUpgrade
    : isSessionError
    ? () => {
        // Force sign out when session is expired
        supabase.auth.signOut().catch((err) => {
          logger.debug("[ERROR_STATE] Sign out failed:", err.message);
        });
      }
    : mode === "history" || mode === "barcode"
    ? onScanAnother
    : onRetry;
  const isPhotoRecoveryMode = mode === "human_food" || mode === "ingredient_capture";
  const displayError = isPhotoRecoveryMode && !isScanLimit && !isSessionError
    ? scanPhotoErrorMessage(error, mode)
    : error;

  return (
    <View style={styles.errorContainer}>
      <View style={styles.errorCircle}>
        <AlertCircle size={48} color={theme.textTertiary} strokeWidth={1.5} />
      </View>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorText}>{displayError}</Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
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

// --- Safety Badge (human food mode) ---

export function SafetyBadge({ safetyLevel, petType, petName }) {
  const theme = useTheme();
  const config = {
    safe: { label: "SAFE", sublabel: "to feed", color: Colors.scoreExcellent, bg: "rgba(52,199,89,0.08)", Icon: CheckCircle2 },
    caution: { label: "CAUTION", sublabel: "feed with care", color: Colors.scoreDecent, bg: "rgba(232,163,23,0.08)", Icon: AlertTriangle },
    dangerous: { label: "DANGEROUS", sublabel: "do not feed", color: Colors.scoreConcerning, bg: "rgba(239,68,68,0.08)", Icon: AlertCircle },
  }[safetyLevel] || { label: "UNKNOWN", sublabel: "", color: theme.textTertiary, bg: theme.surface, Icon: AlertCircle };

  const petLabel = petName || (petType === "dog" ? "dogs" : "cats");

  return (
    <View style={{ alignItems: "center", paddingVertical: 28 }}>
      <View style={{
        width: 120, height: 120, borderRadius: 60,
        backgroundColor: config.bg,
        alignItems: "center", justifyContent: "center",
        marginBottom: 16,
      }}>
        <config.Icon size={52} color={config.color} strokeWidth={1.5} />
      </View>
      <Text style={{ fontSize: 32, fontWeight: "800", color: config.color, letterSpacing: 0 }}>
        {config.label}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: "500", color: theme.textTertiary, marginTop: 4, textTransform: "uppercase", letterSpacing: 0 }}>
        {config.sublabel} for {petLabel}
      </Text>
    </View>
  );
}
