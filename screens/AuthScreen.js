import { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { AppText as Text, MAX_FONT_SIZE_MULTIPLIER } from "../components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import { WebView } from "react-native-webview";
import { UserRound, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { anonymousSignInErrorKind, useAuth } from "../services/auth";
import { useTheme, Colors, Spacing, Shadows, Typography } from "../theme";
import { PRIVACY_HTML, TERMS_HTML } from "../legal";
import { trackEvent } from "../services/analytics";
import { BrandLogo } from "../components/BrandLogo";
import { BRAND_NAME, BRAND_TAGLINE } from "../config/brand";

function AuthButton({ onPress, onPressIn, onPressOut, style, children, disabled, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      {children}
    </Pressable>
  );
}

function providerErrorCopy(provider, error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  if (code === "err_request_canceled" || code === "err_request_cancelled") {
    return null;
  }

  if (
    provider === "apple" &&
    (
      code === "err_request_unknown" ||
      message.includes("unknown reason") ||
      message.includes("authorizationerror error 1000")
    )
  ) {
    return {
      title: "Apple Sign-In Unavailable",
      message: "Apple Sign-In needs an Apple Account on this device. Sign in to iCloud in Settings or continue with Google.",
    };
  }

  return {
    title: "Sign In Failed",
    message: `We couldn't sign you in with ${provider === "apple" ? "Apple" : "Google"}. Please try again or use another sign-in option.`,
  };
}

export default function AuthScreen() {
  const theme = useTheme();
  const {
    anonymousUnavailable,
    signInWithApple,
    signInWithGoogle,
    startAnonymousSession,
  } = useAuth();
  const [loadingApple, setLoadingApple] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingGuest, setLoadingGuest] = useState(false);
  const [legalModal, setLegalModal] = useState(null); // { title, html } or null

  const appleScale = useSharedValue(1);
  const googleScale = useSharedValue(1);
  const guestScale = useSharedValue(1);
  const appleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: appleScale.value }],
  }));
  const googleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: googleScale.value }],
  }));
  const guestAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: guestScale.value }],
  }));

  const spring = { damping: 15, stiffness: 150 };

  useEffect(() => {
    trackEvent("auth_viewed", {
      guest_option_available: !anonymousUnavailable,
      apple_available: Platform.OS === "ios",
      google_available: true,
    });
  }, [anonymousUnavailable]);

  const handleApple = async () => {
    try {
      setLoadingApple(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      trackEvent("auth_sign_in_started", { provider: "apple" });
      await signInWithApple();
      trackEvent("auth_sign_in_completed_client", { provider: "apple" });
    } catch (err) {
      const errorCopy = providerErrorCopy("apple", err);
      if (errorCopy) {
        trackEvent("auth_sign_in_failed", {
          provider: "apple",
          code: err.code,
          message: err.message,
        });
        Alert.alert(errorCopy.title, errorCopy.message);
      } else {
        trackEvent("auth_sign_in_cancelled", { provider: "apple" });
      }
    } finally {
      setLoadingApple(false);
    }
  };

  const handleGoogle = async () => {
    try {
      setLoadingGoogle(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      trackEvent("auth_sign_in_started", { provider: "google" });
      await signInWithGoogle();
      trackEvent("auth_sign_in_completed_client", { provider: "google" });
    } catch (err) {
      const errorCopy = providerErrorCopy("google", err);
      if (!errorCopy) {
        trackEvent("auth_sign_in_cancelled", { provider: "google" });
      } else {
        trackEvent("auth_sign_in_failed", {
          provider: "google",
          code: err.code,
          message: err.message,
        });
        Alert.alert(errorCopy.title, errorCopy.message);
      }
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleGuest = async () => {
    try {
      setLoadingGuest(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      trackEvent("guest_continue_started", { source: "auth_screen" });
      await startAnonymousSession({ automatic: false });
      trackEvent("guest_continue_completed", { source: "auth_screen" });
    } catch (err) {
      const failureKind = anonymousSignInErrorKind(err);
      trackEvent("guest_continue_failed", {
        source: "auth_screen",
        code: err.code,
        failure_kind: failureKind,
        message: err.message,
      });
      Alert.alert(
        failureKind === "capability" ? "Guest Mode Unavailable" : "Couldn't Start Guest Mode",
        failureKind === "capability"
          ? "Guest access is not enabled right now. Continue with Apple or Google."
          : "Check your connection and try again. You can also continue with Apple or Google."
      );
    } finally {
      setLoadingGuest(false);
    }
  };

  const isLoading = loadingApple || loadingGoogle || loadingGuest;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Branding */}
      <View style={styles.brandingContainer}>
        <Animated.View
          entering={FadeInDown.delay(100).duration(500).springify()}
          style={styles.brandRow}
        >
          <BrandLogo size={64} />
          <Text style={[styles.brand, { color: theme.textPrimary }]}>{BRAND_NAME}</Text>
        </Animated.View>
        <Animated.Text
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          entering={FadeInDown.delay(200).duration(500).springify()}
          style={[styles.tagline, { color: theme.textTertiary }]}
        >
          {BRAND_TAGLINE}
        </Animated.Text>
      </View>

      {/* Buttons */}
      <View style={styles.buttonsContainer}>
        {Platform.OS === "ios" && (
          <Animated.View
            entering={FadeInDown.delay(300).duration(400).springify()}
          >
            <AuthButton
              onPress={handleApple}
              onPressIn={() => { appleScale.value = withSpring(0.97, spring); }}
              onPressOut={() => { appleScale.value = withSpring(1, spring); }}
              disabled={isLoading}
              accessibilityLabel="Continue with Apple"
            >
              <Animated.View
                style={[
                  styles.button,
                  styles.appleButton,
                  { backgroundColor: theme.buttonPrimary },
                  Shadows.button,
                  appleAnimStyle,
                ]}
              >
                {loadingApple ? (
                  <ActivityIndicator color={theme.buttonText} />
                ) : (
                  <>
                    <Text style={[styles.appleIcon, { color: theme.buttonText }]}>
                      {"\uF8FF"}
                    </Text>
                    <Text style={[styles.buttonText, { color: theme.buttonText }]}>
                      Continue with Apple
                    </Text>
                  </>
                )}
              </Animated.View>
            </AuthButton>
          </Animated.View>
        )}

        <Animated.View
          entering={FadeInDown.delay(Platform.OS === "ios" ? 400 : 300).duration(400).springify()}
        >
          <AuthButton
            onPress={handleGoogle}
            onPressIn={() => { googleScale.value = withSpring(0.97, spring); }}
            onPressOut={() => { googleScale.value = withSpring(1, spring); }}
            disabled={isLoading}
            accessibilityLabel="Continue with Google"
          >
            <Animated.View
              style={[
                styles.button,
                styles.googleButton,
                { backgroundColor: theme.card, borderColor: theme.separator },
                Shadows.card,
                googleAnimStyle,
              ]}
            >
              {loadingGoogle ? (
                <ActivityIndicator color={theme.textPrimary} />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={[styles.buttonText, { color: theme.textPrimary }]}>
                    Continue with Google
                  </Text>
                </>
              )}
            </Animated.View>
          </AuthButton>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(Platform.OS === "ios" ? 500 : 400).duration(400).springify()}
        >
          <AuthButton
            onPress={handleGuest}
            onPressIn={() => { guestScale.value = withSpring(0.97, spring); }}
            onPressOut={() => { guestScale.value = withSpring(1, spring); }}
            disabled={isLoading}
            accessibilityLabel={anonymousUnavailable ? "Retry guest mode" : "Continue as guest"}
          >
            <Animated.View
              style={[
                styles.button,
                styles.guestButton,
                { backgroundColor: theme.surface, borderColor: theme.separator },
                guestAnimStyle,
              ]}
            >
              {loadingGuest ? (
                <ActivityIndicator color={theme.textPrimary} />
              ) : (
                <>
                  <UserRound size={19} color={theme.textPrimary} strokeWidth={2} />
                  <Text style={[styles.buttonText, { color: theme.textPrimary }]}>
                    {anonymousUnavailable ? "Retry Guest Mode" : "Continue as Guest"}
                  </Text>
                </>
              )}
            </Animated.View>
          </AuthButton>
        </Animated.View>

        {/* Legal */}
        <Animated.View
          entering={FadeInDown.delay(Platform.OS === "ios" ? 600 : 500).duration(400).springify()}
          style={styles.legalContainer}
        >
          <Text style={[styles.legalText, { color: theme.textTertiary }]}>
            By continuing, you agree to our{" "}
          </Text>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setLegalModal({ title: "Terms of Use", html: TERMS_HTML });
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            accessibilityRole="link"
            accessibilityLabel="Terms of Use"
          >
            <Text style={[styles.legalLink, { color: theme.textTertiary }]}>Terms</Text>
          </Pressable>
          <Text style={[styles.legalText, { color: theme.textTertiary }]}> and </Text>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setLegalModal({ title: "Privacy Policy", html: PRIVACY_HTML });
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          >
            <Text style={[styles.legalLink, { color: theme.textTertiary }]}>Privacy Policy</Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* Legal modal */}
      <Modal
        visible={!!legalModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLegalModal(null)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.bg }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              {legalModal?.title}
            </Text>
            <Pressable
              onPress={() => setLegalModal(null)}
              hitSlop={12}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              accessibilityRole="button"
              accessibilityLabel="Close legal document"
            >
              <View style={[styles.modalClose, { backgroundColor: theme.surface }]}>
                <X size={16} color={theme.textSecondary} strokeWidth={2} />
              </View>
            </Pressable>
          </View>
          {legalModal && (
            <WebView
              source={{ html: legalModal.html, baseUrl: "" }}
              style={{ flex: 1, backgroundColor: theme.bg }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  brandingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brand: {
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: 0,
  },
  tagline: {
    ...Typography.body,
    marginTop: 8,
  },
  buttonsContainer: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 40,
    gap: 12,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: Spacing.buttonHeight,
    borderRadius: Spacing.buttonRadius,
    gap: 10,
  },
  appleButton: {},
  googleButton: {
    borderWidth: 1,
  },
  guestButton: {
    borderWidth: 1,
  },
  guestUnavailable: {
    minHeight: Spacing.buttonHeight,
    borderRadius: Spacing.buttonRadius,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  guestUnavailableCopy: {
    flexShrink: 1,
  },
  guestUnavailableTitle: {
    ...Typography.body,
    fontWeight: "600",
  },
  guestUnavailableBody: {
    ...Typography.caption,
    marginTop: 2,
  },
  appleIcon: {
    fontSize: 20,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4285F4",
  },
  buttonText: {
    ...Typography.button,
  },
  legalContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 8,
    paddingHorizontal: 20,
  },
  legalText: {
    ...Typography.caption,
    textAlign: "center",
  },
  legalLink: {
    ...Typography.caption,
    textDecorationLine: "underline",
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: 12,
  },
  modalTitle: {
    ...Typography.cardTitle,
  },
  modalClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
