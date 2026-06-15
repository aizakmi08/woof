#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const edgeSource = fs.readFileSync(path.join(root, "supabase/functions/analyze/index.ts"), "utf8");
const errorsSource = fs.readFileSync(path.join(root, "services/errors.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`human-food quota guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  /remainingHumanFoodChecks\(\) === 0[\s\S]{0,120}\? isGuest[\s\S]{0,220}free guest safety check[\s\S]{0,220}Resets tomorrow UTC/.test(homeSource),
  "exhausted human-food copy must distinguish guest rolling cooldown from signed-in UTC reset"
);

assert(
  /: isGuest[\s\S]{0,180}1 free guest safety check[\s\S]{0,220}1 free safety check per UTC day/.test(homeSource),
  "available human-food copy must distinguish guest and signed-in quota semantics"
);

assert(
  edgeSource.includes("Guest free safety check used. Try again later, sign in, or upgrade for more.") &&
    !edgeSource.includes("Daily free safety check used. Sign in or upgrade for more."),
  "anonymous edge quota error must not promise a daily calendar reset"
);

assert(
  errorsSource.includes("/guest free safety/i") &&
    errorsSource.includes("/free safety check used/i"),
  "guest human-food quota errors must classify as quota errors"
);

console.log("human-food quota guard passed");
