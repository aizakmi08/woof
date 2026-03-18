import { StyleSheet, Text, View, Image, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import { ChevronLeft, LogOut, ChevronRight } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { useAuth } from "../services/auth";
import { useTheme, Colors, Spacing, Shadows, Typography } from "../theme";
import { PRIVACY_HTML, TERMS_HTML } from "../legal";

export default function ProfileScreen({ navigation }) {
  const theme = useTheme();
  const { profile, user, signOut } = useAuth();

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
          <ChevronLeft size={28} color={theme.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
          Profile
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Avatar + Info */}
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
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <Text style={[styles.initials, { color: theme.textSecondary }]}>
              {initials}
            </Text>
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

      {/* Legal Links */}
      <Animated.View
        entering={FadeInDown.delay(200).duration(400).springify()}
        style={[styles.legalSection, { backgroundColor: theme.surface }, Shadows.card]}
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
          <Text style={[styles.legalRowText, { color: theme.textPrimary }]}>
            Privacy Policy
          </Text>
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
          <Text style={[styles.legalRowText, { color: theme.textPrimary }]}>
            Terms of Use
          </Text>
          <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2} />
        </Pressable>
      </Animated.View>

      {/* Sign Out */}
      <Animated.View
        entering={FadeInDown.delay(300).duration(400).springify()}
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
              styles.signOutButton,
              { borderColor: Colors.scoreConcerning },
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
    paddingTop: 32,
    paddingBottom: 40,
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
    borderRadius: Spacing.cardRadius,
    marginBottom: 24,
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
  legalDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.dividerIndent,
  },
  signOutSection: {
    paddingHorizontal: Spacing.screenPadding,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: Spacing.buttonHeight,
    borderRadius: Spacing.buttonRadius,
    borderWidth: 1.5,
    gap: 8,
  },
  signOutText: {
    ...Typography.button,
  },
  footer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 24,
  },
  versionText: {
    ...Typography.caption,
  },
});
