#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const scannerSource = fs.readFileSync(
  path.join(root, "screens/ScannerScreen.js"),
  "utf8"
);
const ingredientCaptureSource = fs.readFileSync(
  path.join(root, "screens/IngredientCaptureScreen.js"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    console.error(`scanner capture guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  scannerSource.includes("captureSessionRef") &&
    scannerSource.includes("mountedRef") &&
    scannerSource.includes("const isActiveCapture") &&
    ingredientCaptureSource.includes("captureSessionRef") &&
    ingredientCaptureSource.includes("mountedRef") &&
    ingredientCaptureSource.includes("const isActiveCapture"),
  "scanner must track mounted/cancelled capture sessions"
);

assert(
  scannerSource.includes('import { useNetwork } from "../services/network";') &&
    scannerSource.includes("const { isOnline } = useNetwork();") &&
    ingredientCaptureSource.includes('import { useNetwork } from "../services/network";') &&
    ingredientCaptureSource.includes("const { isOnline } = useNetwork();") &&
    /if \(!isOnline\) \{[\s\S]{0,180}No internet connection[\s\S]{0,180}return;[\s\S]{0,120}const sessionId = captureSessionRef/.test(scannerSource) &&
    /const handleCapture = async \(\) => \{[\s\S]{0,180}if \(!isOnline\) \{[\s\S]{0,180}No internet connection[\s\S]{0,220}analyze the ingredient label[\s\S]{0,120}return;[\s\S]{0,120}const sessionId = captureSessionRef/.test(ingredientCaptureSource) &&
    /const handleSkip = \(\) => \{[\s\S]{0,160}if \(!isOnline\) \{[\s\S]{0,180}No internet connection[\s\S]{0,220}estimate this product[\s\S]{0,120}return;/.test(ingredientCaptureSource),
  "front scanner and ingredient recovery must block offline capture/estimate before expensive image prep or Results navigation"
);

assert(
  scannerSource.includes("const [cameraReady, setCameraReady] = useState(false)") &&
    ingredientCaptureSource.includes("const [cameraReady, setCameraReady] = useState(false)") &&
    /if \(!isFocused\) \{[\s\S]{0,80}setCameraReady\(false\);[\s\S]{0,120}captureSessionRef\.current\.cancelled = true;[\s\S]{0,80}captureSessionRef\.current\.id \+= 1;[\s\S]{0,80}setCapturing\(false\);/.test(scannerSource) &&
    /if \(!isFocused\) \{[\s\S]{0,80}setCameraReady\(false\);[\s\S]{0,120}captureSessionRef\.current\.cancelled = true;[\s\S]{0,80}captureSessionRef\.current\.id \+= 1;[\s\S]{0,80}setCapturing\(false\);/.test(ingredientCaptureSource) &&
    /onCameraReady=\{\(\) => setCameraReady\(true\)\}/.test(scannerSource) &&
    /onCameraReady=\{\(\) => setCameraReady\(true\)\}/.test(ingredientCaptureSource),
  "scanner and ingredient capture must reset camera readiness and cancel active captures on focus loss"
);

assert(
  /if \(!cameraRef\.current \|\| capturing \|\| !cameraReady\) return;/.test(scannerSource) &&
    /disabled=\{capturing \|\| !cameraReady\}/.test(scannerSource) &&
    /accessibilityState=\{\{ disabled: capturing \|\| !cameraReady \}\}/.test(scannerSource) &&
    /if \(!hasRecoveryContext \|\| !cameraRef\.current \|\| capturing \|\| !cameraReady\) return;/.test(ingredientCaptureSource) &&
    /disabled=\{capturing \|\| !hasRecoveryContext \|\| !cameraReady\}/.test(ingredientCaptureSource) &&
    /accessibilityState=\{\{ disabled: capturing \|\| !hasRecoveryContext \|\| !cameraReady \}\}/.test(ingredientCaptureSource),
  "capture must be blocked until the camera is ready"
);

assert(
  scannerSource.includes("CAMERA_CAPTURE_TIMEOUT_MS = 12000") &&
    scannerSource.includes("IMAGE_MANIPULATION_TIMEOUT_MS = 15000") &&
    ingredientCaptureSource.includes("CAMERA_CAPTURE_TIMEOUT_MS = 12000") &&
    ingredientCaptureSource.includes("IMAGE_MANIPULATION_TIMEOUT_MS = 18000") &&
    scannerSource.includes("function withCaptureTimeout") &&
    ingredientCaptureSource.includes("function withCaptureTimeout") &&
    scannerSource.includes('err.code = "CAPTURE_TIMEOUT"') &&
    ingredientCaptureSource.includes('err.code = "CAPTURE_TIMEOUT"'),
  "native capture and image preparation must have bounded timeouts"
);

assert(
  /const sessionId = captureSessionRef\.current\.id \+ 1;[\s\S]{0,180}captureSessionRef\.current = \{ id: sessionId, cancelled: false \};/.test(scannerSource),
  "each capture must create a fresh active session"
);

assert(
  /withCaptureTimeout\([\s\S]{0,120}takePictureAsync\([\s\S]*?\),[\s\S]{0,120}"Camera capture",[\s\S]{0,80}CAMERA_CAPTURE_TIMEOUT_MS,[\s\S]{0,120}\);\s*if \(!isActiveCapture\(sessionId\)\) return;/.test(scannerSource) &&
    /withCaptureTimeout\([\s\S]{0,120}takePictureAsync\([\s\S]*?\),[\s\S]{0,120}"Camera capture",[\s\S]{0,80}CAMERA_CAPTURE_TIMEOUT_MS,[\s\S]{0,120}\);\s*if \(!isActiveCapture\(sessionId\)\) return;/.test(ingredientCaptureSource),
  "capture cancellation must be checked after native photo capture"
);

assert(
  /takePictureAsync\(\{[\s\S]{0,120}skipProcessing: false,[\s\S]{0,120}exif: false,/.test(scannerSource),
  "scanner package photos must allow Expo orientation processing before vision analysis"
);

assert(
  scannerSource.includes("const FRONT_SCAN_IMAGE_WIDTH = 1400") &&
    scannerSource.includes("const FRONT_SCAN_IMAGE_COMPRESS = 0.76") &&
    /takePictureAsync\(\{[\s\S]{0,80}quality: 0\.9,[\s\S]{0,120}skipProcessing: false/.test(scannerSource) &&
    /resize: \{ width: FRONT_SCAN_IMAGE_WIDTH \}/.test(scannerSource) &&
    /compress: FRONT_SCAN_IMAGE_COMPRESS/.test(scannerSource),
  "front-package scans must use a smaller upload payload than dense OCR captures"
);

assert(
  /takePictureAsync\(\{[\s\S]{0,120}skipProcessing: false,[\s\S]{0,120}exif: false,/.test(ingredientCaptureSource),
  "ingredient-label photos must allow Expo orientation processing before OCR"
);

assert(
  /takePictureAsync\(\{[\s\S]{0,80}quality: 1,[\s\S]{0,120}skipProcessing: false/.test(ingredientCaptureSource) &&
    /resize: \{ width: 1800 \}/.test(ingredientCaptureSource) &&
    /compress: 0\.88/.test(ingredientCaptureSource),
  "ingredient-label OCR captures must retain higher resolution and compression quality"
);

assert(
  !scannerSource.includes("skipProcessing: true") &&
    !ingredientCaptureSource.includes("skipProcessing: true"),
  "camera captures sent to AI must not skip orientation processing"
);

assert(
  /withCaptureTimeout\([\s\S]{0,120}ImageManipulator\.manipulateAsync\([\s\S]*?\),[\s\S]{0,120}"Image preparation",[\s\S]{0,80}IMAGE_MANIPULATION_TIMEOUT_MS,[\s\S]{0,120}\);\s*if \(!isActiveCapture\(sessionId\)\) return;[\s\S]{0,720}navigation\.push\("Results"/.test(scannerSource) &&
    /withCaptureTimeout\([\s\S]{0,120}ImageManipulator\.manipulateAsync\([\s\S]*?\),[\s\S]{0,120}"Image preparation",[\s\S]{0,80}IMAGE_MANIPULATION_TIMEOUT_MS,[\s\S]{0,120}\);\s*if \(!isActiveCapture\(sessionId\)\) return;[\s\S]{0,920}navigation\.replace\("Results"/.test(ingredientCaptureSource),
  "capture cancellation must be checked before navigating to Results"
);

assert(
  /if \(!resized\?\.base64\) \{[\s\S]{0,160}Could not prepare the photo[\s\S]{0,80}setCapturing\(false\);[\s\S]{0,40}return;[\s\S]{0,40}\}\s*try \{[\s\S]{0,360}analysisService\.startAnalysis\(\{[\s\S]{0,360}\}\);[\s\S]{0,160}\}\s*navigation\.push\("Results"/.test(scannerSource) &&
    /if \(!resized\?\.base64\) \{[\s\S]{0,180}Could not prepare the ingredient photo[\s\S]{0,80}setCapturing\(false\);[\s\S]{0,40}return;[\s\S]{0,40}\}\s*try \{[\s\S]{0,480}analysisService\.startAnalysis\(\{[\s\S]{0,480}\}\);[\s\S]{0,160}\}\s*navigation\.replace\("Results"/.test(ingredientCaptureSource),
  "prepared image payloads must include base64 before navigating to Results"
);

assert(
  /const handleBack = \(\) => \{[\s\S]{0,220}if \(capturing\) \{[\s\S]{0,80}cancelActiveCapture\(\);[\s\S]{0,120}navigation\.goBack\(\);/.test(scannerSource),
  "back during capture must cancel the active session before leaving"
);

assert(
  /<View style=\{styles\.scanFrame\} pointerEvents="none">[\s\S]*?<\/View>\s*\{capturing && \([\s\S]{0,180}<View style=\{styles\.processingOverlay\} pointerEvents="box-none">[\s\S]{0,120}<ProcessingCard onCancel=\{handleCancelCapture\}/.test(scannerSource),
  "processing cancel card must render outside the touch-disabled scan frame"
);

assert(
  /accessibilityRole="button"[\s\S]{0,100}accessibilityLabel="Cancel scan"/.test(scannerSource),
  "processing cancel button must remain accessible"
);

console.log("scanner capture guard passed");
