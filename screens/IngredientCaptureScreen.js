import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View, Pressable } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useIsFocused } from "@react-navigation/native";
import { CheckCircle2, Camera } from "lucide-react-native";
import { useTheme, Colors, Spacing } from "../theme";
import { useAuth } from "../services/auth";
import { useNetwork } from "../services/network";
import * as analysisService from "../services/analysisService";
import * as Haptics from "expo-haptics";

const CAMERA_CAPTURE_TIMEOUT_MS = 12000;
const IMAGE_MANIPULATION_TIMEOUT_MS = 18000;

function withCaptureTimeout(promise, label, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`${label} timed out. Please try again.`);
      err.code = "CAPTURE_TIMEOUT";
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export default function IngredientCaptureScreen({ navigation, route }) {
  const { productName, brand, variant, petType, base64, uri } = route.params || {};
  // Compose a richer label so the user can verify identification before snapping the back of the bag.
  const identifiedLabel = [brand, variant].filter(Boolean).join(" · ") || productName;
  const cameraRef = useRef(null);
  const captureSessionRef = useRef({ id: 0, cancelled: false });
  const mountedRef = useRef(true);
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [permission] = useCameraPermissions();
  const theme = useTheme();
  const { isPro } = useAuth();
  const { isOnline } = useNetwork();
  const isFocused = useIsFocused();
  const hasRecoveryContext = Boolean(productName && base64);

  useEffect(() => () => {
    mountedRef.current = false;
    captureSessionRef.current.cancelled = true;
    captureSessionRef.current.id += 1;
  }, []);

  useEffect(() => {
    if (!isFocused) {
      setCameraReady(false);
      captureSessionRef.current.cancelled = true;
      captureSessionRef.current.id += 1;
      setCapturing(false);
    }
  }, [isFocused]);

  const isActiveCapture = (sessionId) => (
    mountedRef.current &&
    captureSessionRef.current.id === sessionId &&
    !captureSessionRef.current.cancelled
  );

  const cancelActiveCapture = () => {
    captureSessionRef.current.cancelled = true;
    captureSessionRef.current.id += 1;
    if (mountedRef.current) setCapturing(false);
  };

  const handleScanAgain = () => {
    Haptics.selectionAsync();
    if (capturing) cancelActiveCapture();
    navigation.replace("Scanner", { petType });
  };

  const handleCapture = async () => {
    if (!hasRecoveryContext || !cameraRef.current || capturing || !cameraReady) return;
    if (!isOnline) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "No internet connection",
        "Connect to Wi-Fi or cellular data to analyze the ingredient label.",
        [{ text: "OK" }],
      );
      return;
    }
    const sessionId = captureSessionRef.current.id + 1;
    captureSessionRef.current = { id: sessionId, cancelled: false };
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const photo = await withCaptureTimeout(
        cameraRef.current.takePictureAsync({
          quality: 1,
          skipProcessing: false,
          base64: false,
          exif: false,
        }),
        "Camera capture",
        CAMERA_CAPTURE_TIMEOUT_MS,
      );
      if (!isActiveCapture(sessionId)) return;
      if (!photo?.uri) {
        setCapturing(false);
        return;
      }
      // Ingredient labels are dense text — keep this slightly larger and higher quality
      // than the front-of-bag scan to give Claude more pixels to OCR.
      const resized = await withCaptureTimeout(
        ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 1800 } }],
          { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        ),
        "Image preparation",
        IMAGE_MANIPULATION_TIMEOUT_MS,
      );
      if (!isActiveCapture(sessionId)) return;
      if (!resized?.base64) {
        Alert.alert("Capture Failed", "Could not prepare the ingredient photo. Please try again.");
        setCapturing(false);
        return;
      }
      try {
        analysisService.startAnalysis({
          mode: "photo_with_ingredients",
          base64,
          ingredientBase64: resized.base64,
          productName,
          brand,
          petType,
          uri,
          isPro,
        });
      } catch (err) {
        console.log("[INGREDIENT_CAPTURE] Background analysis start failed:", err.message);
      }
      navigation.replace("Results", {
        mode: "photo_with_ingredients",
        base64,
        ingredientBase64: resized.base64,
        productName,
        brand,
        petType,
        uri,
      });
    } catch (err) {
      if (!isActiveCapture(sessionId)) return;
      console.log("[INGREDIENT_CAPTURE] Error:", err.message);
      Alert.alert("Capture Failed", err.code === "CAPTURE_TIMEOUT" ? err.message : "Something went wrong. Please try again.");
    } finally {
      if (isActiveCapture(sessionId)) setCapturing(false);
    }
  };

  const handleSkip = () => {
    if (!hasRecoveryContext) return;
    Haptics.selectionAsync();
    if (!isOnline) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "No internet connection",
        "Connect to Wi-Fi or cellular data to estimate this product.",
        [{ text: "OK" }],
      );
      return;
    }
    if (capturing) cancelActiveCapture();
    // Use photo_with_ingredients mode but WITHOUT ingredient photo
    // This tells the analysis service to use AI knowledge for this identified product
    try {
      analysisService.startAnalysis({
        mode: "photo_with_ingredients",
        base64,
        productName,
        brand,
        petType,
        uri,
        isPro,
      });
    } catch (err) {
      console.log("[INGREDIENT_CAPTURE] Estimate analysis start failed:", err.message);
    }
    navigation.replace("Results", {
      mode: "photo_with_ingredients",
      base64,
      productName,
      brand,
      petType,
      uri,
    });
  };

  if (!permission?.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={[styles.errorText, { color: theme.textPrimary }]}>Camera access needed</Text>
      </SafeAreaView>
    );
  }

  if (!hasRecoveryContext) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: theme.bg }]}>
        <Text style={[styles.errorTitle, { color: theme.textPrimary }]}>
          Scan context expired
        </Text>
        <Text style={[styles.errorBody, { color: theme.textSecondary }]}>
          We need the original product photo before reading an ingredient label.
        </Text>
        <Pressable
          onPress={handleScanAgain}
          accessibilityRole="button"
          accessibilityLabel="Scan product again"
          style={({ pressed }) => [
            styles.errorAction,
            { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.errorActionText, { color: theme.buttonText }]}>
            Scan Again
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        />
      )}

      {/* Dark overlay with content */}
      <SafeAreaView style={styles.overlay}>
        {/* Product identified badge */}
        <View style={styles.topSection}>
          <View style={[styles.identifiedBadge, { backgroundColor: "rgba(48,209,88,0.15)" }]}>
            <CheckCircle2 size={20} color="#30D158" strokeWidth={2} />
            <Text style={styles.identifiedText} numberOfLines={1}>
              {identifiedLabel}
            </Text>
          </View>
          <Text style={styles.identifiedSub} numberOfLines={2}>
            We don't have this product yet — capture the ingredient list for an accurate analysis.
          </Text>
        </View>

        {/* Instructions */}
        <View style={styles.centerSection}>
          <View style={styles.instructionCard}>
            <Camera size={32} color="#FFFFFF" strokeWidth={1.5} />
            <Text style={styles.instructionTitle}>Snap the ingredient list</Text>
            <Text style={styles.instructionBody}>
              Flip the package over and frame the full ingredient panel — every line, top to bottom.
            </Text>
          </View>
        </View>

        {/* Bottom: capture + skip */}
        <View style={styles.bottomSection}>
          <Pressable
            onPress={handleCapture}
            disabled={capturing || !hasRecoveryContext || !cameraReady}
            accessibilityRole="button"
            accessibilityLabel="Take ingredient label photo"
            accessibilityState={{ disabled: capturing || !hasRecoveryContext || !cameraReady }}
            style={({ pressed }) => [styles.captureBtn, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <View style={[styles.captureInner, capturing && { opacity: 0.4 }]} />
          </Pressable>
          <Text style={styles.captureLabel}>{capturing ? "Reading..." : "Take Photo"}</Text>

          <Pressable
            onPress={handleSkip}
            disabled={!hasRecoveryContext}
            accessibilityRole="button"
            accessibilityLabel="Skip ingredient photo and use AI estimate"
            accessibilityState={{ disabled: !hasRecoveryContext }}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.7, marginTop: 16 })}
          >
            <Text style={styles.skipText}>Skip — use AI estimate instead</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  identifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  identifiedText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  identifiedSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "400",
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  centerSection: {
    alignItems: "center",
    paddingHorizontal: 40,
  },
  instructionCard: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    padding: 28,
    gap: 12,
  },
  instructionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  instructionBody: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontWeight: "400",
    textAlign: "center",
    lineHeight: 22,
  },
  bottomSection: {
    alignItems: "center",
    paddingBottom: 40,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFFFFF",
  },
  captureLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    fontWeight: "500",
    marginTop: 12,
  },
  skipText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontWeight: "400",
    textDecorationLine: "underline",
  },
  errorText: {
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 100,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  errorBody: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  errorAction: {
    minHeight: Spacing.buttonHeight,
    paddingHorizontal: 28,
    borderRadius: Spacing.buttonRadius,
    justifyContent: "center",
    alignItems: "center",
  },
  errorActionText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
