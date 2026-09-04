# Woof 1.2.0 TestFlight Handoff

Use this after the iOS build is visible in App Store Connect TestFlight. This is an internal-beta test only; it does not submit Woof to App Review.

## Current Build

- Version: `1.2.0`
- Build: `41`
- EAS artifact: https://expo.dev/artifacts/eas/_wWrcx7tgXV7Md39beIyM5gapcX7rj0ALLlQY5o6_6o.ipa
- TestFlight: https://appstoreconnect.apple.com/apps/6760733899/testflight/ios
- Status at upload: submitted to Apple for processing

## Invite Erik

1. In App Store Connect, open **Woof - Pet Food Scanner** > **TestFlight** > **Internal Testing**.
2. Add the current `1.2.0` build to an internal test group.
3. Add Erik by the Apple ID email he uses on his iPhone. Apple sends the TestFlight invitation; do not add his email to this repository.
4. Ask him to install Apple TestFlight first, accept the invitation, then install the `1.2.0` build.

## What To Test

1. Start without creating an account, then search an exact pet-food name and a partial or misspelled name.
2. Scan a front-package label in normal store lighting. A confident catalog match should open promptly; an unclear match should offer choices instead of inventing a result.
3. Open a verified result and check the image, ingredient statement, source, verification date, score, and pet-safety output.
4. Try one product that is not in the catalog. The app should clearly ask for an ingredient-panel scan, retain the submission state, and never display guessed ingredients as verified.
5. Open the paywall after the free limit, confirm all three plans load, then use Restore Purchases. Do not buy a product unless deliberately running the sandbox purchase test.
6. Save the guest account with Apple or Google, then confirm history and any current access state remain intact.
7. Delete one history item, open the privacy/legal links, and report any crash, white screen, stuck camera, or result that disagrees with packaging.

## Feedback To Send

For each issue, include the screen or flow, what was expected, what happened, whether it repeats, and a screenshot or screen recording when safe to share. For product-data issues, include a photo of the exact front package and ingredient panel; no pet or account information is needed.

## TestFlight Release Notes

> Test the faster product-name search and front-label scan flow. Woof now opens verified catalog matches with exact source-backed ingredient statements. Please report any mismatch, unclear label match, slow result, or white screen.
