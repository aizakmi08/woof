# Woof EAS And App Store Versioning Plan

Last updated: 2026-07-11.

Purpose: prevent the next TestFlight or App Store submission from repeating the current App Store Connect mismatch where the iOS `1.2` version record shows build `31` with build version `1.1.1`.

## Current Evidence

- Local release line: `package.json`, `package-lock.json`, and `app.json` use `1.2.0`.
- EAS project id: `ea14f3ad-9dbe-4341-bfba-51eb5c6ead8f`.
- App Store Connect app id: `6760733899`.
- EAS config: `eas.json` uses `"appVersionSource": "remote"` and production builds use `"autoIncrement": true`.
- App Store Connect audit evidence: the iOS `1.2` Distribution record shows build `31` with build version `1.1.1`.
- 2026-07-11 EAS verification: the remote iOS build-number counter is `32`, which is greater than the historical App Store Connect build `31`. The next production build will auto-increment from this counter, so its build number will be higher than `32`.

## Required Pre-Submission Check

Run these commands from a machine with EAS CLI access and the correct Expo account:

```sh
npx eas-cli@latest whoami
npx eas-cli@latest build:version:get
npx eas-cli@latest build:version:get -p ios
```

Save the command output or App Store Connect/EAS screenshots with the release evidence.

Before submitting the next iOS build:

- Remote EAS app version must match the intended release line, currently `1.2.0`.
- The next iOS build number must be greater than App Store Connect build `31`.
- The App Store Connect build row for the submitted build must not show build version `1.1.1`.
- `eas.json` must keep `appVersionSource` set to `remote` unless the release process is intentionally changed and re-audited.
- Production builds must keep `autoIncrement` enabled so the next build number is not reused.

If the remote EAS iOS build number is stale or lower than the next App Store Connect-safe value, set it before building:

```sh
npx eas-cli@latest build:version:set -p ios --build-number 32
```

Use a higher number if App Store Connect already has build `32` or later.

## Submission Guardrail

Do not run a production submit until all of these are true:

1. `npm run check:release` passes locally or in CI.
2. `npm run check:eas-versioning` passes.
3. `npx eas-cli@latest build:version:get -p ios` evidence is saved.
4. The submitted TestFlight/App Store build row shows marketing version `1.2.0` and a build number greater than `31`.
5. `APP_STORE_CONNECT_AUDIT.md` is refreshed if App Store Connect shows a different version/build state.

## Sources

- Local `app.json`, `eas.json`, `package.json`, and `package-lock.json`.
- `APP_STORE_CONNECT_AUDIT.md`.
- Expo deployment guidance: EAS version management with `eas build:version:get` and `eas build:version:set`.
