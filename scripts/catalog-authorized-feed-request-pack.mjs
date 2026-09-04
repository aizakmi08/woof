import fs from "node:fs";
import path from "node:path";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-authorized-feed-requests/current";
const DEFAULT_INPUT_DROPZONE_DIR = "inputs/catalog-authorized-feeds";
const DEFAULT_LIMIT = 100;
const TEMPLATE_HEADERS = [
  "gtin",
  "product_name",
  "brand",
  "product_line",
  "flavor",
  "life_stage",
  "food_form",
  "package_size",
  "pet_type",
  "ingredient_statement",
  "product_image_url",
  "product_url",
  "is_complete_food",
  "guaranteed_analysis",
  "verified_at",
  "source_name",
  "source_license",
];
const DEFAULT_ACCESS_STATUSES = new Set(["requires_authorized_feed"]);
const ACCESS_STATUS_ORDER = {
  requires_authorized_feed: 1,
  requires_browser_snapshot: 2,
  blocked_by_source: 3,
  shared_catalog_source: 4,
  discontinued: 5,
  runnable: 9,
};
const TIER_ORDER = {
  tier_1_us_retail: 1,
  tier_2_us_retail: 2,
};

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) values.push(value);
  }
  return values;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(row, headers) {
  return headers.map((header) => csvEscape(row?.[header] ?? "")).join(",");
}

function sqlString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function sqlTextArray(values) {
  const safeValues = values.map(compact).filter(Boolean);
  if (safeValues.length === 0) return "ARRAY[]::text[]";
  return `ARRAY[${safeValues.map(sqlString).join(", ")}]::text[]`;
}

function shellQuote(value) {
  return `"${String(value || "").replace(/(["\\$`])/g, "\\$1")}"`;
}

function targetSourceSlug(target = {}) {
  return compact(target.sourceSlug)
    || normalizeKey(target.sourceOwner || target.brand)
    || normalizeKey(target.brand)
    || "unknown-source";
}

function targetAccessStatus(target = {}) {
  return target.accessStatus || (target.discovery ? "runnable" : "requires_authorized_feed");
}

function sourceQualityFor(target = {}) {
  if (target.sourcePriority === "gdsn") return "gdsn";
  if (target.sourcePriority === "retailer") return "retailer_verified";
  if (target.sourcePriority === "manufacturer") return "manufacturer";
  return "official";
}

function ingredientVerificationFor(sourceQuality) {
  if (sourceQuality === "gdsn") return "gdsn";
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  if (sourceQuality === "manufacturer") return "manufacturer";
  return "official";
}

function imageVerificationFor(sourceQuality) {
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  if (sourceQuality === "manufacturer") return "manufacturer";
  return "official";
}

function targetBrandValues(target = {}) {
  const seen = new Set();
  const values = [];
  for (const value of [target.brand, ...(Array.isArray(target.aliases) ? target.aliases : [])]) {
    const key = normalizeKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    values.push(compact(value));
  }
  return values;
}

function loadTargets() {
  return JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"))
    .map((target) => ({
      ...target,
      sourceSlug: targetSourceSlug(target),
      accessStatus: targetAccessStatus(target),
    }))
    .sort((left, right) => (
      (ACCESS_STATUS_ORDER[left.accessStatus] || 99) - (ACCESS_STATUS_ORDER[right.accessStatus] || 99)
      || (TIER_ORDER[left.coverageTier] || 99) - (TIER_ORDER[right.coverageTier] || 99)
      || left.sourceSlug.localeCompare(right.sourceSlug)
    ));
}

function selectedAccessStatuses() {
  const explicit = getArgs("--access-status").map(compact).filter(Boolean);
  if (explicit.length > 0) return new Set(explicit);
  const statuses = new Set(DEFAULT_ACCESS_STATUSES);
  if (hasArg("--include-browser-snapshot")) statuses.add("requires_browser_snapshot");
  if (hasArg("--include-blocked")) statuses.add("blocked_by_source");
  if (hasArg("--include-shared")) statuses.add("shared_catalog_source");
  if (hasArg("--all-restricted")) {
    statuses.add("requires_browser_snapshot");
    statuses.add("blocked_by_source");
    statuses.add("shared_catalog_source");
  }
  return statuses;
}

