#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const https = require("https");

const KEYS = [
  {
    label: "iOS",
    envNames: ["REVENUECAT_API_KEY_IOS", "EXPO_PUBLIC_REVENUECAT_API_KEY_IOS"],
    prefix: "appl_",
  },
  {
    label: "Android",
    envNames: ["REVENUECAT_API_KEY_ANDROID", "EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID"],
    prefix: "goog_",
  },
  {
    label: "Test Store",
    envNames: ["REVENUECAT_TEST_STORE_API_KEY", "EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY"],
    prefix: "test_",
  },
];

function readEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) {
      return { name, value: value.trim() };
    }
  }
  return { name: names[0], value: "" };
}

function mask(value) {
  if (!value) return "MISSING";
  return `${value.slice(0, 5)}...${value.slice(-4)} len=${value.length}`;
}

function probeRevenueCat(key) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.revenuecat.com",
        path: "/v1/subscribers/woof_config_probe",
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let message = body;
          try {
            const parsed = JSON.parse(body);
            message = parsed.message || parsed.detail || parsed.code || "";
          } catch {}
          resolve({ status: res.statusCode, message: String(message).slice(0, 180) });
        });
      }
    );
    req.on("error", (err) => resolve({ status: 0, message: err.message }));
    req.end();
  });
}

async function main() {
  let failures = 0;
  let configured = 0;

  for (const spec of KEYS) {
    const { name, value } = readEnv(spec.envNames);
    console.log(`${spec.label}: ${mask(value)} from ${name}`);
    if (!value) {
      console.log(`  skipped: no ${spec.label} key configured`);
      continue;
    }
    configured += 1;
    if (!value.startsWith(spec.prefix)) {
      console.error(`  failed: expected ${spec.prefix} public SDK key`);
      failures += 1;
      continue;
    }

    const result = await probeRevenueCat(value);
    if (result.status >= 200 && result.status < 300) {
      console.log("  RevenueCat API accepted this public SDK key");
    } else {
      console.error(`  failed: RevenueCat API status=${result.status} ${result.message}`);
      failures += 1;
    }
  }

  if (configured === 0) {
    console.error("No RevenueCat public SDK keys configured.");
    process.exit(1);
  }
  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
