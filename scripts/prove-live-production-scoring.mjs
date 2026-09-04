import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const projectRef = process.env.SUPABASE_PROJECT_REF || "rhlgvrywjralxrjcdtrw";
const cacheKey = "natures-logic:nature s logic distinction canine pork recipe natural pork dog food";
const query = `
  SELECT to_jsonb(product) AS product_row
  FROM (
    SELECT
      cache_key,
      product_name,
      brand,
      gtin,
      product_line,
      flavor,
      life_stage,
      food_form,
      package_size,
      pet_type,
      ingredients,
      ingredient_text,
      ingredient_count,
      nutritional_info,
      nutrient_panel,
      has_published_nutrients,
      source,
      source_quality,
      ingredient_verification_status,
      image_verification_status,
      verified_at,
      source_url,
      image_url,
      formula_evidence_tier,
      formula_version_provenance
    FROM public.product_data
    WHERE cache_key = '${cacheKey}'
    LIMIT 1
  ) AS product;
`;

function parseCliJson(output) {
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Supabase CLI did not return JSON");
  return JSON.parse(output.slice(start));
}

const queryRun = spawnSync(
  "supabase",
  ["db", "query", "--linked", "--project-ref", projectRef, query],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
);

if (queryRun.status !== 0) {
  console.error(`BLOCKED(live scoring): ${String(queryRun.stderr || queryRun.stdout).trim()}`);
  process.exit(2);
}

let productRow;
try {
  const payload = parseCliJson(queryRun.stdout);
  productRow = payload.rows?.[0]?.product_row;
} catch (error) {
  console.error(`FAIL(live scoring): ${error.message}`);
  process.exit(1);
}

if (!productRow || typeof productRow !== "object") {
  console.error(`FAIL(live scoring): production row ${cacheKey} was not found`);
  process.exit(1);
}

const jestBinary = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "jest.cmd" : "jest"
);
const testRun = spawnSync(
  jestBinary,
  ["--runInBand", "tests/integration/live-production-scoring.test.js"],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      LIVE_PRODUCT_ROW_JSON: JSON.stringify(productRow),
    },
  }
);

process.stdout.write(testRun.stdout || "");
process.stderr.write(testRun.stderr || "");
process.exit(testRun.status ?? 1);
