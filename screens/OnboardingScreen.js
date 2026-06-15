import { useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  FlatList,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import {
  Camera,
  Search,
  Heart,
  ChevronRight,
  Check,
  ArrowRight,
  Type,
  PawPrint,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, Colors, Spacing, Shadows } from "../theme";

const ONBOARDING_KEY = "@woof_onboarding_complete";

// ── Image assets ─────────────────────────────────────────────────────
const IMG = {
  bag: require("../assets/onboarding/scan-bag.png"),
  grapes: require("../assets/onboarding/safety-grapes.png"),
  banana: require("../assets/onboarding/safety-banana.png"),
};

// Deep, sophisticated green used for the step labels + accents. Pulled from
// the Paper palette so the app visuals match the onboarding design comps.
const ACCENT = "#1F7A45";
const AVOID = "#C94E3B";

// ═══════════════════════════════════════════════════════════════════
// Screen 1 — Welcome
// ═══════════════════════════════════════════════════════════════════

function WelcomePage({ theme }) {
  return (
    <View style={styles.pageInner}>
      {/* Brand mark */}
      <View style={styles.brandRow}>
        <View style={[styles.brandIcon, { backgroundColor: theme.textPrimary }]}>
          <PawPrint size={18} color={theme.bg} strokeWidth={2.2} />
        </View>
        <Text style={[styles.brandName, { color: theme.textPrimary }]}>Woof</Text>
      </View>

      {/* Headline block */}
      <Text style={[styles.stepLabel, { color: ACCENT }]}>WELCOME</Text>
      <Text style={[styles.displayHeadline, { color: theme.textPrimary }]}>
        Know what's in{"\n"}your pet's bowl.
      </Text>
        <Text style={[styles.bodyCopy, { color: theme.textSecondary }]}>
          Woof rates every ingredient in your dog or cat's food — and tells you what's actually safe to share from your plate.
        </Text>
        <Text style={[styles.bodyCopy, { color: theme.textTertiary }]}>
          AI estimates are informational and are not veterinary advice.
        </Text>

      {/* Made for dogs & cats pill */}
      <View style={[styles.petBadge, { backgroundColor: theme.card }, Shadows.card]}>
        <Text style={[styles.petBadgeText, { color: theme.textPrimary }]}>
          🐕  🐈  Made for dogs & cats
        </Text>
      </View>

      {/* Three-way preview cards */}
      <View style={styles.waysList}>
        <WayCard
          theme={theme}
          Icon={Camera}
          title="Scan the bag"
          subtitle="Point, shoot, get a score in seconds."
        />
        <WayCard
          theme={theme}
          Icon={Search}
          title="Search the catalog"
          subtitle="Type a brand — 9,000+ products indexed."
        />
        <WayCard
          theme={theme}
          Icon={Heart}
          title="Check human food"
          subtitle="Can they eat that strawberry? Find out."
        />
      </View>
    </View>
  );
}

function WayCard({ theme, Icon, title, subtitle }) {
  return (
    <View style={[styles.wayCard, { backgroundColor: theme.card }, Shadows.card]}>
      <View style={[styles.wayIcon, { backgroundColor: theme.surface }]}>
        <Icon size={20} color={theme.textPrimary} strokeWidth={1.8} />
      </View>
      <View style={styles.wayText}>
        <Text style={[styles.wayTitle, { color: theme.textPrimary }]}>{title}</Text>
        <Text style={[styles.waySubtitle, { color: theme.textSecondary }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={14} color={theme.textTertiary} strokeWidth={2.2} />
    </View>
  );
}

// Small SVG score ring used in the Scan preview card
function MiniScore({ score, theme }) {
  const size = 50;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(1, score / 100));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.divider} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ACCENT}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * progress} ${c}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={{ fontSize: 16, fontWeight: "800", letterSpacing: -0.4, color: theme.textPrimary }}>
        {score}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Screen 2 — Scan
// ═══════════════════════════════════════════════════════════════════

