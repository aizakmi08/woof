import { useRef, useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Alert,
  Pressable,
  Linking,
} from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  FadeInDown,
  FadeOutUp,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ChevronLeft, HelpCircle, CameraOff, X } from "lucide-react-native";
import { useIsFocused } from "@react-navigation/native";
import { useTheme, Colors, Spacing, Shadows } from "../theme";
import { useAuth } from "../services/auth";
import { useNetwork } from "../services/network";
import { trackEvent } from "../services/analytics";
import * as analysisService from "../services/analysisService";
import * as Haptics from "expo-haptics";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const SCAN_SIZE = 260;
const SCAN_Y = Math.round(SCREEN_H * 0.22);
const SCAN_X = Math.round((SCREEN_W - SCAN_SIZE) / 2);

const CORNER_LEN = 40;
const CORNER_W = 3;
const CORNER_RAD = 4;
const CORNER_COLOR = "#F5F5F5";
const MASK = "rgba(0,0,0,0.45)";
const CAMERA_CAPTURE_TIMEOUT_MS = 12000;
const IMAGE_MANIPULATION_TIMEOUT_MS = 15000;
const SCANNER_SESSION_WARM_TIMEOUT_MS = 1200;
const FRONT_SCAN_IMAGE_WIDTH = 1400;
const FRONT_SCAN_IMAGE_COMPRESS = 0.76;

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

// --- Processing Card (frosted glass) ---

function ProcessingCard({ onCancel }) {
  return (
    <View style={styles.processingCard}>
      <BlurView intensity={40} tint="dark" style={styles.processingBlur}>
        <View style={styles.processingContent}>
          <StreamingDots />
          <Text style={styles.processingLabel}>Analyzing ingredients...</Text>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            hitSlop={12}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Cancel scan"
          >
            <X size={16} color="rgba(245,245,245,0.7)" strokeWidth={2} />
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </View>
  );
}

// --- Streaming Dots (processing indicator) ---

function StreamingDots() {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    const anim = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.3, { duration: 400 })
      ),
      -1
    );
    dot1.value = anim;
    dot2.value = withSequence(withTiming(0.3, { duration: 150 }), anim);
    dot3.value = withSequence(withTiming(0.3, { duration: 300 }), anim);
  }, []);

  const style1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const style2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const style3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, style1]} />
      <Animated.View style={[styles.dot, style2]} />
      <Animated.View style={[styles.dot, style3]} />
    </View>
  );
}