function selectedTargets() {
  const statuses = selectedAccessStatuses();
  const brandFilters = new Set(getArgs("--brand").map(normalizeKey).filter(Boolean));
  const sourceFilters = new Set(getArgs("--source").map(normalizeKey).filter(Boolean));
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  return loadTargets()
    .filter((target) => {
      if (!statuses.has(target.accessStatus)) return false;
      if (brandFilters.size > 0) {
        const brandKeys = targetBrandValues(target).map(normalizeKey);
        if (!brandKeys.some((key) => brandFilters.has(key))) return false;
      }
      if (sourceFilters.size > 0 && !sourceFilters.has(normalizeKey(target.sourceSlug))) return false;
      return true;
    })
    .slice(0, limit);
}

function templateRow(target) {
  return {
    brand: target.brand,
    pet_type: "",
    is_complete_food: "true",
    source_name: target.sourceOwner || target.brand,
    source_license: target.sourcePriority === "retailer"
      ? "authorized retailer feed or explicit reuse permission required"
      : "authorized manufacturer/licensed feed or official reusable source required",
  };
}

function isBroadRetailCatalogTarget(target = {}) {
  return target.sourcePriority === "retailer"
    && (
      /\bretail\s+catalog\b/i.test(target.brand || "")
      || /-retail-catalog$/i.test(target.sourceSlug || "")
    );
}

