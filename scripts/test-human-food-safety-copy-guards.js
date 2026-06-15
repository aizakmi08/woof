const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const resultsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/index.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`human-food safety copy guard failed: ${message}`);
    process.exit(1);
  }
}

const mapperStart = resultsSource.indexOf("function getHumanFoodExplanationTitle(safetyLevel)");
const mapperEnd = resultsSource.indexOf("export default function ResultsScreen", mapperStart);
const mapperBlock = resultsSource.slice(mapperStart, mapperEnd);

assert(
  mapperStart !== -1 &&
    mapperEnd !== -1 &&
    mapperBlock.includes('case "safe":') &&
    mapperBlock.includes("return \"Why It's Likely Safe\";") &&
    mapperBlock.includes('case "caution":') &&
    mapperBlock.includes('return "Why To Use Caution";') &&
    mapperBlock.includes('case "dangerous":') &&
    mapperBlock.includes("return \"Why It's Dangerous\";"),
  "human-food explanation title must map safe, caution, and dangerous separately"
);

assert(
  resultsSource.includes("{getHumanFoodExplanationTitle(result.safetyLevel)}") &&
    !resultsSource.includes('Why It\'s {result.safetyLevel === "safe" ? "Safe" : "Dangerous"}'),
  "human-food explanation UI must not collapse caution into dangerous copy"
);

assert(
  packageJson.includes('"test:human-food-safety-copy": "node scripts/test-human-food-safety-copy-guards.js"') &&
    packageJson.includes("npm run test:human-food-safety-copy"),
  "human-food safety copy guard must be wired into package scripts"
);

console.log("human-food safety copy guard passed");
