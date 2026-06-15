import { useColorScheme } from "react-native";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_STORAGE_KEY = "@woof_theme_preference";

// --- Design Tokens ---

export const Colors = {
  // Core surfaces
  background: "#F5F4F0",
  card: "#FFFFFF",
  surface: "#EEECEA",
  divider: "rgba(60,60,67,0.09)",

  // Text
  textPrimary: "#1C1C1E",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",

  // Button
  buttonPrimary: "#1C1C1E",
  buttonText: "#FFFFFF",

  // Score tiers
  scoreExcellent: "#30D158",
  scoreGreat: "#30D158",
  scoreDecent: "#FF9F0A",
  scoreFair: "#FF9F0A",
  scoreConcerning: "#FF453A",

  // Ingredient quality
  ingredientGood: "#30D158",
  ingredientNeutral: "#9CA3AF",
  ingredientBad: "#FF453A",

  // Semantic
  recallBorder: "rgba(239, 68, 68, 0.25)",
  recallBackground: "#FEF2F2",
  verdictBackground: "#F0FDF4",
  lovedPillBg: "#F0FDF4",
  lovedPillText: "#30D158",
  watchOutPillBg: "rgba(255,159,10,0.1)",
  watchOutPillText: "#FF9F0A",

  // Score tiers — nested for backward compat
  score: {
    excellent: "#30D158",
    good: "#30D158",
    decent: "#FF9F0A",
    poor: "#FF9F0A",
    bad: "#FF453A",
  },

  // Semantic accent
  blue: "#007AFF",
  amber: "#FF9500",

  // Light palette
  light: {
    bg: "#F5F4F0",
    card: "#FFFFFF",
    surface: "#EEECEA",
    textPrimary: "#1C1C1E",
    textSecondary: "rgba(60,60,67,0.6)",
    textTertiary: "rgba(60,60,67,0.3)",
    separator: "rgba(60,60,67,0.10)",
    fill: "rgba(0,0,0,0.04)",
    fillSecondary: "rgba(0,0,0,0.08)",
    statusBar: "dark",
  },

  // Dark palette
  dark: {
    bg: "#121214",
    card: "#1C1C1E",
    surface: "#2C2C2E",
    textPrimary: "#F5F5F5",
    textSecondary: "#98989F",
    textTertiary: "#636366",
    separator: "rgba(255,255,255,0.08)",
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
    shadowColor: "#3C3C43",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  cardSubtle: {
    shadowColor: "#3C3C43",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  button: {
    shadowColor: "#3C3C43",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
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
  if (score >= 85) return { label: "Excellent", color: Colors.scoreExcellent, bg: "rgba(52,199,89,0.08)" };
  if (score >= 70) return { label: "Good", color: Colors.scoreGreat, bg: "rgba(52,199,89,0.08)" };
  if (score >= 50) return { label: "Average", color: Colors.scoreDecent, bg: "rgba(232,163,23,0.08)" };
  if (score >= 30) return { label: "Fair", color: Colors.scoreFair, bg: "rgba(249,115,22,0.08)" };
  return { label: "Poor", color: Colors.scoreConcerning, bg: "rgba(239,68,68,0.08)" };
}

// --- Theme Context ---

const ThemeContext = createContext(null);

// "system" | "light" | "dark"
export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let resolved = false;
    // 2s timeout so a slow disk doesn't keep `loaded` false forever (which would
    // block downstream consumers waiting on the theme to settle).
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      setLoaded(true);
    }, 2000);
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((val) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (val === "light" || val === "dark") setPreference(val);
        setLoaded(true);
      })
      .catch(() => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        setLoaded(true);
      });
  }, []);

  const setThemePreference = useCallback((pref) => {
    setPreference(pref);
    if (pref === "system") {
      AsyncStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
    }
  }, []);

  const resolvedScheme = preference === "system" ? systemScheme : preference;
  const isDark = resolvedScheme === "dark";
  const palette = isDark ? Colors.dark : Colors.light;

  const theme = {
    ...palette,
    blue: Colors.blue,
    amber: Colors.amber,
    green: Colors.scoreExcellent,
    red: Colors.scoreConcerning,
    buttonPrimary: isDark ? "#F5F5F5" : Colors.buttonPrimary,
    buttonText: isDark ? "#1C1C1E" : Colors.buttonText,
    isDark,
    preference,
    setThemePreference,
  };

  // Don't render until preference is loaded to avoid flash
  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

// --- Theme Hook ---

export function useTheme() {
  const ctx = useContext(ThemeContext);
  // Fallback for components rendered outside ThemeProvider (e.g. ErrorBoundary, Onboarding)
  const systemScheme = useColorScheme();
  if (ctx) return ctx;
  const isDark = systemScheme === "dark";
  const palette = isDark ? Colors.dark : Colors.light;
  return {
    ...palette,
    blue: Colors.blue,
    amber: Colors.amber,
    green: Colors.scoreExcellent,
    red: Colors.scoreConcerning,
    buttonPrimary: isDark ? "#F5F5F5" : Colors.buttonPrimary,
    buttonText: isDark ? "#1C1C1E" : Colors.buttonText,
    isDark,
    preference: "system",
    setThemePreference: () => {},
  };
}

// Legacy compat
export const getGrade = getScoreConfig;
