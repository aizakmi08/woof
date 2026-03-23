import { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
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
import { Camera, ChevronRight, ScanLine } from "lucide-react-native";
import { getHistory, clearHistory } from "../services/history";
import { useAuth } from "../services/auth";
import * as analysisService from "../services/analysisService";
import { useTheme, getScoreConfig, Colors, Spacing, Shadows } from "../theme";
import * as Haptics from "expo-haptics";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
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
  return Colors.scoreConcerning;
}

// --- History Row ---

function HistoryRow({ item, onPress, theme, index }) {
  return (
    <TouchableHighlight
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      underlayColor={theme.surface}
      style={styles.historyRow}
      accessibilityRole="button"
      accessibilityLabel={`${item.productName}, score ${item.overallScore}`}
    >
      <View style={styles.historyRowInner}>
        {item.photoUri ? (
          <Image
            source={{ uri: item.photoUri }}
            style={styles.historyThumb}
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
            {item.productName}
          </Text>
          <Text style={[styles.historyTimeAgo, { color: theme.textTertiary }]}>
            {relativeDate(item.dateScanned)}
          </Text>
        </View>
        <View style={styles.historyRowRight}>
          {item.overallScore == null && item.scanMode === "human_food" ? (
            <View
              style={[
                styles.safetyDot,
                { backgroundColor: safetyColor(item.safetyLevel) },
              ]}
            />
          ) : (
            <MiniScoreRing score={item.overallScore} delay={index * 100} />
          )}
          <ChevronRight size={14} color={theme.textTertiary} strokeWidth={2} />
        </View>
      </View>
    </TouchableHighlight>
  );
}

// --- Empty State ---

function EmptyState({ theme }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <ScanLine size={64} color={theme.textTertiary} strokeWidth={1} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>
        Scan your first product
      </Text>
      <Text style={[styles.emptySubtext, { color: theme.textTertiary }]}>
        Point your camera at any pet food label
      </Text>
    </View>
  );
}

// --- Home Screen ---

const BANNER_DISMISS_KEY = "@woof_banner_dismissed";
const BANNER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function HomeScreen({ navigation }) {
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showPetPicker, setShowPetPicker] = useState(false);
  const theme = useTheme();
  const { profile, canScan, isPro } = useAuth();

  // Check if upgrade banner should show (free users, 7-day cooldown)
  useEffect(() => {
    if (isPro) return;
    AsyncStorage.getItem(BANNER_DISMISS_KEY).then((val) => {
      if (!val) {
        setShowBanner(true);
        return;
      }
      const dismissedAt = parseInt(val, 10);
      if (Date.now() - dismissedAt > BANNER_COOLDOWN_MS) {
        setShowBanner(true);
      }
    });
  }, [isPro]);

  const dismissBanner = () => {
    setShowBanner(false);
    AsyncStorage.setItem(BANNER_DISMISS_KEY, String(Date.now()));
  };

  // Scan button press animation
  const scanScale = useSharedValue(1);
  const scanAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scanScale.value }],
  }));

  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

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
      console.log("[HOME] History load error:", err.message);
      setHistoryError(true);
      setHistory([]); // Clear stale data
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
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

  const handleScan = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!canScan()) {
      navigation.navigate("Paywall", { source: "scan_limit" });
      return;
    }
    navigation.navigate("Scanner");
  };

  const handleHistoryPress = (item) => {
    navigation.navigate("Results", {
      mode: "history",
      cacheKey: item.cacheKey,
      ...(item.scanMode === "human_food" && { scanMode: "human_food", petType: item.petType }),
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
            clearHistory().then(() => setHistory([]));
          },
        },
      ]
    );
  };

  const ListHeader = (
    <View style={styles.listHeader}>
      {/* Dev mode banner */}
      {__DEV__ && (
        <View style={[styles.devBanner, { backgroundColor: Colors.scoreExcellent + '15', borderColor: Colors.scoreExcellent + '40' }]}>
          <Text style={[styles.devText, { color: Colors.scoreExcellent }]}>
            DEV MODE • Unlimited scans
          </Text>
        </View>
      )}

      {/* Title + profile */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Woof</Text>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              navigation.navigate("Profile");
            }}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Profile"
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
          Know what's in the bowl
        </Text>
      </View>

      {/* Scan button */}
      <Pressable
        onPress={handleScan}
        onPressIn={() => {
          scanScale.value = withSpring(0.97, { damping: 15, stiffness: 150 });
        }}
        onPressOut={() => {
          scanScale.value = withSpring(1, { damping: 15, stiffness: 150 });
        }}
        accessibilityRole="button"
        accessibilityLabel="Scan a product"
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
          <Text style={[styles.scanButtonText, { color: theme.buttonText }]}>
            Scan a Product
          </Text>
        </Animated.View>
      </Pressable>

      {/* Human food safety check */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (!canScan()) {
            navigation.navigate("Paywall", { source: "scan_limit" });
            return;
          }
          setShowPetPicker(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Check if human food is safe for your pet"
      >
        <View style={[styles.humanFoodButton, { borderColor: theme.separator }]}>
          <Utensils size={18} color={theme.textSecondary} strokeWidth={2} />
          <Text style={[styles.humanFoodButtonText, { color: theme.textPrimary }]}>
            Is This Safe for My Pet?
          </Text>
        </View>
      </Pressable>

      {/* Upgrade banner (free users, 7-day cooldown) */}
      {showBanner && !isPro && (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            navigation.navigate("Paywall", { source: "home_banner" });
          }}
          style={({ pressed }) => [
            styles.upgradeBanner,
            {
              backgroundColor: Colors.scoreExcellent + "0A",
              borderColor: Colors.scoreExcellent + "26",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Shield size={16} color={Colors.scoreExcellent} strokeWidth={2} />
          <Text style={[styles.upgradeBannerText, { color: theme.textPrimary }]} numberOfLines={1}>
            Unlock full ingredient analysis
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.selectionAsync();
              dismissBanner();
            }}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <X size={14} color={theme.textTertiary} strokeWidth={2} />
          </Pressable>
        </Pressable>
      )}

      {/* Section header */}
      {history.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            Recent Scans
          </Text>
          <Pressable
            onPress={handleClearHistory}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Text style={[styles.clearText, { color: theme.textTertiary }]}>
              Clear
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <FlatList
        data={history.slice(0, 10)}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item, index }) => (
          <HistoryRow
            item={item}
            theme={theme}
            index={index}
            onPress={() => handleHistoryPress(item)}
          />
        )}
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
          ) : (
            <EmptyState theme={theme} />
          )
        }
        contentContainerStyle={[
          styles.listContent,
          history.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.textTertiary}
          />
        }
      />
      <Modal visible={showPetPicker} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setShowPetPicker(false)}>
          <View style={[styles.petPickerCard, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.petPickerTitle, { color: theme.textPrimary }]}>
              Who is this for?
            </Text>
            <View style={styles.petPickerRow}>
              <Pressable
                style={({ pressed }) => [styles.petPickerOption, { backgroundColor: pressed ? theme.surface : theme.bg }]}
                onPress={() => {
                  setShowPetPicker(false);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigation.navigate("Scanner", { mode: "human_food", petType: "dog" });
                }}
              >
                <Dog size={36} color={theme.textPrimary} strokeWidth={1.5} />
                <Text style={[styles.petPickerLabel, { color: theme.textPrimary }]}>Dog</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.petPickerOption, { backgroundColor: pressed ? theme.surface : theme.bg }]}
                onPress={() => {
                  setShowPetPicker(false);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigation.navigate("Scanner", { mode: "human_food", petType: "cat" });
                }}
              >
                <Cat size={36} color={theme.textPrimary} strokeWidth={1.5} />
                <Text style={[styles.petPickerLabel, { color: theme.textPrimary }]}>Cat</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
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
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
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
    fontSize: 15,
    fontWeight: "400",
    marginTop: 8,
  },

  // Scan button
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: Spacing.buttonHeight,
    borderRadius: Spacing.buttonRadius,
    gap: 8,
  },
  scanButtonShadow: {
    ...Shadows.button,
  },
  scanButtonText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  // Human food button
  humanFoodButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
    marginTop: 12,
  },
  humanFoodButtonText: {
    fontSize: 16,
    fontWeight: "600",
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
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  clearText: {
    fontSize: 15,
    fontWeight: "400",
  },

  // History rows
  historyRow: {
    paddingHorizontal: Spacing.screenPadding,
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
  rowDivider: {
    height: 0.5,
    marginLeft: Spacing.dividerIndent,
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

  // Upgrade banner
  upgradeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  upgradeBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },

  // Dev banner
  devBanner: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  devText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "500",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
    textAlign: "center",
  },

  // Safety dot for human food entries
  safetyDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
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
});
