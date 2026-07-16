import fs from "node:fs";
import { steps } from "./release-gates.mjs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");
const failures = [];

const preInstallCommands = new Set([
  "git diff --check",
  "npm run check:secrets",
  "npm run check:syntax",
]);

function fail(message) {
  failures.push(message);
}

function normalizeRunCommand(command) {
  return command.trim().replace(/^["']|["']$/g, "");
}

function workflowRunCommands() {
  return [...workflow.matchAll(/^\s*run:\s*(.+?)\s*$/gm)]
    .map((match) => normalizeRunCommand(match[1]));
}

function npmCommandsByScriptPath() {
  const commands = new Map();

  for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
    const match = command.match(/^node\s+([^\s]+)(?:\s|$)/);
    if (!match) continue;
    commands.set(match[1], `npm run ${scriptName}`);
  }

  return commands;
}

function expectedCommandForStep(step, commandsByScriptPath) {
  if (!step.script) {
    if (!step.command) return null;
    return [step.command, ...(step.args || [])].join(" ");
  }

  const baseCommand = commandsByScriptPath.get(step.script);
  if (!baseCommand) {
    fail(`package.json must expose an npm script for ${step.script}`);
    return null;
  }

  return step.args?.length ? `${baseCommand} -- ${step.args.join(" ")}` : baseCommand;
}

const commandsByScriptPath = npmCommandsByScriptPath();
const workflowCommands = workflowRunCommands();
const expectedCommands = steps
  .map((step) => expectedCommandForStep(step, commandsByScriptPath))
  .filter(Boolean);

let lastIndex = -1;
for (const command of expectedCommands) {
  const index = workflowCommands.indexOf(command);
  if (index === -1) {
    fail(`CI workflow must run ${command}`);
    continue;
  }

  if (index < lastIndex) {
    fail(`CI workflow command is out of release-gate order: ${command}`);
  }
  lastIndex = index;
}

const installIndex = workflowCommands.indexOf("npm ci");
if (installIndex === -1) {
  fail("CI workflow must run npm ci before dependency-backed checks");
} else {
  for (const command of expectedCommands) {
    const index = workflowCommands.indexOf(command);
    if (index === -1) continue;

    if (preInstallCommands.has(command) && index > installIndex) {
      fail(`${command} must run before npm ci in CI`);
    }

    if (!preInstallCommands.has(command) && index < installIndex) {
      fail(`${command} must run after npm ci in CI`);
    }
  }
}

if (!expectedCommands.includes("git diff --check")) {
  fail("release gates must include git diff --check so whitespace/conflict-marker checks run in CI");
}

if (!expectedCommands.includes("npm run check:ci")) {
  fail("release gates must include npm run check:ci so CI/preflight drift is self-checked");
}

if (failures.length > 0) {
  console.error("CI release alignment check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`CI release alignment check passed (${expectedCommands.length} release commands checked)`);
