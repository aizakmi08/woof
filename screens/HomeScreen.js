import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Image,
  FlatList,
  TouchableHighlight,
  Pressable,
  Alert,
  RefreshControl,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppText as Text, AppTextInput as TextInput } from "../components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { User, Shield, X, Utensils, Dog, Cat } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useFocusEffect } from "@react-navigation/native";
import { Camera, ChevronRight, ScanLine, Search } from "lucide-react-native";
import { getHistory, clearHistory } from "../services/history";
import { useAuth } from "../services/auth";
import * as analysisService from "../services/analysisService";
import { trackEvent } from "../services/analytics";
import { createLogger } from "../services/logger";
import { useTheme, getScoreConfig, Colors, Spacing, Shadows } from "../theme";
import * as Haptics from "expo-haptics";
import { hasUsablePetProfile, normalizePetProfile } from "../services/petProfile";
import { BrandLogo } from "../components/BrandLogo";
import { BRAND_NAME, BRAND_PRO_NAME, BRAND_TAGLINE } from "../config/brand";
import { requestCatalogEvidenceConsent } from "../services/catalogEvidenceConsent";
import {
  getPendingCatalogContributions,
  removePendingCatalogContribution,
} from "../services/catalogContributions";
import { findVerifiedCatalogProductForLookup } from "../services/productCatalog";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const logger = createLogger("HOME");

// --- Relative time ---

function relativeDate(dateString) {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

// --- Mini Score Ring (36px, staggered fill) ---

function MiniScoreRing({ score, delay = 0 }) {
  const theme = useTheme();
  const size = 36;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = getScoreConfig(score).color;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(score / 100, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [score, delay]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.separator}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringLabel}>
        <Text style={[styles.ringScore, { color }]}>{score}</Text>
      </View>
    </View>
  );
}

// --- Safety color for human food entries ---

function safetyColor(level) {
  if (level === "safe") return Colors.scoreExcellent;
  if (level === "caution") return Colors.scoreDecent;
  if (level === "dangerous") return Colors.scoreConcerning;
  return Colors.textTertiary;
}

function safetyLabel(level) {
  if (level === "safe") return "safe";
  if (level === "caution") return "caution";
  if (level === "dangerous") return "dangerous";
  return "unknown safety";
}

function getHistoryAccessibilityLabel(item) {
  const name = historyDisplayName(item);
  if (item.overallScore == null && item.scanMode === "human_food") {
    return `${name}, ${safetyLabel(item.safetyLevel)} for ${item.petType || "your pet"}`;
  }
  return `${name}, score ${item.overallScore} out of 100`;
}

