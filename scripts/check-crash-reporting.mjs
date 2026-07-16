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

function pluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

function hasSentryPlugin(plugins = []) {
  return plugins.some((plugin) => {
    const name = pluginName(plugin);
    return name === "@sentry/react-native" || name === "@sentry/react-native/expo";
  });
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const appJson = readJson("app.json");
const appConfigSource = readText("app.config.js");
const appSource = readText("App.js");
const metroSource = readText("metro.config.js");
const checklist = readText("DEPLOYMENT_CHECKLIST.md");
const audit = readText("AUDIT.md");
const projectContext = readText("PROJECT_CONTEXT.md");

const sentryDependency = packageJson.dependencies?.["@sentry/react-native"];
const sentryLockDependency = packageLock.packages?.[""]?.dependencies?.["@sentry/react-native"];
const sentryNodeModuleEntry = packageLock.packages?.["node_modules/@sentry/react-native"];
const sentryInstalled = Boolean(sentryDependency || sentryLockDependency || sentryNodeModuleEntry);

if (!sentryInstalled) {
  for (const [source, label] of [
    [checklist, "DEPLOYMENT_CHECKLIST.md"],
    [audit, "AUDIT.md"],
    [projectContext, "PROJECT_CONTEXT.md"],
  ]) {
    assert(
      source.includes("Sentry") &&
        source.includes("@sentry/react-native") &&
        source.includes("native crash reporting"),
      `${label} must keep the missing native crash reporting release gap explicit until Sentry is installed`
    );
  }

  assert(
    checklist.includes("Do not submit the next production build until") &&
      checklist.includes("Sentry native crash reporting"),
    "Deployment checklist must block production release until Sentry native crash reporting is configured"
  );

  console.log("Crash reporting check passed: Sentry is not installed yet, and the production release gate remains explicit.");
  process.exit(0);
}

assert(
  sentryDependency && sentryLockDependency === sentryDependency && sentryNodeModuleEntry,
  "Sentry dependency must be present in package.json and package-lock.json"
);

assert(
  hasSentryPlugin(appJson.expo?.plugins),
  "app.json must include the @sentry/react-native Expo config plugin when Sentry is installed"
);

for (const snippet of [
  '@sentry/react-native/metro',
  "getSentryExpoConfig(__dirname)",
]) {
  assert(metroSource.includes(snippet), `metro.config.js must include ${snippet}`);
}

for (const envName of ["SENTRY_DSN", "SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_AUTH_TOKEN"]) {
  assert(
    appConfigSource.includes(envName),
    `app.config.js must document or expose ${envName} for Sentry/EAS builds`
  );
}

for (const snippet of [
  "isValidSentryAuthToken",
  "^sntrys_",
  "Sentry organization auth token",
]) {
  assert(
    appConfigSource.includes(snippet),
    `app.config.js must enforce the production Sentry token contract with ${snippet}`
  );
}

for (const snippet of [
  "@sentry/react-native",
  "Sentry.init",
  "SENTRY_DSN",
  "sendDefaultPii: false",
  "beforeSend: beforeSendSentryEvent",
  "tracesSampleRate: 0",
  "Sentry.wrap(App)",
  "expo.update_id",
]) {
  assert(appSource.includes(snippet), `App.js must initialize Sentry with ${snippet}`);
}

console.log("Crash reporting check passed: Sentry dependency, Expo plugin, Metro wrapper, env contract, privacy-safe initialization, and app wrapping are present.");
