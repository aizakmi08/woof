#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const authScreenSource = fs.readFileSync(path.join(root, "screens/AuthScreen.js"), "utf8");
const authServiceSource = fs.readFileSync(path.join(root, "services/auth.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`auth apple guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  authScreenSource.includes('import * as AppleAuthentication from "expo-apple-authentication"') &&
    authScreenSource.includes("const [appleAvailable, setAppleAvailable] = useState(false)") &&
    /AppleAuthentication\.isAvailableAsync\(\)[\s\S]{0,180}setAppleAvailable\(available\)/.test(authScreenSource),
  "AuthScreen must check AppleAuthentication runtime availability"
);

assert(
  /Platform\.OS === "ios" && appleAvailable &&/.test(authScreenSource),
  "AuthScreen must render Apple sign-in only when runtime availability is true"
);

assert(
  authScreenSource.includes('err.code === "APPLE_SIGN_IN_UNAVAILABLE"') &&
    authScreenSource.includes("Use Google sign-in to continue on this device."),
  "AuthScreen must show a fallback message when Apple sign-in is unavailable"
);

assert(
  (() => {
    const availability = authServiceSource.indexOf("const isAvailable = await AppleAuthentication.isAvailableAsync();");
    const code = authServiceSource.indexOf('unavailable.code = "APPLE_SIGN_IN_UNAVAILABLE";');
    const thrown = authServiceSource.indexOf("throw unavailable;");
    const nativeSignIn = authServiceSource.indexOf("AppleAuthentication.signInAsync");
    return availability !== -1 && code > availability && thrown > code && nativeSignIn > thrown;
  })(),
  "signInWithApple must guard availability before launching native sign-in"
);

console.log("auth apple guard passed");
