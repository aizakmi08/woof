import { spawnSync } from "node:child_process";
import fs from "node:fs";

const MAX_ALLOWED_MODERATE = 13;

function npmCommand() {
  if (process.env.NPM_CLI_JS) {
    return {
      command: process.execPath,
      args: [process.env.NPM_CLI_JS],
    };
  }

  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath],
    };
  }

  return {
    command: "npm",
    args: [],
  };
}

function readAuditJson() {
  const npm = npmCommand();
  const result = spawnSync(
    npm.command,
    [...npm.args, "audit", "--omit=dev", "--json"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_audit_level: "low",
      },
    }
  );

  const rawOutput = result.stdout || result.stderr;
  if (!rawOutput) {
    throw new Error("npm audit did not produce JSON output");
  }

  try {
    return JSON.parse(rawOutput);
  } catch (error) {
    throw new Error(`npm audit output was not valid JSON: ${error.message}`);
  }
}

function countVulnerabilities(audit) {
  const counts = audit.metadata?.vulnerabilities || {};
  return {
    low: counts.low || 0,
    moderate: counts.moderate || 0,
    high: counts.high || 0,
    critical: counts.critical || 0,
    total: counts.total || 0,
  };
}

function summarizeBlockingFindings(audit) {
  return Object.values(audit.vulnerabilities || {})
    .filter((finding) => finding.severity === "high" || finding.severity === "critical")
    .map((finding) => `${finding.name} (${finding.severity})`);
}

function checkReactNativeDedupe() {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const packageLock = fs.readFileSync("package-lock.json", "utf8");
  const reactNativeVersion = packageJson.dependencies?.["react-native"];

  if (packageJson.overrides?.["react-native"] !== reactNativeVersion) {
    throw new Error("package.json must pin transitive react-native to the app's React Native version");
  }

  if (packageJson.overrides?.["@react-native/virtualized-lists"] !== reactNativeVersion) {
    throw new Error("package.json must pin @react-native/virtualized-lists to the app's React Native version");
  }

  if (packageLock.includes('"node_modules/react-native/node_modules/react-native"')) {
    throw new Error("package-lock.json must not include a nested React Native copy under react-native");
  }
}

checkReactNativeDedupe();

const audit = readAuditJson();
const counts = countVulnerabilities(audit);
const blockingFindings = summarizeBlockingFindings(audit);

if (blockingFindings.length > 0) {
  console.error("Dependency audit check failed: high/critical production advisories found.");
  console.error(`Counts: ${JSON.stringify(counts)}`);
  for (const finding of blockingFindings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

if (counts.moderate > MAX_ALLOWED_MODERATE) {
  console.error(
    `Dependency audit check failed: moderate production advisories increased from ${MAX_ALLOWED_MODERATE} to ${counts.moderate}.`
  );
  console.error("Review the new advisory before relaxing the threshold.");
  process.exit(1);
}

console.log(
  `Dependency audit check passed: ${counts.high} high, ${counts.critical} critical, ${counts.moderate} moderate production advisories.`
);

if (counts.moderate > 0) {
  console.log(
    "Moderate advisories remain tracked for a dedicated Expo/React Native dependency remediation pass."
  );
}
