import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View, Image, Pressable, Alert, ActivityIndicator, Platform, Linking, DeviceEventEmitter } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import { ChevronLeft, LogOut, ChevronRight, Trash2, Star, User, Shield, FileText, Sun, Moon, Smartphone, PlayCircle } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { useAuth } from "../services/auth";
import { useTheme, Colors, Spacing, Shadows, Typography } from "../theme";
import { PRIVACY_HTML, TERMS_HTML } from "../legal";

const SUPPORT_EMAIL = "woofapp.help@gmail.com";
const SUBSCRIPTION_URLS = {
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
};

export default function ProfileScreen({ navigation }) {
  const theme = useTheme();
  const {
    profile, user, signOut, deleteAccount, isPro, isGuest,
    isDev, forceFreeTier, setForceFreeTier, resetScanCount, resetHumanFoodQuota,
    scanCount, humanFoodCountToday,
  } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const signOutScale = useSharedValue(1);
  const signOutAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: signOutScale.value }],
  }));
  const spring = { damping: 15, stiffness: 150 };

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "User";
  const email = profile?.email || user?.email || "";
  const avatarUrl = profile?.avatar_url;
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          try {
            await signOut();
          } catch (err) {
            Alert.alert("Error", err.message);
          }
        },
      },
    ]);
  };

  const handleReplayOnboarding = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // App.js listens for this event and re-shows the onboarding flow.
    DeviceEventEmitter.emit("@woof/replay-onboarding");
  };

  const showManageSubscriptionFallback = useCallback(() => {
    const instructions = Platform.select({
      ios: "Open Settings, tap your Apple ID, then Subscriptions. Choose Woof to manage or cancel.",
      android: "Open Google Play, tap your profile icon, then Payments & subscriptions. Choose Woof to manage or cancel.",
      default: "Open your device subscription settings and choose Woof to manage or cancel.",
    });

    Alert.alert(
      "Manage Subscription",
      `${instructions}\n\nIf you need help, contact ${SUPPORT_EMAIL}.`,
      [
        { text: "OK", style: "cancel" },
        {
          text: "Email Support",
          onPress: () => {
            Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Woof%20Subscription%20Help`).catch(() => {});
          },
        },
      ],
    );
  }, []);

  const handleManageSubscription = useCallback(async () => {
    Haptics.selectionAsync();
    if (!isPro) {
      navigation.navigate("Paywall", { source: "profile" });
      return;
    }

    const url = Platform.select(SUBSCRIPTION_URLS);
    if (!url) {
      showManageSubscriptionFallback();
      return;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showManageSubscriptionFallback();
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      console.log("[PROFILE] Manage subscription link failed:", err.message);
      showManageSubscriptionFallback();
    }
  }, [isPro, navigation, showManageSubscriptionFallback]);

  // Guard so rapid taps can't queue overlapping confirmation alerts.
  const deleteFlowOpenRef = useRef(false);

  const handleDeleteAccount = () => {
    if (deleteFlowOpenRef.current || deleting) return;
    deleteFlowOpenRef.current = true;
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account, scan history, and all associated data. This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => { deleteFlowOpenRef.current = false; },
        },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            // Second confirmation
            Alert.alert(
              "Are you sure?",
              "Your account and all data will be permanently deleted.",
              [
                {
                  text: "Cancel",
                  style: "cancel",
                  onPress: () => { deleteFlowOpenRef.current = false; },
                },
                {
                  text: "Delete Permanently",
                  style: "destructive",
                  onPress: async () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    setDeleting(true);
                    try {
                      await deleteAccount();
                    } catch (err) {
                      Alert.alert("Error", "Failed to delete account. Please try again.");
                    } finally {
                      setDeleting(false);
                      deleteFlowOpenRef.current = false;
                    }
                  },
                },
              ],
              { onDismiss: () => { deleteFlowOpenRef.current = false; } },
            );
          },
        },
      ],
      { onDismiss: () => { deleteFlowOpenRef.current = false; } },
    );
  };

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            navigation.goBack();
          }}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <View style={[styles.backCircle, { backgroundColor: theme.surface }]}>
            <ChevronLeft size={20} color={theme.textPrimary} strokeWidth={2.5} />
          </View>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
          Profile
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Guest: Sign-in prompt */}
      {isGuest ? (
        <Animated.View
          entering={FadeInDown.delay(100).duration(400).springify()}
          style={styles.profileSection}
        >
          <View
            style={[
              styles.avatarContainer,
              { backgroundColor: theme.surface },
              Shadows.card,
            ]}
          >
            <User size={32} color={theme.textTertiary} strokeWidth={1.5} />
          </View>
          <Text style={[styles.displayName, { color: theme.textPrimary }]}>
            Guest
          </Text>
          <Text style={[styles.email, { color: theme.textSecondary }]}>
            Sign in to sync history across devices
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              navigation.navigate("Auth");
            }}
            style={({ pressed }) => [
              styles.signInButton,
              { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={[styles.signInButtonText, { color: theme.buttonText }]}>
              Sign In
            </Text>
          </Pressable>
        </Animated.View>
      ) : (
        <>
          {/* Avatar + Info */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(400).springify()}
            style={styles.profileSection}
          >
            <View style={[styles.avatarContainer, Shadows.card]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <LinearGradient
                  colors={["#5E5CE6", "#BF5AF2"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarGradient}
                >
                  <Text style={[styles.initials, { color: "#FFFFFF" }]}>
                    {initials}
                  </Text>
                </LinearGradient>
              )}
            </View>
            <Text style={[styles.displayName, { color: theme.textPrimary }]}>
              {displayName}
            </Text>
            {email ? (
              <Text style={[styles.email, { color: theme.textSecondary }]}>
                {email}
              </Text>
            ) : null}
          </Animated.View>

          {/* Subscription */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(400).springify()}
            style={[styles.legalSection, { backgroundColor: theme.card }, Shadows.card]}
          >
            <Pressable
              onPress={handleManageSubscription}
              style={({ pressed }) => [styles.subscriptionPressable, { opacity: pressed ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={isPro ? "Manage subscription" : "Upgrade to Pro"}
              accessibilityHint={isPro ? "Opens your device subscription settings, or shows instructions if they cannot be opened." : "Opens the Woof Pro upgrade screen."}
            >
              <View style={styles.subscriptionRow}>
                <LinearGradient
                  colors={["#FFD60A", "#FF9F0A"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.subscriptionIconBadge}
                >
                  <Star size={16} color="#FFFFFF" strokeWidth={1.8} />
                </LinearGradient>
                <View>
                  <Text style={[styles.legalRowText, { color: theme.textPrimary }]}>
                    {isPro ? "Woof Pro" : "Upgrade to Woof Pro"}
                  </Text>
                  <Text style={[styles.subscriptionStatus, { color: isPro ? Colors.scoreExcellent : theme.textTertiary }]}>
                    {isPro ? "Active" : "Free plan"}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {isPro && (
                  <View style={styles.proBadge}>
                    <Text style={styles.proBadgeText}>PRO</Text>
                  </View>
                )}
                <ChevronRight size={16} color={theme.textTertiary} strokeWidth={2} />
              </View>
            </Pressable>
          </Animated.View>
        </>
      )}

      {/* Legal Links */}
      <Animated.View
        entering={FadeInDown.delay(300).duration(400).springify()}
        style={[styles.legalSection, { backgroundColor: theme.card }, Shadows.card]}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            navigation.navigate("WebView", { title: "Privacy Policy", html: PRIVACY_HTML });
          }}
          style={({ pressed }) => [styles.legalRow, { opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.legalIconBadge}>
              <Shield size={15} color="#007AFF" strokeWidth={2} />
            </View>
            <Text style={[styles.legalRowText, { color: theme.textPrimary }]}>
              Privacy Policy
            </Text>
          </View>
          <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2} />
        </Pressable>
        <View style={[styles.legalDivider, { backgroundColor: theme.separator }]} />
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            navigation.navigate("WebView", { title: "Terms of Use", html: TERMS_HTML });
          }}
          style={({ pressed }) => [styles.legalRow, { opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="link"
          accessibilityLabel="Terms of Use"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[styles.legalIconBadge, { backgroundColor: "rgba(88,86,214,0.1)" }]}>
              <FileText size={15} color="#5856D6" strokeWidth={2} />
            </View>
            <Text style={[styles.legalRowText, { color: theme.textPrimary }]}>
              Terms of Use
            </Text>
          </View>
          <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2} />
        </Pressable>
      </Animated.View>

      {/* Appearance */}
      <Animated.View
        entering={FadeInDown.delay(350).duration(400).springify()}
        style={[styles.legalSection, { backgroundColor: theme.card }, Shadows.card]}
      >
        <View style={styles.appearanceSection}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <View style={[styles.legalIconBadge, { backgroundColor: "rgba(142,142,147,0.1)" }]}>
              <Moon size={15} color="#8E8E93" strokeWidth={2} />
            </View>
            <Text style={[styles.legalRowText, { color: theme.textPrimary }]}>
              Appearance
            </Text>
          </View>
          <View style={styles.themeToggleRow}>
            {[
              { key: "system", label: "Auto", Icon: Smartphone },
              { key: "light", label: "Light", Icon: Sun },
              { key: "dark", label: "Dark", Icon: Moon },
            ].map(({ key, label, Icon }) => {
              const active = theme.preference === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    theme.setThemePreference(key);
                  }}
                  style={[
                    styles.themeOption,
                    { backgroundColor: active ? theme.buttonPrimary : theme.fill },
                  ]}
                >
                  <Icon size={16} color={active ? theme.buttonText : theme.textSecondary} strokeWidth={1.8} />
                  <Text style={[styles.themeOptionText, { color: active ? theme.buttonText : theme.textSecondary }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Animated.View>

      {/* Dev Tools — only visible in development builds */}
      {isDev && (
        <Animated.View
          entering={FadeInDown.delay(400).duration(400).springify()}
          style={styles.devToolsSection}
        >
          <Text style={[styles.devToolsLabel, { color: theme.textTertiary }]}>
            DEV TOOLS
          </Text>
          <View style={[styles.devToolsCard, { backgroundColor: theme.card }, Shadows.card]}>
            {/* Toggle row */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setForceFreeTier(!forceFreeTier);
              }}
              style={({ pressed }) => [styles.devRow, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="switch"
              accessibilityState={{ checked: forceFreeTier }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.devRowTitle, { color: theme.textPrimary }]}>
                  Simulate free tier
                </Text>
                <Text style={[styles.devRowSub, { color: theme.textTertiary }]}>
                  {forceFreeTier
                    ? `Real limits active · ${scanCount}/3 scans · ${humanFoodCountToday}/1 safety check today`
                    : "Dev bypass active — all limits unlocked"}
                </Text>
              </View>
              <View
                style={[
                  styles.devToggleTrack,
                  { backgroundColor: forceFreeTier ? Colors.scoreExcellent : theme.divider },
                ]}
              >
                <View
                  style={[
                    styles.devToggleThumb,
                    { transform: [{ translateX: forceFreeTier ? 18 : 2 }] },
                  ]}
                />
              </View>
            </Pressable>

            <View style={[styles.devDivider, { backgroundColor: theme.divider }]} />

            {/* Reset scan count */}
            <Pressable
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await resetScanCount();
                Alert.alert("Reset", "Scan count reset to 0.");
              }}
              style={({ pressed }) => [styles.devRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.devRowTitle, { color: theme.textPrimary }]}>
                  Reset scan count
                </Text>
                <Text style={[styles.devRowSub, { color: theme.textTertiary }]}>
                  Currently {scanCount}/3 — tap to reset to 0
                </Text>
              </View>
              <ChevronRight size={16} color={theme.textTertiary} strokeWidth={2} />
            </Pressable>

            <View style={[styles.devDivider, { backgroundColor: theme.divider }]} />

            {/* Reset human food count */}
            <Pressable
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await resetHumanFoodQuota();
                Alert.alert("Reset", "Human-food quota reset for today.");
              }}
              style={({ pressed }) => [styles.devRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.devRowTitle, { color: theme.textPrimary }]}>
                  Reset today's safety check
                </Text>
                <Text style={[styles.devRowSub, { color: theme.textTertiary }]}>
                  Currently {humanFoodCountToday}/1 — tap to reset to 0
                </Text>
              </View>
              <ChevronRight size={16} color={theme.textTertiary} strokeWidth={2} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Replay Onboarding — useful for testing + curious users */}
      <Animated.View
        entering={FadeInDown.delay(425).duration(400).springify()}
        style={styles.signOutSection}
      >
        <Pressable
          onPress={handleReplayOnboarding}
          accessibilityRole="button"
          accessibilityLabel="Replay app intro"
        >
          {({ pressed }) => (
            <View
              style={[
                styles.signOutCard,
                { backgroundColor: theme.card, opacity: pressed ? 0.85 : 1 },
                Shadows.card,
              ]}
            >
              <PlayCircle size={18} color={theme.textPrimary} strokeWidth={2} />
              <Text style={[styles.signOutText, { color: theme.textPrimary }]}>
                Replay App Intro
              </Text>
            </View>
          )}
        </Pressable>
      </Animated.View>

      {/* Sign Out — authenticated users only */}
      {!isGuest && (
        <Animated.View
          entering={FadeInDown.delay(450).duration(400).springify()}
          style={styles.signOutSection}
        >
          <Pressable
            onPress={handleSignOut}
            onPressIn={() => { signOutScale.value = withSpring(0.97, spring); }}
            onPressOut={() => { signOutScale.value = withSpring(1, spring); }}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Animated.View
              style={[
                styles.signOutCard,
                { backgroundColor: theme.card },
                Shadows.card,
                signOutAnimStyle,
              ]}
            >
              <LogOut size={18} color={Colors.scoreConcerning} strokeWidth={2} />
              <Text style={[styles.signOutText, { color: Colors.scoreConcerning }]}>
                Sign Out
              </Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      )}

      {/* Delete Account — authenticated users only */}
      {!isGuest && (
        <Animated.View
          entering={FadeInDown.delay(550).duration(400).springify()}
          style={styles.deleteSection}
        >
        <Pressable
          onPress={handleDeleteAccount}
          disabled={deleting}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
        >
          {deleting ? (
            <View style={styles.deleteRow}>
              <ActivityIndicator size="small" color={Colors.scoreConcerning} />
              <Text style={[styles.deleteText, { color: Colors.scoreConcerning }]}>
                Deleting...
              </Text>
            </View>
          ) : (
            <View style={styles.deleteRow}>
              <Trash2 size={14} color={Colors.scoreConcerning} strokeWidth={1.5} />
              <Text style={[styles.deleteText, { color: Colors.scoreConcerning }]}>
                Delete Account
              </Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
      )}

      {/* Version Footer */}
      <View style={styles.footer}>
        <Text style={[styles.versionText, { color: theme.textTertiary }]}>
          Woof v{appVersion}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: 12,
  },
  headerTitle: {
    ...Typography.cardTitle,
  },
  profileSection: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 32,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 16,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  initials: {
    fontSize: 28,
    fontWeight: "600",
  },
  displayName: {
    ...Typography.sectionHeader,
    marginBottom: 4,
  },
  email: {
    ...Typography.body,
  },
  legalSection: {
    marginHorizontal: Spacing.screenPadding,
    borderRadius: 16,
    marginBottom: 16,
  },
  subscriptionPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  subscriptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  subscriptionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  subscriptionStatus: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 1,
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 48,
  },
  legalRowText: {
    ...Typography.body,
    fontWeight: "500",
  },
  legalIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,122,255,0.1)",
  },
  legalDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.dividerIndent,
  },
  appearanceSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  themeToggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  signOutSection: {
    paddingHorizontal: Spacing.screenPadding,
  },
  devToolsSection: {
    paddingHorizontal: Spacing.screenPadding,
    marginBottom: 8,
  },
  devToolsLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 8,
    marginLeft: 4,
  },
  devToolsCard: {
    borderRadius: Spacing.cardRadius,
    overflow: "hidden",
  },
  devRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  devRowTitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.1,
    marginBottom: 2,
  },
  devRowSub: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
  },
  devDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  devToggleTrack: {
    width: 38,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
  },
  devToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  proBadge: {
    backgroundColor: "rgba(255,159,10,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  proBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF9F0A",
  },
  signOutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
  },
  signOutText: {
    ...Typography.button,
  },
  deleteSection: {
    alignItems: "center",
    marginTop: 24,
  },
  deleteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: "400",
  },
  signInButton: {
    height: Spacing.buttonHeight,
    borderRadius: Spacing.buttonRadius,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    marginTop: 24,
    marginHorizontal: Spacing.screenPadding,
  },
  signInButtonText: {
    ...Typography.button,
  },
  footer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 28,
  },
  versionText: {
    ...Typography.caption,
  },
});
