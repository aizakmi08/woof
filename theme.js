import { useColorScheme } from "react-native";

// --- Design Tokens ---

export const Colors = {
  // Core surfaces
  background: "#FAFAFA",
  card: "#FFFFFF",
  surface: "#F5F5F5",
  divider: "#F0F0F0",

  // Text
  textPrimary: "#1C1C1E",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",

  // Button
  buttonPrimary: "#1C1C1E",
  buttonText: "#FFFFFF",

  // Score tiers
  scoreExcellent: "#34C759",
  scoreGreat: "#34C759",
  scoreDecent: "#E8A317",
  scoreFair: "#F97316",
  scoreConcerning: "#EF4444",

  // Ingredient quality
  ingredientGood: "#34C759",
  ingredientNeutral: "#9CA3AF",
  ingredientBad: "#EF4444",

  // Semantic
  recallBorder: "rgba(239, 68, 68, 0.25)",
  recallBackground: "#FEF2F2",
  verdictBackground: "#FFFDF7",
  lovedPillBg: "#F0FDF4",
  lovedPillText: "#16A34A",
  watchOutPillBg: "#FEF3C7",
  watchOutPillText: "#D97706",

  // Score tiers — nested for backward compat
  score: {
    excellent: "#34C759",
    good: "#34C759",
    decent: "#E8A317",
    poor: "#F97316",
    bad: "#EF4444",
  },

  // Semantic accent
  blue: "#007AFF",
  amber: "#FF9500",

  // Light palette
  light: {
    bg: "#FAFAFA",
    card: "#FFFFFF",
    surface: "#F5F5F5",
    textPrimary: "#1C1C1E",
    textSecondary: "#6B7280",
    textTertiary: "#9CA3AF",
    separator: "#F0F0F0",
    fill: "rgba(0,0,0,0.04)",
    fillSecondary: "rgba(0,0,0,0.08)",
    statusBar: "dark",
  },

  // Dark palette
  dark: {
    bg: "#1C1C1E",
    card: "#2C2C2E",
    surface: "#3A3A3C",
    textPrimary: "#F5F5F5",
    textSecondary: "#8E8E93",
    textTertiary: "#48484A",
    separator: "#3A3A3C",
    fill: "rgba(255,255,255,0.06)",
    fillSecondary: "rgba(255,255,255,0.10)",
    statusBar: "light",
  },
};

export const Typography = {
  screenTitle: { fontSize: 34, fontWeight: "700", letterSpacing: -0.5 },
  sectionHeader: { fontSize: 22, fontWeight: "600", letterSpacing: -0.3 },
  cardTitle: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 15, fontWeight: "400", lineHeight: 22 },
  bodySecondary: { fontSize: 15, fontWeight: "400", lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: "400" },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase" },
  scoreLarge: { fontSize: 48, fontWeight: "700", letterSpacing: -1 },
  scoreLabel: { fontSize: 13, fontWeight: "600", letterSpacing: 2, textTransform: "uppercase" },
  statValue: { fontSize: 16, fontWeight: "600" },
  statLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" },
  button: { fontSize: 17, fontWeight: "600", letterSpacing: 0.5 },

  // Legacy aliases (used in ResultsScreen styles)
  bodyBold: { fontSize: 15, fontWeight: "600", lineHeight: 22 },
  captionBold: { fontSize: 13, fontWeight: "600" },
  smallLabel: { fontSize: 10, fontWeight: "700" },
  score: { fontSize: 48, fontWeight: "700", letterSpacing: -1 },
};

export const Spacing = {
  // 4px base grid (used in other screens)
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,

  // Design system semantic tokens
  screenPadding: 20,
  sectionGap: 36,
  subsectionGap: 24,
  elementGap: 12,
  cardPadding: 16,
  cardGap: 12,
  rowHeight: 72,
  buttonHeight: 54,
  buttonRadius: 14,
  cardRadius: 14,
  dividerIndent: 20,

  // Legacy aliases (used in other screens)
  section: 20,
  screenH: 24,
  cardPad: 20,
  radius: 16,
  radiusSm: 12,
};

export const Shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  button: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  scoreGlow: (color) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 40,
    elevation: 0,
  }),
};

export const Animation = {
  spring: {
    default: { damping: 15, stiffness: 150 },
    snappy: { damping: 20, stiffness: 300 },
    gentle: { damping: 28, stiffness: 180 },
    bouncy: { damping: 12, stiffness: 400 },
  },
};

// --- Score Config ---

export function getScoreConfig(score) {
  if (score >= 85) return { label: "EXCELLENT", color: Colors.scoreExcellent, bg: "rgba(52,199,89,0.08)" };
  if (score >= 70) return { label: "GOOD", color: Colors.scoreGreat, bg: "rgba(52,199,89,0.08)" };
  if (score >= 50) return { label: "AVERAGE", color: Colors.scoreDecent, bg: "rgba(232,163,23,0.08)" };
  if (score >= 30) return { label: "BELOW AVERAGE", color: Colors.scoreFair, bg: "rgba(249,115,22,0.08)" };
  return { label: "POOR", color: Colors.scoreConcerning, bg: "rgba(239,68,68,0.08)" };
}

// --- Theme Hook ---

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const palette = isDark ? Colors.dark : Colors.light;
  return {
    ...palette,
    blue: Colors.blue,
    amber: Colors.amber,
    green: Colors.scoreExcellent,
    red: Colors.scoreConcerning,
    buttonPrimary: isDark ? "#F5F5F5" : Colors.buttonPrimary,
    buttonText: isDark ? "#1C1C1E" : Colors.buttonText,
  };
}

// Legacy compat
export const getGrade = getScoreConfig;
