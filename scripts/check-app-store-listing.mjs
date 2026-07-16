import fs from "node:fs";

const LISTING_PATH = "APP_STORE_LISTING.md";
const DEPLOYMENT_CHECKLIST_PATH = "DEPLOYMENT_CHECKLIST.md";
const STORE_CONFIG_PATH = "store.config.json";
const failures = [];

const LIMITS = {
  appName: 30,
  subtitle: 30,
  promotionalText: 170,
  description: 4000,
  keywordsBytes: 100,
  screenshotCaption: 32,
};

const BLOCKED_PATTERNS = [
  {
    label: "DogFoodAdvisor source claim",
    regex: /\bDogFoodAdvisor\b/i,
  },
  {
    label: "CatFoodAdvisor source claim",
    regex: /\bCatFoodAdvisor\b/i,
  },
  {
    label: "customer review claim",
    regex: /\bcustomer reviews?\b|\breview summaries\b|\breal reviews?\b|\bverified reviews?\b/i,
  },
  {
    label: "recall claim",
    regex: /\brecall alerts?\b|\brecall history\b/i,
  },
  {
    label: "veterinary approval claim",
    regex: /\bveterinary approved\b|\bvet approved\b/i,
  },
  {
    label: "guaranteed safety claim",
    regex: /\bguaranteed safe\b|\bguaranteed safety\b/i,
  },
  {
    label: "medical diagnosis claim",
    regex: /\bmedical diagnosis\b|\bmedical diagnoses\b/i,
  },
];