export default function ScannerScreen({ navigation, route }) {
  // Extract mode params for human food scanning
  const { mode: scanMode, petType } = route.params || {};
  const isHumanFood = scanMode === "human_food";

  const cameraRef = useRef(null);
  const captureSessionRef = useRef({ id: 0, cancelled: false });
  const mountedRef = useRef(true);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const theme = useTheme();
  const { checkSession, isPro } = useAuth();
  const { isOnline } = useNetwork();
  const isFocused = useIsFocused(); // Only show camera when screen is focused

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

  // Proactively refresh auth session when scanner mounts
  useEffect(() => {
    checkSession({ timeoutMs: SCANNER_SESSION_WARM_TIMEOUT_MS }).catch((err) => {
      console.log("[SCANNER] Session check failed:", err.message);
    });
  }, [checkSession]);

  // Re-poll camera permission when screen regains focus — handles the case
  // where the user denied initially, opened iOS Settings, granted, then came back.
  useEffect(() => {
    if (isFocused && permission && !permission.granted && permission.canAskAgain === false) {
      requestPermission().catch(() => {});
    }
  }, [isFocused, permission?.granted, permission?.canAskAgain, requestPermission]);

  // --- Reanimated shared values ---
  const pulseAnim = useSharedValue(0);
  const flashOpacity = useSharedValue(0);
  const captureScale = useSharedValue(1);
  const processAnim = useSharedValue(0);
  const overlayDarken = useSharedValue(0);

  // Corner bracket pulse (0.7 → 1.0)
  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }),
        withTiming(0, { duration: 2000 })
      ),
      -1
    );
  }, []);

  const cornerAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(pulseAnim.value, [0, 1], [0.7, 1.0]);
    // Processing: corners contract inward by 15px
    const translate = interpolate(processAnim.value, [0, 1], [0, 15]);
    return {
      opacity,
      transform: [{ scale: 1 }],
    };
  });

  // Individual corner translate styles for inward contraction
  const cornerTLStyle = useAnimatedStyle(() => {
    const t = interpolate(processAnim.value, [0, 1], [0, 15]);
    return { transform: [{ translateX: t }, { translateY: t }] };
  });
  const cornerTRStyle = useAnimatedStyle(() => {
    const t = interpolate(processAnim.value, [0, 1], [0, 15]);
    return { transform: [{ translateX: -t }, { translateY: t }] };
  });
  const cornerBLStyle = useAnimatedStyle(() => {
    const t = interpolate(processAnim.value, [0, 1], [0, 15]);
    return { transform: [{ translateX: t }, { translateY: -t }] };
  });
  const cornerBRStyle = useAnimatedStyle(() => {
    const t = interpolate(processAnim.value, [0, 1], [0, 15]);
    return { transform: [{ translateX: -t }, { translateY: -t }] };
  });

  // Processing state
  useEffect(() => {
    processAnim.value = withTiming(capturing ? 1 : 0, {
      duration: capturing ? 600 : 300,
      easing: Easing.inOut(Easing.cubic),
    });
    overlayDarken.value = withTiming(capturing ? 1 : 0, {
      duration: capturing ? 400 : 200,
    });
  }, [capturing]);

  // Darkened overlay when processing
  const overlayDarkenStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${interpolate(overlayDarken.value, [0, 1], [0, 0.2])})`,
  }));

  // Flash style
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  // Capture button scale style
  const captureScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: captureScale.value }],
  }));

  // --- Handlers ---
  const isActiveCapture = useCallback((sessionId) => (
    mountedRef.current &&
    captureSessionRef.current.id === sessionId &&
    !captureSessionRef.current.cancelled
  ), []);

  const cancelActiveCapture = useCallback(() => {
    captureSessionRef.current.cancelled = true;
    captureSessionRef.current.id += 1;
    if (mountedRef.current) setCapturing(false);
  }, []);

  const handleCapture = async () => {
    if (!cameraRef.current || capturing || !cameraReady) return;
    // Pre-flight network check — analysis needs the network. Tell user immediately
    // instead of letting them snap a photo that's destined to fail.
    if (!isOnline) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "No internet connection",
        "Connect to Wi-Fi or cellular data to scan products.",
        [{ text: "OK" }],
      );
      return;
    }
    const sessionId = captureSessionRef.current.id + 1;
    captureSessionRef.current = { id: sessionId, cancelled: false };
    setCapturing(true);
    trackEvent("scan_started", {
      mode: isHumanFood ? "human_food_photo" : "pet_food_photo",
      petType: petType || "unknown",
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    captureScale.value = withSequence(
      withSpring(0.92, { damping: 20, stiffness: 300 }),
      withSpring(1, { damping: 15, stiffness: 150 })
    );

    try {
      // Let Expo normalize device orientation before vision analysis; tilted
      // package photos are worse than the small extra capture cost.
      const photo = await withCaptureTimeout(
        cameraRef.current.takePictureAsync({
          quality: 0.9,
          skipProcessing: false,
          base64: false,
          exif: false,
        }),
        "Camera capture",
        CAMERA_CAPTURE_TIMEOUT_MS,
      );
      if (!isActiveCapture(sessionId)) return;
      if (!photo?.uri) {
        Alert.alert("Capture Failed", "Could not read the photo. Please try again.");
        setCapturing(false);
        return;
      }
      // Front scans identify the package, not dense ingredient text. Keep enough
      // detail for brand/name recognition while reducing upload and Edge decode time.
      const resized = await withCaptureTimeout(
        ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: FRONT_SCAN_IMAGE_WIDTH } }],
          { compress: FRONT_SCAN_IMAGE_COMPRESS, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        ),
        "Image preparation",
        IMAGE_MANIPULATION_TIMEOUT_MS,
      );
      if (!isActiveCapture(sessionId)) return;
      if (!resized?.base64) {
        Alert.alert("Capture Failed", "Could not prepare the photo. Please try again.");
        setCapturing(false);
        return;
      }
      try {
        analysisService.startAnalysis({
          mode: isHumanFood ? "human_food" : "photo",
          base64: resized.base64,
          uri: photo.uri,
          petType,
          isPro,
        });
      } catch (err) {
        console.log("[SCANNER] Background analysis start failed:", err.message);
      }
      navigation.push("Results", {
        mode: isHumanFood ? "human_food" : "photo",
        base64: resized.base64,
        uri: photo.uri,
        ...(isHumanFood && { petType }),
      });
    } catch (err) {
      if (!isActiveCapture(sessionId)) return;
      console.log("[SCANNER] Capture error:", err.message);
      Alert.alert("Capture Failed", err.code === "CAPTURE_TIMEOUT" ? err.message : "Something went wrong. Please try again.");
    } finally {
      // Always reset capturing state, even on error — prevents button-stuck-disabled bug
      if (isActiveCapture(sessionId)) {
        setCapturing(false);
      }
    }
  };

  const handleCancelCapture = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cancelActiveCapture();
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (capturing) {
      cancelActiveCapture();
    }
    navigation.goBack();
  };

  const showHelp = () => {
    Alert.alert(
      "How to Scan",
      "1. Point the camera at the front of the product — brand and name visible\n\n2. Tap the capture button to take a photo\n\n3. We'll identify the product and analyze its ingredients",
      [{ text: "Got it" }]
    );
  };

  // --- Permission screens ---
  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.permissionContainer}>
          <View style={styles.permissionIconWrap}>
            <CameraOff size={48} color={theme.textTertiary} strokeWidth={1.5} />
          </View>
          <Text style={[styles.permissionTitle, { color: theme.textPrimary }]}>
            Camera Access Needed
          </Text>
          <Text style={[styles.permissionText, { color: theme.textSecondary }]}>
            Woof needs camera access to scan{"\n"}pet food packages, ingredient labels,{"\n"}and human foods.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.permissionButton,
              { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const result = await requestPermission();
              if (!result.granted) {
                Linking.openSettings();
              }
            }}
          >
            <Text style={[styles.permissionButtonText, { color: theme.buttonText }]}>
              Allow Camera
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // --- Camera UI ---
  return (
    <View style={styles.container}>
      {/* Only render camera when screen is focused (turns off during results screen) */}
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        />
      )}

      {/* Dark mask overlay with cutout */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.mask, { top: 0, height: SCAN_Y, left: 0, right: 0 }]} />
        <View style={[styles.mask, { top: SCAN_Y, height: SCAN_SIZE, left: 0, width: SCAN_X }]} />
        <View style={[styles.mask, { top: SCAN_Y, height: SCAN_SIZE, right: 0, width: SCAN_X }]} />
        <View style={[styles.mask, { top: SCAN_Y + SCAN_SIZE, bottom: 0, left: 0, right: 0 }]} />
      </View>

      {/* Darkening overlay during processing */}
      <Animated.View
        style={[StyleSheet.absoluteFill, overlayDarkenStyle]}
        pointerEvents="none"
      />

      {/* Scan frame: corners + flash */}
      <View style={styles.scanFrame} pointerEvents="none">
        <Animated.View style={[StyleSheet.absoluteFill, cornerAnimStyle]}>
          <Animated.View style={[styles.corner, styles.cornerTL, cornerTLStyle]} />
          <Animated.View style={[styles.corner, styles.cornerTR, cornerTRStyle]} />
          <Animated.View style={[styles.corner, styles.cornerBL, cornerBLStyle]} />
          <Animated.View style={[styles.corner, styles.cornerBR, cornerBRStyle]} />
        </Animated.View>
      </View>

      {capturing && (
        <View style={styles.processingOverlay} pointerEvents="box-none">
          <ProcessingCard onCancel={handleCancelCapture} />
        </View>
      )}

      {/* Instruction pill below scan area */}
      <View style={styles.instructionWrap} pointerEvents="none">
        <View style={styles.instructionPill}>
          <Text style={styles.instructionText}>
            {isHumanFood
              ? "Take a clear photo of the food"
              : "Capture brand name & flavor for accurate results"}
          </Text>
        </View>
      </View>

      {/* Interactive controls */}
      <SafeAreaView style={styles.controls}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={handleBack}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={capturing ? "Cancel scan and go back" : "Go back"}
          >
            <ChevronLeft size={24} color="#F5F5F5" strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{isHumanFood ? "Food Safety" : "Scan"}</Text>
          <TouchableOpacity
            style={styles.helpBtn}
            onPress={showHelp}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="How to scan"
          >
            <HelpCircle size={18} color="#F5F5F5" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }} />

        {/* Bottom: capture button + label */}
        <View style={styles.bottomArea}>
          {!isHumanFood && (
            <Text style={styles.barcodeHint}>
              Capture the front of the bag — brand, product name, and flavor must be readable
            </Text>
          )}
          <View style={{ height: 20 }} />
          <Pressable
            onPress={handleCapture}
            disabled={capturing || !cameraReady}
            onPressIn={() => {
              captureScale.value = withSpring(0.92, { damping: 20, stiffness: 300 });
            }}
            onPressOut={() => {
              captureScale.value = withSpring(1, { damping: 15, stiffness: 150 });
            }}
            accessibilityRole="button"
            accessibilityLabel={capturing ? "Scanning" : cameraReady ? "Capture photo" : "Camera starting"}
            accessibilityState={{ disabled: capturing || !cameraReady }}
          >
            <Animated.View style={[styles.captureBtn, captureScaleStyle]}>
              <View style={[
                styles.captureInner,
                (capturing || !cameraReady) && styles.captureInnerDisabled,
              ]} />
            </Animated.View>
          </Pressable>
          <View style={{ height: 12 }} />
          <Text style={styles.captureLabel}>
            {capturing ? "Analyzing..." : cameraReady ? "Take Photo" : "Camera starting..."}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1C1C1E",
  },
  // Mask overlay
  mask: {
    position: "absolute",
    backgroundColor: MASK,
  },

  // Scan frame
  scanFrame: {
    position: "absolute",
    top: SCAN_Y,
    left: SCAN_X,
    width: SCAN_SIZE,
    height: SCAN_SIZE,
  },
  processingOverlay: {
    position: "absolute",
    top: SCAN_Y,
    left: SCAN_X,
    width: SCAN_SIZE,
    height: SCAN_SIZE,
  },
  corner: {
    position: "absolute",
    width: CORNER_LEN,
    height: CORNER_LEN,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_W,
    borderLeftWidth: CORNER_W,
    borderColor: CORNER_COLOR,
    borderTopLeftRadius: CORNER_RAD,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_W,
    borderRightWidth: CORNER_W,
    borderColor: CORNER_COLOR,
    borderTopRightRadius: CORNER_RAD,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_W,
    borderLeftWidth: CORNER_W,
    borderColor: CORNER_COLOR,
    borderBottomLeftRadius: CORNER_RAD,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_W,
    borderRightWidth: CORNER_W,
    borderColor: CORNER_COLOR,
    borderBottomRightRadius: CORNER_RAD,
  },
  barcodeFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(52, 199, 89, 0.2)",
    borderRadius: Spacing.sm,
  },

  // Instruction pill (frosted glass)
  instructionWrap: {
    position: "absolute",
    top: SCAN_Y + SCAN_SIZE + Spacing.xl,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  instructionPill: {
    borderRadius: 20,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  instructionText: {
    color: "#F5F5F5",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.2,
  },

  // Interactive controls layer
  controls: {
    ...StyleSheet.absoluteFillObject,
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  topBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  helpBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(245,245,245,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: {
    color: "#F5F5F5",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.3,
  },

  // Bottom area
  bottomArea: {
    alignItems: "center",
    paddingBottom: Spacing.screenH,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFFFFF",
  },
  captureInnerDisabled: {
    backgroundColor: "rgba(245,245,245,0.3)",
  },
  captureLabel: {
    color: "rgba(245,245,245,0.8)",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  barcodeHint: {
    color: "rgba(245,245,245,0.5)",
    fontSize: 13,
    letterSpacing: 0.1,
  },

  // Processing card (frosted glass)
  processingCard: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  processingBlur: {
    borderRadius: Spacing.cardRadius,
    overflow: "hidden",
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  processingContent: {
    alignItems: "center",
  },
  processingLabel: {
    color: "#F5F5F5",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 16,
    letterSpacing: 0.2,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: "rgba(245,245,245,0.7)",
    fontSize: 14,
    fontWeight: "500",
  },

  // Streaming dots
  dotsRow: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F5F5F5",
  },

  // Fallback banner
  fallbackBanner: {
    alignSelf: "center",
    backgroundColor: "rgba(30, 30, 30, 0.85)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
    marginHorizontal: Spacing.screenPadding,
  },
  fallbackBannerText: {
    color: "#F5F5F5",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 0.1,
  },

  // Permission screen
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  permissionIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  permissionText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 40,
    lineHeight: 24,
  },
  permissionButton: {
    height: Spacing.buttonHeight,
    paddingHorizontal: 40,
    borderRadius: Spacing.buttonRadius,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    marginHorizontal: Spacing.screenPadding,
  },
  permissionButtonText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
