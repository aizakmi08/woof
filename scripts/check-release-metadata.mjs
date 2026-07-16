import fs from "node:fs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  );
}

function sameObject(left = {}, right = {}) {
  return JSON.stringify(normalizeObject(left)) === JSON.stringify(normalizeObject(right));
}

function pluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

function findPlugin(plugins, name) {
  return plugins.find((plugin) => pluginName(plugin) === name);
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const appJson = readJson("app.json");
const appConfigSource = readText("app.config.js");
const easJson = readJson("eas.json");

const rootLock = packageLock.packages?.[""];
const expoConfig = appJson.expo;
const appPlugins = expoConfig?.plugins || [];
const cameraPermission = "Woof needs camera access to scan pet food labels and food items.";
const requiredPublicEasEnv = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SENTRY_DSN",
];
const requiredPlatformEasEnv = [
  "REVENUECAT_API_KEY_IOS",
  "REVENUECAT_API_KEY_ANDROID",
];
const requiredPrivateEasEnv = [
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN",
];

assert(rootLock, "package-lock.json is missing the root package entry");
assert(expoConfig, "app.json is missing the expo config");

assert(
  packageJson.version === rootLock.version,
  `package.json version ${packageJson.version} does not match package-lock root version ${rootLock.version}`
);

assert(
  packageJson.version === expoConfig.version,
  `package.json version ${packageJson.version} does not match app.json expo.version ${expoConfig.version}`
);

assert(
  sameObject(packageJson.dependencies, rootLock.dependencies),
  "package.json dependencies do not match package-lock root dependencies"
);

assert(
  sameObject(packageJson.devDependencies, rootLock.devDependencies),
  "package.json devDependencies do not match package-lock root devDependencies"
);

assert(
  packageJson.dependencies["react-dom"] === packageJson.dependencies.react,
  "react-dom must stay installed and match the React version for Expo web QA/export"
);

assert(
  packageJson.dependencies["react-native-web"] === "0.21.2",
  "react-native-web must stay installed at the Expo SDK 55-compatible version for Expo web QA/export"
);

assert(
  packageLock.packages?.["node_modules/react-dom"]?.version === packageJson.dependencies["react-dom"],
  "package-lock is missing the expected react-dom web runtime package"
);

assert(
  packageLock.packages?.["node_modules/react-native-web"]?.version === packageJson.dependencies["react-native-web"],
  "package-lock is missing the expected react-native-web runtime package"
);

assert(
  expoConfig.ios?.bundleIdentifier === "io.woof.app",
  "Unexpected iOS bundle identifier"
);

assert(
  expoConfig.android?.package === "com.app.woof",
  "Unexpected Android package"
);

assert(
  expoConfig.name === "woof" && expoConfig.slug === "woof" && expoConfig.scheme === "woof",
  "Unexpected Expo name, slug, or URL scheme"
);

assert(
  expoConfig.runtimeVersion?.policy === "appVersion",
  "Expo runtimeVersion should stay pinned to the native app version"
);

assert(
  expoConfig.updates?.url === "https://u.expo.dev/ea14f3ad-9dbe-4341-bfba-51eb5c6ead8f",
  "Expo updates URL no longer points at the Woof EAS project"
);

assert(
  expoConfig.ios?.usesAppleSignIn === true,
  "iOS config must keep usesAppleSignIn enabled while Apple login is shipped"
);

assert(
  expoConfig.ios?.infoPlist?.NSCameraUsageDescription === cameraPermission,
  "iOS camera usage description must cover pet-food and human-food scanner modes"
);

assert(
  expoConfig.ios?.infoPlist?.NSUserTrackingUsageDescription == null,
  "Do not add ATT tracking permission copy unless tracking/ad-ID collection is intentionally shipped"
);

const expoCameraPlugin = findPlugin(appPlugins, "expo-camera");
assert(
  Array.isArray(expoCameraPlugin) && expoCameraPlugin[1]?.cameraPermission === cameraPermission,
  "expo-camera permission copy must match the iOS camera usage description"
);

for (const requiredPlugin of [
  "expo-splash-screen",
  "expo-camera",
  "expo-apple-authentication",
  "expo-web-browser",
  "expo-sharing",
  "@sentry/react-native/expo",
]) {
  assert(
    findPlugin(appPlugins, requiredPlugin),
    `app.json is missing required plugin ${requiredPlugin}`
  );
}

for (const requiredPermission of ["INTERNET", "CAMERA"]) {
  assert(
    expoConfig.android?.permissions?.includes(requiredPermission),
    `Android config is missing required permission ${requiredPermission}`
  );
}

assert(
  easJson.submit?.production?.ios?.ascAppId === "6760733899",
  "EAS submit ascAppId must match the live Woof App Store id"
);

assert(
  easJson.cli?.appVersionSource === "remote",
  "EAS appVersionSource changed; re-check release versioning expectations"
);

assert(
  easJson.build?.production?.autoIncrement === true,
  "Production EAS builds should keep autoIncrement enabled"
);

for (const envName of requiredPublicEasEnv) {
  assert(
    appConfigSource.includes(`"${envName}"`) &&
      appConfigSource.includes("function publicEnv") &&
      appConfigSource.includes("EXPO_PUBLIC_${name}") &&
      appConfigSource.includes(`publicEnv("${envName}")`),
    `app.config.js must expose and validate ${envName} with EXPO_PUBLIC fallback support`
  );
}

for (const envName of requiredPlatformEasEnv) {
  assert(
    appConfigSource.includes(`"${envName}"`) &&
      appConfigSource.includes("REQUIRED_PLATFORM_EAS_ENV") &&
      appConfigSource.includes("EAS_BUILD_PLATFORM"),
    `app.config.js must validate ${envName} only for the matching EAS platform`
  );
}

for (const envName of requiredPrivateEasEnv) {
  assert(
    appConfigSource.includes(`"${envName}"`) && appConfigSource.includes("process.env[name]"),
    `app.config.js must validate ${envName} for Sentry/EAS builds`
  );
}

assert(
  !appConfigSource.includes("SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN"),
  "app.config.js must not expose SENTRY_AUTH_TOKEN in Expo extra"
);

assert(
  appConfigSource.includes("REQUIRED_PUBLIC_EAS_ENV") &&
    appConfigSource.includes("EAS_BUILD") &&
    appConfigSource.includes("EAS_BUILD_PROFILE") &&
    appConfigSource.includes("assertReleaseEnv();"),
  "app.config.js must fail fast when release EAS builds are missing public app config"
);

console.log("Release metadata check passed");
console.log(`Version: ${packageJson.version}`);
console.log("Reminder: EAS uses remote app versioning, so verify the remote build number before App Store submission.");
