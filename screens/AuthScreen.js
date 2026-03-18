import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import { WebView } from "react-native-webview";
import Svg, { Path } from "react-native-svg";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../services/auth";
import { useTheme, Colors, Spacing, Shadows, Typography } from "../theme";
import { PRIVACY_HTML, TERMS_HTML } from "../legal";

function AppLogo({ size = 48 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path d="M503.336 454.671C513.775 453.303 528.487 456.332 538.452 459.545C562.736 466.887 583.104 488.258 594.653 510.351C605.092 530.321 607.692 537.7 628.016 549.433C623.093 551.323 617.848 552.825 612.908 554.843C596.003 561.751 581.59 570.297 568.992 583.495C553.892 599.314 545.305 616.66 540.672 637.914C539.318 644.129 537.675 651.946 537.815 658.305C508.944 654.534 492.551 656.384 465.13 666.999C451.055 672.51 439.733 676.433 424.872 678.762C386.3 684.809 355.707 669.364 350.754 628.227C347.659 602.528 354.074 572.475 378.049 557.873C388.219 551.679 399.794 548.695 407.921 539.431C421.226 525.324 425.723 507.914 437.897 492.618C456.132 469.707 474.69 458.41 503.336 454.671Z" fill="#1C1C1E" />
      <Path d="M645.446 570.243C695.669 566.239 739.617 603.735 743.571 653.962C747.525 704.189 709.986 748.1 659.755 752.004C609.594 755.903 565.758 718.428 561.809 668.271C557.861 618.114 595.293 574.241 645.446 570.243Z" fill="#1C1C1E" />
      <Path fill="#64D161" d="M685.654 627.076C690.778 626.769 697.132 627.744 700.715 631.541C714.89 646.566 694.777 661.797 685.469 670.956L666.929 689.315C643.227 712.71 637.731 706.417 617.421 684.7C610.037 677.999 599.147 669.823 599.633 658.853C599.877 654.351 601.901 650.129 605.259 647.12C619.365 634.456 635.58 654.955 643.912 664.705C655.464 653.768 672.808 632.747 685.654 627.076Z" />
      <Path d="M430.039 275.677C440.247 273.906 454.194 278.484 462.724 283.981C509.697 314.249 509.812 408.041 448.083 420.925C435.157 422.777 421.032 418.117 410.639 410.459C367.718 378.834 367.362 284.414 430.039 275.677Z" fill="#1C1C1E" />
      <Path d="M583.789 275.6C615.436 273.391 635.569 301.136 639.635 330.048C645.08 368.759 625.046 415.489 582.232 421.272C573.643 422.464 561.098 418.345 554.017 413.56C519.463 390.215 517.694 336.201 539.758 303.824C551.184 287.056 564.377 279.332 583.789 275.6Z" fill="#1C1C1E" />
      <Path d="M682.257 394.627C691.705 393.739 702.144 395.464 709.887 401.097C739.194 422.419 737.537 468.586 718.104 495.882C708.376 509.546 696.757 517.046 680.609 519.898C627.366 522.232 617.919 452.938 643.53 418.512C654.159 404.226 664.927 397.632 682.257 394.627Z" fill="#1C1C1E" />
      <Path d="M327.359 393.594C377.914 388.979 407.507 460.303 380.078 499.819C373.494 509.341 363.389 515.849 351.996 517.903C346.536 518.801 341.914 518.338 336.432 517.39C288.519 509.102 268.964 429.347 308.82 400.949C314.505 396.899 320.563 395.077 327.359 393.594Z" fill="#1C1C1E" />
    </Svg>
  );
}

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

export default function AuthScreen() {
  const theme = useTheme();
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [loadingApple, setLoadingApple] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [legalModal, setLegalModal] = useState(null); // { title, html } or null

  const appleScale = useSharedValue(1);
  const googleScale = useSharedValue(1);
  const appleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: appleScale.value }],
  }));
  const googleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: googleScale.value }],
  }));

  const spring = { damping: 15, stiffness: 150 };

  const handleApple = async () => {
    try {
      setLoadingApple(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await signInWithApple();
    } catch (err) {
      if (err.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Sign In Failed", err.message);
      }
    } finally {
      setLoadingApple(false);
    }
  };

  const handleGoogle = async () => {
    try {
      setLoadingGoogle(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await signInWithGoogle();
    } catch (err) {
      Alert.alert("Sign In Failed", err.message);
    } finally {
      setLoadingGoogle(false);
    }
  };

  const isLoading = loadingApple || loadingGoogle;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Branding */}
      <View style={styles.brandingContainer}>
        <Animated.View
          entering={FadeInDown.delay(100).duration(500).springify()}
          style={styles.brandRow}
        >
          <AppLogo size={64} />
          <Text style={[styles.brand, { color: theme.textPrimary }]}>Woof</Text>
        </Animated.View>
        <Animated.Text
          entering={FadeInDown.delay(200).duration(500).springify()}
          style={[styles.tagline, { color: theme.textTertiary }]}
        >
          Know what's in the bowl
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

        {/* Legal */}
        <Animated.View
          entering={FadeInDown.delay(500).duration(400).springify()}
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
    letterSpacing: -1,
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