function retailerKeyFor(target = {}) {
  const identity = [
    target.sourceOwner,
    target.sourceSlug,
    target.brand,
    target.targetUrl,
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  if (identity.includes("chewy.com") || /\bchewy\b/.test(identity)) return "chewy";
  if (identity.includes("petco.com") || /\bpetco\b/.test(identity)) return "petco";
  if (identity.includes("petsmart.com") || /\bpetsmart\b/.test(identity)) return "petsmart";
  if (identity.includes("walmart.com") || /\bwalmart\b/.test(identity)) return "walmart";
  if (identity.includes("amazon.com") || /\bamazon\b/.test(identity)) return "amazon";
  if (identity.includes("target.com") || /\btarget\b/.test(identity)) return "target";
  if (identity.includes("costco.com") || /\bcostco\b/.test(identity)) return "costco";
  if (identity.includes("kroger.com") || /\bkroger\b/.test(identity)) return "kroger";
  if (identity.includes("tractorsupply.com") || /\btractor supply\b/.test(identity)) return "tractor-supply";
  return "";
}

function addExpectedBrandArgs(command, target) {
  if (!isBroadRetailCatalogTarget(target)) {
    command.push("--expected-brand", shellQuote(target.brand));
  }
  return command;
}

function importCommand(target, templatePath) {
  const sourceQuality = sourceQualityFor(target);
  return addExpectedBrandArgs([
    "node scripts/catalog-official-feed-import.mjs",
    "--file", shellQuote(templatePath),
    "--source", shellQuote(target.sourceSlug),
    "--source-quality", sourceQuality,
    "--ingredient-verification", ingredientVerificationFor(sourceQuality),
    "--image-verification", imageVerificationFor(sourceQuality),
  ], target).join(" ");
}

function inferSnapshotRetailer(target = {}) {
  const identity = [
    target.sourceOwner,
    target.sourceSlug,
    target.brand,
    target.targetUrl,
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  if (identity.includes("petsmart.com") || identity.includes("petsmart")) return "petsmart";
  if (identity.includes("chewy.com") || identity.includes("chewy")) return "chewy";
  if (identity.includes("walmart.com") || identity.includes("walmart")) return "walmart";
  if (identity.includes("petco.com") || identity.includes("petco")) return "petco";
  return "";
}

function snapshotImportCommand(target) {
  const command = [
    "npm run catalog:retailer-snapshot-import-batch --",
    "--brand", shellQuote(target.brand),
    "--source", shellQuote(target.sourceSlug),
    "--snapshot-dir", shellQuote(`inputs/catalog-browser-snapshots/${target.sourceSlug}`),
  ];
  const retailer = inferSnapshotRetailer(target);
  if (retailer) {
    command.push("--retailer", shellQuote(retailer));
  }
  if (target.discovery?.requiredUrlPattern) {
    command.push("--required-source-url-pattern", shellQuote(target.discovery.requiredUrlPattern));
  }
  command.push("--allow-partial-pages");
  return command.join(" ");
}

function dropImportCommand(target) {
  const sourceQuality = sourceQualityFor(target);
  return addExpectedBrandArgs([
    "node scripts/catalog-authorized-feed-drop-import.mjs",
    "--input-dir inputs/catalog-authorized-feeds",
    "--output-dir outputs/catalog-authorized-feed-imports",
    "--source", shellQuote(target.sourceSlug),
    "--source-quality", sourceQuality,
  ], target).join(" ");
}

function queueExportSql(target) {
  const brands = targetBrandValues(target);
  const brandArray = brands.length > 0 ? sqlTextArray(brands) : sqlTextArray([target.brand]);
  const retailerKey = retailerKeyFor(target);
  const retailerClause = isBroadRetailCatalogTarget(target) && retailerKey
    ? `
  OR (
    ${sqlString(retailerKey)} = 'chewy'
    AND (
      lower(coalesce(q.source_url, '')) LIKE '%chewy.com%'
      OR lower(coalesce(q.product_source, '')) LIKE '%chewy%'
    )
  )
  OR (
    ${sqlString(retailerKey)} = 'petco'
    AND (
      lower(coalesce(q.source_url, '')) LIKE '%petco.com%'
      OR lower(coalesce(q.product_source, '')) LIKE '%petco%'
    )
  )
  OR (
    ${sqlString(retailerKey)} = 'petsmart'
    AND (
      lower(coalesce(q.source_url, '')) LIKE '%petsmart.com%'
      OR lower(coalesce(q.product_source, '')) LIKE '%petsmart%'
    )
  )
  OR (
    ${sqlString(retailerKey)} = 'walmart'
    AND (
      lower(coalesce(q.source_url, '')) LIKE '%walmart.com%'
      OR lower(coalesce(q.product_source, '')) LIKE '%walmart%'
    )
  )`
    : "";
  return `-- Export current acquisition gaps for ${target.brand}.
-- Run in Supabase SQL Editor with a privileged role, then use the output to
-- request or fill an authorized feed. This query does not update data.
WITH target_brands AS (
  SELECT lower(trim(value)) AS brand_key
  FROM unnest(${brandArray}) AS value
)
SELECT
  q.brand,
  q.product_name,
  q.pet_type,
  q.gap_type,
  q.priority_score,
  q.affected_product_count,
  q.demand_events,
  q.needs_verified_ingredients,
  q.needs_verified_image,
  q.needs_pet_type,
  q.source_url,
  q.sample_metadata
FROM public.catalog_acquisition_queue q
WHERE q.status = 'open'
  AND (
    lower(trim(q.brand)) IN (SELECT brand_key FROM target_brands)
    OR regexp_replace(lower(coalesce(q.brand, '')), '[^a-z0-9]+', '', 'g') IN (
      SELECT regexp_replace(brand_key, '[^a-z0-9]+', '', 'g')
      FROM target_brands
    )${retailerClause}
  )
ORDER BY
  (q.gap_type <> 'brand') DESC,
  q.priority_score DESC,
  q.affected_product_count DESC,
  q.updated_at DESC
LIMIT 500;
`;
}

function combinedGapSummarySql(targets) {
  const targetRows = targets.map((target) => ({
    sourceSlug: target.sourceSlug,
    brand: target.brand,
    brandValues: targetBrandValues(target),
    accessStatus: target.accessStatus,
    sourceOwner: target.sourceOwner || target.brand,
    retailerKey: isBroadRetailCatalogTarget(target) ? retailerKeyFor(target) : "",
  }));

  return `-- Summarize live acquisition gaps for this restricted-source request pack.
-- Run in Supabase SQL Editor with a privileged role. This query is read-only.
-- Exact brand matches are used for private-label feeds. Broad retailer catalog
-- targets also match queue rows with retailer host/source evidence when present.
WITH restricted_sources(source_slug, brand, brand_values, access_status, source_owner, retailer_key) AS (
  VALUES
${targetRows.map((row) => `    (${sqlString(row.sourceSlug)}, ${sqlString(row.brand)}, ${sqlTextArray(row.brandValues)}, ${sqlString(row.accessStatus)}, ${sqlString(row.sourceOwner)}, ${sqlString(row.retailerKey)})`).join(",\n")}
),
queue_counts AS (
  SELECT
    r.source_slug,
    r.brand,
    r.access_status,
    r.source_owner,
    count(q.*)::int AS open_rows,
    sum(coalesce(q.affected_product_count, 0))::int AS affected_products,
    count(q.*) FILTER (WHERE q.needs_verified_ingredients)::int AS needs_ingredients_rows,
    count(q.*) FILTER (WHERE q.needs_verified_image)::int AS needs_image_rows,
    count(q.*) FILTER (WHERE q.needs_pet_type)::int AS needs_pet_type_rows,
    max(q.priority_score) AS max_priority,
    string_agg(
      DISTINCT nullif(left(coalesce(q.product_source, ''), 48), ''),
      '; '
      ORDER BY nullif(left(coalesce(q.product_source, ''), 48), '')
    ) AS product_sources
  FROM restricted_sources r
  LEFT JOIN public.catalog_acquisition_queue q
    ON q.status = 'open'
   AND (
     lower(trim(q.brand)) = ANY (
       SELECT lower(trim(value))
       FROM unnest(r.brand_values) AS value
     )
     OR regexp_replace(lower(coalesce(q.brand, '')), '[^a-z0-9]+', '', 'g') = ANY (
       SELECT regexp_replace(lower(trim(value)), '[^a-z0-9]+', '', 'g')
       FROM unnest(r.brand_values) AS value
     )
     OR (
       r.retailer_key = 'chewy'
       AND (
         lower(coalesce(q.source_url, '')) LIKE '%chewy.com%'
         OR lower(coalesce(q.product_source, '')) LIKE '%chewy%'
       )
     )
     OR (
       r.retailer_key = 'petco'
       AND (
         lower(coalesce(q.source_url, '')) LIKE '%petco.com%'
         OR lower(coalesce(q.product_source, '')) LIKE '%petco%'
       )
     )
     OR (
       r.retailer_key = 'petsmart'
       AND (
         lower(coalesce(q.source_url, '')) LIKE '%petsmart.com%'
         OR lower(coalesce(q.product_source, '')) LIKE '%petsmart%'
       )
     )
     OR (
       r.retailer_key = 'walmart'
       AND (
         lower(coalesce(q.source_url, '')) LIKE '%walmart.com%'
         OR lower(coalesce(q.product_source, '')) LIKE '%walmart%'
       )
     )
   )
  GROUP BY r.source_slug, r.brand, r.access_status, r.source_owner
)
SELECT *
FROM queue_counts
ORDER BY open_rows DESC, affected_products DESC, max_priority DESC NULLS LAST, brand;
`;
}

function targetReadme(target, relativeTemplatePath, relativeSqlPath) {
  const sourceQuality = sourceQualityFor(target);
  const browserSnapshotWorkflow = target.accessStatus === "requires_browser_snapshot"
    ? `
## Browser Snapshot Workflow

This source is marked \`requires_browser_snapshot\`, so use rendered browser evidence instead of local Node/curl scraping.

1. Open the source target or product page in Chrome: ${target.targetUrl || ""}
2. Collect rendered browser JSON with \`source_url\`, \`html\`, and visible \`text\`. For Petco sources, \`scripts/petco-browser-batch-snapshot-collector.js\` and \`scripts/petco-browser-snapshot-collector.js\` produce the expected shape.
3. Save one JSON object or an array of JSON snapshots to:

\`inputs/catalog-browser-snapshots/${target.sourceSlug}/snapshot.json\`

4. Generate guarded SQL chunks:

\`${snapshotImportCommand(target)}\`

The snapshot importer uses \`--allow-partial-pages\` so incomplete rendered pages are quarantined as warnings while valid product rows continue through the importer. It still requires retailer product URLs that match the configured allow-list, exact rendered ingredient text, retailer-verified images, and stable SKU/cache-key evidence before emitting SQL.
`
    : "";
  return `# ${target.brand} Authorized Catalog Feed Request

Source owner: ${target.sourceOwner || target.brand}
Access status: ${target.accessStatus}
Source priority: ${target.sourcePriority || "official"}
Target URL: ${target.targetUrl || ""}

## Required Evidence

- Active US dog/cat complete food products only.
- Exact ingredient statement from the label or authorized product content.
- One verified front package image URL.
- Product URL or evidence URL for every row.
- Dog/cat pet type, complete-food flag, product name, brand, flavor/recipe, life stage, food form, package size, and GTIN when available.
- Verification date or source publication timestamp.
- No AI-generated ingredients, no inferred ingredients, no lifestyle-only images, no bundles, no variety packs, no treats, no toppers, no supplements.

## Files

- Template: \`${relativeTemplatePath}\`
- Live queue export SQL: \`${relativeSqlPath}\`

## Import Path

After receiving the authorized feed, place it under:

\`inputs/catalog-authorized-feeds/${target.sourceSlug}/feed.csv\`

Then run:

\`${dropImportCommand(target)}\`

The guarded importer will emit SQL chunks only. Review the generated manifest and SQL before applying to Supabase.

Expected source quality: \`${sourceQuality}\`
Expected ingredient verification: \`${ingredientVerificationFor(sourceQuality)}\`
Expected image verification: \`${imageVerificationFor(sourceQuality)}\`
${browserSnapshotWorkflow}
`;
}

function rootReadme({ targets, outputDir }) {
  const counts = targets.reduce((map, target) => {
    map[target.accessStatus] = (map[target.accessStatus] || 0) + 1;
    return map;
  }, {});
  return `# Woof Authorized Feed Request Pack

Generated for ${targets.length} source target(s).

Access status counts:
${Object.entries(counts).map(([status, count]) => `- ${status}: ${count}`).join("\n")}

This pack turns restricted/private-label coverage into a repeatable acquisition workflow. It does not bypass website restrictions or content licenses.

## Acceptance Criteria

- Ingredients must be exact source-backed label text.
- Front image must be a real front package image.
- Each row must include source/evidence URL and verification date when available.
- Only dog/cat complete foods can become app-ready.
- Treats, toppers, broths, supplements, variety packs, bundles, and discontinued products stay excluded unless scope changes.

## Workflow

1. Send the relevant template from \`${path.relative(process.cwd(), path.join(outputDir, "templates"))}\` to the source owner or feed provider.
2. Run \`${path.relative(process.cwd(), path.join(outputDir, "sql", "restricted-source-gap-summary.sql"))}\` in Supabase to prioritize source requests by current live demand.
3. Use the matching per-source SQL in \`${path.relative(process.cwd(), path.join(outputDir, "sql"))}\` to export current live gap examples from Supabase.
4. Drop received files under \`inputs/catalog-authorized-feeds/<source-slug>/\`.
5. Run \`npm run catalog:restricted-source-readiness -- --gap-summary ${path.relative(process.cwd(), path.join(outputDir, "restricted-source-gap-summary-live.json"))}\` when a live gap export is available.
6. Run \`npm run catalog:authorized-feed-drop-import\`.
7. Review generated SQL manifests, then apply valid chunks.
8. Run \`npm run check:catalog-scraper\` and \`npm run catalog:live-verified-contract-audit\`.

The drop importer fails by default when a feed has zero verified-ready candidates, no known source target, no expected brand gate, empty input, or restricted-source evidence quality weaker than \`gdsn\`, \`manufacturer\`, or \`retailer_verified\`.

For sources marked \`requires_browser_snapshot\`, use the per-source docs under \`${path.relative(process.cwd(), path.join(outputDir, "docs"))}\`. Those docs include rendered-browser collector and snapshot-import commands.

Importer script: \`scripts/catalog-authorized-feed-drop-import.mjs\`
Serving table: \`product_data\`
Verified rows must pass \`catalog_quality_state(...) = 'verified_ready'\`.
`;
}

function dropzoneRootReadme({ targets, requestOutputDir }) {
  return `# Woof Authorized Feed Drop Zone

Place licensed or explicitly authorized feed files in the source-specific folders in this directory.

Do not put public scrape exports here unless the source terms or feed contract allow Woof to reuse exact ingredient statements and front package images.

## Accepted Feed Evidence

- Active US dog/cat complete-food products only.
- Exact source-backed ingredient statements.
- Verified front package image URL.
- Product URL or evidence URL for every row.
- Dog/cat pet type, complete-food flag, brand, product name, flavor/recipe, life stage, food form, package size, and GTIN when available.
- Verification date or source publication timestamp.

## Workflow

1. Use the request templates under \`${requestOutputDir}/templates/\`.
2. Save the received authorized file as \`inputs/catalog-authorized-feeds/<source-slug>/feed.csv\` or another supported feed extension.
3. Keep \`feed.csv.template\` as a header/sample reference; it is intentionally ignored by the drop importer.
4. Run \`npm run catalog:authorized-feed-drop-import\`.
5. Review generated SQL manifests under \`outputs/catalog-authorized-feed-imports/\` before applying anything live.

Configured source folders: ${targets.length}
`;
}

function dropzoneSourceReadme(target, requestOutputDir) {
  const sourceQuality = sourceQualityFor(target);
  const requestDocPath = path.join(requestOutputDir, "docs", `${target.sourceSlug}.md`);
  return `# ${target.brand} Authorized Feed Intake

Source slug: \`${target.sourceSlug}\`
Source owner: ${target.sourceOwner || target.brand}
Access status: ${target.accessStatus}
Expected source quality: \`${sourceQuality}\`
Expected ingredient verification: \`${ingredientVerificationFor(sourceQuality)}\`
Expected image verification: \`${imageVerificationFor(sourceQuality)}\`

Request documentation: \`${requestDocPath}\`
Request template: \`${path.join(requestOutputDir, "templates", `${target.sourceSlug}.csv`)}\`

Drop the received authorized feed as:

\`inputs/catalog-authorized-feeds/${target.sourceSlug}/feed.csv\`

Then run:

\`node scripts/catalog-authorized-feed-drop-import.mjs --input-dir inputs/catalog-authorized-feeds --output-dir outputs/catalog-authorized-feed-imports --source ${target.sourceSlug} --source-quality ${sourceQuality}\`

The importer emits guarded SQL chunks only. A row can become app-ready only if it has exact ingredients, a verified front image, source URL/evidence URL, dog/cat metadata, and complete-food scope.
`;
}

function writeInputDropzone(targets, { inputDir, requestOutputDir }) {
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, "README.md"), dropzoneRootReadme({ targets, requestOutputDir }), "utf8");

  for (const target of targets) {
    const sourceDir = path.join(inputDir, target.sourceSlug);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, ".gitkeep"), "", "utf8");
    fs.writeFileSync(path.join(sourceDir, "README.md"), dropzoneSourceReadme(target, requestOutputDir), "utf8");
    fs.writeFileSync(path.join(sourceDir, "feed.csv.template"), `${[
      TEMPLATE_HEADERS.join(","),
      csvLine(templateRow(target), TEMPLATE_HEADERS),
    ].join("\n")}\n`, "utf8");
  }
}

