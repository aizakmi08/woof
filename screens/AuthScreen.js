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
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAuth } from "../services/auth";
import { useTheme, Colors, Spacing, Shadows, Typography } from "../theme";
import { PRIVACY_HTML, TERMS_HTML } from "../legal";

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
        <Animated.Text
          entering={FadeInDown.delay(100).duration(500).springify()}
          style={[styles.brand, { color: theme.textPrimary }]}
        >
          Woof
        </Animated.Text>
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
