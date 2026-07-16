const APP_ID = "6760733899";
const COUNTRY = "us";
const LOOKUP_URL = `https://itunes.apple.com/lookup?id=${APP_ID}&country=${COUNTRY}`;
const guestValidated = process.argv.includes("--guest-validated");
const expectCurrentRisk = process.argv.includes("--expect-current-risk");
const failures = [];
const risks = [];

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
    label: "unsupported verified-data claim",
    regex: /\bverified data from\b/i,
  },
  {
    label: "recall claim",
    regex: /\brecall alerts?\b|\brecall history\b/i,
  },
  {
    label: "overbroad safety promise",
    regex: /\bactually safe\b|\bexactly what's safe\b|\bwhat's harmful\b|\bwhat's best\b/i,
  },
  {
    label: "guaranteed safety claim",
    regex: /\bguaranteed safe\b|\bguaranteed safety\b/i,
  },
  {
    label: "veterinary approval claim",
    regex: /\bveterinary approved\b|\bvet approved\b/i,
  },
  {
    label: "medical diagnosis claim",
    regex: /\bmedical diagnosis\b|\bmedical diagnoses\b/i,
  },
];

function fail(message) {
  failures.push(message);
}

function risk(message) {
  risks.push(message);
}

function checkBlockedClaims(description) {
  for (const { label, regex } of BLOCKED_PATTERNS) {
    if (regex.test(description)) {
      risk(`Live App Store description contains ${label}`);
    }
  }
}

function checkNoAccountGate(description) {
  const hasNoAccountClaim = /\bno account (required|needed)\b/i.test(description);
  if (hasNoAccountClaim && !guestValidated) {
    risk("Live App Store description has a no-account claim; rerun with --guest-validated only after anonymous guest scanning is validated end to end.");
  }
}

const response = await fetch(LOOKUP_URL, {
  headers: {
    Accept: "application/json",
    "User-Agent": "woof-live-app-store-listing-check",
  },
});

if (!response.ok) {
  fail(`Apple lookup returned HTTP ${response.status}`);
} else {
  const payload = await response.json();
  const app = payload.results?.[0];

  if (payload.resultCount !== 1 || !app) {
    fail(`Expected one App Store result for ${APP_ID}, got ${payload.resultCount || 0}`);
  } else {
    if (app.bundleId !== "io.woof.app") {
      fail(`Expected bundle id io.woof.app, got ${app.bundleId || "unknown"}`);
    }

    if (app.trackName !== "Woof - Pet Food Scanner" && app.trackName !== "Woof: Pet Food Scanner") {
      fail(`Unexpected live app name: ${app.trackName || "unknown"}`);
    }

    if (!app.trackViewUrl?.includes(`/id${APP_ID}`)) {
      fail("Apple lookup result does not point at the expected App Store id");
    }

    const description = app.description || "";
    if (description.length < 100) {
      fail("Live App Store description is unexpectedly short or missing");
    }

    checkBlockedClaims(description);
    checkNoAccountGate(description);

    console.log(`Live App Store listing snapshot: ${app.trackName}, version ${app.version || "unknown"}, ${app.userRatingCount || 0} rating(s), ${app.trackViewUrl}`);
  }
}

if (expectCurrentRisk) {
  for (const expected of [
    "DogFoodAdvisor source claim",
    "CatFoodAdvisor source claim",
    "unsupported verified-data claim",
    "no-account claim",
  ]) {
    if (!risks.some((message) => message.includes(expected))) {
      fail(`Expected current live listing risk was not detected: ${expected}`);
    }
  }
} else if (risks.length > 0) {
  failures.push(...risks);
}

if (failures.length > 0) {
  console.error("Live App Store listing check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (risks.length > 0) {
  console.log("Live App Store listing risks detected as expected:");
  for (const message of risks) {
    console.log(`- ${message}`);
  }
}

console.log("Live App Store listing check passed.");