function ScanPage({ theme }) {
  return (
    <View style={styles.pageInner}>
      {/* Scanner mock with bag + corners */}
      <View style={styles.scannerMock}>
        <Image source={IMG.bag} style={styles.scannerBag} resizeMode="contain" accessible={false} accessibilityElementsHidden />
        <View style={[styles.scanCorner, styles.scanCornerTL, { borderColor: ACCENT }]} />
        <View style={[styles.scanCorner, styles.scanCornerTR, { borderColor: ACCENT }]} />
        <View style={[styles.scanCorner, styles.scanCornerBL, { borderColor: ACCENT }]} />
        <View style={[styles.scanCorner, styles.scanCornerBR, { borderColor: ACCENT }]} />
      </View>

      {/* Result preview card */}
      <View style={[styles.resultCard, { backgroundColor: theme.card }, Shadows.card]}>
        <MiniScore score={78} theme={theme} />
        <View style={styles.resultTextBlock}>
          <Text style={[styles.resultTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            Canidae All Life Stages
          </Text>
          <Text style={[styles.resultMeta, { color: theme.textSecondary }]}>
            Good · 51 ingredients analyzed
          </Text>
        </View>
      </View>

      {/* Copy */}
      <View style={styles.copyBlock}>
        <Text style={[styles.stepLabel, { color: ACCENT }]}>STEP 1 · SCAN</Text>
        <Text style={[styles.headlineMedium, { color: theme.textPrimary }]}>
          Point at the bag.{"\n"}That's it.
        </Text>
        <Text style={[styles.bodyCopy, { color: theme.textSecondary }]}>
          Make sure the <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>brand, product name, and flavor</Text> are all visible. We'll identify the product and pull its real ingredient list from our database.
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Screen 3 — Search
// ═══════════════════════════════════════════════════════════════════

function SearchPage({ theme }) {
  return (
    <View style={styles.pageInner}>
      {/* Search bar mock */}
      <View style={[styles.searchBarMock, { backgroundColor: theme.card, borderColor: theme.textPrimary }, Shadows.card]}>
        <Search size={16} color={theme.textTertiary} strokeWidth={2} style={{ marginRight: 10 }} />
        <Text style={[styles.searchBarText, { color: theme.textPrimary }]}>blue buffalo</Text>
        <View style={[styles.searchCursor, { backgroundColor: ACCENT }]} />
      </View>

      {/* Results card */}
      <View style={[styles.resultsCard, { backgroundColor: theme.card }, Shadows.card]}>
        <SearchRow theme={theme} title="Life Protection Formula — Chicken" brand="Blue Buffalo" ingredients={42} verified />
        <View style={[styles.resultsDivider, { backgroundColor: theme.divider }]} />
        <SearchRow theme={theme} title="Wilderness — Salmon Recipe" brand="Blue Buffalo" ingredients={38} verified />
        <View style={[styles.resultsDivider, { backgroundColor: theme.divider }]} />
        <SearchRow theme={theme} title="Basics — Limited Ingredient Turkey" brand="Blue Buffalo" ingredients={28} />
      </View>

      {/* Copy */}
      <View style={styles.copyBlock}>
        <Text style={[styles.stepLabel, { color: ACCENT }]}>STEP 2 · SEARCH</Text>
        <Text style={[styles.headlineMedium, { color: theme.textPrimary }]}>
          Don't have{"\n"}the bag? Search.
        </Text>
        <Text style={[styles.bodyCopy, { color: theme.textSecondary }]}>
          Type a brand or product name. We've indexed <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>9,000+ pet food recipes</Text> with source labels — the score appears instantly.
        </Text>
      </View>
    </View>
  );
}

function SearchRow({ theme, title, brand, ingredients, verified }) {
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchBrandMark}>
        <Text style={styles.searchBrandMarkText}>BB</Text>
      </View>
      <View style={styles.searchRowContent}>
        <Text style={[styles.searchRowTitle, { color: theme.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.searchRowMetaRow}>
          <Text style={[styles.searchRowMeta, { color: theme.textSecondary }]}>{brand}</Text>
          <View style={[styles.searchRowDot, { backgroundColor: theme.textTertiary }]} />
          <Text style={[styles.searchRowMeta, { color: theme.textTertiary }]}>
            {ingredients} ingredients
          </Text>
          {verified ? (
            <View style={[styles.verifiedPill, { backgroundColor: theme.surface }]}>
              <Text style={[styles.verifiedPillText, { color: theme.textSecondary }]}>verified</Text>
            </View>
          ) : null}
        </View>
      </View>
      <ChevronRight size={14} color={theme.textTertiary} strokeWidth={2.2} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Screen 4 — Is This Safe? (photo OR text)
// ═══════════════════════════════════════════════════════════════════

function SafetyPage({ theme }) {
  return (
    <View style={styles.pageInner}>
      {/* Option A — Photo */}
      <View style={[styles.safetyOption, { backgroundColor: theme.card }, Shadows.card]}>
        <View style={styles.safetyOptionHeader}>
          <View style={[styles.safetyOptionIcon, { backgroundColor: theme.textPrimary }]}>
            <Camera size={14} color={theme.bg} strokeWidth={2} />
          </View>
          <Text style={[styles.safetyOptionLabel, { color: theme.textPrimary }]}>
            SNAP A PHOTO
          </Text>
        </View>
        <View style={styles.safetyOptionBody}>
          <Image source={IMG.grapes} style={styles.safetyFoodImage} resizeMode="contain" accessible={false} accessibilityElementsHidden />
          <View style={styles.safetyOptionText}>
            <Text style={[styles.safetyFoodName, { color: theme.textPrimary }]}>Grapes</Text>
            <View style={styles.safetyStatusRow}>
              <View style={[styles.safetyStatusDot, { backgroundColor: AVOID }]} />
              <Text style={[styles.safetyStatusText, { color: AVOID }]}>Toxic for dogs</Text>
            </View>
          </View>
        </View>
      </View>

      {/* OR divider */}
      <View style={styles.orRow}>
        <View style={[styles.orLine, { backgroundColor: theme.divider }]} />
        <Text style={[styles.orText, { color: theme.textTertiary }]}>OR</Text>
        <View style={[styles.orLine, { backgroundColor: theme.divider }]} />
      </View>

      {/* Option B — Text */}
      <View style={[styles.safetyOption, { backgroundColor: theme.card }, Shadows.card]}>
        <View style={styles.safetyOptionHeader}>
          <View style={[styles.safetyOptionIcon, { backgroundColor: theme.textPrimary }]}>
            <Type size={14} color={theme.bg} strokeWidth={2} />
          </View>
          <Text style={[styles.safetyOptionLabel, { color: theme.textPrimary }]}>
            TYPE THE FOOD
          </Text>
        </View>
        <View style={[styles.safetyTextInput, { backgroundColor: theme.bg, borderColor: theme.textPrimary }]}>
          <Search size={14} color={theme.textTertiary} strokeWidth={2} style={{ marginRight: 10 }} />
          <Text style={[styles.safetyTextInputText, { color: theme.textPrimary }]}>banana</Text>
          <View style={[styles.searchCursor, { backgroundColor: ACCENT }]} />
        </View>
        <View style={styles.safetyResultRow}>
          <View style={[styles.safetyResultIcon, { backgroundColor: "#E4F0E8" }]}>
            <Check size={16} color={ACCENT} strokeWidth={2.4} />
          </View>
          <View style={styles.safetyOptionText}>
            <Text style={[styles.safetyFoodName, { color: theme.textPrimary }]}>Safe in moderation</Text>
            <Text style={[styles.safetyResultBody, { color: theme.textSecondary }]}>
              Plain banana is safe — rich in potassium. Small pieces only.
            </Text>
          </View>
        </View>
      </View>

      {/* Copy */}
      <View style={styles.copyBlock}>
        <Text style={[styles.stepLabel, { color: ACCENT }]}>STEP 3 · IS THIS SAFE?</Text>
        <Text style={[styles.headlineMedium, { color: theme.textPrimary }]}>
          Can my pet{"\n"}eat that?
        </Text>
        <Text style={[styles.bodyCopy, { color: theme.textSecondary }]}>
          <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>Snap a photo</Text> of anything on your plate — or just <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>type the name</Text>. Instant verdict with portion guidance.
        </Text>
        <Text style={[styles.bodyCopy, { color: theme.textTertiary }]}>
          For ingestion concerns, contact your veterinarian or pet poison control.
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Pagination dots
// ═══════════════════════════════════════════════════════════════════

function PageDots({ count, current, theme }) {
  return (
    <View
      style={styles.dotsRow}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${count}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current && styles.dotActive,
            { backgroundColor: i === current ? theme.textPrimary : theme.divider },
          ]}
        />
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Pages config
// ═══════════════════════════════════════════════════════════════════

const PAGES = [
  { key: "welcome", Component: WelcomePage, button: "Continue", showSkip: true },
  { key: "scan", Component: ScanPage, button: "Continue", showSkip: true },
  { key: "search", Component: SearchPage, button: "Continue", showSkip: true },
  { key: "safety", Component: SafetyPage, button: "Get Started", showSkip: false, withArrow: true },
];

// ═══════════════════════════════════════════════════════════════════
// Main screen
// ═══════════════════════════════════════════════════════════════════

export default function OnboardingScreen({ onComplete }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleSkip = useCallback(() => {
    Haptics.selectionAsync();
    AsyncStorage.setItem(ONBOARDING_KEY, "true").catch(() => {});
    onComplete();
  }, [onComplete]);

  const handleNext = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentIndex < PAGES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      await AsyncStorage.setItem(ONBOARDING_KEY, "true").catch(() => {});
      onComplete();
    }
  }, [currentIndex, onComplete]);

  const renderPage = useCallback(
    ({ item }) => (
      <View style={[styles.page, { width }]}>
        <item.Component theme={theme} />
      </View>
    ),
    [width, theme]
  );

  const currentPage = PAGES[currentIndex] || PAGES[0];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Skip button — hidden on final page */}
      <View style={styles.skipContainer}>
        {currentPage.showSkip ? (
          <Pressable onPress={handleSkip} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })} accessibilityRole="button">
            <Text style={[styles.skipText, { color: theme.textSecondary }]}>Skip</Text>
          </Pressable>
        ) : (
          <View style={{ height: 22 }} />
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={PAGES}
        keyExtractor={(item) => item.key}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />

      {/* Bottom: dots + CTA */}
      <View style={styles.bottomArea}>
        <PageDots count={PAGES.length} current={currentIndex} theme={theme} />
        <Pressable
          onPress={handleNext}
          onPressIn={() => { btnScale.value = withSpring(0.97, { damping: 15, stiffness: 150 }); }}
          onPressOut={() => { btnScale.value = withSpring(1, { damping: 15, stiffness: 150 }); }}
          accessibilityRole="button"
          accessibilityLabel={currentPage.button}
        >
          <Animated.View
            style={[styles.ctaButton, { backgroundColor: theme.buttonPrimary }, Shadows.button, btnStyle]}
          >
            <Animated.Text
              key={currentPage.button}
              entering={FadeIn.duration(200)}
              style={[styles.ctaText, { color: theme.buttonText }]}
            >
              {currentPage.button}
            </Animated.Text>
            {currentPage.withArrow ? (
              <ArrowRight size={18} color={theme.buttonText} strokeWidth={2.2} style={{ marginLeft: 8 }} />
            ) : null}
          </Animated.View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export { ONBOARDING_KEY };

// ═══════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Skip row
  skipContainer: {
    alignItems: "flex-end",
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 4,
    height: 32,
  },
  skipText: { fontSize: 15, fontWeight: "500" },

  // Page container
  page: { flex: 1 },
  pageInner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 12,
    justifyContent: "flex-start",
  },

  // Brand mark (welcome)
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 32,
  },
  brandIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  brandName: { fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },

  // Step label (tiny uppercase label above headlines)
  stepLabel: {
    fontSize: 12, fontWeight: "600",
    letterSpacing: 1.4, marginBottom: 14,
  },

  // Headlines
  displayHeadline: {
    fontSize: 34, fontWeight: "800",
    letterSpacing: -0.8, lineHeight: 40,
    marginBottom: 14,
  },
  headlineMedium: {
    fontSize: 30, fontWeight: "800",
    letterSpacing: -0.7, lineHeight: 34,
    marginBottom: 14,
  },
  bodyCopy: {
    fontSize: 15, fontWeight: "400",
    lineHeight: 22, maxWidth: 340,
  },

  // "Made for dogs & cats" pill
  petBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
    marginTop: 20,
  },
  petBadgeText: {
    fontSize: 13, fontWeight: "600", letterSpacing: -0.1,
  },

  // Welcome three-way cards
  waysList: {
    gap: 12,
    marginTop: 24,
  },
  wayCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 14,
  },
  wayIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  wayText: { flex: 1, minWidth: 0, gap: 3 },
  wayTitle: { fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },
  waySubtitle: { fontSize: 13, fontWeight: "400", lineHeight: 18 },

  // Copy block (used on screens 2-4)
  copyBlock: {
    marginTop: 24,
  },

  // Scanner mock (screen 2)
  scannerMock: {
    alignSelf: "center",
    width: 240, height: 280,
    backgroundColor: "#1C1A17",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  scannerBag: { width: 160, height: 180 },
  scanCorner: {
    position: "absolute",
    width: 28, height: 28,
  },
  scanCornerTL: {
    top: 20, left: 20,
    borderTopWidth: 3, borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  scanCornerTR: {
    top: 20, right: 20,
    borderTopWidth: 3, borderRightWidth: 3,
    borderTopRightRadius: 6,
  },
  scanCornerBL: {
    bottom: 20, left: 20,
    borderBottomWidth: 3, borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  scanCornerBR: {
    bottom: 20, right: 20,
    borderBottomWidth: 3, borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },

  // Result preview card (screen 2)
  resultCard: {
    alignSelf: "center",
    width: 320,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 14,
  },
  resultTextBlock: { flex: 1, minWidth: 0, gap: 3 },
  resultTitle: { fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
  resultMeta: { fontSize: 12, fontWeight: "400" },

  // Search bar mock (screen 3)
  searchBarMock: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  searchBarText: { fontSize: 15, fontWeight: "500", flex: 1 },
  searchCursor: {
    width: 2, height: 18,
    borderRadius: 1,
  },

  // Search results (screen 3)
  resultsCard: {
    borderRadius: 14,
    overflow: "hidden",
  },
  resultsDivider: { height: StyleSheet.hairlineWidth },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  searchBrandMark: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: "#2E6FB5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  searchBrandMarkText: {
    color: "#FFFFFF", fontSize: 10, fontWeight: "800",
    letterSpacing: 0.5,
  },
  searchRowContent: { flex: 1, minWidth: 0, gap: 2 },
  searchRowTitle: { fontSize: 14, fontWeight: "600", letterSpacing: -0.2 },
  searchRowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  searchRowMeta: { fontSize: 11, fontWeight: "500" },
  searchRowDot: {
    width: 2, height: 2, borderRadius: 1,
    opacity: 0.7,
  },
  verifiedPill: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  verifiedPillText: {
    fontSize: 9, fontWeight: "600", letterSpacing: 0.3,
  },

  // Safety options (screen 4)
  safetyOption: {
    padding: 16,
    borderRadius: 18,
  },
  safetyOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  safetyOptionIcon: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  safetyOptionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.8,
  },
  safetyOptionBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 4,
  },
  safetyFoodImage: { width: 48, height: 48 },
  safetyOptionText: { flex: 1, minWidth: 0, gap: 4 },
  safetyFoodName: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  safetyStatusRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  safetyStatusDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  safetyStatusText: { fontSize: 12, fontWeight: "600" },

  // OR divider
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 12,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontSize: 11, fontWeight: "600", letterSpacing: 1.4 },

  // Safety text input mock
  safetyTextInput: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  safetyTextInputText: { fontSize: 13, fontWeight: "500", flex: 1 },

  // Safety result row (inside type option)
  safetyResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 4,
  },
  safetyResultIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  safetyResultBody: { fontSize: 12, fontWeight: "400", lineHeight: 16 },

  // Bottom area (dots + CTA)
  bottomArea: {
    paddingHorizontal: 28,
    paddingBottom: 24,
    gap: 20,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
  },
  dotActive: {
    width: 20,
  },

  ctaButton: {
    flexDirection: "row",
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  ctaText: {
    fontSize: 17, fontWeight: "600", letterSpacing: -0.1,
  },
});
