#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const webViewScreen = fs.readFileSync(path.join(root, "screens/WebViewScreen.js"), "utf8");
const homeScreen = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const authScreen = fs.readFileSync(path.join(root, "screens/AuthScreen.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`webview security guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  webViewScreen.includes("const isLocalHtml = !url") &&
    webViewScreen.includes("javaScriptEnabled={!isLocalHtml}") &&
    webViewScreen.includes("domStorageEnabled={!isLocalHtml}") &&
    webViewScreen.includes('originWhitelist={isLocalHtml ? ["about:blank"] : ["https://*"]}') &&
    webViewScreen.includes("setSupportMultipleWindows={false}"),
  "shared WebView screen must disable JS/storage for local HTML and restrict external URLs to https"
);

for (const [label, source] of [
  ["Home legal consent", homeScreen],
  ["Auth legal modal", authScreen],
]) {
  assert(
    source.includes("source={{ html:") &&
      source.includes("javaScriptEnabled={false}") &&
      source.includes("domStorageEnabled={false}") &&
      source.includes('originWhitelist={["about:blank"]}') &&
      source.includes("setSupportMultipleWindows={false}"),
    `${label} WebView must disable JS/storage and restrict local HTML origins`
  );
}

console.log("webview security guard passed");
