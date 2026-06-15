#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appJson = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const packageJsonObject = JSON.parse(packageJson);
const scannerSource = fs.readFileSync(path.join(root, "screens/ScannerScreen.js"), "utf8");
const profileSource = fs.readFileSync(path.join(root, "screens/ProfileScreen.js"), "utf8");
const themeSource = fs.readFileSync(path.join(root, "theme.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`platform scope guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  appJson?.expo?.name === "Woof",
  "native display name must match the public Woof brand capitalization"
);

assert(
  packageJsonObject.version === appJson?.expo?.version,
  "package.json version must match the Expo app version used in support/release metadata"
);

assert(
  appJson?.expo?.ios?.supportsTablet === false,
  "iOS tablet support must stay disabled until an iPad/tablet QA pass is documented"
);

assert(
  appJson?.expo?.orientation === "portrait",
  "phone-first launch scope should remain portrait-only until broader device QA is complete"
);

assert(
  appJson?.expo?.userInterfaceStyle === "automatic" &&
    profileSource.includes('{ key: "system", label: "Auto"') &&
    profileSource.includes('{ key: "dark", label: "Dark"') &&
    themeSource.includes("const systemScheme = useColorScheme()") &&
    themeSource.includes('preference === "system" ? systemScheme : preference'),
  "native userInterfaceStyle must be automatic while Profile exposes Auto/Dark appearance controls"
);

const iosCameraCopy = appJson?.expo?.ios?.infoPlist?.NSCameraUsageDescription || "";
const cameraPlugin = appJson?.expo?.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-camera");
const pluginCameraCopy = cameraPlugin?.[1]?.cameraPermission || "";
for (const copy of [iosCameraCopy, pluginCameraCopy]) {
  assert(
    copy.includes("pet food packages") &&
      copy.includes("ingredient labels") &&
      copy.includes("human foods"),
    "native camera permission copy must cover package scans, ingredient labels, and human-food checks"
  );
}

assert(
  scannerSource.includes("pet food packages, ingredient labels") &&
    scannerSource.includes("and human foods"),
  "in-app camera permission fallback must match native camera permission scope"
);

assert(
  packageJson.includes('"test:platform-scope": "node scripts/test-platform-scope-guards.js"') &&
    packageJson.includes("npm run test:platform-scope"),
  "platform scope guard must be wired into package scripts"
);

console.log("platform scope guard passed");