function fail(message) {
  failures.push(message);
}

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function section(source, heading) {
  const headingMatch = [...source.matchAll(/^#{2,3}\s+(.+)$/gm)]
    .find((match) => match[1].trim() === heading);
  const start = headingMatch?.index ?? -1;
  if (start < 0) {
    fail(`Missing APP_STORE_LISTING.md section: ${heading}`);
    return "";
  }

  const bodyStart = source.indexOf("\n", start);
  const rest = source.slice(bodyStart + 1);
  const nextHeading = rest.search(/\n#{2,3}\s/);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function firstInlineCode(source, label) {
  const match = source.match(/`([^`\n]+)`/);
  if (!match) {
    fail(`${label}: missing inline code value`);
    return "";
  }
  return match[1].trim();
}

function fencedText(source, label) {
  const match = source.match(/```text\n([\s\S]*?)\n```/);
  if (!match) {
    fail(`${label}: missing fenced text block`);
    return "";
  }
  return match[1].trim();
}

function charCount(value) {
  return Array.from(value).length;
}

function assertMaxChars(value, max, label) {
  const count = charCount(value);
  if (count > max) {
    fail(`${label}: ${count} characters exceeds App Store limit of ${max}`);
  }
}

function assertMaxBytes(value, max, label) {
  const count = Buffer.byteLength(value, "utf8");
  if (count > max) {
    fail(`${label}: ${count} UTF-8 bytes exceeds App Store limit of ${max}`);
  }
}

function assertNoBlockedClaims(value, label) {
  for (const { label: claimLabel, regex } of BLOCKED_PATTERNS) {
    if (regex.test(value)) {
      fail(`${label}: remove unsupported ${claimLabel}`);
    }
  }
}

function assertIncludes(value, needle, label) {
  if (!value.includes(needle)) {
    fail(`${label}: missing ${needle}`);
  }
}

function orderedIndex(source, needles, label) {
  let previous = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle);
    if (index === -1) {
      fail(`${label}: missing ${needle}`);
      continue;
    }
    if (index < previous) {
      fail(`${label}: ${needle} appears out of order`);
    }
    previous = index;
  }
}

const listing = readText(LISTING_PATH);
const checklist = readText(DEPLOYMENT_CHECKLIST_PATH);
const storeConfig = JSON.parse(readText(STORE_CONFIG_PATH));

const appName = firstInlineCode(section(listing, "App Name"), "App name");
const subtitle = firstInlineCode(section(listing, "Subtitle"), "Subtitle");
const promotionalText = firstInlineCode(section(listing, "Promotional Text"), "Promotional text");
const keywords = firstInlineCode(section(listing, "Keywords"), "Keywords");
const description = fencedText(section(listing, "Proposed Description"), "Proposed description");
const screenshotSet = section(listing, "Screenshot Set");
const screenshotProductionRules = section(listing, "Screenshot Production Rules");
const recommendedCopy = [
  appName,
  subtitle,
  promotionalText,
  keywords,
  description,
].join("\n");

assertMaxChars(appName, LIMITS.appName, "App name");
assertMaxChars(subtitle, LIMITS.subtitle, "Subtitle");
assertMaxChars(promotionalText, LIMITS.promotionalText, "Promotional text");
assertMaxChars(description, LIMITS.description, "Description");
assertMaxBytes(keywords, LIMITS.keywordsBytes, "Keywords");
assertNoBlockedClaims(recommendedCopy, "Recommended App Store metadata");

if (keywords.includes(" ")) {
  fail("Keywords: use comma-separated keyword tokens without spaces to preserve the 100-byte budget");
}

assertIncludes(description, "AI-assisted", "Description");
assertIncludes(description, "not veterinary advice", "Description");
assertIncludes(description, "Open Pet Food Facts", "Description");
assertIncludes(description, "3 free scans", "Description");
assertIncludes(description, "No account", "Description");

assertIncludes(
  listing,
  "Use only after TestFlight confirms guest scanning works end to end.",
  "Promotional text guest-scan gate"
);
assertIncludes(
  listing,
  "Gate: use only after anonymous-first scanning is enabled and validated.",
  "Screenshot no-account gate"
);

const screenshotCaptions = [
  "Scan before you buy",
  "Score food in seconds",
  "Spot ingredient flags",
  "Can my dog eat this?",
  "Try 3 scans free",
  "Unlimited label checks",
];

orderedIndex(
  screenshotSet,
  [
    "1. **Scan Any Label**",
    "2. **Score Food Fast**",
    "3. **Spot Ingredient Flags**",
    "4. **Human Food Check**",
    "5. **Try Free As Guest**",
    "6. **Unlimited Label Checks**",
  ],
  "Screenshot order"
);

for (const caption of screenshotCaptions) {
  assertIncludes(screenshotSet, `Caption: \`${caption}\``, "Screenshot caption set");
  assertMaxChars(caption, LIMITS.screenshotCaption, `Screenshot caption ${caption}`);
}

assertNoBlockedClaims(screenshotSet, "Screenshot set");
assertIncludes(screenshotProductionRules, "real screens from the validated TestFlight build", "Screenshot production rules");
assertIncludes(screenshotProductionRules, "first three screenshots product-proof-first", "Screenshot production rules");
assertIncludes(screenshotProductionRules, "target 32 characters or fewer", "Screenshot production rules");
assertIncludes(screenshotProductionRules, "only after anonymous guest scanning is enabled", "Screenshot production rules");
assertIncludes(screenshotProductionRules, "monthly-default paywall", "Screenshot production rules");
assertIncludes(screenshotProductionRules, "AI-assisted informational posture", "Screenshot production rules");

assertIncludes(
  checklist,
  "Enable Anonymous Sign-Ins",
  "Deployment checklist anonymous-auth gate"
);
assertIncludes(
  checklist,
  "No unsupported source claims remain in App Store copy/screenshots.",
  "Deployment checklist unsupported-source gate"
);
assertIncludes(
  checklist,
  "replacement metadata has been applied or intentionally superseded in App Store Connect.",
  "Deployment checklist listing-application gate"
);

const storeApple = storeConfig.apple || {};
const storeInfo = storeApple.info?.["en-US"] || {};
const storeKeywords = Array.isArray(storeInfo.keywords) ? storeInfo.keywords.join(",") : "";
const storeMetadata = [
  storeInfo.title,
  storeInfo.subtitle,
  storeInfo.promotionalText,
  storeInfo.description,
  storeInfo.releaseNotes,
  storeKeywords,
].filter(Boolean).join("\n");

if (storeConfig.configVersion !== 0) {
  fail("store.config.json: expected configVersion 0");
}
if (storeApple.version !== "1.2") {
  fail(`store.config.json: expected existing App Store version 1.2, got ${storeApple.version || "missing"}`);
}
if (storeApple.release?.automaticRelease !== false) {
  fail("store.config.json: keep automatic release disabled until final approval");
}
for (const [label, actual, expected] of [
  ["title", storeInfo.title, appName],
  ["subtitle", storeInfo.subtitle, subtitle],
  ["promotional text", storeInfo.promotionalText, promotionalText],
  ["description", storeInfo.description, description],
  ["keywords", storeKeywords, keywords],
]) {
  if (actual !== expected) {
    fail(`store.config.json: ${label} must match APP_STORE_LISTING.md`);
  }
}
if (!storeInfo.releaseNotes?.includes("source-backed ingredient statements")) {
  fail("store.config.json: release notes must describe the verified-catalog change");
}
if (storeApple.review) {
  fail("store.config.json: keep App Review contact details and notes in APP_STORE_RELEASE_1.2.0.md, not the repository config");
}
if (storeInfo.screenshots) {
  fail("store.config.json: do not replace screenshots until TestFlight evidence is captured");
}
assertNoBlockedClaims(storeMetadata, "store.config.json");

if (failures.length > 0) {
  console.error("App Store listing check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `App Store listing check passed (name ${charCount(appName)}/${LIMITS.appName} chars, subtitle ${charCount(subtitle)}/${LIMITS.subtitle}, promo ${charCount(promotionalText)}/${LIMITS.promotionalText}, keywords ${Buffer.byteLength(keywords, "utf8")}/${LIMITS.keywordsBytes} bytes, description ${charCount(description)}/${LIMITS.description})`
  + `; ${screenshotCaptions.length} screenshot captions/order rules checked`
);
