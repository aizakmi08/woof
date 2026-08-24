import { useRef, useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Dimensions,
  Alert,
  Pressable,
  Linking,
  Platform,
  ActivityIndicator,
} from "react-native";
import { AppText as Text } from "../components/AppText";
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
import { trackEvent } from "../services/analytics";
import { createLogger } from "../services/logger";
import {
  cropLabelToNormalizedRegion,
  labelOcrIsAvailable,
  nativeLabelCropIsAvailable,
  recognizeLabelText,
} from "../services/labelOcr";
import { projectScanFrameToPhoto } from "../services/cameraCrop";
import * as Haptics from "expo-haptics";
import { BRAND_NAME } from "../config/brand";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const SCAN_SIZE = 260;
const SCAN_Y = Math.round(SCREEN_H * 0.28);
const SCAN_X = Math.round((SCREEN_W - SCAN_SIZE) / 2);
const SCAN_FRAME_INSET = 5;

const CORNER_LEN = 40;
const CORNER_W = 3;
const CORNER_RAD = 4;
const CORNER_COLOR = "#F5F5F5";
const MASK = "rgba(0,0,0,0.45)";
const TARGET_IMAGE_BASE64_LENGTH = 1_200_000;
// Product identity is often split between the top and bottom of a tall bag.
// Keep enough detail for the visual resolver to read both without sending an
// unnecessarily large camera image.
const TARGET_LABEL_IMAGE_BASE64_LENGTH = 480_000;
const MAX_CLIENT_IMAGE_BASE64_LENGTH = 2_400_000;
const BARCODE_PREVIEW_TIMEOUT_MS = 700;
const IMAGE_OPTIMIZATION_STEPS = [
  { width: 1024, compress: 0.68 },
  { width: 900, compress: 0.62 },
  { width: 768, compress: 0.56 },
  { width: 640, compress: 0.52 },
];
const LABEL_IMAGE_OPTIMIZATION_STEPS = [
  { width: 768, compress: 0.64 },
  { width: 680, compress: 0.59 },
  { width: 600, compress: 0.54 },
];
const logger = createLogger("SCANNER");

// --- Processing Card (frosted glass) ---

function ProcessingCard({ label, onCancel }) {
  return (
    <View style={styles.processingCard}>
      <BlurView intensity={40} tint="dark" style={styles.processingBlur}>
        <View style={styles.processingContent}>
          <StreamingDots />
          <Text style={styles.processingLabel}>{label}</Text>
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

function scannerInstructionText({ showFallbackBanner, isHumanFood, isLabelLookup, isIngredientCapture }) {
  if (isLabelLookup) return "Point at the front label";
  if (isIngredientCapture) return "Point at the ingredients list";
  if (showFallbackBanner) return "Point at the ingredient label";
  return isHumanFood ? "Point at the food item" : "Point at the product packaging";
}

function scannerTipText({ showFallbackBanner, isHumanFood, isLabelLookup, isIngredientCapture }) {
  if (isLabelLookup) return "Brand and product name readable • avoid glare";
  if (isIngredientCapture) return "Keep the full ingredients list readable";
  if (showFallbackBanner) return "Keep brand and ingredients readable";
  if (isHumanFood) return "Good light • fill the frame • hold steady";
  return "Good light • label readable • hold steady";
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

async function optimizePhotoForAnalysis(uri, {
  targetBase64Length = TARGET_IMAGE_BASE64_LENGTH,
  steps = IMAGE_OPTIMIZATION_STEPS,
  initialActions = [],
} = {}) {
  let lastResult = null;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [...initialActions, { resize: { width: step.width } }],
      { compress: step.compress, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    lastResult = {
      ...result,
      optimizationStep: i + 1,
      targetWidth: step.width,
      compression: step.compress,
      crop: initialActions.find((action) => action.crop)?.crop || null,
    };

    const base64Length = result.base64?.length || 0;
    if (base64Length > 0 && base64Length <= targetBase64Length) {
      return lastResult;
    }
  }

  return lastResult;
}

async function captureBarcodePreview(cameraRef) {
  if (!cameraRef.current) return null;

  try {
    const photoPromise = cameraRef.current.takePictureAsync({
      quality: 0.55,
      skipProcessing: true,
    });
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve(null), BARCODE_PREVIEW_TIMEOUT_MS);
    });
    const photo = await Promise.race([photoPromise, timeoutPromise]);
    return photo?.uri || null;
  } catch {
    return null;
  }
}

