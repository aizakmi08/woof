const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const onboardingSource = fs.readFileSync(path.join(root, "screens/OnboardingScreen.js"), "utf8");
const paywallSource = fs.readFileSync(path.join(root, "screens/PaywallScreen.js"), "utf8");
const resultsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/index.js"), "utf8");
const componentsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/components.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`veterinary disclaimer guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  homeSource.includes("AI estimate, not veterinary advice") &&
    homeSource.includes("contact your vet or pet poison control"),
  "Home human-food entry and modal must show visible veterinary caveats before submission"
);

assert(
  onboardingSource.includes("not veterinary advice") &&
    onboardingSource.includes("contact your veterinarian or pet poison control"),
  "Onboarding safety examples must include veterinary and ingestion caveats"
);

assert(
  paywallSource.includes("Human food safety estimates") &&
    !paywallSource.includes("Human food safety checker"),
  "Paywall must not market human-food safety as an unconditional checker"
);

assert(
  componentsSource.includes("AI estimate, not veterinary advice") &&
    componentsSource.includes("Contact your vet or pet poison control"),
  "result disclaimer must include veterinary and ingestion caveats"
);

assert(
  /\/\* Scan Another \+ Disclaimer \*\/[\s\S]{0,80}\{done && \(/.test(resultsSource) &&
    !/\/\* Scan Another \+ Disclaimer[\s\S]{0,40}for Pro users/.test(resultsSource),
  "pet-food result disclaimer must render for all completed users, not only Pro users"
);

assert(
  /done && result\.safetyLevel[\s\S]{0,100}<Disclaimer \/>/.test(resultsSource),
  "human-food result disclaimer must be visible near the safety verdict"
);

assert(
  packageJson.includes('"test:veterinary-disclaimer": "node scripts/test-veterinary-disclaimer-guards.js"') &&
    packageJson.includes("npm run test:veterinary-disclaimer"),
  "veterinary disclaimer guard must be wired into package scripts"
);

console.log("veterinary disclaimer guard passed");
