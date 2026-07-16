# Woof 1.2.0 App Store Release Candidate

Prepared: 2026-07-11.

Status: build-ready after the external release gates below are completed. This document does not authorize a public submission or automatic App Store release.

## Prepared In This Candidate

- iOS marketing version: `1.2.0`.
- EAS production build counter: `32`; production `autoIncrement` means the next build will receive a higher build number.
- `store.config.json` contains the prepared US metadata and deliberately uses manual release after review.
- The prepared product-page copy removes unsupported third-party-source, recall, guaranteed-safety, and medical claims.
- `outputs/app-store/screenshots/2026-06-30-premium/` contains the reviewed six-screen App Store package for iPhone and iPad; do not replace the live gallery until its states are confirmed against the TestFlight candidate.
- `APP_PRIVACY_DISCLOSURE.md` is the source of truth for the App Store Connect privacy form.

## App Review Notes

Enter the following in App Store Connect together with the existing reviewer contact details. Do not add private contact details to this repository.

> Woof is AI-assisted and informational, not veterinary advice. Pet food scans analyze photos of packaging and labels and may use Open Pet Food Facts when available. Human food checks are informational and include safety caveats. Users can start with anonymous guest auth and later save their account with Apple or Google. Woof Pro unlocks unlimited scans and deeper report sections. RevenueCat products: Weekly, Monthly, and Annual.

## Required External Gates

1. Resolve the Supabase billing/egress grace-period risk before July 15, 2026, then capture the upload-byte KPI review.
2. Add `REVENUECAT_API_KEY_ANDROID`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` to the EAS production environment. Values must stay in EAS, never in this repository.
3. Update the App Store Connect App Privacy form from `APP_PRIVACY_DISCLOSURE.md`, including no tracking/IDFA, linked purchase history and scan photos, and Sentry crash diagnostics.
4. Run a TestFlight build and complete the guest, accessibility, purchase, restore, cancellation, and expiration checks in `REVENUECAT_TESTFLIGHT_RUNBOOK.md`.
5. Replace the live screenshot gallery only with assets checked against the TestFlight candidate, then capture the Product Page Preview.
6. Push the prepared metadata only after the review notes and privacy form have been updated, then verify the public listing with `npm run check:live-listing -- --guest-validated`.

## Operator Sequence

```sh
npm run check:preflight -- --dependency-free
npm run check:evidence
npx eas-cli@latest build:version:get --platform ios --profile production
npx eas-cli@latest build --platform ios --profile production
```

After the build passes TestFlight validation, use the existing EAS submit profile to upload the selected build. Do not submit it for App Review until `npm run check:evidence -- --strict` passes.
