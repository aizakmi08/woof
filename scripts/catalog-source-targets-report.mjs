import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_IMPORT_ROOT = "outputs/catalog-source-imports";
const DEFAULT_LIMIT = 40;
const DEFAULT_MIN_AFFECTED_PRODUCTS = 20;
const PAGE_SIZE = 1000;
const SOURCE_PRIORITIES = new Set(["manufacturer", "gdsn", "retailer", "official"]);
const COVERAGE_TIERS = new Set(["tier_1_us_retail", "tier_2_us_retail"]);
const ACCESS_STATUSES = new Set([
  "runnable",
  "requires_authorized_feed",
  "requires_browser_snapshot",
  "blocked_by_source",
  "shared_catalog_source",
  "discontinued",
  "official_site_needs_adapter",
]);
const REQUIRED_SOURCE_KEYS = [
  "Blue Buffalo",
  "Blue Wilderness",
  "Purina Pro Plan",
  "Pro Plan Veterinary Diets",
  "Fancy Feast",
  "Wellness",
  "Friskies",
  "Royal Canin",
  "Royal Canin Veterinary Diet",
  "Hill's Science Diet",
  "Hill's Prescription Diet",
  "Purina ONE",
  "Nutro",
  "Pedigree",
  "Stella & Chewy's",
  "Tiki Cat",
  "Weruva",
  "Merrick",
  "Open Farm",
  "IAMS",
  "Instinct",
  "Taste of the Wild",
  "ACANA",
  "Sheba",
  "CANIDAE",
  "Solid Gold",
  "Farmina Pet Foods",
  "N&D",
  "Natural Balance",
  "Bully Max",
  "Meow Mix",
  "Go! Solutions",
  "Rachael Ray",
  "Hill's Prescription",
  "KOHA",
  "WholeHearted",
  "Dr. Harvey's",
  "Fromm",
  "Nature's Logic",
  "Now Fresh",
  "Freshpet",
  "Purina Cat Chow",
  "Dave's Pet Food",
  "Rawz",
  "Ziwi Peak",
  "Pure Balance",
  "Berkley Jensen",
  "Diamond Naturals",
  "Lotus",
  "Primal",
  "Jinx",
  "4Health",
  "Crave",
  "Blackwood",
  "Health Extension",
  "Kirkland Signature",
  "Trader Joe's",
  "Wysong",
  "Grandma Lucy's",
  "Nature's Select",
  "9Lives",
  "Almo Nature",
  "Fussie Cat",
  "Halo",
  "Holistic Select",
  "Dr. Marty",
  "Feline Natural",
  "Chewy Made",
  "American Journey",
  "Tiny Tiger",
  "True Acre Foods",
  "Kindfull",
  "Wag",
  "Healthy Dogma",
  "K9 Natural",
  "Ol' Roy",
  "Abound",
  "Luvsome",
  "Pet Pride",
  "Purina Beyond",
  "Annamaet",
  "Addiction",
  "Evanger's",
  "smallbatch",
  "Tucker's Raw Frozen",
  "Simply Nourish",
  "Applaws",
  "FirstMate",
  "NutriSource",
  "Chicken Soup for the Soul",
  "Whiskas",
  "Authority",
  "Optimeal",
];
const EXPECTED_NON_US_GENERIC_OR_NON_COMPLETE_QUEUE_BRANDS = new Set([
  "arm hammer",
  "ark naturals",
  "atavik",
  "auchan",
  "carrefour",
  "edgard cooper",
  "empreintes",
  "full moon",
  "generic",
  "grain free",
  "greenies",
  "icelandic",
  "jack",
  "kiebitzmarkt",
  "leader price",
  "nature s protection",
  "petami",
  "real nature",
  "temptations",
  "tropiclean",
  "u",
]);

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedBrand(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedSourceSlug(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sourceSlugFor(target = {}) {
  return normalizedSourceSlug(target.sourceSlug || target.sourceOwner || target.brand || "catalog-source");
}

function targetAccessStatus(target = {}) {
  return target.accessStatus || (target.discovery ? "runnable" : "requires_authorized_feed");
}

function outputSlugsFor(target = {}) {
  return [
    sourceSlugFor(target),
    ...(Array.isArray(target.outputAliases) ? target.outputAliases : []),
  ]
    .map(normalizedSourceSlug)
    .filter(Boolean);
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function readOnlyKey() {
  return (
    serviceRoleKey()
    || process.env.SUPABASE_ANON_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    || ""
  );
}

function clientFromEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = readOnlyKey();
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function loadSourceTargets() {
  const rows = JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"));
  const failures = [];
  const index = new Map();
  const runnableSources = new Map();
  const aliasCount = rows.reduce((total, target) => total + (Array.isArray(target.aliases) ? target.aliases.length : 0), 0);

  rows.forEach((target, rowIndex) => {
    const label = target.brand || `row ${rowIndex + 1}`;
    if (!target.brand) failures.push(`${SOURCE_TARGETS_PATH}: ${label} missing brand`);
    if (!target.sourceOwner) failures.push(`${SOURCE_TARGETS_PATH}: ${label} missing sourceOwner`);
    if (!target.targetUrl || !/^https:\/\//i.test(target.targetUrl)) {
      failures.push(`${SOURCE_TARGETS_PATH}: ${label} targetUrl must be an https URL`);
    }
    if (!SOURCE_PRIORITIES.has(target.sourcePriority)) {
      failures.push(`${SOURCE_TARGETS_PATH}: ${label} has unsupported sourcePriority`);
    }
    if (!COVERAGE_TIERS.has(target.coverageTier)) {
      failures.push(`${SOURCE_TARGETS_PATH}: ${label} has unsupported coverageTier`);
    }
    if (target.aliases && !Array.isArray(target.aliases)) {
      failures.push(`${SOURCE_TARGETS_PATH}: ${label} aliases must be an array`);
    }
    if (target.outputAliases && !Array.isArray(target.outputAliases)) {
      failures.push(`${SOURCE_TARGETS_PATH}: ${label} outputAliases must be an array`);
    }
    if (target.accessStatus && !ACCESS_STATUSES.has(target.accessStatus)) {
      failures.push(`${SOURCE_TARGETS_PATH}: ${label} has unsupported accessStatus`);
    }
    if (target.discovery && !target.sourceSlug) {
      failures.push(`${SOURCE_TARGETS_PATH}: ${label} runnable source target must define sourceSlug`);
    }

    const keys = [target.brand, ...(Array.isArray(target.aliases) ? target.aliases : [])]
      .map(normalizedBrand)
      .filter(Boolean);

    for (const key of keys) {
      if (index.has(key) && index.get(key) !== target) {
        failures.push(`${SOURCE_TARGETS_PATH}: duplicate source target key "${key}"`);
      }
      index.set(key, target);
    }

    if (target.discovery && typeof target.discovery === "object") {
      const sourceSlug = sourceSlugFor(target);
      if (runnableSources.has(sourceSlug)) {
        failures.push(`${SOURCE_TARGETS_PATH}: duplicate runnable sourceSlug "${sourceSlug}" for ${runnableSources.get(sourceSlug)} and ${label}`);
      }
      runnableSources.set(sourceSlug, label);
    }
  });

  for (const requiredKey of REQUIRED_SOURCE_KEYS) {
    if (!index.has(normalizedBrand(requiredKey))) {
      failures.push(`${SOURCE_TARGETS_PATH}: missing required US retail source target or alias for ${requiredKey}`);
    }
  }

  return { rows, index, aliasCount, failures };
}

function hasLocalReport(importRoot, target) {
  return outputSlugsFor(target).some((slug) => (
    fs.existsSync(path.join(importRoot, slug, "report.json"))
    || fs.existsSync(path.join(importRoot, slug, "run-report.json"))
    || fs.existsSync(path.join(importRoot, slug, "sql", "manifest.json"))
  ));
}

async function fetchAllOpenQueueRows(client) {
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("catalog_acquisition_queue")
      .select([
        "brand",
        "gap_type",
        "priority_score",
        "affected_product_count",
        "demand_events",
        "needs_product_record",
        "needs_verified_ingredients",
        "needs_verified_image",
        "needs_pet_type",
        "status",
      ].join(","))
      .eq("status", "open")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

function aggregateQueueRows(rows, sourceTargets) {
  const byBrand = new Map();

  for (const row of rows) {
    const brand = compact(row.brand) || "[blank]";
    const key = normalizedBrand(brand);
    const stats = byBrand.get(key) || {
      brand,
      openRows: 0,
      affectedProducts: 0,
      actionableRows: 0,
      actionableAffectedProducts: 0,
      brandRollupRows: 0,
      brandRollupAffectedProducts: 0,
      demandEvents: 0,
      maxPriority: 0,
      needsProductRecord: false,
      needsVerifiedIngredients: false,
      needsVerifiedImage: false,
      needsPetType: false,
      sourceOwner: sourceTargets.get(key)?.sourceOwner || "",
      sourceTargetUrl: sourceTargets.get(key)?.targetUrl || "",
      coverageTier: sourceTargets.get(key)?.coverageTier || "",
      expectedQueueNoise: EXPECTED_NON_US_GENERIC_OR_NON_COMPLETE_QUEUE_BRANDS.has(key),
    };

    stats.openRows += 1;
    const affectedProductCount = Number(row.affected_product_count || 0);
    stats.affectedProducts += affectedProductCount;
    if (row.gap_type === "brand") {
      stats.brandRollupRows += 1;
      stats.brandRollupAffectedProducts += affectedProductCount;
    } else {
      stats.actionableRows += 1;
      stats.actionableAffectedProducts += affectedProductCount;
    }
    stats.demandEvents += Number(row.demand_events || 0);
    stats.maxPriority = Math.max(stats.maxPriority, Number(row.priority_score || 0));
    stats.needsProductRecord ||= Boolean(row.needs_product_record);
    stats.needsVerifiedIngredients ||= Boolean(row.needs_verified_ingredients);
    stats.needsVerifiedImage ||= Boolean(row.needs_verified_image);
    stats.needsPetType ||= Boolean(row.needs_pet_type);
    byBrand.set(key, stats);
  }

  return [...byBrand.values()].sort((left, right) => (
    right.actionableAffectedProducts - left.actionableAffectedProducts
    || right.affectedProducts - left.affectedProducts
    || right.maxPriority - left.maxPriority
    || left.brand.localeCompare(right.brand)
  ));
}

function summarizeManifest(rows, aliasCount) {
  const tierCounts = rows.reduce((counts, target) => {
    counts[target.coverageTier] = (counts[target.coverageTier] || 0) + 1;
    return counts;
  }, {});
  const accessStatusCounts = rows.reduce((counts, target) => {
    const status = targetAccessStatus(target);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const feedNeededTargets = rows
    .filter((target) => {
      const status = targetAccessStatus(target);
      return status !== "runnable";
    })
    .map((target) => ({
      brand: target.brand,
      sourceOwner: target.sourceOwner,
      status: target.accessStatus || "requires_authorized_feed",
      sourcePriority: target.sourcePriority,
      targetUrl: target.targetUrl,
    }))
    .sort((left, right) => (
      left.status.localeCompare(right.status)
      || left.sourceOwner.localeCompare(right.sourceOwner)
    ));

  return {
    brands: rows.length,
    aliases: aliasCount,
    tier1: tierCounts.tier_1_us_retail || 0,
    tier2: tierCounts.tier_2_us_retail || 0,
    runnable: accessStatusCounts.runnable || 0,
    accessStatusCounts,
    feedNeededTargets,
  };
}

function summarizeLocalReports(rows, importRoot) {
  const runnableTargets = rows.filter((target) => targetAccessStatus(target) === "runnable");
  const missingRunnableReports = runnableTargets
    .filter((target) => !hasLocalReport(importRoot, target))
    .map((target) => ({
      brand: target.brand,
      source: sourceSlugFor(target),
      outputAliases: outputSlugsFor(target).slice(1).join(", "),
      coverageTier: target.coverageTier,
    }));

  return {
    importRoot,
    runnableTargets: runnableTargets.length,
    reportedRunnableTargets: runnableTargets.length - missingRunnableReports.length,
    missingRunnableReports,
  };
}

function printReport({ manifestSummary, localReportSummary, queueSummary, failures, liveSkipped }) {
  console.log("Catalog source targets report");
  console.log(`Manifest brands: ${manifestSummary.brands}`);
  console.log(`Manifest aliases: ${manifestSummary.aliases}`);
  console.log(`Tier 1 US retail brands: ${manifestSummary.tier1}`);
  console.log(`Tier 2 US retail brands: ${manifestSummary.tier2}`);
  console.log(`Runnable source targets: ${manifestSummary.runnable}`);
  console.log(`Runnable source local reports: ${localReportSummary.reportedRunnableTargets}/${localReportSummary.runnableTargets}`);

  console.log("\nSource access status:");
  console.table(Object.entries(manifestSummary.accessStatusCounts).map(([status, count]) => ({ status, count })));

  if (manifestSummary.feedNeededTargets.length > 0) {
    console.log("\nSource targets requiring authorized feed, browser snapshot, shared source, or adapter work:");
    console.table(manifestSummary.feedNeededTargets.slice(0, 30));
  }

  if (localReportSummary.missingRunnableReports.length > 0) {
    console.log("\nRunnable source targets missing local extraction reports:");
    console.table(localReportSummary.missingRunnableReports);
  }

  if (liveSkipped) {
    console.log("\nLive queue: skipped (catalog_acquisition_queue requires SUPABASE_SERVICE_ROLE_KEY or another privileged read key).");
  } else if (queueSummary) {
    console.log("\nLive queue coverage:");
    console.table([{
      openRows: queueSummary.openRows,
      rawAffectedProducts: queueSummary.affectedProducts,
      actionableOpenRows: queueSummary.actionableOpenRows,
      actionableAffectedProducts: queueSummary.actionableAffectedProducts,
      brandRollupRows: queueSummary.brandRollupRows,
      brandRollupAffectedProducts: queueSummary.brandRollupAffectedProducts,
      topBrandsChecked: queueSummary.topBrandsChecked,
      assignedTopBrands: queueSummary.assignedTopBrands,
      unassignedTopBrands: queueSummary.unassignedTopBrands.length,
      auditedLiveBrands: queueSummary.auditedLiveBrands,
      assignedAuditedBrands: queueSummary.assignedAuditedBrands,
      minAffectedProducts: queueSummary.minAffectedProducts,
      unassignedAuditedBrands: queueSummary.unassignedAuditedBrands.length,
      expectedQueueNoise: queueSummary.expectedQueueNoise.length,
    }]);

    if (queueSummary.unassignedTopBrands.length > 0) {
      console.log("\nUnassigned top queue brands:");
      console.table(queueSummary.unassignedTopBrands);
    }

    if (queueSummary.unassignedAuditedBrands.length > 0) {
      console.log("\nUnassigned meaningful live queue brands:");
      console.table(queueSummary.unassignedAuditedBrands);
    }

    if (queueSummary.expectedQueueNoise.length > 0) {
      console.log("\nExpected non-US/generic/non-complete-food queue rows kept out of the US retail source manifest:");
      console.table(queueSummary.expectedQueueNoise);
    }
  }

  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const failure of failures) console.error(`- ${failure}`);
  }
}

async function main() {
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  const minAffectedProducts = positiveInteger(getArg("--min-affected-products"), DEFAULT_MIN_AFFECTED_PRODUCTS);
  const importRoot = compact(getArg("--import-root", DEFAULT_IMPORT_ROOT));
  const json = hasArg("--json");
  const strictLive = hasArg("--strict-live");
  const allowedUnassigned = positiveInteger(getArg("--allow-unassigned-top-brands"), 0);
  const { rows, index, aliasCount, failures } = loadSourceTargets();
  const manifestSummary = summarizeManifest(rows, aliasCount);
  const localReportSummary = summarizeLocalReports(rows, importRoot);
  const client = clientFromEnv();
  let liveSkipped = false;
  let queueSummary = null;

  if (!client) {
    liveSkipped = true;
    if (strictLive) {
      failures.push("strict live source-target audit requires SUPABASE_URL and a read key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)");
    }
  } else {
    let queueRows = [];
    try {
      queueRows = await fetchAllOpenQueueRows(client);
    } catch (error) {
      liveSkipped = true;
      if (strictLive) {
        failures.push(`strict live source-target audit could not read catalog_acquisition_queue: ${error.message || error}`);
      }
    }

    if (liveSkipped) {
      if (json) {
        queueSummary = null;
      }
    } else {
    const brands = aggregateQueueRows(queueRows, index);
    const topBrands = brands.slice(0, limit);
    const auditedBrands = strictLive
      ? brands.filter((brand) => brand.affectedProducts >= minAffectedProducts)
      : topBrands;
    const unassignedTopBrands = topBrands
      .filter((brand) => !brand.sourceOwner && !brand.expectedQueueNoise)
      .map(({ brand, openRows, affectedProducts, maxPriority }) => ({ brand, openRows, affectedProducts, maxPriority }));
    const unassignedAuditedBrands = auditedBrands
      .filter((brand) => !brand.sourceOwner && !brand.expectedQueueNoise)
      .map(({ brand, openRows, affectedProducts, maxPriority }) => ({ brand, openRows, affectedProducts, maxPriority }));
    const expectedQueueNoise = auditedBrands
      .filter((brand) => brand.expectedQueueNoise)
      .map(({ brand, openRows, affectedProducts, maxPriority }) => ({ brand, openRows, affectedProducts, maxPriority }));

    queueSummary = {
      openRows: queueRows.length,
      affectedProducts: queueRows.reduce((sum, row) => sum + Number(row.affected_product_count || 0), 0),
      actionableOpenRows: queueRows.filter((row) => row.gap_type !== "brand").length,
      actionableAffectedProducts: queueRows
        .filter((row) => row.gap_type !== "brand")
        .reduce((sum, row) => sum + Number(row.affected_product_count || 0), 0),
      brandRollupRows: queueRows.filter((row) => row.gap_type === "brand").length,
      brandRollupAffectedProducts: queueRows
        .filter((row) => row.gap_type === "brand")
        .reduce((sum, row) => sum + Number(row.affected_product_count || 0), 0),
      topBrandsChecked: topBrands.length,
      assignedTopBrands: topBrands.filter((brand) => Boolean(brand.sourceOwner)).length,
      unassignedTopBrands,
      auditedLiveBrands: auditedBrands.length,
      assignedAuditedBrands: auditedBrands.filter((brand) => Boolean(brand.sourceOwner)).length,
      minAffectedProducts,
      unassignedAuditedBrands,
      expectedQueueNoise,
    };

    if (strictLive && unassignedAuditedBrands.length > allowedUnassigned) {
      failures.push(`live queue has ${unassignedAuditedBrands.length} unassigned meaningful US retail brand(s) with affected products >= ${minAffectedProducts}; allowed ${allowedUnassigned}`);
    }
    }
  }

  if (json) {
    console.log(JSON.stringify({ manifestSummary, localReportSummary, queueSummary, liveSkipped, failures }, null, 2));
  } else {
    printReport({ manifestSummary, localReportSummary, queueSummary, failures, liveSkipped });
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
