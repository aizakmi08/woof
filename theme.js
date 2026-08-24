import { useColorScheme } from "react-native";

// --- Design Tokens ---

export const Colors = {
  // Woof brand. The live mark is black with a green verification check.
  brandMidnight: "#111111",
  brandApricot: "#666662",
  brandMint: "#64D161",
  brandIvory: "#F7F7F4",

  // Core surfaces
  background: "#F7F7F4",
  card: "#FFFFFF",
  surface: "#EFEFEB",
  divider: "#DEDED8",

  // Text
  textPrimary: "#111111",
  textSecondary: "#51514D",
  textTertiary: "#7A7A73",

  // Button
  buttonPrimary: "#111111",
  buttonText: "#FFFFFF",

  // Score tiers
  scoreExcellent: "#2F8F5B",
  scoreGreat: "#2F8F5B",
  scoreDecent: "#D8941C",
  scoreFair: "#D96A32",
  scoreConcerning: "#C74A46",

  // Ingredient quality
  ingredientGood: "#2F8F5B",
  ingredientNeutral: "#9CA3AF",
  ingredientBad: "#C74A46",

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
    excellent: "#2F8F5B",
    good: "#2F8F5B",
    decent: "#D8941C",
    poor: "#D96A32",
    bad: "#C74A46",
  },

  // Semantic accent
  blue: "#007AFF",
  amber: "#FF9500",

  // Light palette
  light: {
    bg: "#F7F7F4",
    card: "#FFFFFF",
    surface: "#EFEFEB",
    textPrimary: "#111111",
    textSecondary: "#51514D",
    textTertiary: "#7A7A73",
    separator: "#DEDED8",
    fill: "rgba(17,17,17,0.045)",
    fillSecondary: "rgba(17,17,17,0.085)",
    statusBar: "dark",
  },

  // Dark palette
  dark: {
    bg: "#0E0E0D",
    card: "#171716",
    surface: "#20201F",
    textPrimary: "#F7F7F4",
    textSecondary: "#B7B7B0",
    textTertiary: "#8A8A83",
    separator: "#30302E",
    fill: "rgba(255,255,255,0.055)",
    fillSecondary: "rgba(255,255,255,0.10)",
    statusBar: "light",
  },
};

export const Typography = {
  screenTitle: { fontSize: 32, fontWeight: "700", letterSpacing: 0 },
  sectionHeader: { fontSize: 20, fontWeight: "700", letterSpacing: 0 },
  cardTitle: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 15, fontWeight: "400", lineHeight: 22 },
  bodySecondary: { fontSize: 15, fontWeight: "400", lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: "400" },
  label: { fontSize: 12, fontWeight: "600", letterSpacing: 0 },
  scoreLarge: { fontSize: 48, fontWeight: "700", letterSpacing: 0 },
  scoreLabel: { fontSize: 13, fontWeight: "600", letterSpacing: 0, textTransform: "uppercase" },
  statValue: { fontSize: 16, fontWeight: "600" },
  statLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0, textTransform: "uppercase" },
  button: { fontSize: 16, fontWeight: "600", letterSpacing: 0 },

  // Legacy aliases (used in ResultsScreen styles)
  bodyBold: { fontSize: 15, fontWeight: "600", lineHeight: 22 },
  captionBold: { fontSize: 13, fontWeight: "600" },
  smallLabel: { fontSize: 10, fontWeight: "700" },
  score: { fontSize: 48, fontWeight: "700", letterSpacing: 0 },
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
  sectionGap: 28,
  subsectionGap: 24,
  elementGap: 12,
  cardPadding: 16,
  cardGap: 12,
  rowHeight: 72,
  buttonHeight: 56,
  buttonRadius: 14,
  cardRadius: 16,
  dividerIndent: 20,

  // Legacy aliases (used in other screens)
  section: 20,
  screenH: 24,
  cardPad: 20,
  radius: 18,
  radiusSm: 12,
};

export const Shadows = {
  card: {
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.045)",
  },
  button: {
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.14)",
  },
  scoreGlow: (color) => ({ boxShadow: `0 0 40px ${color}14` }),
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
  if (score >= 85) return { label: "EXCELLENT", color: Colors.scoreExcellent, bg: "rgba(47,143,91,0.08)" };
  if (score >= 70) return { label: "GOOD", color: Colors.scoreGreat, bg: "rgba(47,143,91,0.08)" };
  if (score >= 50) return { label: "AVERAGE", color: Colors.scoreDecent, bg: "rgba(216,148,28,0.08)" };
  if (score >= 30) return { label: "BELOW AVERAGE", color: Colors.scoreFair, bg: "rgba(217,106,50,0.08)" };
  return { label: "POOR", color: Colors.scoreConcerning, bg: "rgba(199,74,70,0.08)" };
}

// --- Theme Hook ---

function buildTheme(isDark) {
  const palette = isDark ? Colors.dark : Colors.light;
  return Object.freeze({
    ...palette,
    blue: Colors.blue,
    amber: Colors.amber,
    green: Colors.scoreExcellent,
    red: Colors.scoreConcerning,
    brandMidnight: Colors.brandMidnight,
    brandApricot: Colors.brandApricot,
    brandMint: Colors.brandMint,
    brandIvory: Colors.brandIvory,
    dangerSurface: isDark ? "rgba(199,74,70,0.22)" : "rgba(199,74,70,0.10)",
    cautionSurface: isDark ? "rgba(216,148,28,0.20)" : "rgba(216,148,28,0.10)",
    successSurface: isDark ? "rgba(47,143,91,0.20)" : "rgba(47,143,91,0.10)",
    skeletonShimmer: isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.58)",
    buttonPrimary: isDark ? "#F5F5F5" : Colors.buttonPrimary,
    buttonText: isDark ? "#1C1C1E" : Colors.buttonText,
  });
}

const LIGHT_THEME = buildTheme(false);
const DARK_THEME = buildTheme(true);

export function useTheme() {
  const scheme = useColorScheme();
  return scheme === "dark" ? DARK_THEME : LIGHT_THEME;
}

// Legacy compat
export const getGrade = getScoreConfig;
