import { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { AppText as Text, AppTextInput as TextInput } from "../components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import {
  ChevronLeft,
  LogOut,
  ChevronRight,
  Trash2,
  CreditCard,
  UserPlus,
  RefreshCw,
  Star,
  Mail,
  PawPrint,
  X,
  Dog,
  Cat,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { useAuth } from "../services/auth";
import { trackEvent } from "../services/analytics";
import {
  initializePurchases,
  restorePurchases,
  getRevenueCatResultAnalytics,
} from "../services/purchases";
import { openStoreReview } from "../services/reviewPrompt";
import { useTheme, Colors, Spacing, Shadows, Typography } from "../theme";
import { PRIVACY_HTML, TERMS_HTML } from "../legal";
import {
  PET_AVOID_PRESETS,
  hasUsablePetProfile,
  normalizePetProfile,
  parseAvoidIngredients,
  petProfileSummary,
} from "../services/petProfile";

const SUPPORT_EMAIL = "woofapp.help@gmail.com";

export default function ProfileScreen({ navigation, route }) {
  const theme = useTheme();
  const {
    profile,
    user,
    signOut,
    deleteAccount,
    isPro,
    isAnonymous,
    signInWithApple,
    signInWithGoogle,
    updatePetProfile,
    refreshProStatus,
  } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [savingApple, setSavingApple] = useState(false);
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showPetEditor, setShowPetEditor] = useState(false);
  const [petName, setPetName] = useState("");
  const [petType, setPetType] = useState("");
  const [petLifeStage, setPetLifeStage] = useState("adult");
  const [selectedAvoidIngredients, setSelectedAvoidIngredients] = useState([]);
  const [customAvoidIngredientsText, setCustomAvoidIngredientsText] = useState("");
  const [savingPet, setSavingPet] = useState(false);

  const signOutScale = useSharedValue(1);
  const signOutAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: signOutScale.value }],
  }));
  const spring = { damping: 15, stiffness: 150 };

  const displayName = isAnonymous
    ? "Guest User"
    : profile?.display_name || user?.email?.split("@")[0] || "User";
  const email = isAnonymous
    ? "Save your account to keep scans across devices"
    : profile?.email || user?.email || "";
  const avatarUrl = profile?.avatar_url;
  const initials = isAnonymous
    ? "G"
    : displayName
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  const savedPetProfile = normalizePetProfile(profile?.pet_profile);
  const hasSavedPet = hasUsablePetProfile(savedPetProfile);
  const petLifeStageOptions = [
    { value: "young", label: petType === "cat" ? "Kitten" : "Puppy" },
    { value: "adult", label: "Adult" },
    { value: "senior", label: "Senior" },
  ];

  const handleSaveAccount = async (provider) => {
    const setSaving = provider === "apple" ? setSavingApple : setSavingGoogle;
    const signIn = provider === "apple" ? signInWithApple : signInWithGoogle;

    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      trackEvent("guest_upgrade_started", { provider });
      await signIn();
      trackEvent("guest_upgrade_completed", { provider });
    } catch (err) {
      if (err.code === "ERR_REQUEST_CANCELED") {
        trackEvent("guest_upgrade_cancelled", { provider });
        return;
      }

      trackEvent("guest_upgrade_failed", {
        provider,
        code: err.code,
        message: err.message,
      });
      Alert.alert(
        "Could Not Save Account",
        err.message || "Please try again in a moment."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          try {
            trackEvent("profile_sign_out_confirmed");
            await signOut();
          } catch (err) {
            Alert.alert("Error", err.message);
          }
        },
      },
    ]);
  };

  const profileRestoreAnalytics = (extra = {}) => ({
    source: "profile",
    ...extra,
  });

  const handleRestorePurchases = async () => {
    if (restoring) return;

    try {
      setRestoring(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const purchasesInitialized = user?.id
        ? await initializePurchases(user.id)
        : false;
      trackEvent("restore_started", profileRestoreAnalytics({
        purchases_initialized: purchasesInitialized,
      }));

      const result = await restorePurchases();
      const resultAnalytics = getRevenueCatResultAnalytics(result);
      const analytics = profileRestoreAnalytics({
        purchases_initialized: purchasesInitialized,
        ...resultAnalytics,
      });

      if (result.success) {
        trackEvent("restore_completed", analytics);
        const proAfterRefresh = await refreshProStatus({
          source: "profile_restore",
          userId: user?.id,
        });
        trackEvent("restore_entitlement_refreshed", {
          ...analytics,
          is_pro: proAfterRefresh,
        });

        Alert.alert(
          proAfterRefresh ? "Purchases Restored" : "Restore Received",
          proAfterRefresh
            ? "Your Woof Pro access is active."
            : "Your purchase was found, but Pro access is still syncing. Please try again in a moment."
        );
      } else if (result.error) {
        trackEvent("restore_failed", {
          ...analytics,
          message: result.error,
        });
        Alert.alert("Restore Failed", result.error);
      } else if (resultAnalytics.active_entitlement_count > 0 || resultAnalytics.active_subscription_count > 0) {
        trackEvent("restore_no_entitlement", analytics);
        Alert.alert(
          "Restore Found",
          "We found purchase activity, but Pro access was not activated. Please contact support if Restore Purchases does not resolve this shortly."
        );
      } else {
        trackEvent("restore_no_purchases", analytics);
        Alert.alert("No Purchases Found", "We couldn't find any active subscriptions to restore.");
      }
    } catch (err) {
      trackEvent("restore_failed", profileRestoreAnalytics({
        message: err.message,
      }));
      Alert.alert("Restore Failed", err.message || "Please try again in a moment.");
    } finally {
      setRestoring(false);
    }
  };

  const handleSubscriptionPress = async () => {
    Haptics.selectionAsync();

    if (!isPro) {
      trackEvent("profile_upgrade_tapped", { is_pro: false });
      trackEvent("paywall_requested", {
        source: "profile",
        source_surface: "profile_subscription_row",
      });
      navigation.navigate("Paywall", { source: "profile" });
      return;
    }

    const url = Platform.select({
      ios: "https://apps.apple.com/account/subscriptions",
      android: "https://play.google.com/store/account/subscriptions",
    });

    trackEvent("subscription_manage_tapped", { is_pro: true, platform: Platform.OS });

    try {
      if (!url) throw new Error("Subscription management is not available on this platform.");
      await Linking.openURL(url);
      trackEvent("subscription_manage_opened", { platform: Platform.OS });
    } catch (err) {
      trackEvent("subscription_manage_failed", {
        platform: Platform.OS,
        message: err.message,
      });
      Alert.alert(
        "Could Not Open Subscriptions",
        "Please open your App Store or Google Play subscription settings to manage or cancel Woof Pro."
      );
    }
  };

  const handleRateWoof = async () => {
    Haptics.selectionAsync();
    const opened = await openStoreReview({
      source: "profile",
      isPro,
      scanMode: null,
    });

    if (!opened) {
      Alert.alert(
        "Could Not Open App Store",
        "Ratings are available from the App Store version of Woof. Please try again later."
      );
    }
  };

  const handleContactSupport = async () => {
    Haptics.selectionAsync();

    const appVersion = Constants.expoConfig?.version || Constants.nativeAppVersion || "unknown";
    const nativeBuildVersion = Constants.nativeBuildVersion || "unknown";
    const supportDiagnostics = [
      "",
      "",
      "---",
      "Woof support diagnostics",
      `App version: ${appVersion}`,
      `Build: ${nativeBuildVersion}`,
      `Platform: ${Platform.OS} ${Platform.Version || "unknown"}`,
      `Plan: ${isPro ? "pro" : "free"}`,
      `Account: ${isAnonymous ? "guest" : "signed_in"}`,
    ].join("\n");
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Woof Support")}&body=${encodeURIComponent(supportDiagnostics)}`;

    trackEvent("support_contact_tapped", {
      source: "profile",
      platform: Platform.OS,
      is_pro: isPro,
      account_type: isAnonymous ? "guest" : "signed_in",
    });

    try {
      await Linking.openURL(mailtoUrl);
      trackEvent("support_contact_opened", {
        source: "profile",
        platform: Platform.OS,
        is_pro: isPro,
        account_type: isAnonymous ? "guest" : "signed_in",
      });
    } catch (err) {
      trackEvent("support_contact_failed", {
        source: "profile",
        platform: Platform.OS,
        error_name: err.name,
      });
      Alert.alert(
        "Could Not Open Email",
        `Please email ${SUPPORT_EMAIL} and include what happened.`
      );
    }
  };

  const openPetEditor = () => {
    const current = normalizePetProfile(profile?.pet_profile);
    const presetValues = new Set(PET_AVOID_PRESETS.map((preset) => preset.toLowerCase()));
    setPetName(current.name);
    setPetType(current.petType);
    setPetLifeStage(current.lifeStage);
    setSelectedAvoidIngredients(current.avoidIngredients.filter((ingredient) => presetValues.has(ingredient)));
    setCustomAvoidIngredientsText(current.avoidIngredients.filter((ingredient) => !presetValues.has(ingredient)).join(", "));
    setShowPetEditor(true);
  };

  useEffect(() => {
    if (!route?.params?.openPetEditor) return;
    openPetEditor();
    navigation.setParams({ openPetEditor: false });
  }, [route?.params?.openPetEditor]);

  const toggleAvoidIngredient = (preset) => {
    Haptics.selectionAsync();
    const normalizedPreset = preset.toLowerCase();
    setSelectedAvoidIngredients((current) => current.includes(normalizedPreset)
      ? current.filter((ingredient) => ingredient !== normalizedPreset)
      : [...current, normalizedPreset]);
  };

  const handleSavePet = async () => {
    const nextProfile = normalizePetProfile({
      name: petName,
      petType,
      lifeStage: petLifeStage,
      avoidIngredients: [
        ...selectedAvoidIngredients,
        ...parseAvoidIngredients(customAvoidIngredientsText),
      ],
    });

    if (!nextProfile.name || !nextProfile.petType) {
      Alert.alert("Pet Details Needed", "Enter a name and choose dog or cat.");
      return;
    }

    try {
      setSavingPet(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updatePetProfile(nextProfile);
      setShowPetEditor(false);
      if (route?.params?.returnAfterPetSave && navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch (err) {
      Alert.alert("Could Not Save Pet", err.message || "Please try again in a moment.");
    } finally {
      setSavingPet(false);
    }
  };

  const handleDeleteAccount = () => {
    const title = isAnonymous ? "Delete Guest Data" : "Delete Account";
    const message = isAnonymous
      ? "This will permanently delete your guest profile, scan history, and all associated data. This action cannot be undone."
      : "This will permanently delete your account, scan history, and all associated data. This action cannot be undone.";
    const confirmMessage = isAnonymous
      ? "Your guest data will be permanently deleted."
      : "Your account and all data will be permanently deleted.";

    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: title,
          style: "destructive",
          onPress: () => {
            // Second confirmation
            Alert.alert(
              "Are you sure?",
              confirmMessage,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete Permanently",
                  style: "destructive",
                  onPress: async () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    setDeleting(true);
                    try {
                      trackEvent("account_delete_confirmed", {
                        account_type: isAnonymous ? "guest" : "signed_in",
                      });
                      await deleteAccount();
                    } catch (err) {
                      setDeleting(false);
                      Alert.alert("Error", "Failed to delete account. Please try again.");
                    }
                  },
                },
              ]
            );
          },
        },
      ]
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
          accessibilityHint="Returns to the previous screen"
        >
          <ChevronLeft size={28} color={theme.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
          Profile
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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

        <Animated.View
          entering={FadeInDown.delay(180).duration(400).springify()}
          style={[styles.petSection, { backgroundColor: theme.surface }, Shadows.card]}
        >
          <Pressable
            onPress={openPetEditor}
            style={({ pressed }) => [styles.petProfileButton, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={hasSavedPet ? `Edit ${savedPetProfile.name}'s pet details` : "Add pet details"}
            accessibilityHint="Sets the pet used for personalized ingredient and life-stage checks"
          >
            <View style={[styles.petIcon, { backgroundColor: theme.card }]}>
              <PawPrint size={20} color={theme.textPrimary} strokeWidth={1.8} />
            </View>
            <View style={styles.petProfileCopy}>
              <Text style={[styles.petProfileTitle, { color: theme.textPrimary }]}>
                {hasSavedPet ? savedPetProfile.name : "My Pet"}
              </Text>
              <Text style={[styles.petProfileSummary, { color: theme.textSecondary }]} numberOfLines={2}>
                {petProfileSummary(savedPetProfile)}
              </Text>
            </View>
            <ChevronRight size={18} color={theme.textTertiary} strokeWidth={1.8} />
          </Pressable>
        </Animated.View>

        {isAnonymous ? (
          <Animated.View
            entering={FadeInDown.delay(200).duration(400).springify()}
            style={[styles.guestSection, { backgroundColor: theme.surface }, Shadows.card]}
          >
            <View style={styles.guestHeader}>
              <UserPlus size={20} color={theme.textPrimary} strokeWidth={1.8} />
              <View style={styles.guestCopy}>
                <Text style={[styles.guestTitle, { color: theme.textPrimary }]}>
                  Save Your Scans
                </Text>
                <Text style={[styles.guestDescription, { color: theme.textSecondary }]}>
                  Add Apple or Google so your history and subscription can move with you.
                </Text>
              </View>
            </View>
            <View style={styles.saveButtons}>
              {Platform.OS === "ios" ? (
                <Pressable
                  onPress={() => handleSaveAccount("apple")}
                  disabled={savingApple || savingGoogle}
                  style={({ pressed }) => [
                    styles.saveButton,
                    { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.85 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Save account with Apple"
                  accessibilityHint="Links your guest scans to an Apple sign-in"
                  accessibilityState={{ disabled: savingApple || savingGoogle }}
                >
                  {savingApple ? (
                    <ActivityIndicator color={theme.buttonText} />
                  ) : (
                    <Text style={[styles.saveButtonText, { color: theme.buttonText }]}>
                      Save with Apple
                    </Text>
                  )}
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => handleSaveAccount("google")}
                disabled={savingApple || savingGoogle}
                style={({ pressed }) => [
                  styles.saveButton,
                  styles.saveButtonSecondary,
                  {
                    borderColor: theme.separator,
                    backgroundColor: theme.card,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save account with Google"
                accessibilityHint="Links your guest scans to a Google sign-in"
                accessibilityState={{ disabled: savingApple || savingGoogle }}
              >
                {savingGoogle ? (
                  <ActivityIndicator color={theme.textPrimary} />
                ) : (
                  <Text style={[styles.saveButtonText, { color: theme.textPrimary }]}>
                    Save with Google
                  </Text>
                )}
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {/* Subscription */}
        <Animated.View
          entering={FadeInDown.delay(isAnonymous ? 300 : 200).duration(400).springify()}
          style={[styles.legalSection, { backgroundColor: theme.surface }, Shadows.card]}
        >
          <Pressable
            onPress={handleSubscriptionPress}
            style={({ pressed }) => [styles.subscriptionPressable, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={isPro ? "Manage subscription" : "Upgrade to Pro"}
            accessibilityHint={isPro ? "Opens system subscription management" : "Opens Woof Pro plans"}
          >
            <View style={styles.subscriptionRow}>
              <CreditCard size={18} color={isPro ? Colors.scoreExcellent : theme.textSecondary} strokeWidth={1.8} />
              <View style={styles.subscriptionCopy}>
                <Text style={[styles.legalRowText, { color: theme.textPrimary }]}>
                  {isPro ? "Manage Subscription" : "Upgrade to Woof Pro"}
                </Text>
                <Text style={[styles.subscriptionStatus, { color: isPro ? Colors.scoreExcellent : theme.textTertiary }]}>
                  {isPro ? "Active" : "Free plan"}
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2} />
          </Pressable>
          <View style={[styles.legalDivider, { backgroundColor: theme.separator }]} />
          <Pressable
            onPress={handleRestorePurchases}
            disabled={restoring}
            style={({ pressed }) => [styles.subscriptionPressable, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            accessibilityHint="Checks App Store or Google Play purchases for an active Woof Pro subscription"
            accessibilityState={{ disabled: restoring, busy: restoring }}
          >
            <View style={styles.subscriptionRow}>
              <RefreshCw size={18} color={theme.textSecondary} strokeWidth={1.8} />
              <View style={styles.subscriptionCopy}>
                <Text style={[styles.legalRowText, { color: theme.textPrimary }]}>
                  Restore Purchases
                </Text>
                <Text style={[styles.subscriptionStatus, { color: theme.textTertiary }]}>
                  {restoring ? "Checking..." : "Use your App Store or Google Play purchase"}
                </Text>
              </View>
            </View>
            {restoring ? (
              <ActivityIndicator size="small" color={theme.textTertiary} />
            ) : (
              <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2} />
            )}
          </Pressable>
          <View style={[styles.legalDivider, { backgroundColor: theme.separator }]} />
          <Pressable
            onPress={handleRateWoof}
            style={({ pressed }) => [styles.subscriptionPressable, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Rate Woof"
            accessibilityHint="Opens the store rating page"
          >
            <View style={styles.subscriptionRow}>
              <Star size={18} color={theme.textSecondary} strokeWidth={1.8} />
              <View style={styles.subscriptionCopy}>
                <Text style={[styles.legalRowText, { color: theme.textPrimary }]}>
                  Rate Woof
                </Text>
                <Text style={[styles.subscriptionStatus, { color: theme.textTertiary }]}>
                  Support the app with a quick rating
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2} />
          </Pressable>
          <View style={[styles.legalDivider, { backgroundColor: theme.separator }]} />
          <Pressable
            onPress={handleContactSupport}
            style={({ pressed }) => [styles.subscriptionPressable, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Contact Support"
            accessibilityHint="Opens an email draft to Woof support"
          >
            <View style={styles.subscriptionRow}>
              <Mail size={18} color={theme.textSecondary} strokeWidth={1.8} />
              <View style={styles.subscriptionCopy}>
                <Text style={[styles.legalRowText, { color: theme.textPrimary }]}>
                  Contact Support
                </Text>
                <Text style={[styles.subscriptionStatus, { color: theme.textTertiary }]}>
                  Get help with scans, account, or Pro
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={theme.textTertiary} strokeWidth={2} />
          </Pressable>
        </Animated.View>

        {/* Legal Links */}
        <Animated.View
          entering={FadeInDown.delay(isAnonymous ? 400 : 300).duration(400).springify()}
          style={[styles.legalSection, { backgroundColor: theme.surface }, Shadows.card]}
        >
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              trackEvent("legal_link_opened", { source: "profile", document: "privacy" });
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
              trackEvent("legal_link_opened", { source: "profile", document: "terms" });
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

        {!isAnonymous ? (
          <Animated.View
            entering={FadeInDown.delay(400).duration(400).springify()}
            style={styles.signOutSection}
          >
            <Pressable
              onPress={handleSignOut}
              onPressIn={() => { signOutScale.value = withSpring(0.97, spring); }}
              onPressOut={() => { signOutScale.value = withSpring(1, spring); }}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              accessibilityHint="Shows a confirmation before signing out"
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
        ) : null}

        {/* Delete Account */}
        <Animated.View
          entering={FadeInDown.delay(500).duration(400).springify()}
          style={styles.deleteSection}
        >
          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            accessibilityRole="button"
            accessibilityLabel={isAnonymous ? "Delete guest data" : "Delete account"}
            accessibilityHint="Shows confirmations before deleting your saved app data"
            accessibilityState={{ disabled: deleting }}
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
                  {isAnonymous ? "Delete Guest Data" : "Delete Account"}
                </Text>
              </View>
            )}
          </Pressable>
        </Animated.View>

        {/* Version Footer */}
        <View style={styles.footer}>
          <Text style={[styles.versionText, { color: theme.textTertiary }]}>
            Woof v{appVersion}
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showPetEditor}
        transparent
        animationType="fade"
        onRequestClose={() => !savingPet && setShowPetEditor(false)}
      >
        <KeyboardAvoidingView
          style={styles.petModalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !savingPet && setShowPetEditor(false)}
            accessibilityRole="button"
            accessibilityLabel="Close pet details"
          />
          <View
            style={[styles.petModalCard, { backgroundColor: theme.card }]}
            accessibilityViewIsModal
          >
            <View style={styles.petModalHeader}>
              <Text style={[styles.petModalTitle, { color: theme.textPrimary }]}>Pet Details</Text>
              <Pressable
                onPress={() => setShowPetEditor(false)}
                disabled={savingPet}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close pet details"
              >
                <X size={22} color={theme.textPrimary} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.petModalContent}
            >
              <Text style={[styles.petFieldLabel, { color: theme.textSecondary }]}>Name</Text>
              <TextInput
                value={petName}
                onChangeText={setPetName}
                placeholder="Pet name"
                placeholderTextColor={theme.textTertiary}
                maxLength={40}
                autoCapitalize="words"
                returnKeyType="done"
                style={[
                  styles.petTextInput,
                  { color: theme.textPrimary, borderColor: theme.separator, backgroundColor: theme.bg },
                ]}
                accessibilityLabel="Pet name"
              />

              <Text style={[styles.petFieldLabel, { color: theme.textSecondary }]}>Pet Type</Text>
              <View style={[styles.petSegmentedControl, { backgroundColor: theme.bg }]}>
                {[
                  { value: "dog", label: "Dog", Icon: Dog },
                  { value: "cat", label: "Cat", Icon: Cat },
                ].map(({ value, label, Icon }) => {
                  const selected = petType === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPetType(value);
                      }}
                      style={[
                        styles.petTypeOption,
                        selected && { backgroundColor: theme.buttonPrimary },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityHint={`Sets ${label.toLowerCase()} as the pet type`}
                      accessibilityState={{ selected }}
                    >
                      <Icon size={18} color={selected ? theme.buttonText : theme.textSecondary} strokeWidth={1.8} />
                      <Text style={[styles.petTypeText, { color: selected ? theme.buttonText : theme.textSecondary }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.petFieldLabel, { color: theme.textSecondary }]}>Life Stage</Text>
              <View style={styles.petLifeStageRow}>
                {petLifeStageOptions.map((option) => {
                  const selected = petLifeStage === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPetLifeStage(option.value);
                      }}
                      style={[
                        styles.petLifeStageOption,
                        {
                          borderColor: selected ? theme.buttonPrimary : theme.separator,
                          backgroundColor: selected ? theme.buttonPrimary : theme.bg,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityHint={`Sets ${option.label.toLowerCase()} as the pet life stage`}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.petLifeStageText, { color: selected ? theme.buttonText : theme.textSecondary }]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.petFieldLabel, { color: theme.textSecondary }]}>Avoid Ingredients</Text>
              <View style={styles.petAvoidPresets}>
                {PET_AVOID_PRESETS.map((preset) => {
                  const selected = selectedAvoidIngredients.includes(preset.toLowerCase());
                  return (
                    <Pressable
                      key={preset}
                      onPress={() => toggleAvoidIngredient(preset)}
                      style={[
                        styles.petAvoidChip,
                        {
                          borderColor: selected ? theme.buttonPrimary : theme.separator,
                          backgroundColor: selected ? theme.buttonPrimary : theme.bg,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Avoid ${preset}`}
                      accessibilityHint={`Adds or removes ${preset.toLowerCase()} from the avoid list`}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.petAvoidChipText, { color: selected ? theme.buttonText : theme.textSecondary }]}>
                        {preset}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={customAvoidIngredientsText}
                onChangeText={setCustomAvoidIngredientsText}
                placeholder="Other ingredients, separated by commas"
                placeholderTextColor={theme.textTertiary}
                maxLength={300}
                autoCapitalize="none"
                style={[
                  styles.petTextInput,
                  styles.petAvoidInput,
                  { color: theme.textPrimary, borderColor: theme.separator, backgroundColor: theme.bg },
                ]}
                accessibilityLabel="Ingredients to avoid"
              />
            </ScrollView>

            <Pressable
              onPress={handleSavePet}
              disabled={savingPet}
              style={({ pressed }) => [
                styles.petSaveButton,
                { backgroundColor: theme.buttonPrimary, opacity: savingPet || pressed ? 0.75 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save pet details"
              accessibilityState={{ disabled: savingPet }}
            >
              {savingPet ? (
                <ActivityIndicator color={theme.buttonText} />
              ) : (
                <Text style={[styles.petSaveButtonText, { color: theme.buttonText }]}>Save Pet</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
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
    textAlign: "center",
    paddingHorizontal: Spacing.screenPadding,
  },
  guestSection: {
    marginHorizontal: Spacing.screenPadding,
    borderRadius: Spacing.cardRadius,
    marginBottom: 24,
    padding: 16,
  },
  petSection: {
    marginHorizontal: Spacing.screenPadding,
    borderRadius: Spacing.cardRadius,
    marginBottom: 24,
  },
  petProfileButton: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  petIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  petProfileCopy: {
    flex: 1,
    minWidth: 0,
  },
  petProfileTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  petProfileSummary: {
    ...Typography.caption,
    lineHeight: 18,
    marginTop: 2,
  },
  guestHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  guestCopy: {
    flex: 1,
  },
  guestTitle: {
    ...Typography.body,
    fontWeight: "600",
    marginBottom: 3,
  },
  guestDescription: {
    ...Typography.caption,
    lineHeight: 18,
  },
  saveButtons: {
    marginTop: 14,
    gap: 10,
  },
  saveButton: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  saveButtonSecondary: {
    borderWidth: 1,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  legalSection: {
    marginHorizontal: Spacing.screenPadding,
    borderRadius: Spacing.cardRadius,
    marginBottom: 24,
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
    flex: 1,
    gap: 12,
    minWidth: 0,
  },
  subscriptionCopy: {
    flex: 1,
    minWidth: 0,
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
  footer: {
    alignItems: "center",
    paddingTop: 22,
  },
  versionText: {
    ...Typography.caption,
  },
  petModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  petModalCard: {
    maxHeight: "88%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 18,
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 24,
  },
  petModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  petModalTitle: {
    ...Typography.sectionHeader,
  },
  petModalContent: {
    paddingBottom: 18,
  },
  petFieldLabel: {
    ...Typography.caption,
    fontWeight: "600",
    marginTop: 14,
    marginBottom: 7,
  },
  petTextInput: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  petSegmentedControl: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 3,
    gap: 3,
  },
  petTypeOption: {
    flex: 1,
    minHeight: 42,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  petTypeText: {
    fontSize: 15,
    fontWeight: "600",
  },
  petLifeStageRow: {
    flexDirection: "row",
    gap: 8,
  },
  petLifeStageOption: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  petLifeStageText: {
    fontSize: 14,
    fontWeight: "600",
  },
  petAvoidPresets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  petAvoidChip: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 11,
  },
  petAvoidChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  petAvoidInput: {
    marginTop: 10,
  },
  petSaveButton: {
    height: Spacing.buttonHeight,
    borderRadius: Spacing.buttonRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  petSaveButtonText: {
    ...Typography.button,
  },
});