function historyDisplayName(item) {
  const rawName = item?.productName || item?.foodName || "Scan result";
  return String(rawName)
    .replace(/\s+Other(?=\s+\d+(?:\.\d+)?\s*(?:lb|oz|kg|g|ct)\b)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isComparableHistoryItem(item) {
  return item?.scanMode !== "human_food" && Number.isFinite(Number(item?.overallScore));
}

function comparableHistoryIdentity(item) {
  const cacheKey = normalizeHistoryText(item?.cacheKey);
  if (cacheKey) return `cache:${cacheKey}`;
  return [
    item?.scanMode || "pet_food",
    item?.petType || "unknown_pet",
    historyDisplayName(item),
  ].map(normalizeHistoryText).join(":");
}

function selectDistinctComparableHistory(items, limit = 2) {
  const selected = [];
  const seen = new Set();

  for (const item of items) {
    if (!isComparableHistoryItem(item)) continue;
    const identity = comparableHistoryIdentity(item);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    selected.push(item);
    if (selected.length >= limit) break;
  }

  return selected;
}

function normalizeHistoryText(value) {
  return String(value || "").trim().toLowerCase();
}

function historyItemMatchesFilter(item, filter) {
  if (filter === "human_food") return item?.scanMode === "human_food";
  if (filter === "pet_food") return item?.scanMode !== "human_food";
  return true;
}

function historyItemMatchesQuery(item, query) {
  const normalizedQuery = normalizeHistoryText(query);
  if (!normalizedQuery) return true;
  const searchableText = [
    historyDisplayName(item),
    item?.petType,
    item?.dataSource,
    item?.safetyLevel,
    item?.scanMode === "human_food" ? "human food" : "pet food",
  ].map(normalizeHistoryText).join(" ");
  return searchableText.includes(normalizedQuery);
}

function filterHistoryItems(items, filter, query) {
  return items.filter((item) =>
    historyItemMatchesFilter(item, filter) && historyItemMatchesQuery(item, query)
  );
}

function compareScoreDelta(items) {
  if (!Array.isArray(items) || items.length < 2) return null;
  const leftScore = Number(items[0]?.overallScore);
  const rightScore = Number(items[1]?.overallScore);
  if (!Number.isFinite(leftScore) || !Number.isFinite(rightScore)) return null;
  return Math.abs(leftScore - rightScore);
}

function compareLeaderSlot(items) {
  if (!Array.isArray(items) || items.length < 2) return null;
  const leftScore = Number(items[0]?.overallScore);
  const rightScore = Number(items[1]?.overallScore);
  if (!Number.isFinite(leftScore) || !Number.isFinite(rightScore)) return null;
  if (leftScore === rightScore) return "tie";
  return leftScore > rightScore ? "left" : "right";
}

// --- History Tools ---

const HISTORY_FILTERS = [
  { key: "all", label: "All" },
  { key: "pet_food", label: "Pet food" },
  { key: "human_food", label: "Human food" },
];

function HistoryTools({
  theme,
  query,
  activeFilter,
  totalCount,
  resultCount,
  onQueryChange,
  onQuerySubmit,
  onQueryClear,
  onFilterChange,
}) {
  return (
    <View style={styles.historyTools}>
      <View
        style={[
          styles.historySearchBox,
          {
            backgroundColor: theme.card,
            borderColor: theme.separator,
          },
        ]}
      >
        <Search size={16} color={theme.textTertiary} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          onSubmitEditing={onQuerySubmit}
          placeholder="Search saved scans"
          placeholderTextColor={theme.textTertiary}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="never"
          style={[styles.historySearchInput, { color: theme.textPrimary }]}
          accessibilityLabel="Search saved scans"
        />
        {query.length > 0 && (
          <Pressable
            onPress={onQueryClear}
            hitSlop={15}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Clear history search"
          >
            <X size={15} color={theme.textTertiary} strokeWidth={2} />
          </Pressable>
        )}
      </View>

      <View style={styles.historyFilterRow} accessible={false}>
        {HISTORY_FILTERS.map((filter) => {
          const selected = activeFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              onPress={() => onFilterChange(filter.key)}
              style={({ pressed }) => [
                styles.historyFilterPill,
                {
                  backgroundColor: selected ? theme.textPrimary : theme.card,
                  borderColor: selected ? theme.textPrimary : theme.separator,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${filter.label} scans`}
            >
              <Text
                style={[
                  styles.historyFilterText,
                  { color: selected ? theme.bg : theme.textSecondary },
                ]}
                numberOfLines={1}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.historyResultsText, { color: theme.textTertiary }]}>
        Showing {resultCount} of {totalCount} saved scans
      </Text>
    </View>
  );
}

function FilteredHistoryEmptyState({ theme, onClear }) {
  return (
    <View style={styles.filteredEmptyContainer}>
      <Text style={[styles.filteredEmptyTitle, { color: theme.textPrimary }]}>
        No matching scans
      </Text>
      <Text style={[styles.filteredEmptyText, { color: theme.textTertiary }]}>
        Try a different search or show all scan types.
      </Text>
      <Pressable
        onPress={onClear}
        style={({ pressed }) => [
          styles.filteredEmptyButton,
          {
            backgroundColor: theme.card,
            borderColor: theme.separator,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Clear history filters"
      >
        <Text style={[styles.filteredEmptyButtonText, { color: theme.textPrimary }]}>
          Clear filters
        </Text>
      </Pressable>
    </View>
  );
}

// --- History Row ---

function HistoryRow({ item, onPress, onCompare, compareSelected, theme, index }) {
  const name = historyDisplayName(item);
  const imageUri = item.displayImageUrl || item.photoUri || null;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  return (
    <View style={styles.historyRow}>
      <TouchableHighlight
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        underlayColor={theme.surface}
        accessibilityRole="button"
        accessibilityLabel={getHistoryAccessibilityLabel(item)}
        accessibilityHint="Opens the saved scan result"
      >
        <View style={styles.historyRowInner}>
        {imageUri && !imageFailed ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.historyThumb}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={[styles.historyThumbPlaceholder, { backgroundColor: theme.fill }]}>
            <Camera size={16} color={theme.textTertiary} strokeWidth={1.5} />
          </View>
        )}
        <View style={styles.historyRowLeft}>
          <Text
            style={[styles.historyProductName, { color: theme.textPrimary }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={[styles.historyTimeAgo, { color: theme.textTertiary }]}>
            {relativeDate(item.dateScanned)}
          </Text>
        </View>
        <View style={styles.historyRowRight}>
          {item.overallScore == null && item.scanMode === "human_food" ? (
            <View
              style={[
                styles.safetyPill,
                {
                  backgroundColor: `${safetyColor(item.safetyLevel)}18`,
                  borderColor: safetyColor(item.safetyLevel),
                },
              ]}
            >
              <Text style={[styles.safetyPillText, { color: safetyColor(item.safetyLevel) }]}>
                {safetyLabel(item.safetyLevel).replace(" safety", "").replace(/^./, (letter) => letter.toUpperCase())}
              </Text>
            </View>
          ) : (
            <MiniScoreRing score={item.overallScore} delay={index * 100} />
          )}
          <ChevronRight size={14} color={theme.textTertiary} strokeWidth={2} />
        </View>
        </View>
      </TouchableHighlight>
      {isComparableHistoryItem(item) ? (
        <Pressable
          onPress={onCompare}
          style={({ pressed }) => [
            styles.historyCompareAction,
            {
              borderColor: compareSelected ? theme.textPrimary : theme.separator,
              backgroundColor: compareSelected ? theme.surface : theme.card,
              opacity: pressed ? 0.65 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${compareSelected ? "Remove" : "Add"} ${name} ${compareSelected ? "from" : "to"} comparison`}
          accessibilityState={{ selected: compareSelected }}
        >
          <Text style={[styles.historyCompareActionText, { color: theme.textPrimary }]}>
            {compareSelected ? "Selected" : "Compare"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// --- Compare Recent Scans ---

function CompareRecentCard({ items, theme, onPress }) {
  const [left, right] = items;
  const ready = items.length === 2;
  const delta = ready ? compareScoreDelta(items) : null;

  return (
    <Pressable
      onPress={ready ? onPress : undefined}
      disabled={!ready}
      style={({ pressed }) => [
        styles.compareCard,
        {
          backgroundColor: theme.card,
          borderColor: theme.separator,
          opacity: ready ? (pressed ? 0.8 : 1) : 0.62,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Compare recent scans"
      accessibilityHint={ready ? "Opens a side by side comparison" : "Select Compare on two scored pet-food history rows"}
      accessibilityState={{ disabled: !ready }}
    >
      <View style={styles.compareCardCopy}>
        <Text style={[styles.compareEyebrow, { color: theme.textTertiary }]}>
          Shopping helper
        </Text>
        <Text style={[styles.compareTitle, { color: theme.textPrimary }]}>
          Compare products
        </Text>
        <Text
          style={[styles.compareSubtitle, { color: theme.textSecondary }]}
          numberOfLines={2}
        >
          {ready
            ? `${historyDisplayName(left)} vs ${historyDisplayName(right)}`
            : `Choose ${2 - items.length} more scored pet food${items.length === 1 ? "" : "s"} below`}
        </Text>
      </View>
      <View style={[styles.compareDeltaBadge, { backgroundColor: theme.surface }]}>
        <Text style={[styles.compareDeltaValue, { color: theme.textPrimary }]}>
          {ready ? delta ?? 0 : items.length}
        </Text>
        <Text style={[styles.compareDeltaLabel, { color: theme.textTertiary }]}>
          {ready ? "pts apart" : "selected"}
        </Text>
      </View>
      <ChevronRight size={16} color={theme.textTertiary} strokeWidth={2} />
    </Pressable>
  );
}

function CompareProductColumn({ item, theme, slot, isLeader, onPress }) {
  const score = Number(item.overallScore);
  const config = getScoreConfig(score);

  return (
    <Pressable
      onPress={() => onPress(item, slot)}
      style={({ pressed }) => [
        styles.compareProductColumn,
        {
          backgroundColor: theme.surface,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${historyDisplayName(item)}, score ${score} out of 100`}
      accessibilityHint="Opens this saved scan result"
    >
      <MiniScoreRing score={score} />
      <Text
        style={[styles.compareProductName, { color: theme.textPrimary }]}
        numberOfLines={2}
      >
        {historyDisplayName(item)}
      </Text>
      <Text style={[styles.compareProductMeta, { color: theme.textTertiary }]}>
        {relativeDate(item.dateScanned)}
      </Text>
      <View
        style={[
          styles.compareGradePill,
          { backgroundColor: config.bg },
        ]}
      >
        <Text style={[styles.compareGradeText, { color: config.color }]}>
          {isLeader ? "Higher score" : config.label}
        </Text>
      </View>
    </Pressable>
  );
}

function CompareRecentModal({ visible, items, theme, onClose, onOpenItem }) {
  if (items.length < 2) return null;

  const [left, right] = items;
  const delta = compareScoreDelta(items);
  const leaderSlot = compareLeaderSlot(items);
  const leader = leaderSlot === "right" ? right : left;
  const summary = leaderSlot === "tie"
    ? "These two scans are tied."
    : `${historyDisplayName(leader)} scores ${delta} points higher.`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => onClose("system")}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => onClose("backdrop")}
        accessible={false}
      >
        <View
          style={[styles.compareModalCard, { backgroundColor: theme.card }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.compareModalHeader}>
            <View style={styles.compareModalTitleBlock}>
              <Text style={[styles.compareModalTitle, { color: theme.textPrimary }]}>
                Compare recent scans
              </Text>
              <Text style={[styles.compareModalSummary, { color: theme.textSecondary }]}>
                {summary}
              </Text>
            </View>
            <Pressable
              onPress={() => onClose("close_button")}
              hitSlop={12}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              accessibilityRole="button"
              accessibilityLabel="Close comparison"
            >
              <X size={18} color={theme.textTertiary} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.compareColumns}>
            <CompareProductColumn
              item={left}
              theme={theme}
              slot="left"
              isLeader={leaderSlot === "left"}
              onPress={onOpenItem}
            />
            <CompareProductColumn
              item={right}
              theme={theme}
              slot="right"
              isLeader={leaderSlot === "right"}
              onPress={onOpenItem}
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

// --- Empty State ---

function EmptyState({ theme, remainingScans, isPro, onScan, onSearch }) {
  const freeScanValue = isPro
    ? "Unlimited scans included"
    : Number.isFinite(remainingScans)
      ? `${remainingScans} free ${remainingScans === 1 ? "scan" : "scans"} left`
      : "3 free scans included";

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconContainer, { backgroundColor: theme.surface }]}>
        <ScanLine size={28} color={theme.textSecondary} strokeWidth={1.7} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
        Your scans will live here
      </Text>
      <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
        Results are saved automatically so you can compare foods without scanning them again.
      </Text>
      <Text style={[styles.emptyValueCue, { color: theme.textTertiary }]}>
        {freeScanValue}
      </Text>
      <View style={styles.emptyActions}>
        <Pressable
          onPress={onScan}
          style={({ pressed }) => [
            styles.emptyPrimaryAction,
            { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.78 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Scan your first product"
        >
          <Camera size={17} color={theme.buttonText} strokeWidth={2.2} />
          <Text style={[styles.emptyPrimaryActionText, { color: theme.buttonText }]}>Scan a product</Text>
        </Pressable>
        <Pressable
          onPress={onSearch}
          style={({ pressed }) => [
            styles.emptySecondaryAction,
            { borderColor: theme.separator, opacity: pressed ? 0.62 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Search the product catalog"
        >
          <Search size={17} color={theme.textPrimary} strokeWidth={2.1} />
          <Text style={[styles.emptySecondaryActionText, { color: theme.textPrimary }]}>Search instead</Text>
        </Pressable>
      </View>
    </View>
  );
}

function freeScanStatusCopy(remaining) {
  if (!Number.isFinite(remaining)) return null;
  if (remaining <= 0) {
    return {
      title: "Free scans used",
      body: "Upgrade for unlimited pet-food and human-food checks.",
      action: "Unlock unlimited",
    };
  }

  const scanWord = remaining === 1 ? "scan" : "scans";
  return {
    title: `${remaining} free ${scanWord} left`,
    body: "Use them on pet food labels or human-food questions.",
    action: "Upgrade anytime",
  };
}

function FreeScanStatus({ theme, remaining, onUpgrade }) {
  const copy = freeScanStatusCopy(remaining);
  if (!copy) return null;

  const urgent = remaining <= 0;

  return (
    <Pressable
      onPress={onUpgrade}
      style={({ pressed }) => [
        styles.freeScanStatus,
        {
          backgroundColor: urgent ? Colors.scoreExcellent + "0A" : theme.card,
          borderColor: urgent ? Colors.scoreExcellent + "26" : theme.separator,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${copy.title}. ${copy.body}`}
      accessibilityHint={`Opens ${BRAND_PRO_NAME} plans`}
    >
      <View style={styles.freeScanStatusCopy}>
        <Text style={[styles.freeScanStatusTitle, { color: theme.textPrimary }]}>
          {copy.title}
        </Text>
        <Text style={[styles.freeScanStatusBody, { color: theme.textTertiary }]} numberOfLines={2}>
          {copy.body}
        </Text>
      </View>
      <Text
        style={[
          styles.freeScanStatusAction,
          { color: urgent ? Colors.scoreExcellent : theme.textSecondary },
        ]}
        maxFontSizeMultiplier={1.1}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {copy.action}
      </Text>
    </Pressable>
  );
}

// --- Home Screen ---

const HOME_SCAN_CTA_ANALYTICS = { source_surface: "home_scan_cta" };
const HOME_HUMAN_FOOD_CTA_ANALYTICS = { source_surface: "home_human_food_cta" };
const HOME_CATALOG_SEARCH_SOURCE_SURFACE = "home_catalog_search";
const HOME_INGREDIENT_CAPTURE_SOURCE_SURFACE = "home_ingredient_capture";
const HOME_HISTORY_SEARCH_SOURCE_SURFACE = "home_history_search";
const HOME_HISTORY_FILTER_SOURCE_SURFACE = "home_history_filter";
const HOME_FREE_SCAN_STATUS_SOURCE_SURFACE = "home_free_scan_status";
const HOME_EMPTY_STATE_SOURCE_SURFACE = "home_empty_state";
const LAST_HUMAN_FOOD_PET_KEY = "@woof/last_human_food_pet_type";

export default function HomeScreen({ navigation }) {
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showPetPicker, setShowPetPicker] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareSelection, setCompareSelection] = useState([]);
  const [completedContribution, setCompletedContribution] = useState(null);
  const [lastHumanFoodPetType, setLastHumanFoodPetType] = useState(null);
  const [pendingHumanPetType, setPendingHumanPetType] = useState(null);
  const [saveHumanFoodPet, setSaveHumanFoodPet] = useState(false);
  const [humanFoodPetName, setHumanFoodPetName] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const theme = useTheme();
  const { profile, canScan, isPro, remainingScans, updatePetProfile } = useAuth();
  const savedPetProfile = normalizePetProfile(profile?.pet_profile);
  const hasSavedPet = hasUsablePetProfile(savedPetProfile);

  // Scan button press animation
  const scanScale = useSharedValue(1);
  const scanAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scanScale.value }],
  }));

  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LAST_HUMAN_FOOD_PET_KEY)
      .then((value) => setLastHumanFoodPetType(value === "dog" || value === "cat" ? value : null))
      .catch(() => {});
  }, []);

  const checkContributionStatus = useCallback(async () => {
    try {
      const pending = await getPendingCatalogContributions();
      for (const contribution of pending.slice(0, 4)) {
        const match = await findVerifiedCatalogProductForLookup({
          productName: contribution.productName,
          brand: contribution.brand,
          petType: contribution.petType,
          gtin: contribution.gtin,
          barcode: contribution.gtin,
        }, { limit: 8 });
        if (match) {
          setCompletedContribution({ contribution, product: match });
          return;
        }
      }
      setCompletedContribution(null);
    } catch (err) {
      logger.debug("[HOME] Contribution status check failed:", err.message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryError(false);
    setHistoryLoading(true);

    try {
      // Add timeout to prevent infinite loading
      const timeoutMs = 8000;
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("HISTORY_TIMEOUT")), timeoutMs)
      );

      const historyData = await Promise.race([
        getHistory(),
        timeout
      ]);

      setHistory(historyData);
      setHistoryError(false);
    } catch (err) {
      logger.debug("[HOME] History load error:", err.message);
      setHistoryError(true);
      setHistory([]); // Clear stale data
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
      checkContributionStatus();
    }, [loadHistory, checkContributionStatus])
  );

  // Subscribe to background analysis completions for real-time history updates
  useEffect(() => {
    const unsub = analysisService.subscribe((event) => {
      if (event.type === "complete") {
        loadHistory();
      }
    });
    return unsub;
  }, [loadHistory]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory().finally(() => setRefreshing(false));
  }, [loadHistory]);

  const navigatePaywall = (source, properties = {}) => {
    trackEvent("paywall_requested", {
      source,
      ...properties,
    });
    navigation.navigate("Paywall", { source });
  };

  const remainingFreeScans = remainingScans();
  const remainingScansAnalyticsValue = Number.isFinite(remainingFreeScans)
    ? remainingFreeScans
    : null;

  const handleFreeScanStatusUpgrade = () => {
    Haptics.selectionAsync();
    trackEvent("free_scan_status_tapped", {
      source_surface: HOME_FREE_SCAN_STATUS_SOURCE_SURFACE,
      remaining_scans: remainingScansAnalyticsValue,
      is_pro: isPro,
    });
    navigatePaywall("home_banner", {
      source_surface: "home_banner",
      trigger_surface: HOME_FREE_SCAN_STATUS_SOURCE_SURFACE,
      remaining_scans: remainingScansAnalyticsValue,
    });
  };

  const handleScan = (sourceSurface = HOME_SCAN_CTA_ANALYTICS.source_surface) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const allowed = canScan();
    trackEvent("scan_cta_tapped", {
      scan_mode: "label_lookup",
      source_surface: sourceSurface,
      can_scan: allowed,
      is_pro: isPro,
      remaining_scans: remainingScansAnalyticsValue,
    });
    if (!allowed) {
      trackEvent("scan_blocked_by_limit", {
        scan_mode: "label_lookup",
        source_surface: sourceSurface,
        remaining_scans: remainingScansAnalyticsValue,
      });
      navigatePaywall("scan_limit", {
        source_surface: sourceSurface,
        scan_mode: "label_lookup",
        remaining_scans: remainingScansAnalyticsValue,
      });
      return;
    }
    navigation.navigate("Scanner", { mode: "label_lookup" });
  };

  const handleIngredientCapture = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const allowed = canScan();
    trackEvent("ingredient_capture_tapped", {
      source_surface: HOME_INGREDIENT_CAPTURE_SOURCE_SURFACE,
      can_scan: allowed,
      is_pro: isPro,
      remaining_scans: remainingScansAnalyticsValue,
    });
    if (!allowed) {
      trackEvent("scan_blocked_by_limit", {
        scan_mode: "ingredient_capture",
        source_surface: HOME_INGREDIENT_CAPTURE_SOURCE_SURFACE,
        remaining_scans: remainingScansAnalyticsValue,
      });
      navigatePaywall("scan_limit", {
        source_surface: HOME_INGREDIENT_CAPTURE_SOURCE_SURFACE,
        scan_mode: "ingredient_capture",
        remaining_scans: remainingScansAnalyticsValue,
      });
      return;
    }
    const catalogEvidenceConsent = await requestCatalogEvidenceConsent();
    if (catalogEvidenceConsent == null) return;
    navigation.navigate("Scanner", {
      mode: "ingredient_capture",
      sourceSurface: HOME_INGREDIENT_CAPTURE_SOURCE_SURFACE,
      catalogEvidenceConsent,
    });
  };

  const handleHumanFoodCheck = (sourceSurface = HOME_HUMAN_FOOD_CTA_ANALYTICS.source_surface) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const allowed = canScan();
    trackEvent("scan_cta_tapped", {
      scan_mode: "human_food",
      source_surface: sourceSurface,
      can_scan: allowed,
      is_pro: isPro,
      remaining_scans: remainingScansAnalyticsValue,
    });
    if (!allowed) {
      trackEvent("scan_blocked_by_limit", {
        scan_mode: "human_food",
        source_surface: sourceSurface,
        remaining_scans: remainingScansAnalyticsValue,
      });
      navigatePaywall("scan_limit", {
        source_surface: sourceSurface,
        scan_mode: "human_food",
        remaining_scans: remainingScansAnalyticsValue,
      });
      return;
    }
    if (hasSavedPet) {
      trackEvent("human_food_pet_selected", {
        pet_type: savedPetProfile.petType,
        source: "saved_pet_profile",
      });
      navigation.navigate("Scanner", {
        mode: "human_food",
        petType: savedPetProfile.petType,
        petName: savedPetProfile.name,
      });
      return;
    }

    setPendingHumanPetType(lastHumanFoodPetType);
    setShowPetPicker(true);
  };

  const handleCatalogSearchSubmit = () => {
    const query = catalogQuery.trim();
    Haptics.selectionAsync();
    trackEvent("catalog_search_submitted", {
      source_surface: HOME_CATALOG_SEARCH_SOURCE_SURFACE,
      query_present: query.length > 0,
      query_length: query.length,
    });
    navigation.navigate("ProductSearch", {
      initialQuery: query,
      sourceSurface: HOME_CATALOG_SEARCH_SOURCE_SURFACE,
    });
  };

  const handleCatalogQueryClear = () => {
    Haptics.selectionAsync();
    setCatalogQuery("");
    trackEvent("catalog_search_home_cleared", {
      source_surface: HOME_CATALOG_SEARCH_SOURCE_SURFACE,
    });
  };

  const handleEmptyStateSearch = () => {
    Haptics.selectionAsync();
    trackEvent("catalog_search_submitted", {
      source_surface: HOME_EMPTY_STATE_SOURCE_SURFACE,
      query_present: false,
      query_length: 0,
    });
    navigation.navigate("ProductSearch", {
      initialQuery: "",
      sourceSurface: HOME_EMPTY_STATE_SOURCE_SURFACE,
    });
  };

  const normalizedHistoryQuery = normalizeHistoryText(historyQuery);
  const hasActiveHistoryTools = historyFilter !== "all" || normalizedHistoryQuery.length > 0;
  const filteredHistory = useMemo(
    () => filterHistoryItems(history, historyFilter, historyQuery),
    [history, historyFilter, historyQuery]
  );
  const visibleHistory = hasActiveHistoryTools || historyExpanded
    ? filteredHistory
    : filteredHistory.slice(0, 10);

  const historyToolAnalytics = useCallback((extra = {}) => ({
    source_surface: extra.source_surface || HOME_HISTORY_FILTER_SOURCE_SURFACE,
    filter: extra.filter ?? historyFilter,
    query_present: extra.query_present ?? normalizedHistoryQuery.length > 0,
    query_length: extra.query_length ?? normalizedHistoryQuery.length,
    total_count: history.length,
    result_count: extra.result_count ?? filteredHistory.length,
    visible_count: extra.visible_count ?? visibleHistory.length,
    is_pro: isPro,
  }), [filteredHistory.length, history.length, historyFilter, isPro, normalizedHistoryQuery.length, visibleHistory.length]);

  const handleHistoryFilterChange = (nextFilter) => {
    if (nextFilter === historyFilter) return;
    const nextResultCount = filterHistoryItems(history, nextFilter, historyQuery).length;
    Haptics.selectionAsync();
    trackEvent("history_filter_changed", historyToolAnalytics({
      filter: nextFilter,
      previous_filter: historyFilter,
      result_count: nextResultCount,
    }));
    setHistoryFilter(nextFilter);
  };

  const handleHistoryQueryChange = (nextQuery) => {
    const wasEmpty = normalizedHistoryQuery.length === 0;
    const nextNormalized = normalizeHistoryText(nextQuery);
    setHistoryQuery(nextQuery);
    if (wasEmpty && nextNormalized.length > 0) {
      trackEvent("history_search_started", historyToolAnalytics({
        source_surface: HOME_HISTORY_SEARCH_SOURCE_SURFACE,
        query_present: true,
        query_length: nextNormalized.length,
        result_count: filterHistoryItems(history, historyFilter, nextQuery).length,
      }));
    }
  };

  const handleHistoryQuerySubmit = () => {
    trackEvent("history_search_submitted", historyToolAnalytics({
      source_surface: HOME_HISTORY_SEARCH_SOURCE_SURFACE,
    }));
  };

  const clearHistoryTools = (sourceSurface = "home_history_clear_filters") => {
    const hadFilters = hasActiveHistoryTools;
    setHistoryQuery("");
    setHistoryFilter("all");
    if (hadFilters) {
      Haptics.selectionAsync();
      trackEvent("history_filters_cleared", historyToolAnalytics({
        source_surface: sourceSurface,
        filter: "all",
        query_present: false,
        query_length: 0,
        result_count: history.length,
        visible_count: historyExpanded ? history.length : Math.min(history.length, 10),
      }));
    }
  };

  const handleHistoryQueryClear = () => {
    setHistoryQuery("");
    Haptics.selectionAsync();
    trackEvent("history_search_cleared", historyToolAnalytics({
      source_surface: HOME_HISTORY_SEARCH_SOURCE_SURFACE,
      query_present: false,
      query_length: 0,
      result_count: filterHistoryItems(history, historyFilter, "").length,
    }));
  };

  const toggleHistoryExpanded = () => {
    const nextExpanded = !historyExpanded;
    Haptics.selectionAsync();
    trackEvent(nextExpanded ? "history_list_expanded" : "history_list_collapsed", historyToolAnalytics({
      source_surface: "home_history_list",
      visible_count: nextExpanded ? filteredHistory.length : Math.min(filteredHistory.length, 10),
    }));
    setHistoryExpanded(nextExpanded);
  };

  const comparableHistory = useMemo(() => compareSelection
    .map((id) => history.find((item) => item.id === id))
    .filter(Boolean)
    .filter(isComparableHistoryItem)
    .slice(0, 2), [compareSelection, history]);

  const toggleCompareSelection = (item) => {
    if (!isComparableHistoryItem(item)) return;
    Haptics.selectionAsync();
    setCompareSelection((current) => {
      if (current.includes(item.id)) return current.filter((id) => id !== item.id);
      if (current.length >= 2) return [current[1], item.id];
      return [...current, item.id];
    });
  };

  const compareAnalytics = useCallback((items = comparableHistory) => ({
    source_surface: "home_compare_card",
    compared_count: items.length,
    score_delta: compareScoreDelta(items),
    leader_slot: compareLeaderSlot(items),
    left_data_source: items[0]?.dataSource || null,
    right_data_source: items[1]?.dataSource || null,
    left_has_photo: !!items[0]?.photoUri,
    right_has_photo: !!items[1]?.photoUri,
    is_pro: isPro,
  }), [comparableHistory, isPro]);

  const handleCompareOpen = () => {
    if (comparableHistory.length < 2) return;
    Haptics.selectionAsync();
    trackEvent("history_compare_opened", compareAnalytics());
    setShowCompareModal(true);
  };

  const handleContributionRescore = async () => {
    if (!completedContribution?.product) return;
    Haptics.selectionAsync();
    await removePendingCatalogContribution(completedContribution.contribution.key).catch(() => {});
    const product = completedContribution.product;
    setCompletedContribution(null);
    navigation.navigate("Results", {
      mode: "catalog",
      cacheKey: product.cacheKey,
      catalogProduct: product,
      petType: product.petType,
      sourceSurface: "catalog_contribution_completed",
    });
  };

  const chooseHumanFoodPet = async (petType) => {
    setShowPetPicker(false);
    setLastHumanFoodPetType(petType);
    AsyncStorage.setItem(LAST_HUMAN_FOOD_PET_KEY, petType).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    trackEvent("human_food_pet_selected", {
      pet_type: petType,
      saved_as_profile: saveHumanFoodPet && !!humanFoodPetName.trim(),
    });
    if (saveHumanFoodPet && humanFoodPetName.trim()) {
      try {
        await updatePetProfile({
          name: humanFoodPetName.trim(),
          petType,
          lifeStage: "adult",
          avoidIngredients: [],
        });
      } catch (err) {
        logger.debug("[HOME] Save human-food pet failed:", err.message);
      }
    }
    setSaveHumanFoodPet(false);
    setHumanFoodPetName("");
    navigation.navigate("Scanner", { mode: "human_food", petType });
  };

  const handleCompareClose = (closeReason = "dismissed") => {
    if (showCompareModal) {
      trackEvent("history_compare_closed", {
        ...compareAnalytics(),
        close_reason: closeReason,
      });
    }
    setShowCompareModal(false);
  };

  const handleHistoryPress = (item, extra = {}) => {
    trackEvent("history_item_opened", {
      scan_mode: item.scanMode || "pet_food",
      data_source: item.dataSource,
      has_photo: !!item.photoUri,
      source_surface: extra.source_surface || "home_recent_scans",
      compare_slot: extra.compare_slot || null,
      history_filter: extra.history_filter || "all",
      query_present: !!extra.query_present,
      query_length: extra.query_length || 0,
    });
    navigation.navigate("Results", {
      mode: "history",
      cacheKey: item.cacheKey,
      historyEntryId: item.id,
      historyProductName: historyDisplayName(item),
      ...(item.resultSnapshot && { historyResultSnapshot: item.resultSnapshot }),
      ...(item.scanMode === "human_food" && { scanMode: "human_food", petType: item.petType }),
    });
  };

  const handleCompareResultOpen = (item, slot) => {
    Haptics.selectionAsync();
    trackEvent("history_compare_result_opened", {
      ...compareAnalytics(),
      compare_slot: slot,
      opened_score: Number.isFinite(Number(item?.overallScore)) ? Number(item.overallScore) : null,
    });
    setShowCompareModal(false);
    handleHistoryPress(item, {
      source_surface: "home_compare_modal",
      compare_slot: slot,
    });
  };

  const handleClearHistory = () => {
    Alert.alert(
      "Clear all scan history?",
      "This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            trackEvent("history_cleared", { visible_count: history.length });
            clearHistory().then(() => {
              setHistory([]);
              setHistoryQuery("");
              setHistoryFilter("all");
              setHistoryExpanded(false);
            });
          },
        },
      ]
    );
  };

  const ListHeader = (
    <View style={styles.listHeader}>
      {/* Title + profile */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandTitleRow}>
            <BrandLogo size={36} />
            <Text style={[styles.title, { color: theme.textPrimary }]}>{BRAND_NAME}</Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              trackEvent("profile_tapped");
              navigation.navigate("Profile");
            }}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            accessibilityHint="Opens account, subscription, and legal settings"
          >
            <View style={[styles.profileButton, { backgroundColor: theme.surface }]}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.profileAvatar} />
              ) : (
                <User size={16} color={theme.textSecondary} strokeWidth={2} />
              )}
            </View>
          </Pressable>
        </View>
        <Text style={[styles.tagline, { color: theme.textTertiary }]}>
          {BRAND_TAGLINE}
        </Text>
      </View>

      <Text style={[styles.actionEyebrow, { color: theme.textSecondary }]}>Pet food check</Text>
      <Pressable
        onPress={() => handleScan(HOME_SCAN_CTA_ANALYTICS.source_surface)}
        onPressIn={() => {
          scanScale.value = withSpring(0.97, { damping: 15, stiffness: 150 });
        }}
        onPressOut={() => {
          scanScale.value = withSpring(1, { damping: 15, stiffness: 150 });
        }}
        accessibilityRole="button"
        accessibilityLabel="Scan a product label"
        accessibilityHint="Opens the camera to identify a product from the front label"
      >
        <Animated.View
          style={[
            styles.scanButton,
            { backgroundColor: theme.buttonPrimary },
            styles.scanButtonShadow,
            scanAnimStyle,
          ]}
        >
          <Camera size={18} color={theme.buttonText} strokeWidth={2} />
          <Text
            style={[styles.scanButtonText, { color: theme.buttonText }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            Scan Front Label
          </Text>
        </Animated.View>
      </Pressable>

      <View style={styles.trustLine} accessible accessibilityLabel="Exact formula matching only. Similar recipes are never substituted.">
        <Shield size={15} color={Colors.scoreExcellent} strokeWidth={2.2} />
        <Text style={[styles.trustLineText, { color: theme.textSecondary }]}>
          Exact formula only. Never a similar recipe.
        </Text>
      </View>

      <View style={styles.catalogSearchSection}>
        <Text style={[styles.searchAlternativeLabel, { color: theme.textSecondary }]}>Search by name</Text>
        <View
          style={[
            styles.catalogSearchBox,
            {
              backgroundColor: theme.card,
              borderColor: theme.separator,
            },
          ]}
        >
          <Search size={18} color={theme.textTertiary} strokeWidth={2} />
          <TextInput
            value={catalogQuery}
            onChangeText={setCatalogQuery}
            onSubmitEditing={handleCatalogSearchSubmit}
            placeholder="Brand, product, or recipe"
            placeholderTextColor={theme.textTertiary}
            returnKeyType="search"
            autoCapitalize="words"
            autoCorrect={false}
            style={[styles.catalogSearchInput, { color: theme.textPrimary }]}
            accessibilityLabel="Search products by name"
          />
          {catalogQuery.length > 0 ? (
            <Pressable
              onPress={handleCatalogQueryClear}
              hitSlop={14}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              accessibilityRole="button"
              accessibilityLabel="Clear product search"
            >
              <X size={16} color={theme.textTertiary} strokeWidth={2} />
            </Pressable>
          ) : null}
          {catalogQuery.trim().length > 0 ? (
            <Pressable
              onPress={handleCatalogSearchSubmit}
              hitSlop={10}
              style={({ pressed }) => [
                styles.catalogSearchSubmit,
                {
                  backgroundColor: theme.buttonPrimary,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Search catalog"
            >
              <ChevronRight size={16} color={theme.buttonText} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={handleIngredientCapture}
          style={({ pressed }) => [
            styles.labelScanButton,
            { opacity: pressed ? 0.58 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Scan ingredients list"
          accessibilityHint="Opens the camera to capture an ingredient-panel photo for catalog review"
        >
          <Camera size={15} color={theme.textSecondary} strokeWidth={2} />
          <Text style={[styles.labelScanButtonText, { color: theme.textSecondary }]}>
            Can’t find it? Scan the ingredient panel
          </Text>
        </Pressable>
      </View>

      {completedContribution ? (
        <Pressable
          onPress={handleContributionRescore}
          style={({ pressed }) => [
            styles.contributionBanner,
            {
              backgroundColor: theme.card,
              borderColor: Colors.scoreExcellent,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Your submission was added. Rescore product"
        >
          <Shield size={18} color={Colors.scoreExcellent} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.contributionTitle, { color: theme.textPrimary }]}>Your submission was added</Text>
            <Text style={[styles.contributionBody, { color: theme.textSecondary }]} numberOfLines={1}>
              {completedContribution.product.productName || completedContribution.contribution.productName} — rescore
            </Text>
          </View>
          <ChevronRight size={16} color={theme.textTertiary} strokeWidth={2} />
        </Pressable>
      ) : null}

      {/* Human food safety check */}
      {hasSavedPet || lastHumanFoodPetType ? (
        <View style={[styles.humanPetChip, { backgroundColor: theme.surface, borderColor: theme.separator }]}>
          {((hasSavedPet ? savedPetProfile.petType : lastHumanFoodPetType) === "cat")
            ? <Cat size={14} color={theme.textSecondary} strokeWidth={2} />
            : <Dog size={14} color={theme.textSecondary} strokeWidth={2} />}
          <Text style={[styles.humanPetChipText, { color: theme.textSecondary }]}>
            For {hasSavedPet ? savedPetProfile.name : `your ${lastHumanFoodPetType}`}
          </Text>
          <Pressable
            onPress={() => {
              setPendingHumanPetType(hasSavedPet ? savedPetProfile.petType : lastHumanFoodPetType);
              setShowPetPicker(true);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Switch pet for human-food check"
          >
            <Text style={[styles.humanPetSwitch, { color: theme.textPrimary }]}>Switch</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        onPress={() => handleHumanFoodCheck(HOME_HUMAN_FOOD_CTA_ANALYTICS.source_surface)}
        accessibilityRole="button"
        accessibilityLabel="Check if human food is safe for your pet"
        accessibilityHint={hasSavedPet
          ? `Opens the camera for ${savedPetProfile.name}'s human-food check`
          : "Choose dog or cat, then open the camera for a human-food check"}
      >
        <View style={[styles.humanFoodButton, { borderColor: theme.separator }]}>
          <Utensils size={18} color={theme.textSecondary} strokeWidth={2} />
          <Text
            style={[styles.humanFoodButtonText, { color: theme.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            Is This Safe for My Pet?
          </Text>
        </View>
      </Pressable>

      {!isPro && (
        <FreeScanStatus
          theme={theme}
          remaining={remainingFreeScans}
          onUpgrade={handleFreeScanStatusUpgrade}
        />
      )}

      {/* Section header */}
      {history.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Recent Scans</Text>
              <Text style={[styles.historyLimitHint, { color: theme.textTertiary }]}>History keeps your last 50 scans</Text>
            </View>
            <Pressable
              onPress={handleClearHistory}
              hitSlop={15}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              accessibilityRole="button"
              accessibilityLabel="Clear scan history"
              accessibilityHint="Shows a confirmation before deleting scan history"
            >
              <Text style={[styles.clearText, { color: theme.textTertiary }]}>
                Clear
              </Text>
            </Pressable>
          </View>
          <HistoryTools
            theme={theme}
            query={historyQuery}
            activeFilter={historyFilter}
            totalCount={history.length}
            resultCount={filteredHistory.length}
            onQueryChange={handleHistoryQueryChange}
            onQuerySubmit={handleHistoryQuerySubmit}
            onQueryClear={handleHistoryQueryClear}
            onFilterChange={handleHistoryFilterChange}
          />
        </>
      )}

      <CompareRecentCard
        items={comparableHistory}
        theme={theme}
        onPress={handleCompareOpen}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <FlatList
        data={visibleHistory}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item, index }) => {
          const sourceSurface = hasActiveHistoryTools
            ? (normalizedHistoryQuery ? HOME_HISTORY_SEARCH_SOURCE_SURFACE : HOME_HISTORY_FILTER_SOURCE_SURFACE)
            : "home_recent_scans";
          return (
            <HistoryRow
              item={item}
              theme={theme}
              index={index}
              onPress={() => handleHistoryPress(item, {
                source_surface: sourceSurface,
                history_filter: historyFilter,
                query_present: normalizedHistoryQuery.length > 0,
                query_length: normalizedHistoryQuery.length,
              })}
              onCompare={() => toggleCompareSelection(item)}
              compareSelected={compareSelection.includes(item.id)}
            />
          );
        }}
        ItemSeparatorComponent={() => (
          <View
            style={[styles.rowDivider, { backgroundColor: theme.separator }]}
          />
        )}
        ListEmptyComponent={
          historyError ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>
                Couldn't load history
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.textTertiary }]}>
                Pull down to try again
              </Text>
            </View>
          ) : history.length > 0 ? (
            <FilteredHistoryEmptyState
              theme={theme}
              onClear={() => clearHistoryTools("home_history_empty_clear")}
            />
          ) : (
            <EmptyState
              theme={theme}
              remainingScans={remainingFreeScans}
              isPro={isPro}
              onScan={() => handleScan(HOME_EMPTY_STATE_SOURCE_SURFACE)}
              onSearch={handleEmptyStateSearch}
            />
          )
        }
        contentContainerStyle={[
          styles.listContent,
          visibleHistory.length === 0 && styles.listContentEmpty,
        ]}
        ListFooterComponent={
          !hasActiveHistoryTools && filteredHistory.length > 10 ? (
            <View style={styles.historyFooter}>
              <Pressable
                onPress={toggleHistoryExpanded}
                style={({ pressed }) => [
                  styles.historyExpandButton,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.separator,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={historyExpanded ? "Show recent scans only" : "Show all saved scans"}
              >
                <Text style={[styles.historyExpandText, { color: theme.textPrimary }]}>
                  {historyExpanded ? "Show recent" : `Show all ${filteredHistory.length} scans`}
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.textTertiary}
          />
        }
      />
      <Modal
        visible={showPetPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPetPicker(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowPetPicker(false)}
          accessible={false}
        >
          <View style={[styles.petPickerCard, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.petPickerTitle, { color: theme.textPrimary }]}>
              Who is this for?
            </Text>
            <View style={styles.petPickerRow}>
              <Pressable
                style={({ pressed }) => [styles.petPickerOption, { backgroundColor: pressed || pendingHumanPetType === "dog" ? theme.surface : theme.bg }]}
                onPress={() => setPendingHumanPetType("dog")}
                accessibilityRole="button"
                accessibilityLabel="Check human food for a dog"
                accessibilityHint="Opens the camera in dog food-safety mode"
              >
                <Dog size={36} color={theme.textPrimary} strokeWidth={1.5} />
                <Text style={[styles.petPickerLabel, { color: theme.textPrimary }]}>Dog</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.petPickerOption, { backgroundColor: pressed || pendingHumanPetType === "cat" ? theme.surface : theme.bg }]}
                onPress={() => setPendingHumanPetType("cat")}
                accessibilityRole="button"
                accessibilityLabel="Check human food for a cat"
                accessibilityHint="Opens the camera in cat food-safety mode"
              >
                <Cat size={36} color={theme.textPrimary} strokeWidth={1.5} />
                <Text style={[styles.petPickerLabel, { color: theme.textPrimary }]}>Cat</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => setSaveHumanFoodPet((value) => !value)}
              style={styles.savePetToggle}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: saveHumanFoodPet }}
              accessibilityLabel="Save this as my pet"
            >
              <View style={[styles.savePetCheckbox, { borderColor: theme.textPrimary, backgroundColor: saveHumanFoodPet ? theme.textPrimary : "transparent" }]} />
              <Text style={[styles.savePetToggleText, { color: theme.textPrimary }]}>Save as my pet</Text>
            </Pressable>
            {saveHumanFoodPet ? (
              <TextInput
                value={humanFoodPetName}
                onChangeText={setHumanFoodPetName}
                placeholder="Pet name"
                placeholderTextColor={theme.textTertiary}
                style={[styles.savePetNameInput, { color: theme.textPrimary, borderColor: theme.separator, backgroundColor: theme.bg }]}
                accessibilityLabel="Pet name"
              />
            ) : null}
            <Pressable
              onPress={() => pendingHumanPetType && chooseHumanFoodPet(pendingHumanPetType)}
              disabled={!pendingHumanPetType || (saveHumanFoodPet && !humanFoodPetName.trim())}
              style={({ pressed }) => [
                styles.petPickerContinue,
                {
                  backgroundColor: theme.buttonPrimary,
                  opacity: !pendingHumanPetType || (saveHumanFoodPet && !humanFoodPetName.trim()) ? 0.45 : pressed ? 0.72 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Continue to human-food camera"
              accessibilityState={{ disabled: !pendingHumanPetType || (saveHumanFoodPet && !humanFoodPetName.trim()) }}
            >
              <Text style={[styles.petPickerContinueText, { color: theme.buttonText }]}>Continue</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      <CompareRecentModal
        visible={showCompareModal}
        items={comparableHistory}
        theme={theme}
        onClose={handleCompareClose}
        onOpenItem={handleCompareResultOpen}
      />
    </SafeAreaView>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listHeader: {
    paddingHorizontal: Spacing.screenPadding,
  },

  // Header
  header: {
    paddingTop: 12,
    paddingBottom: 28,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 0,
  },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  tagline: {
    fontSize: 14,
    fontWeight: "400",
    marginTop: 6,
  },

  actionEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0,
    marginBottom: 10,
  },
  trustLine: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  trustLineText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    flexShrink: 1,
  },

  // Catalog search
  catalogSearchSection: {
    marginTop: 16,
    marginBottom: 12,
    gap: 8,
  },
  searchAlternativeLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  catalogSearchBox: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  catalogSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 10,
  },
  catalogSearchSubmit: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  labelScanButton: {
    minHeight: 44,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 7,
  },
  labelScanButtonText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0,
    flexShrink: 1,
  },
  contributionBanner: {
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contributionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  contributionBody: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },

  // Scan button
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 62,
    borderRadius: Spacing.buttonRadius,
    gap: 8,
  },
  scanButtonShadow: {
    ...Shadows.button,
  },
  scanButtonText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0,
    flexShrink: 1,
    textAlign: "center",
  },

  // Human food button
  humanFoodButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginTop: 4,
  },
  humanFoodButtonText: {
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "center",
  },
  humanPetChip: {
    alignSelf: "flex-start",
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  humanPetChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  humanPetSwitch: {
    fontSize: 12,
    fontWeight: "800",
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: Spacing.sectionGap,
    marginBottom: Spacing.elementGap,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0,
  },
  historyLimitHint: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 3,
  },
  clearText: {
    fontSize: 15,
    fontWeight: "400",
  },
  historyTools: {
    marginBottom: 16,
  },
  historySearchBox: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  historySearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "400",
    paddingVertical: 10,
  },
  historyFilterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  historyFilterPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  historyFilterText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
  },
  historyResultsText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
  },
  filteredEmptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  filteredEmptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  filteredEmptyText: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
    textAlign: "center",
  },
  filteredEmptyButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  filteredEmptyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0,
  },

  // History rows
  historyRow: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 8,
  },
  historyRowInner: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.rowHeight,
  },
  historyThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 12,
  },
  historyThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  historyRowLeft: {
    flex: 1,
    marginRight: 16,
    justifyContent: "center",
  },
  historyProductName: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 21,
    marginBottom: 2,
  },
  historyTimeAgo: {
    fontSize: 12,
  },
  historyRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  historyCompareAction: {
    alignSelf: "flex-end",
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -4,
  },
  historyCompareActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  rowDivider: {
    height: 0.5,
    marginLeft: Spacing.dividerIndent,
  },
  historyFooter: {
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: 14,
  },
  historyExpandButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  historyExpandText: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0,
  },

  // Compare recent scans
  compareCard: {
    minHeight: 82,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  compareCardCopy: {
    flex: 1,
    minWidth: 0,
  },
  compareEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  compareTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0,
    marginBottom: 3,
  },
  compareSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  compareDeltaBadge: {
    width: 58,
    height: 58,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  compareDeltaValue: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: 0,
  },
  compareDeltaLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0,
  },

  // Mini score ring
  ringLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ringScore: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Free scan status
  freeScanStatus: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  freeScanStatusCopy: {
    flex: 1,
    minWidth: 0,
  },
  freeScanStatusTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
    marginBottom: 3,
  },
  freeScanStatusBody: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 17,
  },
  freeScanStatusAction: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    maxWidth: 116,
    textAlign: "right",
  },

  // Empty state
  emptyContainer: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingBottom: 36,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
    textAlign: "center",
  },
  emptyValueCue: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyActions: {
    width: "100%",
    maxWidth: 320,
    marginTop: 20,
    gap: 10,
  },
  emptyPrimaryAction: {
    minHeight: 50,
    borderRadius: 15,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  emptyPrimaryActionText: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptySecondaryAction: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  emptySecondaryActionText: {
    fontSize: 15,
    fontWeight: "600",
  },

  // Labeled safety status for human-food entries
  safetyPill: {
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  safetyPillText: {
    fontSize: 11,
    fontWeight: "800",
  },

  // Pet picker modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  petPickerCard: {
    width: 280,
    borderRadius: 14,
    padding: 24,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
  },
  petPickerTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  petPickerRow: {
    flexDirection: "row",
    gap: 16,
  },
  petPickerOption: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
    borderRadius: 12,
  },
  petPickerLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  savePetToggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  savePetCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  savePetToggleText: {
    fontSize: 14,
    fontWeight: "600",
  },
  savePetNameInput: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  petPickerContinue: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  petPickerContinueText: {
    fontSize: 15,
    fontWeight: "700",
  },

  // Compare modal
  compareModalCard: {
    width: "88%",
    maxWidth: 380,
    borderRadius: 14,
    padding: 20,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
  },
  compareModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },
  compareModalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  compareModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0,
    marginBottom: 6,
  },
  compareModalSummary: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  },
  compareColumns: {
    flexDirection: "row",
    gap: 12,
  },
  compareProductColumn: {
    flex: 1,
    minHeight: 178,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  compareProductName: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
    marginTop: 12,
    minHeight: 36,
  },
  compareProductMeta: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 6,
  },
  compareGradePill: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  compareGradeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
});
