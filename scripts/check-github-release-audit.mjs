import { readFileSync } from "node:fs";

const repoOwner = "aizakmi08";
const repoName = "woof";
const repoApiBase = `https://api.github.com/repos/${repoOwner}/${repoName}`;
const expectedMainSha = "54dd71d3ef17292b5a3f93de09b3625b1c1d6787";
const expectedPrHeadSha = "b6626b1296af168ddd6f08c451751ae0a2ada8d2";
const expectedPrHeadBranch = "codex/push-woof-app";
const failures = [];

function fail(message) {
  failures.push(message);
}

function requireSnippet(source, snippet, context) {
  if (!source.includes(snippet)) {
    fail(`${context}: missing ${snippet}`);
  }
}

async function fetchJson(path) {
  const response = await fetch(`${repoApiBase}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "woof-release-audit",
    },
  });

  if (!response.ok) {
    fail(`GitHub API ${path} returned ${response.status}`);
    return null;
  }

  return response.json();
}

function validateBranch(branch, { expectedName, expectedSha, expectedProtected }) {
  if (!branch) return;

  if (branch.name !== expectedName) {
    fail(`expected branch ${expectedName}, got ${branch.name || "unknown"}`);
  }

  if (branch.commit?.sha !== expectedSha) {
    fail(`${expectedName} SHA changed: expected ${expectedSha}, got ${branch.commit?.sha || "unknown"}`);
  }

  if (branch.protected !== expectedProtected) {
    fail(`${expectedName} protection changed: expected ${expectedProtected}, got ${branch.protected}`);
  }
}

const auditDoc = readFileSync("GITHUB_RELEASE_AUDIT.md", "utf8");
const pullRequestTemplate = readFileSync(".github/pull_request_template.md", "utf8");

for (const snippet of [
  "npm run check:github-release",
  "PR #1",
  expectedPrHeadBranch,
  expectedPrHeadSha,
  expectedMainSha,
  "protected: false",
  "pages-build-deployment",
  ".github/workflows/ci.yml",
  "two active workflows",
  "007`-`049",
]) {
  requireSnippet(auditDoc, snippet, "GITHUB_RELEASE_AUDIT.md");
}

for (const snippet of [
  "stale draft PR #1",
  "supabase/migrations/007`-`057",
  "npm run check:preflight",
  "npm run check:github-release",
  "npm run check:evidence",
  "npm run check:evidence -- --strict",
  "npm run edge:verify-live",
  "npm run check:live-listing -- --guest-validated",
  "RELEASE_EVIDENCE.md",
  "GitHub smoke CI is green",
  "audit migrations `058`-`070`",
  "App Store Connect build `31`",
  "Paid growth remains paused",
]) {
  requireSnippet(pullRequestTemplate, snippet, ".github/pull_request_template.md");
}

const repo = await fetchJson("");
if (repo) {
  if (repo.full_name !== `${repoOwner}/${repoName}`) {
    fail(`expected ${repoOwner}/${repoName}, got ${repo.full_name || "unknown"}`);
  }

  if (repo.private !== false) {
    fail("repository visibility changed from public");
  }

  if (repo.default_branch !== "main") {
    fail(`default branch changed: expected main, got ${repo.default_branch || "unknown"}`);
  }
}

const [mainBranch, releaseBranch] = await Promise.all([
  fetchJson("/branches/main"),
  fetchJson(`/branches/${encodeURIComponent(expectedPrHeadBranch)}`),
]);

validateBranch(mainBranch, {
  expectedName: "main",
  expectedSha: expectedMainSha,
  expectedProtected: false,
});

validateBranch(releaseBranch, {
  expectedName: expectedPrHeadBranch,
  expectedSha: expectedPrHeadSha,
  expectedProtected: false,
});

const pulls = await fetchJson("/pulls?state=open&per_page=100");
if (Array.isArray(pulls)) {
  if (pulls.length !== 1) {
    fail(`expected exactly 1 open PR, got ${pulls.length}`);
  }

  const pr = pulls.find((candidate) => candidate.number === 1);
  if (!pr) {
    fail("expected open PR #1");
  } else {
    if (pr.title !== "[codex] Prepare woof app release update") {
      fail(`PR #1 title changed: ${pr.title}`);
    }
    if (pr.draft !== true) {
      fail("PR #1 is no longer draft");
    }
    if (pr.base?.ref !== "main") {
      fail(`PR #1 base changed: ${pr.base?.ref || "unknown"}`);
    }
    if (pr.head?.ref !== expectedPrHeadBranch) {
      fail(`PR #1 head branch changed: ${pr.head?.ref || "unknown"}`);
    }
    if (pr.head?.sha !== expectedPrHeadSha) {
      fail(`PR #1 head SHA changed: expected ${expectedPrHeadSha}, got ${pr.head?.sha || "unknown"}`);
    }
  }
}

const workflowData = await fetchJson("/actions/workflows?per_page=100");
const workflows = workflowData?.workflows || [];
const workflowNames = workflows.map((workflow) => workflow.name);
const workflowPaths = workflows.map((workflow) => workflow.path);

if (!workflowNames.includes("pages-build-deployment")) {
  fail("GitHub Pages deployment workflow is no longer present");
}

if (!workflowPaths.includes(".github/workflows/ci.yml")) {
  fail("remote GitHub smoke CI workflow is missing");
}

if (workflows.length !== 2) {
  fail(`expected CI and Pages workflows to be visible remotely, got ${workflows.length}`);
}

const ciWorkflow = workflows.find((workflow) => workflow.path === ".github/workflows/ci.yml");
if (ciWorkflow) {
  const ciRuns = await fetchJson(`/actions/workflows/${ciWorkflow.id}/runs?branch=main&per_page=1`);
  const latestCiRun = ciRuns?.workflow_runs?.[0];
  if (!latestCiRun) {
    fail("GitHub smoke CI has no main-branch run");
  } else {
    if (latestCiRun.head_sha !== expectedMainSha) {
      fail(`latest GitHub smoke CI run is for ${latestCiRun.head_sha || "unknown"}, expected ${expectedMainSha}`);
    }
    if (latestCiRun.status !== "completed" || latestCiRun.conclusion !== "success") {
      fail(`latest GitHub smoke CI run is ${latestCiRun.status || "unknown"}/${latestCiRun.conclusion || "unknown"}`);
    }
  }
}

if (failures.length > 0) {
  console.error("GitHub release audit check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error("Refresh GITHUB_RELEASE_AUDIT.md and the publish plan before release.");
  process.exit(1);
}

console.log("GitHub release audit check passed: remote PR, branch, protection, and workflow state match GITHUB_RELEASE_AUDIT.md.");