function cleanPackOutput(outputDir) {
  for (const entry of ["templates", "sql", "docs"]) {
    fs.rmSync(path.join(outputDir, entry), { recursive: true, force: true });
  }
  for (const fileName of [
    "README.md",
    "manifest.json",
    "request-index.csv",
    "readiness-report.csv",
    "readiness-report.json",
    "readiness-report.md",
    "restricted-source-gap-summary-live.json",
  ]) {
    fs.rmSync(path.join(outputDir, fileName), { force: true });
  }
}

function writePack(targets, outputDir) {
  const templateDir = path.join(outputDir, "templates");
  const sqlDir = path.join(outputDir, "sql");
  const docsDir = path.join(outputDir, "docs");
  cleanPackOutput(outputDir);
  fs.mkdirSync(templateDir, { recursive: true });
  fs.mkdirSync(sqlDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const summarySqlPath = path.join(sqlDir, "restricted-source-gap-summary.sql");
  const manifestTargets = [];
  const indexRows = [];

  for (const target of targets) {
    const templatePath = path.join(templateDir, `${target.sourceSlug}.csv`);
    const sqlPath = path.join(sqlDir, `${target.sourceSlug}-queue-export.sql`);
    const docPath = path.join(docsDir, `${target.sourceSlug}.md`);
    const relativeTemplatePath = path.relative(outputDir, templatePath);
    const relativeSqlPath = path.relative(outputDir, sqlPath);

    fs.writeFileSync(templatePath, `${[
      TEMPLATE_HEADERS.join(","),
      csvLine(templateRow(target), TEMPLATE_HEADERS),
    ].join("\n")}\n`, "utf8");
    fs.writeFileSync(sqlPath, queueExportSql(target), "utf8");
    fs.writeFileSync(docPath, targetReadme(target, relativeTemplatePath, relativeSqlPath), "utf8");

    const row = {
      source_slug: target.sourceSlug,
      brand: target.brand,
      aliases: targetBrandValues(target).filter((value) => value !== target.brand).join("; "),
      source_owner: target.sourceOwner || "",
      access_status: target.accessStatus,
      source_priority: target.sourcePriority || "",
      coverage_tier: target.coverageTier || "",
      target_url: target.targetUrl || "",
      template_path: path.relative(process.cwd(), templatePath),
      sql_path: path.relative(process.cwd(), sqlPath),
      docs_path: path.relative(process.cwd(), docPath),
      source_quality: sourceQualityFor(target),
      ingredient_verification: ingredientVerificationFor(sourceQualityFor(target)),
      image_verification: imageVerificationFor(sourceQualityFor(target)),
      import_command: importCommand(target, path.relative(process.cwd(), templatePath)),
      drop_import_command: dropImportCommand(target),
      snapshot_import_command: target.accessStatus === "requires_browser_snapshot" ? snapshotImportCommand(target) : "",
      notes: target.notes || "",
    };
    indexRows.push(row);
    manifestTargets.push(row);
  }

  const indexHeaders = [
    "source_slug",
    "brand",
    "aliases",
    "source_owner",
    "access_status",
    "source_priority",
    "coverage_tier",
    "target_url",
    "template_path",
    "sql_path",
    "docs_path",
    "source_quality",
    "ingredient_verification",
    "image_verification",
    "import_command",
    "drop_import_command",
    "snapshot_import_command",
    "notes",
  ];

  fs.writeFileSync(path.join(outputDir, "request-index.csv"), `${[
    indexHeaders.join(","),
    ...indexRows.map((row) => csvLine(row, indexHeaders)),
  ].join("\n")}\n`, "utf8");
  fs.writeFileSync(summarySqlPath, combinedGapSummarySql(targets), "utf8");
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify({
    generated_at: generatedAt,
    source_targets_path: SOURCE_TARGETS_PATH,
    request_count: targets.length,
    summary_sql_path: path.relative(process.cwd(), summarySqlPath),
    access_status_counts: targets.reduce((map, target) => {
      map[target.accessStatus] = (map[target.accessStatus] || 0) + 1;
      return map;
    }, {}),
    template_headers: TEMPLATE_HEADERS,
    targets: manifestTargets,
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "README.md"), rootReadme({ targets, outputDir }), "utf8");
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-authorized-feed-request-pack.mjs",
      "",
      "Generates source-specific templates and SQL exports for authorized catalog data acquisition.",
      "",
      "Options:",
      "  --output-dir <dir>              Default: outputs/catalog-authorized-feed-requests/current",
      "  --access-status <status>        Repeatable. Default: requires_authorized_feed.",
      "  --include-browser-snapshot      Also include requires_browser_snapshot targets.",
      "  --include-blocked               Also include blocked_by_source targets.",
      "  --include-shared                Also include shared_catalog_source targets.",
      "  --all-restricted                Include authorized-feed, browser-snapshot, blocked, and shared targets.",
      "  --brand <brand>                 Repeatable brand filter.",
      "  --source <source-slug>          Repeatable source filter.",
      "  --write-input-dropzone          Create inputs/catalog-authorized-feeds/<source-slug>/ intake folders.",
      "  --input-dropzone-dir <dir>      Default: inputs/catalog-authorized-feeds.",
      "  --limit <n>",
      "  --json",
    ].join("\n"));
    return;
  }

  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  const inputDropzoneDir = compact(getArg("--input-dropzone-dir", DEFAULT_INPUT_DROPZONE_DIR));
  const targets = selectedTargets();
  writePack(targets, outputDir);
  if (hasArg("--write-input-dropzone")) {
    writeInputDropzone(targets, {
      inputDir: inputDropzoneDir,
      requestOutputDir: outputDir,
    });
  }

  const summary = {
    generated_at: new Date().toISOString(),
    output_dir: outputDir,
    input_dropzone_dir: hasArg("--write-input-dropzone") ? inputDropzoneDir : null,
    request_count: targets.length,
    access_status_counts: targets.reduce((map, target) => {
      map[target.accessStatus] = (map[target.accessStatus] || 0) + 1;
      return map;
    }, {}),
    sources: targets.map((target) => ({
      source_slug: target.sourceSlug,
      brand: target.brand,
      access_status: target.accessStatus,
      source_priority: target.sourcePriority || "",
      coverage_tier: target.coverageTier || "",
    })),
  };

  if (hasArg("--json")) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("Authorized feed request pack generated");
    console.log(`Output: ${outputDir}`);
    console.table(summary.sources);
  }
}

main();
