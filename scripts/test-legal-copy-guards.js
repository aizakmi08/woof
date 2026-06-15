#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const legalSource = fs.readFileSync(path.join(root, "legal.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`legal copy guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  !legalSource.includes("You must sign in with Apple or Google to use the App"),
  "terms must not claim sign-in is required while guest scanning exists"
);

assert(
  legalSource.includes("limited guest features without creating an account") &&
    legalSource.includes("Guest usage information") &&
    legalSource.includes("Guest scan history is stored on your device"),
  "legal copy must disclose guest mode and guest data behavior"
);

assert(
  legalSource.includes("Anthropic Claude and OpenAI models") &&
    legalSource.includes("<strong>OpenAI:</strong>") &&
    legalSource.includes("product identification, OCR, and ingredient lookup"),
  "privacy copy must disclose OpenAI for identify/OCR/ingredient helper paths"
);

assert(
  legalSource.includes("<strong>Anthropic (Claude):</strong>") &&
    legalSource.includes("AI-powered ingredient analysis, safety checks, and scoring"),
  "privacy copy must disclose Anthropic Claude analysis paths"
);

assert(
  legalSource.includes("ScrapingBee and public product websites") &&
    legalSource.includes("server-side product lookup"),
  "privacy copy must disclose server-side public web product lookup vendors"
);

assert(
  legalSource.includes("Some de-identified cached product analyses may be retained") &&
    legalSource.includes("native secure storage for authentication sessions"),
  "privacy copy must describe cached analysis retention and secure session storage"
);

assert(
  legalSource.includes("Some plans may include a free trial or introductory offer when shown") &&
    !legalSource.includes("Some plans include a free trial period. If you cancel before the trial ends"),
  "subscription terms must not imply every plan has a free trial"
);

console.log("legal copy guard passed");
