# Woof GitHub Release Audit

Last updated: 2026-07-10.

Source: read-only local `git` inspection, `git ls-remote`, `git fetch --prune origin`, and unauthenticated GitHub API reads for `aizakmi08/woof`. No remote writes were performed. Repeat the live-state freshness check with `npm run check:github-release`.

## Executive Readout

The current GitHub release path is not ready for a production merge. The remote repository has one open draft PR, but that PR is not the same work as the current local audit worktree. GitHub Actions now has two active workflows: the smoke CI workflow and GitHub Pages. Both latest runs succeeded on the current remote `main` commit.

Treat the current remote draft PR as stale or at least requiring reconciliation before it is merged. The next safe publish path is to create or update a branch containing the current audit work, push the new CI workflow with it, let the checks run on GitHub, and only then decide what to do with the existing draft PR. PR #1 also has a migration-number collision with production Supabase history that must be resolved before it can be used as any release line.

## Remote Repository Snapshot

- Repository: `https://github.com/aizakmi08/woof`
- Visibility: public
- Default branch: `main`
- Local checkout: `/Users/admin/Documents/woof`
- Current local branch: `main`
- Local `HEAD`: `f1ecad5c47c644a512470e9515c0ffbe8d45edff`
- `origin/main`: `54dd71d3ef17292b5a3f93de09b3625b1c1d6787`
- Remote branches:
  - `main`: `54dd71d3ef17292b5a3f93de09b3625b1c1d6787`
  - `codex/push-woof-app`: `b6626b1296af168ddd6f08c451751ae0a2ada8d2`
- Tags: none returned by `git ls-remote --tags origin`
- Branch protection from public branch API:
  - `main`: `protected: false`
  - `codex/push-woof-app`: `protected: false`

## Open PR Snapshot

- PR: `#1` / `[codex] Prepare woof app release update`
- URL: `https://github.com/aizakmi08/woof/pull/1`
- State: open
- Draft: true
- Base: `main`
- Head: `codex/push-woof-app`
- Created: 2026-06-15
- Reviewers, labels, assignees: none
- Issue comments: 0
- Commit statuses on PR head: 0
- Check runs on PR head: 0

PR #1 is very large: `git diff --stat origin/main..origin/codex/push-woof-app` reports 452 changed files, 123,698 insertions, and 4,262 deletions. It includes many catalog, scraper, sitemap export, backfill, fixture, and migration files.

## Migration Collision With Production Supabase

PR #1 currently contains `supabase/migrations/007_product_data.sql` through `supabase/migrations/049_reject_non_complete_food_catalog_rows.sql`. The live Supabase project already has remote migration history through `057_tighten_supplemental_catalog_exclusions`, and the current local audit worktree intentionally keeps new deployable audit migrations at `058`-`070`.

This is a production release blocker. Merging PR #1 as-is would put stale `007`-`049` migration files back into the release branch even though those version numbers belong to production's existing `007`-`057` history. Before PR #1 can be merged or reused, remove the stale migration files from the release line or reconcile them through an intentional Supabase migration-history repair plan backed by schema verification.

## Mismatch With Current Audit Worktree

The local audit worktree is still on `main` at `f1ecad5...` with uncommitted changes and is behind remote `main` at `54dd71d...`. It is not the same as PR #1 or the current remote release state.

Important mismatches:

- PR #1 has no `.github/workflows/ci.yml`; remote `main` and the current local worktree do.
- PR #1 package version is `1.1.1`; the current local worktree has been aligned to `1.2.0`.
- PR #1 `AUDIT.md` is the older March 2026 comprehensive audit; the current local worktree replaces it with the June 17 source-backed operating audit.
- PR #1 validation commands reference older scripts such as `check:config`, `test:secret-hygiene`, `test:release-verification`, and `test:guards`; the current local worktree uses the newer release gates such as `check:secrets`, `check:syntax`, `check:analytics`, `check:privacy`, `check:claims`, `check:sql`, `check:deployment`, `check:edge`, `check:crash-reporting`, `check:audit`, `check:expo-config`, and `check:release`.
- The current local audit adds App Store Connect, App Privacy, KPI, deployment, Supabase reconciliation, RevenueCat sync, Sentry, analytics, and post-deploy validation artifacts that are not represented by the remote PR state.

Risk:

- Merging PR #1 as-is could ship a stale or different release package, miss the current audit's release gates, and bypass the GitHub Actions smoke workflow now required by this worktree.
- Merging PR #1 as-is could also reintroduce `007`-`049` migration files that collide with the live Supabase project's existing migration history.

## GitHub Actions Snapshot

GitHub API currently reports two active workflows:

- `CI`
- Path: `.github/workflows/ci.yml`
- Latest run: completed successfully on `main` at `54dd71d3ef17292b5a3f93de09b3625b1c1d6787`
- Run: `https://github.com/aizakmi08/woof/actions/runs/28731098630`
- `pages-build-deployment`
- Path: `dynamic/pages/pages-build-deployment`
- Latest run: completed successfully on `main` at `54dd71d3ef17292b5a3f93de09b3625b1c1d6787`

The remote smoke CI currently runs:

- secret scanning
- JavaScript syntax and guard checks
- analytics privacy checks
- App Privacy disclosure checks
- accessibility label checks
- claim-safety checks
- App Store listing checks
- SQL migration checks
- KPI runbook checks
- deployment-readiness checks
- crash-reporting checks
- Edge Function checks
- `npm ci`
- dependency audit threshold checks
- Expo config checks
- release metadata checks

The local worktree now also includes `.github/pull_request_template.md`. `npm run check:github-release` verifies that the template keeps the stale PR #1 warning, migration-collision warning, required local validation commands, strict release-evidence gate, live Edge verifier, App Store live-listing check, and paid-growth pause visible in every future release PR.

## Release Recommendations

1. Do not merge PR #1 until it is reconciled with the current audit worktree and its `007`-`049` migration collision is removed or intentionally repaired.
2. Choose one publish path:
   - update `codex/push-woof-app` with the current audit work after resolving the PR branch's extra catalog/backfill and stale migration changes, or
   - create a fresh branch for the current audit work and close/supersede PR #1.
3. Require the existing smoke CI workflow to run successfully on the release branch before merge.
4. Keep the release PR body aligned with `.github/pull_request_template.md`; do not merge until the validation/evidence checklist is either completed or explicitly waived with owner/date/rationale.
5. Enable branch protection on `main` before production release work: require pull request review or explicit self-review, require the CI workflow once it exists remotely, and block direct pushes to `main` where practical.
6. Keep generated catalog/backfill/scraper output out of the production release PR unless it is intentionally reviewed, licensed, and tied to a deploy plan.
7. Add GitHub releases or tags that map App Store/TestFlight build numbers to source commits after the next production-ready build.

## Follow-Up Checks

- Run `npm run check:github-release` before publishing or after any remote branch/PR/workflow change, then refresh this audit if the remote state no longer matches.
- Recheck PR #1 after the current audit branch is pushed.
- Confirm the CI workflow runs successfully on the release pull request.
- Confirm the PR body's validation section matches the actual scripts in `package.json`.
- Confirm the release PR does not contain stale `supabase/migrations/007`-`057` files from the old PR branch.
- Confirm no generated, private, or dashboard-derived artifacts are accidentally staged before the release branch is pushed.
