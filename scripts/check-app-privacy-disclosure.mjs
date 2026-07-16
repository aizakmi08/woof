import fs from "node:fs";

const DISCLOSURE_PATH = "APP_PRIVACY_DISCLOSURE.md";
const CHECKLIST_PATH = "DEPLOYMENT_CHECKLIST.md";
const WORKFLOW_PATH = ".github/workflows/ci.yml";
const PRIVACY_POLICY_PATH = "docs/privacy.html";
const PACKAGE_PATH = "package.json";
const PACKAGE_LOCK_PATH = "package-lock.json";

const failures = [];

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function fail(message) {
  failures.push(message);
}

function requireSnippet(source, snippet, label) {
  if (!source.includes(snippet)) {
    fail(`${label}: missing ${snippet}`);
  }
}

function packageHasDependency(packageJson, packageLock, dependencyName) {
  return Boolean(
    packageJson.dependencies?.[dependencyName] ||
      packageJson.devDependencies?.[dependencyName] ||
      packageLock.packages?.[""]?.dependencies?.[dependencyName] ||
      packageLock.packages?.[""]?.devDependencies?.[dependencyName] ||
      packageLock.packages?.[`node_modules/${dependencyName}`]
  );
}

const disclosure = readText(DISCLOSURE_PATH);
const checklist = readText(CHECKLIST_PATH);
const workflow = readText(WORKFLOW_PATH);
const privacyPolicy = readText(PRIVACY_POLICY_PATH);
const packageJson = readJson(PACKAGE_PATH);
const packageLock = readJson(PACKAGE_LOCK_PATH);
const sentryInstalled = packageHasDependency(packageJson, packageLock, "@sentry/react-native");

if (packageJson.scripts?.["check:privacy"] !== "node scripts/check-app-privacy-disclosure.mjs") {
  fail("package.json must expose check:privacy");
}

requireSnippet(workflow, "npm run check:privacy", "CI workflow");
requireSnippet(checklist, "npm run check:privacy", "Deployment checklist local checks");
requireSnippet(checklist, "APP_PRIVACY_DISCLOSURE.md", "Deployment checklist");
requireSnippet(checklist, "Data Used to Track You: No", "Deployment checklist");
requireSnippet(checklist, "No IDFA", "Deployment checklist");

for (const snippet of [
  "Last updated: 2026-06-29.",
  "https://developer.apple.com/app-store/app-privacy-details/",
  "https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/",
  "https://support.apple.com/en-us/102399",
  "https://developer.apple.com/videos/play/wwdc2022/10167/",
  "https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy",
  "Data Used to Track You: No",
  "No IDFA",
  "Supabase",
  "Anthropic Claude",
  "RevenueCat",
  "Apple Search Ads attribution",
  "Apple Ads / AdServices",
  "Sentry",
  "Open Pet Food Facts",
  "Apple Sign In",
  "Google Sign In",
  "@sentry/react-native",
  "public.profiles",
  "public.scan_history",
  "public.analytics_events",
  "public.scan_usage_events",
  "public.rate_limits",
  "public.revenuecat_events",
  "public.analysis_cache",
  "delete_own_account",
  "services/analytics.js",
  "services/claude.js",
  "supabase/functions/analyze/index.ts",
]) {
  requireSnippet(disclosure, snippet, DISCLOSURE_PATH);
}

for (const dataType of [
  "Name",
  "Email Address",
  "User ID",
  "Purchase History",
  "Photos or Videos",
  "Other User Content",
  "Customer Support Data",
  "Product Interaction",
  "Advertising Data",
  "Other Usage Data",
  "Performance Data",
  "Other Diagnostic Data",
  "Other Data Types",
]) {
  requireSnippet(disclosure, dataType, `${DISCLOSURE_PATH} data inventory`);
}

for (const notCollected of [
  "Location: No.",
  "Contacts: No.",
  "Browsing History: No.",
  "Device ID: No",
  "Payment Info: No.",
  "Health & Fitness: No.",
  "Sensitive Info: No.",
  "Audio Data: No.",
  "Search History: No",
]) {
  requireSnippet(disclosure, notCollected, `${DISCLOSURE_PATH} not-collected list`);
}

for (const policySnippet of [
  "Camera Images",
  "Scan History",
  "Guest and Account Information",
  "Subscription Information",
  "Apple Search Ads Attribution",
  "We do not use IDFA",
  "Operational Logs",
  "We do not track you across other apps or websites",
  "Supabase",
  "Anthropic",
  "RevenueCat",
  "Open Pet Food Facts",
  "You can delete your guest data or account",
]) {
  requireSnippet(privacyPolicy, policySnippet, PRIVACY_POLICY_PATH);
}

if (/Data Used to Track You:\s*Yes/i.test(disclosure)) {
  fail(`${DISCLOSURE_PATH}: tracking answer must not be Yes while no tracking SDK/IDFA is present`);
}

if (sentryInstalled) {
  if (disclosure.includes("Sentry is not installed yet")) {
    fail(`${DISCLOSURE_PATH}: Sentry appears installed; update the Sentry/crash-data disclosure`);
  }
  requireSnippet(disclosure, "Sentry: native crash and error reporting", `${DISCLOSURE_PATH} Sentry processor`);
  requireSnippet(disclosure, "Crash Data: Yes", `${DISCLOSURE_PATH} Sentry update`);
} else {
  requireSnippet(disclosure, "Sentry is not installed yet", `${DISCLOSURE_PATH} missing-Sentry state`);
  requireSnippet(disclosure, "Crash Data: No", `${DISCLOSURE_PATH} missing-Sentry state`);
}

if (failures.length > 0) {
  console.error("App Privacy disclosure check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("App Privacy disclosure check passed");