const failedBarcodesThisSession = new Set();

function normalizedBarcode(value) {
  return String(value || "").trim();
}

export default function ScannerScreen({ navigation, route }) {
  // Extract mode params for human food scanning
  const { fallbackToPhoto, failedBarcode, fallbackMessage, verificationMessage, mode: scanMode, petType, petName } = route.params || {};
  const isHumanFood = scanMode === "human_food";
  const isLabelLookup = scanMode === "label_lookup";
  const isIngredientCapture = scanMode === "ingredient_capture";
  const scannerTitle = isHumanFood
    ? (petName ? `Food Safety for ${petName}` : "Food Safety")
    : (isLabelLookup ? "Find Product" : (isIngredientCapture ? "Add Ingredients" : "Scan"));

  const cameraRef = useRef(null);
  const cameraViewportRef = useRef({ width: SCREEN_W, height: SCREEN_H });
  const scannedRef = useRef(false);
  const captureRunIdRef = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [showFallbackBanner, setShowFallbackBanner] = useState(false);
  const [barcodeEnabled, setBarcodeEnabled] = useState(!isHumanFood && !isLabelLookup && !isIngredientCapture);
  const [sessionReady, setSessionReady] = useState(null);
  const theme = useTheme();
  const { checkSession, isPro, remainingScans } = useAuth();
  const freeScansLeft = remainingScans();
  const isFocused = useIsFocused(); // Only show camera when screen is focused
  const scanModeForAnalytics = isHumanFood
    ? "human_food"
    : (isLabelLookup ? "label_lookup" : (isIngredientCapture ? "ingredient_capture" : "pet_food"));
  const cameraPermissionCopy = isHumanFood
    ? `${BRAND_NAME} needs camera access to check food items for your pet.`
    : (isLabelLookup
      ? `Photograph the front package so ${BRAND_NAME} can identify the exact food.`
      : (isIngredientCapture
        ? `Photograph the ingredient panel so the exact formula can be reviewed.`
        : `${BRAND_NAME} needs camera access to scan pet food labels and packaging.`));
  const cameraPermissionBlocked = permission?.canAskAgain === false;
  const cameraPermissionButtonText = cameraPermissionBlocked ? "Open Settings" : "Allow Camera";
  const cameraPermissionAccessibilityLabel = cameraPermissionBlocked
    ? "Open camera settings"
    : "Allow camera access";
  const cameraPermissionHint = cameraPermissionBlocked
    ? "Opens device settings so you can allow camera access"
    : "Opens the system camera permission prompt";
  const scannerInstruction = scannerInstructionText({ showFallbackBanner, isHumanFood, isLabelLookup, isIngredientCapture });
  const scannerTip = scannerTipText({ showFallbackBanner, isHumanFood, isLabelLookup, isIngredientCapture });
  const scanFrameWidth = SCAN_SIZE;
  const scanFrameHeight = isLabelLookup ? Math.round(SCAN_SIZE * 4 / 3) : SCAN_SIZE;
  const scanFrameX = Math.round((SCREEN_W - scanFrameWidth) / 2);
  const scanFrameY = isLabelLookup ? Math.round(SCREEN_H * 0.20) : SCAN_Y;

  const handleCameraViewportLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout || {};
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      cameraViewportRef.current = { width, height };
    }
  }, []);

  useEffect(() => {
    trackEvent("scanner_viewed", {
      scan_mode: scanModeForAnalytics,
      scanner_mode: scanModeForAnalytics,
      fallback_to_photo: !!fallbackToPhoto,
      pet_type: petType,
      capture_tip: scannerTipText({ showFallbackBanner: !!fallbackToPhoto, isHumanFood, isLabelLookup, isIngredientCapture }),
    });
  }, [fallbackToPhoto, isHumanFood, isLabelLookup, isIngredientCapture, petType, scanModeForAnalytics]);

  // Proactively refresh auth session when scanner mounts
  useEffect(() => {
    checkSession()
      .then((ready) => setSessionReady(ready === true))
      .catch((err) => {
        setSessionReady(false);
        logger.debug("[SCANNER] Session check failed:", err.message);
      });
  }, [checkSession]);

  // Keep barcode detection aligned with the active scanner mode.
  useEffect(() => {
    if (fallbackToPhoto) return;
    setBarcodeEnabled(!isHumanFood && !isLabelLookup && !isIngredientCapture);
  }, [fallbackToPhoto, isHumanFood, isLabelLookup, isIngredientCapture]);

  // Barcode-not-found fallback: ignore the failed value for the rest of this app session.
  useEffect(() => {
    if (!fallbackToPhoto) return;
    const normalizedFailedBarcode = normalizedBarcode(failedBarcode);
    if (normalizedFailedBarcode) failedBarcodesThisSession.add(normalizedFailedBarcode);
    setShowFallbackBanner(true);
    setBarcodeEnabled(!isHumanFood && !isLabelLookup && !isIngredientCapture);
    const bannerTimer = setTimeout(() => setShowFallbackBanner(false), 5000);
    return () => {
      clearTimeout(bannerTimer);
    };
  }, [failedBarcode, fallbackToPhoto, isHumanFood, isLabelLookup, isIngredientCapture]);

  useEffect(() => {
    if (!verificationMessage) return;
    setShowFallbackBanner(true);
    const bannerTimer = setTimeout(() => setShowFallbackBanner(false), 7_000);
    return () => clearTimeout(bannerTimer);
  }, [verificationMessage]);

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
    backgroundColor: "#000000",
    opacity: interpolate(overlayDarken.value, [0, 1], [0, 0.2]),
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
  const handleBarcodeScanned = useCallback(
    async ({ data }) => {
      if (scannedRef.current || capturing) return;
      const barcodeValue = normalizedBarcode(data);
      if (!barcodeValue || failedBarcodesThisSession.has(barcodeValue)) {
        if (barcodeValue) {
          trackEvent("barcode_ignored_after_failed_lookup", {
            scan_mode: "barcode",
            barcode_length: barcodeValue.length,
          });
        }
        return;
      }
      scannedRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      flashOpacity.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 300 })
      );

      const previewUri = await captureBarcodePreview(cameraRef);
      trackEvent("barcode_detected", {
        scan_mode: "barcode",
        barcode_length: String(data || "").length,
        preview_captured: !!previewUri,
        preview_timeout_ms: BARCODE_PREVIEW_TIMEOUT_MS,
      });

      navigation.push("Results", { mode: "barcode", barcode: barcodeValue, uri: previewUri });
      setTimeout(() => {
        scannedRef.current = false;
      }, 2000);
    },
    [capturing, navigation]
  );

  const handleCapture = async () => {
    if (sessionReady === false) {
      Alert.alert("Session Needs Refresh", "Reconnect or sign in again before taking a scan.");
      return;
    }
    if (!cameraRef.current || capturing) return;
    const captureRunId = captureRunIdRef.current + 1;
    captureRunIdRef.current = captureRunId;
    const isCurrentCapture = () => captureRunIdRef.current === captureRunId;
    let captureStage = "camera_capture";
    const captureStartedAt = Date.now();

    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    trackEvent("photo_capture_started", {
      scan_mode: isHumanFood ? "human_food" : (isLabelLookup ? "label_lookup" : (isIngredientCapture ? "ingredient_capture" : "photo")),
      pet_type: petType,
    });

    captureScale.value = withSequence(
      withSpring(0.92, { damping: 20, stiffness: 300 }),
      withSpring(1, { damping: 15, stiffness: 150 })
    );

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: isLabelLookup ? 0.72 : 0.8,
      });
      if (!isCurrentCapture()) return;

      if (!photo?.uri) {
        trackEvent("photo_capture_failed", {
          scan_mode: isHumanFood ? "human_food" : (isLabelLookup ? "label_lookup" : (isIngredientCapture ? "ingredient_capture" : "photo")),
          scanner_mode: scanModeForAnalytics,
          pet_type: petType,
          capture_stage: "missing_photo_uri",
        });
        Alert.alert("Capture Failed", "Could not read the photo. Please try again.");
        setCapturing(false);
        return;
      }
      captureStage = "scan_frame_crop";
      const cameraViewport = cameraViewportRef.current;
      const scanFrameCrop = projectScanFrameToPhoto({
        photoWidth: photo.width,
        photoHeight: photo.height,
        previewWidth: cameraViewport.width,
        previewHeight: cameraViewport.height,
        frame: {
          x: scanFrameX,
          y: scanFrameY,
          width: scanFrameWidth,
          height: scanFrameHeight,
        },
        inset: SCAN_FRAME_INSET,
      });
      const normalizedCrop = {
        x: scanFrameCrop.originX / photo.width,
        y: scanFrameCrop.originY / photo.height,
        width: scanFrameCrop.width / photo.width,
        height: scanFrameCrop.height / photo.height,
      };
      const shouldUseNativeCrop = Platform.OS === "ios" && nativeLabelCropIsAvailable();
      const nativeFramedPhoto = shouldUseNativeCrop
        ? await cropLabelToNormalizedRegion(photo.uri, normalizedCrop)
        : null;
      if (shouldUseNativeCrop && !nativeFramedPhoto) {
        throw new Error("The highlighted label frame could not be cropped safely.");
      }
      const framedPhoto = nativeFramedPhoto || await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ crop: scanFrameCrop }],
        {
          compress: 0.96,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      const cropEngine = nativeFramedPhoto
        ? "woof_native_uikit"
        : "expo_image_manipulator_fallback";
      if (!isCurrentCapture()) return;

      // Start at a label-readable size that usually meets the upload target in
      // one pass, avoiding extra image transformations on the hot scan path.
      captureStage = "image_optimization";
      // OCR and visual recognition must inspect the same pixels inside the
      // highlighted frame. Never allow surrounding shelf or browser text to
      // compete with the product label the user intentionally framed.
      const labelOcrPromise = isLabelLookup && labelOcrIsAvailable()
        ? recognizeLabelText(framedPhoto.uri)
        : Promise.resolve(null);
      const [resized, labelOcr] = await Promise.all([
        optimizePhotoForAnalysis(framedPhoto.uri, isLabelLookup ? {
          targetBase64Length: TARGET_LABEL_IMAGE_BASE64_LENGTH,
          steps: LABEL_IMAGE_OPTIMIZATION_STEPS,
        } : undefined),
        labelOcrPromise,
      ]);
      if (!isCurrentCapture()) return;

      if (isLabelLookup) {
        trackEvent("label_ocr_completed", {
          usable: labelOcr?.usable === true,
          duration_ms: Math.round(labelOcr?.durationMs || 0),
          line_count: labelOcr?.lines?.length || 0,
          text_length: labelOcr?.text?.length || 0,
          stage: "scanner_parallel_capture",
        });
      }

      if (!resized?.base64) {
        trackEvent("photo_capture_failed", {
          scan_mode: isHumanFood ? "human_food" : (isLabelLookup ? "label_lookup" : (isIngredientCapture ? "ingredient_capture" : "photo")),
          scanner_mode: scanModeForAnalytics,
          pet_type: petType,
          capture_stage: "optimization_missing_base64",
          optimized_width: resized?.width || null,
          optimized_height: resized?.height || null,
          optimization_step: resized?.optimizationStep || null,
        });
        Alert.alert("Capture Failed", "Could not process the photo. Please try again.");
        setCapturing(false);
        return;
      }
      const base64Length = resized.base64.length;
      if (base64Length > MAX_CLIENT_IMAGE_BASE64_LENGTH) {
        trackEvent("photo_capture_too_large", {
          scan_mode: isHumanFood ? "human_food" : (isLabelLookup ? "label_lookup" : (isIngredientCapture ? "ingredient_capture" : "photo")),
          scanner_mode: scanModeForAnalytics,
          pet_type: petType,
          base64_length: base64Length,
          max_base64_length: MAX_CLIENT_IMAGE_BASE64_LENGTH,
          optimization_step: resized.optimizationStep,
          target_width: resized.targetWidth,
          compression: resized.compression,
          capture_stage: "client_size_gate",
        });
        Alert.alert("Photo Too Large", "Please move closer to the label and try again.");
        setCapturing(false);
        return;
      }

      trackEvent("photo_capture_completed", {
        scan_mode: isHumanFood ? "human_food" : (isLabelLookup ? "label_lookup" : (isIngredientCapture ? "ingredient_capture" : "photo")),
        pet_type: petType,
        base64_length: base64Length,
        estimated_decoded_bytes: Math.round(base64Length * 0.75),
        original_width: photo.width,
        original_height: photo.height,
        camera_preview_width: cameraViewport.width,
        camera_preview_height: cameraViewport.height,
        optimized_width: resized.width,
        optimized_height: resized.height,
        crop_origin_x: scanFrameCrop.originX,
        crop_origin_y: scanFrameCrop.originY,
        crop_width: scanFrameCrop.width,
        crop_height: scanFrameCrop.height,
        cropped_output_width: framedPhoto.width || null,
        cropped_output_height: framedPhoto.height || null,
        crop_source_width: nativeFramedPhoto?.sourceWidth || null,
        crop_source_height: nativeFramedPhoto?.sourceHeight || null,
        crop_engine: cropEngine,
        image_scope: "highlighted_scan_frame",
        label_image_scope: isLabelLookup ? "highlighted_scan_frame" : null,
        optimization_step: resized.optimizationStep,
        target_width: resized.targetWidth,
        compression: resized.compression,
        capture_to_handoff_ms: Date.now() - captureStartedAt,
      });

      setCapturing(false);

      if (isLabelLookup) {
        const labelLookupParams = {
          labelImageBase64: resized.base64,
          labelImageUri: resized.uri || framedPhoto.uri,
          labelOcrText: labelOcr?.usable ? labelOcr.text : "",
          labelOcrLines: labelOcr?.usable ? labelOcr.lines : [],
          labelOcrDurationMs: labelOcr?.usable ? labelOcr.durationMs : null,
          labelCaptureId: `${Date.now()}`,
          labelCaptureStartedAt: captureStartedAt,
          labelAttempt: Math.max(1, Number(route.params?.labelAttempt) || 1),
          sourceSurface: "scanner_label_lookup",
        };

        if (route.params?.returnToProductSearch && navigation.popTo) {
          navigation.popTo("ProductSearch", labelLookupParams, { merge: true });
        } else {
          navigation.replace("ProductSearch", labelLookupParams);
        }
      } else {
        navigation.replace("Results", {
          mode: isHumanFood ? "human_food" : (isIngredientCapture ? "ingredient_capture" : "photo"),
          base64: resized.base64,
          uri: framedPhoto.uri,
          acquisitionQuery: route.params?.acquisitionQuery || null,
          candidateProduct: route.params?.candidateProduct || null,
          labelIdentification: route.params?.labelIdentification || null,
          sourceSurface: route.params?.sourceSurface || null,
          catalogEvidenceConsent: route.params?.catalogEvidenceConsent === true,
          ...(isHumanFood && { petType, petName }),
        });
      }
    } catch (err) {
      if (!isCurrentCapture()) return;
      logger.debug("[SCANNER] Capture error:", err.message);
      trackEvent("photo_capture_failed", {
        scan_mode: isHumanFood ? "human_food" : (isLabelLookup ? "label_lookup" : (isIngredientCapture ? "ingredient_capture" : "photo")),
        pet_type: petType,
        capture_stage: captureStage,
        error_name: err?.name || "unknown",
        message: err.message,
      });
      const captureFailure = captureStage === "scan_frame_crop"
        ? ["Couldn't Frame the Label", "Keep the full package inside the guide and retake the photo."]
        : captureStage === "image_optimization"
          ? ["Couldn't Prepare the Photo", "Retake the photo in good light and hold the camera steady."]
          : ["Camera Capture Failed", "The camera couldn't finish the photo. Please try again."];
      Alert.alert(captureFailure[0], captureFailure[1]);
    } finally {
      if (isCurrentCapture()) {
        setCapturing(false);
      }
    }
  };

  const handleCancelCapture = () => {
    if (!capturing) return;
    captureRunIdRef.current += 1;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackEvent("photo_capture_cancelled", {
      scan_mode: isHumanFood ? "human_food" : (isLabelLookup ? "label_lookup" : (isIngredientCapture ? "ingredient_capture" : "photo")),
      pet_type: petType,
    });
    setCapturing(false);
  };

  const showHelp = () => {
    trackEvent("scanner_help_opened", {
      scan_mode: scanModeForAnalytics,
      fallback_to_photo: !!showFallbackBanner,
      pet_type: petType,
      capture_tip: scannerTip,
    });

    if (isHumanFood) {
      Alert.alert(
        "How to Check Food",
        `1. Use good light and keep the food or label readable\n\n2. Fill the frame and tap the capture button\n\n3. ${BRAND_NAME} checks safety guidance for your selected pet`,
        [{ text: "Got it" }]
      );
      return;
    }

    if (isLabelLookup) {
      Alert.alert(
        "How to Find Products",
        `1. Point at the front of the bag or can\n\n2. Make the brand and product name readable\n\n3. ${BRAND_NAME} searches by product name, not barcode`,
        [{ text: "Got it" }]
      );
      return;
    }

    if (isIngredientCapture) {
      Alert.alert(
        "How to Add Ingredients",
        `1. Capture the full ingredients list\n\n2. Keep the text sharp and readable\n\n3. ${BRAND_NAME} saves it for catalog review before verified results are shared`,
        [{ text: "Got it" }]
      );
      return;
    }

    Alert.alert(
      "How to Scan",
      `1. Keep the product name or ingredients readable\n\n2. Use good light and avoid glare\n\n3. ${BRAND_NAME} works best from the front label or product name`,
      [{ text: "Got it" }]
    );
  };

  const handleCameraPermissionPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    trackEvent("camera_permission_requested", {
      scan_mode: scanModeForAnalytics,
      can_ask_again: permission?.canAskAgain !== false,
      status: permission?.status || "unknown",
    });

    if (cameraPermissionBlocked) {
      try {
        await Linking.openSettings();
        trackEvent("camera_permission_settings_opened", {
          scan_mode: scanModeForAnalytics,
        });
      } catch (err) {
        trackEvent("camera_permission_settings_failed", {
          scan_mode: scanModeForAnalytics,
          message: err.message,
        });
        Alert.alert(
          "Open Settings",
          `Please open your device settings and allow camera access for ${BRAND_NAME}.`
        );
      }
      return;
    }

    try {
      const nextPermission = await requestPermission();
      trackEvent("camera_permission_result", {
        scan_mode: scanModeForAnalytics,
        granted: nextPermission?.granted === true,
        can_ask_again: nextPermission?.canAskAgain !== false,
        status: nextPermission?.status || "unknown",
      });
    } catch (err) {
      trackEvent("camera_permission_request_failed", {
        scan_mode: scanModeForAnalytics,
        message: err.message,
      });
      Alert.alert("Camera Access", "Could not request camera access. Please try again.");
    }
  };

  // --- Permission screens ---
  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.permissionHeader}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={({ pressed }) => [
              styles.permissionBackButton,
              { opacity: pressed ? 0.55 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
          >
            <ChevronLeft size={26} color={theme.textPrimary} strokeWidth={2.2} />
          </Pressable>
        </View>
        <View style={styles.permissionContainer}>
          <View style={[styles.permissionIconWrap, { backgroundColor: theme.surface }]}>
            <CameraOff size={34} color={theme.textSecondary} strokeWidth={1.6} />
          </View>
          <Text style={[styles.permissionEyebrow, { color: theme.textTertiary }]}>
            {scannerTitle}
          </Text>
          <Text style={[styles.permissionTitle, { color: theme.textPrimary }]}>
            Use your camera to scan
          </Text>
          <Text style={[styles.permissionText, { color: theme.textSecondary }]}>
            {cameraPermissionCopy}
          </Text>
          <Text style={[styles.permissionPrivacy, { color: theme.textTertiary }]}>
            Photos are used only for product lookup and ingredient analysis.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.permissionButton,
              { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleCameraPermissionPress}
            accessibilityRole="button"
            accessibilityLabel={cameraPermissionAccessibilityLabel}
            accessibilityHint={cameraPermissionHint}
          >
            <Text style={[styles.permissionButtonText, { color: theme.buttonText }]}>
              {cameraPermissionButtonText}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // --- Camera UI ---
  return (
    <View style={styles.container} onLayout={handleCameraViewportLayout}>
      {/* Only render camera when screen is focused (turns off during results screen) */}
      {isFocused && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={barcodeEnabled ? handleBarcodeScanned : undefined}
          barcodeScannerSettings={{
            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
          }}
        />
      )}

      {/* Dark mask overlay with cutout */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
        <View style={[styles.mask, { top: 0, height: scanFrameY, left: 0, right: 0 }]} />
        <View style={[styles.mask, { top: scanFrameY, height: scanFrameHeight, left: 0, width: scanFrameX }]} />
        <View style={[styles.mask, { top: scanFrameY, height: scanFrameHeight, right: 0, width: scanFrameX }]} />
        <View style={[styles.mask, { top: scanFrameY + scanFrameHeight, bottom: 0, left: 0, right: 0 }]} />
      </View>

      {/* Darkening overlay during processing */}
      <Animated.View
        style={[StyleSheet.absoluteFill, overlayDarkenStyle, { pointerEvents: "none" }]}
      />

      {/* Scan frame: corners + flash + processing */}
      <View style={[styles.scanFrame, { pointerEvents: "box-none", top: scanFrameY, left: scanFrameX, width: scanFrameWidth, height: scanFrameHeight }]}>
        <Animated.View style={[StyleSheet.absoluteFill, cornerAnimStyle]}>
          <Animated.View style={[styles.corner, styles.cornerTL, cornerTLStyle]} />
          <Animated.View style={[styles.corner, styles.cornerTR, cornerTRStyle]} />
          <Animated.View style={[styles.corner, styles.cornerBL, cornerBLStyle]} />
          <Animated.View style={[styles.corner, styles.cornerBR, cornerBRStyle]} />
        </Animated.View>

        <Animated.View style={[styles.barcodeFlash, flashStyle]} />

        {capturing && (
          <ProcessingCard
            label={isHumanFood ? "Checking food safety..." : (isLabelLookup ? "Finding product..." : (isIngredientCapture ? "Reading ingredients..." : "Analyzing ingredients..."))}
            onCancel={handleCancelCapture}
          />
        )}
      </View>

      {/* Instruction pill below scan area */}
      <View style={[styles.instructionWrap, { pointerEvents: "none", top: scanFrameY + scanFrameHeight + Spacing.lg }]}>
        <BlurView intensity={32} tint="dark" style={styles.instructionBlur}>
          <Text style={styles.instructionLight}>
            {scannerInstruction}
          </Text>
          <Text style={styles.instructionTipLight}>
            {scannerTip}
          </Text>
        </BlurView>
      </View>

      {/* Interactive controls */}
      <SafeAreaView style={styles.controls}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
          >
            <ChevronLeft size={24} color="#F5F5F5" strokeWidth={2.5} />
          </TouchableOpacity>
          <Text
            style={styles.topTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {scannerTitle}
          </Text>
          <TouchableOpacity
            style={styles.helpBtn}
            onPress={showHelp}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="How to scan"
            accessibilityHint="Shows tips for capturing a usable label photo"
          >
            <HelpCircle size={18} color="#F5F5F5" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Fallback banner when barcode not found */}
        {showFallbackBanner && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            exiting={FadeOutUp.duration(300)}
            style={styles.fallbackBanner}
          >
            <Text style={styles.fallbackBannerText}>
              {verificationMessage || fallbackMessage || "Barcode not in the verified catalog — capture the front label instead"}
            </Text>
          </Animated.View>
        )}

        {sessionReady === false ? (
          <View style={styles.sessionBanner} accessible accessibilityRole="alert">
            <Text style={styles.sessionBannerText}>Session needs a refresh before scanning</Text>
          </View>
        ) : null}

        {!isPro && Number.isFinite(freeScansLeft) ? (
          <View
            style={styles.freeScansPill}
            accessible
            accessibilityLabel={`${Math.max(0, freeScansLeft)} free scans left`}
          >
            <Text style={styles.freeScansPillText}>
              {Math.max(0, freeScansLeft)} free scan{freeScansLeft === 1 ? "" : "s"} left
            </Text>
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        {/* Bottom: barcode note + capture button + label */}
        <View style={styles.bottomArea}>
          {!isHumanFood && !isLabelLookup && !isIngredientCapture && (
            <Text style={styles.barcodeHint}>
              Barcodes detected automatically
            </Text>
          )}
          <View style={{ height: 20 }} />
          <Pressable
            onPress={handleCapture}
            disabled={capturing || sessionReady === false}
            onPressIn={() => {
              captureScale.value = withSpring(0.92, { damping: 20, stiffness: 300 });
            }}
            onPressOut={() => {
              captureScale.value = withSpring(1, { damping: 15, stiffness: 150 });
            }}
            accessibilityRole="button"
            accessibilityLabel={capturing ? "Scanning" : "Capture photo"}
            accessibilityHint={isHumanFood ? "Takes a photo of the food item" : "Takes a photo of the pet food package or label"}
            accessibilityState={{ disabled: capturing || sessionReady === false }}
          >
            <Animated.View style={[styles.captureBtn, captureScaleStyle]}>
              <View style={[
                styles.captureInner,
                capturing && styles.captureInnerDisabled,
              ]} />
            </Animated.View>
          </Pressable>
          <View style={{ height: 12 }} />
          <Text style={styles.captureLabel}>
            {capturing ? "Scanning..." : "Capture"}
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
  instructionBlur: {
    borderRadius: 20,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  instruction: {
    color: "rgba(245,245,245,0.85)",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0,
  },
  instructionLight: {
    color: "#F5F5F5",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0,
    textAlign: "center",
  },
  instructionTipLight: {
    color: "rgba(245,245,245,0.7)",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0,
    marginTop: 4,
    textAlign: "center",
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
    letterSpacing: 0,
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
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.30)",
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFFFFF",
  },
  captureInnerDisabled: {
    backgroundColor: "rgba(245,245,245,0.4)",
  },
  captureLabel: {
    color: "rgba(245,245,245,0.8)",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0,
  },
  barcodeHint: {
    color: "rgba(245,245,245,0.5)",
    fontSize: 13,
    letterSpacing: 0,
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
    letterSpacing: 0,
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
    backgroundColor: "rgba(232, 163, 23, 0.92)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
    marginHorizontal: Spacing.screenPadding,
  },
  fallbackBannerText: {
    color: "#1C1C1E",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0,
  },
  sessionBanner: {
    alignSelf: "center",
    backgroundColor: "rgba(180, 45, 45, 0.94)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10,
    marginHorizontal: Spacing.screenPadding,
    zIndex: 9,
  },
  sessionBannerText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  freeScansPill: {
    position: "absolute",
    top: 112,
    alignSelf: "center",
    backgroundColor: "rgba(17,17,17,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    zIndex: 8,
  },
  freeScansPillText: {
    color: "#F7F7F4",
    fontSize: 12,
    fontWeight: "700",
  },

  // Permission screen
  permissionHeader: {
    height: 52,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  permissionBackButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingBottom: 56,
  },
  permissionIconWrap: {
    width: 82,
    height: 82,
    borderRadius: 24,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  permissionEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  permissionTitle: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: 0,
    textAlign: "center",
  },
  permissionText: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 23,
    maxWidth: 310,
  },
  permissionPrivacy: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
    maxWidth: 290,
    marginTop: 10,
    marginBottom: 28,
  },
  permissionButton: {
    height: Spacing.buttonHeight,
    width: "100%",
    maxWidth: 300,
    paddingHorizontal: 24,
    borderRadius: Spacing.buttonRadius,
    justifyContent: "center",
    alignItems: "center",
  },
  permissionButtonText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0,
  },
});
