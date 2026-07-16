# Woof Release PR

## Release Scope

- [ ] This PR supersedes or reconciles stale draft PR #1 (`codex/push-woof-app`) before merge.
- [ ] This PR does not include stale `supabase/migrations/007`-`057` files from PR #1.
- [ ] Generated catalog, scraper, sitemap, fixture, backfill, and dashboard-export artifacts are intentionally reviewed or excluded.
- [ ] App Store, Supabase, RevenueCat, analytics, crash-reporting, and growth-impact changes are summarized for review.

## Required Local Validation

Paste non-sensitive command output or CI links:

```sh
npm run check:preflight
npm run check:github-release
npm run check:evidence
```

## Required External Evidence

- [ ] GitHub smoke CI is green on this PR branch.
- [ ] `RELEASE_EVIDENCE.md` has been updated with non-sensitive proof for completed external checks.
- [ ] `npm run check:evidence -- --strict` passes before production submission or paid-growth launch.
- [ ] Supabase migration history is reconciled against live `001`-`057`; audit migrations `058`-`070` are applied intentionally.
- [ ] `npm run edge:verify-live` passes against the live Supabase functions host after deploying Edge Functions.
- [ ] RevenueCat purchase, restore, webhook, and `revenuecat-sync` entitlement paths are validated in sandbox/TestFlight.
- [ ] App Store Connect metadata/privacy changes are applied, and `npm run check:live-listing -- --guest-validated` passes after the public listing updates.
- [ ] TestFlight validates guest scan, account save/linking, free-scan enforcement, paywall package loading, restore, delete account, and accessibility smoke paths.

## Known Release Blockers

- [ ] Any blocker left unchecked below is explicitly documented with owner/date/rationale:
  - Supabase egress/plan risk before the July 15, 2026 grace-period deadline.
  - Supabase Anonymous Sign-Ins, manual identity linking, redirect URLs, anonymous-user RLS/abuse/cleanup decisions, and Leaked Password Protection decision.
  - EAS remote iOS build number greater than App Store Connect build `31`.
  - Sentry EAS secrets/source-map upload/release-health proof.
  - Paid growth remains paused until release evidence is complete.
