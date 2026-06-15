#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = {
  index: fs.readFileSync(path.join(root, "docs/index.html"), "utf8"),
  support: fs.readFileSync(path.join(root, "docs/support.html"), "utf8"),
  privacy: fs.readFileSync(path.join(root, "docs/privacy.html"), "utf8"),
  terms: fs.readFileSync(path.join(root, "docs/terms.html"), "utf8"),
};
const combined = Object.values(files).join("\n");

function assert(condition, message) {
  if (!condition) {
    console.error(`public docs guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  files.index.includes("https://apps.apple.com/us/app/woof-pet-food-scanner/id6760733899") &&
    !combined.includes("id6760733995"),
  "public App Store links must use the canonical App Store Connect ID"
);

assert(
  files.support.includes("start with the front of the package") &&
    files.support.includes("photograph the ingredient panel") &&
    !files.support.includes("using live scan"),
  "support docs must describe the current two-step scan flow"
);

assert(
  !combined.includes("You must sign in with Apple or Google to use the App") &&
    files.terms.includes("limited guest features without creating an account") &&
    files.privacy.includes("Guest Usage Information") &&
    files.privacy.includes("Guest scan history is stored on your device"),
  "public legal docs must match guest-mode behavior"
);

assert(
  files.privacy.includes("Anthropic (Claude AI)") &&
    files.privacy.includes("OpenAI") &&
    files.privacy.includes("product identification, OCR, and ingredient lookup") &&
    files.privacy.includes("ScrapingBee and public product websites"),
  "public privacy docs must disclose current AI and product lookup vendors"
);

assert(
  !combined.includes("Last updated: March 17, 2025") &&
    !combined.includes("&copy; 2025 Woof") &&
    files.privacy.includes("Last updated: June 8, 2026") &&
    files.terms.includes("Last updated: June 8, 2026"),
  "public legal/support dates and footers must be current"
);

assert(
  !files.terms.includes("$4.99/week") &&
    !files.terms.includes("$7.99/month") &&
    !files.terms.includes("$29.99/year") &&
    !files.terms.includes("with a 3-day free trial") &&
    files.terms.includes("Some plans may include a free trial or introductory offer when shown"),
  "public terms must not hardcode stale prices or imply every plan has a trial"
);

assert(
  files.privacy.includes("native secure storage for authentication sessions") &&
    files.privacy.includes("Some de-identified cached product analyses may be retained"),
  "public privacy docs must describe secure auth storage and cached analysis retention"
);

console.log("public docs guard passed");
