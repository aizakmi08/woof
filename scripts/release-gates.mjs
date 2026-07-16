export const fullEnvironmentLabels = new Set([
  "Edge Function type check",
  "production dependency audit",
  "Expo SDK package versions",
  "Expo config resolution",
  "Expo native bundle export",
  "Expo native prebuild",
  "catalog completeness",
]);

export const steps = [
  {
    label: "git whitespace check",
    command: "git",
    args: ["diff", "--check"],
  },
  {
    label: "secret scan",
    script: "scripts/check-secrets.mjs",
  },
  {
    label: "JavaScript syntax and product guards",
    script: "scripts/check-js-syntax.mjs",
  },
  {
    label: "product resolver contract",
    script: "scripts/check-product-resolver-contract.mjs",
  },
  {
    label: "catalog quality",
    script: "scripts/check-catalog-quality.mjs",
  },
  {
    label: "catalog scraper contract",
    script: "scripts/check-catalog-scraper.mjs",
  },
  {
    label: "CI release alignment",
    script: "scripts/check-ci-release-alignment.mjs",
  },
  {
    label: "GitHub release audit",
    script: "scripts/check-github-release-audit.mjs",
  },
  {
    label: "analytics privacy",
    script: "scripts/check-analytics-privacy.mjs",
  },
  {
    label: "App Privacy disclosure",
    script: "scripts/check-app-privacy-disclosure.mjs",
  },
  {
    label: "accessibility labels",
    script: "scripts/check-accessibility.mjs",
  },
  {
    label: "pet-profile safety behavior",
    script: "scripts/check-pet-profile-safety.mjs",
  },
  {
    label: "claim safety",
    script: "scripts/check-claim-safety.mjs",
  },
  {
    label: "App Store listing",
    script: "scripts/check-app-store-listing.mjs",
  },
  {
    label: "App Store screenshots",
    script: "scripts/check-app-store-screenshots.mjs",
  },
  {
    label: "EAS versioning",
    script: "scripts/check-eas-versioning.mjs",
  },
  {
    label: "RevenueCat readiness",
    script: "scripts/check-revenuecat-readiness.mjs",
  },
  {
    label: "SQL migrations",
    script: "scripts/check-sql-migrations.mjs",
  },
  {
    label: "KPI runbook",
    script: "scripts/check-kpi-runbook.mjs",
  },
  {
    label: "deployment readiness",
    script: "scripts/check-deployment-readiness.mjs",
  },
  {
    label: "release evidence structure",
    script: "scripts/check-release-evidence.mjs",
  },
  {
    label: "native crash reporting",
    script: "scripts/check-crash-reporting.mjs",
  },
  {
    label: "Edge Function safety",
    script: "scripts/check-edge-functions.mjs",
  },
  {
    label: "Edge Function type check",
    script: "scripts/check-edge-typecheck.mjs",
  },
  {
    label: "Edge Function fingerprints",
    script: "scripts/fingerprint-edge-functions.mjs",
  },
  {
    label: "live Edge verifier dry run",
    script: "scripts/verify-live-edge-functions.mjs",
    args: ["--dry-run"],
  },
  {
    label: "live Auth verifier dry run",
    script: "scripts/verify-live-auth-settings.mjs",
    args: ["--dry-run"],
  },
  {
    label: "production dependency audit",
    script: "scripts/check-dependency-audit.mjs",
  },
  {
    label: "catalog completeness",
    command: "npm",
    args: ["run", "check:catalog-completeness"],
  },
  {
    label: "Expo SDK package versions",
    script: "scripts/check-expo-versions.mjs",
  },
  {
    label: "Expo config resolution",
    script: "scripts/check-expo-config.mjs",
  },
  {
    label: "Expo native bundle export",
    script: "scripts/check-expo-export.mjs",
  },
  {
    label: "Expo native prebuild",
    script: "scripts/check-expo-prebuild.mjs",
  },
  {
    label: "release metadata",
    script: "scripts/check-release-metadata.mjs",
  },
];
