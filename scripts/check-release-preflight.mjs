import { spawnSync } from "node:child_process";
import { fullEnvironmentLabels, steps } from "./release-gates.mjs";

const skipFullEnvironment = process.argv.includes("--dependency-free");
const selectedSteps = skipFullEnvironment
  ? steps.filter((step) => !fullEnvironmentLabels.has(step.label))
  : steps;

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

  console.log(`\n${prefix} ${step.label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(`\nRelease preflight failed while starting "${step.label}": ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nRelease preflight failed at "${step.label}" with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

for (let index = 0; index < selectedSteps.length; index += 1) {
  runStep(selectedSteps[index], index);
}

console.log("\nRelease preflight passed.");

if (skipFullEnvironment) {
  console.log("Full-environment checks were skipped. Run the full preflight after npm ci and Deno setup before release.");
}
