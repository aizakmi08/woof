import { spawnSync } from "node:child_process";
import { fullEnvironmentLabels, steps } from "./release-gates.mjs";

const skipFullEnvironment = process.argv.includes("--dependency-free");
const selectedSteps = skipFullEnvironment
  ? steps.filter((step) => !fullEnvironmentLabels.has(step.label))
  : steps;
const completedSteps = [];

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function printTimingSummary() {
  console.log("\nRelease preflight timing summary:");
  for (const step of completedSteps) {
    console.log(`- ${step.status} ${step.label}: ${formatDuration(step.durationMs)}`);
  }
}

function stepCommand(step) {
  if (step.script) {
    return {
      command: process.execPath,
      args: [step.script, ...(step.args || [])],
    };
  }

  return {
    command: step.command,
    args: step.args || [],
  };
}

function runStep(step, index) {
  const { command, args } = stepCommand(step);
  const prefix = `[${index + 1}/${selectedSteps.length}]`;
  const startedAt = performance.now();

  console.log(`\n${prefix} ${step.label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    completedSteps.push({ label: step.label, status: "BLOCKED", durationMs: performance.now() - startedAt });
    printTimingSummary();
    console.error(`\nRelease preflight failed while starting "${step.label}": ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    completedSteps.push({ label: step.label, status: "FAIL", durationMs: performance.now() - startedAt });
    printTimingSummary();
    console.error(`\nRelease preflight failed at "${step.label}" with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }

  const durationMs = performance.now() - startedAt;
  completedSteps.push({ label: step.label, status: "PASS", durationMs });
  console.log(`${prefix} PASS in ${formatDuration(durationMs)}`);
}

for (let index = 0; index < selectedSteps.length; index += 1) {
  runStep(selectedSteps[index], index);
}

printTimingSummary();
console.log("\nRelease preflight passed.");

if (skipFullEnvironment) {
  console.log("Full-environment checks were skipped. Run the full preflight after npm ci and Deno setup before release.");
}
