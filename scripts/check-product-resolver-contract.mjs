import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const scriptDirectory = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const jestBinary = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "jest.cmd" : "jest"
);

if (!fs.existsSync(jestBinary)) {
  console.error("Jest is missing. Run npm ci before npm run check:resolver-contract.");
  process.exit(1);
}

const result = spawnSync(
  jestBinary,
  [
    "--runInBand",
    "--config",
    path.join(root, "jest.config.js"),
    "tests/contracts/product-resolver-contract.test.js",
  ],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
