import fs from "node:fs";
import path from "node:path";

const SCREENSHOT_RUN_ID = "2026-06-30-premium";
const SCREENSHOT_ROOT = `outputs/app-store/screenshots/${SCREENSHOT_RUN_ID}`;
const MANIFEST_PATH = `${SCREENSHOT_ROOT}/manifest.json`;
const failures = [];

const EXPECTED_FAMILIES = new Map([
  ["iphone-69", { width: 1320, height: 2868, count: 6 }],
  ["iphone-67", { width: 1290, height: 2796, count: 6 }],
  ["ipad-13", { width: 2064, height: 2752, count: 6 }],
]);

const EXPECTED_CAPTIONS = [
  "Scan before you buy",
  "Score food in seconds",
  "Spot ingredient flags",
  "Can my dog eat this?",
  "Try 3 scans free",
  "Unlimited label checks",
];

const BLOCKED_PATTERNS = [
  /\bDogFoodAdvisor\b/i,
  /\bCatFoodAdvisor\b/i,
  /\bcustomer reviews?\b|\breview summaries\b|\breal reviews?\b|\bverified reviews?\b/i,
  /\brecall alerts?\b|\brecall history\b/i,
  /\bveterinary approved\b|\bvet approved\b/i,
  /\bguaranteed safe\b|\bguaranteed safety\b/i,
  /\bmedical diagnosis\b|\bmedical diagnoses\b/i,
];

function fail(message) {
  failures.push(message);
}

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    fail(`${filePath}: expected PNG file`);
    return { width: 0, height: 0 };
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function assertNoBlockedClaims(text, label) {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      fail(`${label}: contains unsupported App Store claim text`);
    }
  }
}

if (!fs.existsSync(MANIFEST_PATH)) {
  fail(`Missing screenshot manifest: ${MANIFEST_PATH}`);
} else {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  assertNoBlockedClaims(JSON.stringify(manifest), "Screenshot manifest");

  if (!Array.isArray(manifest.families)) {
    fail("Screenshot manifest: families must be an array");
  } else {
    const actualFamilyIds = manifest.families.map((family) => family.id);
    for (const familyId of EXPECTED_FAMILIES.keys()) {
      if (!actualFamilyIds.includes(familyId)) {
        fail(`Missing screenshot family: ${familyId}`);
      }
    }

    for (const family of manifest.families) {
      const expected = EXPECTED_FAMILIES.get(family.id);
      if (!expected) {
        fail(`Unexpected screenshot family: ${family.id}`);
        continue;
      }

      if (!Array.isArray(family.screenshots) || family.screenshots.length !== expected.count) {
        fail(`${family.id}: expected ${expected.count} screenshots`);
        continue;
      }

      family.screenshots.forEach((item, index) => {
        const expectedCaption = EXPECTED_CAPTIONS[index];
        if (item.caption !== expectedCaption) {
          fail(`${family.id} screenshot ${index + 1}: expected caption "${expectedCaption}"`);
        }
        if (Array.from(item.caption || "").length > 32) {
          fail(`${family.id} screenshot ${index + 1}: caption exceeds 32 characters`);
        }

        const filePath = item.path;
        if (!filePath || !fs.existsSync(filePath)) {
          fail(`${family.id} screenshot ${index + 1}: missing file ${filePath || "(none)"}`);
          return;
        }

        const relative = path.relative(process.cwd(), path.resolve(filePath));
        if (relative.startsWith("..")) {
          fail(`${family.id} screenshot ${index + 1}: file is outside the workspace`);
        }

        const size = readPngSize(filePath);
        if (size.width !== expected.width || size.height !== expected.height) {
          fail(`${family.id} screenshot ${index + 1}: expected ${expected.width}x${expected.height}, got ${size.width}x${size.height}`);
        }

        if (item.width !== expected.width || item.height !== expected.height) {
          fail(`${family.id} screenshot ${index + 1}: manifest dimensions do not match expected family size`);
        }
      });
    }
  }

  const sourcePath = manifest.source_polish_layer;
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    fail("Screenshot manifest: missing copied polish source layer");
  }
}

const reviewBoardPath = `${SCREENSHOT_ROOT}/review-board.html`;
if (!fs.existsSync(reviewBoardPath)) {
  fail(`Missing screenshot review board: ${reviewBoardPath}`);
}

for (const filePath of [
  `${SCREENSHOT_ROOT}/review-manifest.json`,
  `${SCREENSHOT_ROOT}/review-options.json`,
  `${SCREENSHOT_ROOT}/offer-contact-sheet.png`,
  `${SCREENSHOT_ROOT}/moodboard-widget-payload.json`,
  `${SCREENSHOT_ROOT}/data/stream.json`,
  `${SCREENSHOT_ROOT}/data/stream-static.json`,
  `${SCREENSHOT_ROOT}/run-state.json`,
  `${SCREENSHOT_ROOT}/latest-action.json`,
]) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing Creative Production review artifact: ${filePath}`);
  }
}

if (failures.length > 0) {
  console.error("App Store screenshot check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("App Store screenshot check passed (18 screenshots checked)");
