const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) {
    console.error(`recall RPC guard failed: ${message}`);
    process.exit(1);
  }
}

const root = path.join(__dirname, "..");
const migration016 = fs.readFileSync(
  path.join(root, "supabase/migrations/016_brand_recalls.sql"),
  "utf8"
);
const migration025 = fs.readFileSync(
  path.join(root, "supabase/migrations/025_fix_brand_recall_summary.sql"),
  "utf8"
);

for (const [label, sql] of [
  ["016_brand_recalls", migration016],
  ["025_fix_brand_recall_summary", migration025],
]) {
  assert(
    /CREATE OR REPLACE FUNCTION get_brand_recall_summary\(p_brand_normalized TEXT\)/.test(sql),
    `${label} must define get_brand_recall_summary`
  );
  assert(
    /FROM brand_recalls br/.test(sql),
    `${label} must alias brand_recalls before aggregating recall fields`
  );
  assert(
    /WHERE br\.brand_normalized = p_brand_normalized/.test(sql),
    `${label} must qualify brand_normalized in get_brand_recall_summary`
  );
  assert(
    /WHERE br\.severity = 'active'/.test(sql) &&
      /WHERE br\.severity = 'major'/.test(sql),
    `${label} must qualify severity to avoid PL/pgSQL OUT-column ambiguity`
  );
  assert(
    /MAX\(br\.recall_date\)/.test(sql) &&
      /MIN\(br\.recall_date\)/.test(sql) &&
      /ARRAY_AGG\(DISTINCT br\.cause\)/.test(sql),
    `${label} must qualify aggregated recall columns`
  );
}

console.log("recall RPC guard passed");
