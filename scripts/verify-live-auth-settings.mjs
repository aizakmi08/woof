import "dotenv/config";
import process from "node:process";

const dryRun = process.argv.includes("--dry-run");

function envValue(...names) {
  for (const name of names) {
    const value = (process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function normalizedSupabaseUrl({ required }) {
  const value = envValue("SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL");
  if (!value) {
    if (!required) return null;
    throw new Error("Set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL before live Auth verification.");
  }

  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error("Supabase Auth verification requires an HTTPS project URL.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function anonKey({ required }) {
  const value = envValue("SUPABASE_ANON_KEY", "EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (!value && required) {
    throw new Error("Set SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY before live Auth verification.");
  }
  return value || null;
}

function expectedContract() {
  return {
    disable_signup: false,
    external: {
      anonymous_users: true,
      apple: true,
      google: true,
    },
    dashboard_only_checks: [
      "Allow manual linking is enabled",
      "Apple and Google callback URLs are current",
      "Anonymous-user abuse controls and cleanup retention are recorded",
    ],
  };
}

const baseUrl = normalizedSupabaseUrl({ required: !dryRun });
const key = anonKey({ required: !dryRun });

if (dryRun) {
  console.log(JSON.stringify({
    dry_run: true,
    settings_url: baseUrl ? `${baseUrl}/auth/v1/settings` : "<SUPABASE_URL>/auth/v1/settings",
    expected: expectedContract(),
  }, null, 2));
  process.exit(0);
}

const settingsUrl = `${baseUrl}/auth/v1/settings`;
const response = await fetch(settingsUrl, {
  headers: { apikey: key },
  signal: AbortSignal.timeout(10_000),
});

if (!response.ok) {
  throw new Error(`Supabase Auth settings returned HTTP ${response.status}.`);
}

const settings = await response.json();
const observed = {
  disable_signup: settings?.disable_signup,
  external: {
    anonymous_users: settings?.external?.anonymous_users,
    apple: settings?.external?.apple,
    google: settings?.external?.google,
  },
};

const failures = [];
if (observed.disable_signup !== false) failures.push("new-user signups are disabled");
if (observed.external.anonymous_users !== true) failures.push("anonymous sign-ins are disabled");
if (observed.external.apple !== true) failures.push("Apple sign-in is disabled");
if (observed.external.google !== true) failures.push("Google sign-in is disabled");

console.log(JSON.stringify({
  settings_url: settingsUrl,
  observed,
  dashboard_only_checks: expectedContract().dashboard_only_checks,
}, null, 2));

if (failures.length > 0) {
  console.error("Live Supabase Auth verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Live Supabase Auth verification passed.");
