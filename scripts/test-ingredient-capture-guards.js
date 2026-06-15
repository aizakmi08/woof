#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "screens/IngredientCaptureScreen.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`ingredient capture guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  source.includes("const hasRecoveryContext = Boolean(productName && base64)") &&
    source.includes('import * as analysisService from "../services/analysisService";') &&
    source.includes('import { useAuth } from "../services/auth";') &&
    source.includes('import { useNetwork } from "../services/network";') &&
    source.includes("const { isPro } = useAuth();") &&
    source.includes("const { isOnline } = useNetwork();") &&
    source.includes("captureSessionRef") &&
    source.includes("mountedRef") &&
    source.includes("const isActiveCapture") &&
    source.includes("const cancelActiveCapture") &&
    /if \(!hasRecoveryContext \|\| !cameraRef\.current \|\| capturing \|\| !cameraReady\) return;/.test(source) &&
    /const handleSkip = \(\) => \{[\s\S]{0,80}if \(!hasRecoveryContext\) return;/.test(source),
  "capture and skip must require original product context and cancellable active sessions"
);

assert(
  source.includes("CAMERA_CAPTURE_TIMEOUT_MS = 12000") &&
    source.includes("IMAGE_MANIPULATION_TIMEOUT_MS = 18000") &&
	    source.includes("function withCaptureTimeout") &&
	    /withCaptureTimeout\([\s\S]{0,120}takePictureAsync\([\s\S]*?\),[\s\S]{0,120}"Camera capture",[\s\S]{0,80}CAMERA_CAPTURE_TIMEOUT_MS/.test(source) &&
	    /withCaptureTimeout\([\s\S]{0,120}ImageManipulator\.manipulateAsync\([\s\S]*?\),[\s\S]{0,120}"Image preparation",[\s\S]{0,80}IMAGE_MANIPULATION_TIMEOUT_MS/.test(source) &&
	    /const photo = await withCaptureTimeout[\s\S]{0,360}if \(!isActiveCapture\(sessionId\)\) return;/.test(source) &&
	    /const resized = await withCaptureTimeout[\s\S]{0,360}if \(!isActiveCapture\(sessionId\)\) return;[\s\S]{0,220}if \(!resized\?\.base64\)[\s\S]{0,760}analysisService\.startAnalysis\(\{[\s\S]{0,360}ingredientBase64: resized\.base64,[\s\S]{0,360}\}\);[\s\S]{0,180}navigation\.replace\("Results"/.test(source),
	  "ingredient capture native photo and resize work must be bounded and cancellation-aware"
	);

assert(
  /if \(!resized\?\.base64\) \{[\s\S]{0,180}Could not prepare the ingredient photo[\s\S]{0,80}setCapturing\(false\);[\s\S]{0,40}return;[\s\S]{0,40}\}\s*try \{[\s\S]{0,120}analysisService\.startAnalysis\(\{[\s\S]{0,120}mode: "photo_with_ingredients",[\s\S]{0,120}base64,[\s\S]{0,120}ingredientBase64: resized\.base64,[\s\S]{0,120}productName,[\s\S]{0,80}brand,[\s\S]{0,80}petType,[\s\S]{0,80}uri,[\s\S]{0,80}isPro,[\s\S]{0,160}\}\);[\s\S]{0,160}Background analysis start failed[\s\S]{0,80}\}\s*navigation\.replace\("Results"/.test(source),
  "ingredient capture must fail before Results when image preparation returns no base64"
);

assert(
  /const handleSkip = \(\) => \{[\s\S]{0,80}if \(!hasRecoveryContext\) return;[\s\S]{0,220}if \(!isOnline\) \{[\s\S]{0,180}No internet connection[\s\S]{0,220}estimate this product[\s\S]{0,120}return;[\s\S]{0,120}if \(capturing\) cancelActiveCapture\(\);[\s\S]{0,220}analysisService\.startAnalysis\(\{[\s\S]{0,120}mode: "photo_with_ingredients",[\s\S]{0,120}base64,[\s\S]{0,120}productName,[\s\S]{0,80}brand,[\s\S]{0,80}petType,[\s\S]{0,80}uri,[\s\S]{0,80}isPro,[\s\S]{0,160}\}\);[\s\S]{0,160}Estimate analysis start failed[\s\S]{0,120}navigation\.replace\("Results"/.test(source),
  "skip-label estimate path must pre-start analysis before replacing Results"
);

assert(
  /const handleCapture = async \(\) => \{[\s\S]{0,180}if \(!isOnline\) \{[\s\S]{0,180}No internet connection[\s\S]{0,220}analyze the ingredient label[\s\S]{0,120}return;[\s\S]{0,120}const sessionId = captureSessionRef/.test(source),
  "ingredient label capture must block offline before camera/image work"
);

assert(
  /const handleScanAgain = \(\) => \{[\s\S]{0,120}navigation\.replace\("Scanner", \{ petType \}\);[\s\S]{0,20}\};/.test(source) &&
    /if \(!hasRecoveryContext\) \{[\s\S]{0,240}Scan context expired[\s\S]{0,300}onPress=\{handleScanAgain\}/.test(source),
  "missing route context must fail fast to a scan-again state"
);

assert(
  source.includes("const [cameraReady, setCameraReady] = useState(false)") &&
    /onCameraReady=\{\(\) => setCameraReady\(true\)\}/.test(source) &&
    /disabled=\{capturing \|\| !hasRecoveryContext \|\| !cameraReady\}/.test(source) &&
    /accessibilityState=\{\{ disabled: capturing \|\| !hasRecoveryContext \|\| !cameraReady \}\}/.test(source),
  "ingredient capture button must be disabled when recovery context is invalid"
);

assert(
  /disabled=\{!hasRecoveryContext\}/.test(source) &&
    /accessibilityLabel="Skip ingredient photo and use AI estimate"/.test(source),
  "skip estimate action must also be guarded and accessible"
);

assert(
  packageJson.includes('"test:ingredient-capture": "node scripts/test-ingredient-capture-guards.js"') &&
    packageJson.includes("npm run test:ingredient-capture"),
  "ingredient capture guard must be wired into package scripts"
);

console.log("ingredient capture guard passed");
