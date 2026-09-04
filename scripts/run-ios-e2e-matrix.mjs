import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const FLOW_PATH = path.join(ROOT, "tests/e2e/maestro/dev-qa-product-open.yaml");
const APP_ID = "io.woof.app";
const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-5";
const MAX_CONTENT_SIZE = "accessibility-extra-extra-extra-large";
const DEFAULT_CONTENT_SIZE = "large";
const MATRIX = [
  { name: "Woof E2E SE", type: "com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation", className: "se" },
  { name: "Woof E2E Large", type: "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max", className: "large" },
];

function valueFor(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env || process.env,
  });
  if (result.error) throw result.error;
  return result;
}

function simctl(args, options = {}) {
  return run("xcrun", ["simctl", ...args], options);
}

function existingDeviceId(name) {
  const json = JSON.parse(execFileSync("xcrun", ["simctl", "list", "devices", "--json"], { encoding: "utf8" }));
  for (const devices of Object.values(json.devices || {})) {
    const match = devices.find((device) => device.name === name && device.isAvailable);
    if (match) return match.udid;
  }
  return null;
}

function ensureDevice(device) {
  const existing = existingDeviceId(device.name);
  if (existing) return existing;
  const result = simctl(["create", device.name, device.type, RUNTIME], { capture: true });
  if (result.status !== 0) fail(`could not create ${device.name}: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

function safeSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const appPath = path.resolve(valueFor("--app") || "");
const metroUrl = valueFor("--metro-url");
const maestroBin = process.env.MAESTRO_BIN || "maestro";
const javaHome = process.env.JAVA_HOME || "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home";

if (!valueFor("--app") || !fs.existsSync(appPath)) fail("--app must point to an existing iOS Simulator .app bundle");
if (!/^https?:\/\/[^/]+:\d+$/.test(metroUrl || "")) fail("--metro-url must be an HTTP(S) origin such as http://10.0.0.37:8081");
if (!fs.existsSync(FLOW_PATH)) fail(`Maestro flow is missing: ${FLOW_PATH}`);

const date = new Date().toLocaleDateString("en-CA");
const outputDir = path.join(ROOT, "docs", "context-evidence", date, "ios-e2e-product-open");
fs.mkdirSync(outputDir, { recursive: true });

const results = [];
const maestroEnv = {
  ...process.env,
  JAVA_HOME: javaHome,
  MAESTRO_CLI_NO_ANALYTICS: "1",
  MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true",
};
for (const device of MATRIX) {
  const udid = ensureDevice(device);
  simctl(["boot", udid], { capture: true });
  simctl(["bootstatus", udid, "-b"]);
  const install = simctl(["install", udid, appPath], { capture: true });
  if (install.status !== 0) fail(`could not install the app on ${device.name}: ${(install.stderr || install.stdout).trim()}`);

  for (const appearance of ["light", "dark"]) {
    for (const textSize of [DEFAULT_CONTENT_SIZE, MAX_CONTENT_SIZE]) {
      const cell = `${device.className}-${appearance}-${textSize === DEFAULT_CONTENT_SIZE ? "default-text" : "maximum-text"}`;
      simctl(["ui", udid, "appearance", appearance]);
      simctl(["ui", udid, "content_size", textSize]);
      simctl(["terminate", udid, APP_ID], { capture: true });

      const startedAt = Date.now();
      const launch = simctl(["launch", udid, APP_ID], { capture: true });
      if (launch.status !== 0) {
        results.push({ cell, status: "FAIL", durationMs: Date.now() - startedAt, detail: (launch.stderr || launch.stdout).trim() });
        continue;
      }
      run("sleep", ["6"]);

      const test = run(maestroBin, ["--device", udid, "test", FLOW_PATH], { capture: true, env: maestroEnv });
      const status = test.status === 0 ? "PASS" : "FAIL";
      const screenshotPath = path.join(outputDir, `${safeSlug(cell)}-${status.toLowerCase()}.png`);
      const screenshot = simctl(["io", udid, "screenshot", screenshotPath], { capture: true });
      results.push({
        cell,
        device: device.name,
        appearance,
        contentSize: textSize,
        status,
        durationMs: Date.now() - startedAt,
        screenshot: screenshot.status === 0 ? path.relative(ROOT, screenshotPath) : null,
        detail: status === "PASS" ? null : `${test.stdout}\n${test.stderr}`.trim().slice(-4000),
      });
      console.log(`${status} ${cell} ${results.at(-1).durationMs}ms`);
    }
  }
}

const resultPath = path.join(outputDir, "results.json");
const metroOrigin = new URL(metroUrl);
fs.writeFileSync(resultPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  app: path.basename(appPath),
  metro: `local:${metroOrigin.port}`,
  results,
}, null, 2)}\n`);
const failures = results.filter((result) => result.status !== "PASS");
console.log(`Matrix ${failures.length === 0 ? "PASS" : "FAIL"}: ${results.length - failures.length}/${results.length} cells passed`);
console.log(`Evidence: ${resultPath}`);
process.exit(failures.length === 0 ? 0 : 1);
