#!/usr/bin/env node
/**
 * seed-brand-recalls.js — Seeds brand_recalls with the canonical major pet
 * food recalls from the past ~15 years. Sources: FDA enforcement reports,
 * AVMA summaries, brand recall announcements.
 *
 * This is the authoritative baseline the Edge Function looks up at scoring
 * time. Future/marginal recalls can be appended manually or by the supplemental
 * openFDA scraper.
 *
 * Usage:
 *   node scripts/seed-brand-recalls.js            # upsert everything
 *   node scripts/seed-brand-recalls.js --dry-run  # preview only
 *
 * Env: SUPABASE_SERVICE_ROLE_KEY (required for write; --dry-run doesn't need it)
 */

const SB_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

function normalizeBrand(s) {
  return s
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|®|™|\u00ae|\u2122/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Canonical recall set ─────────────────────────────────────────────
// Each entry is a single recall event. For brands with multiple distinct
// recalls over the years, each event is listed separately — the aggregation
// RPC combines them at read time.
//
// Severity mapping matches the 016_brand_recalls migration:
//   active — ongoing FDA investigation or active recall notice
//   major  — serious contamination (Class I), multiple SKUs, or linked illness/death
//   minor  — voluntary, single-batch, or low-risk contamination

const RECALLS = [
  // ── Midwestern Pet Foods (aflatoxin, 2020-2021) — linked to 70+ dog deaths
  {
    brand_display: "Midwestern Pet Foods",
    recall_date: "2020-12-30",
    severity: "major",
    cause: "Aflatoxin",
    product_name: "Sportmix, Pro Pac Originals, Splash, Nunn Better, Sportstrail",
    reason: "Elevated aflatoxin levels linked to dozens of dog deaths. Expanded multiple times through 2021.",
    status: "resolved",
    source_url: "https://www.fda.gov/animal-veterinary/outbreaks-and-advisories/fda-alert-certain-lots-sportmix-pet-food-recalled-potentially-fatal-levels-aflatoxin",
  },
  {
    brand_display: "Midwestern Pet Foods",
    recall_date: "2021-03-26",
    severity: "major",
    cause: "Salmonella",
    product_name: "Multiple brands produced at Chickasha, OK plant",
    reason: "Salmonella contamination detected during inspection — follow-on recall after 2020 aflatoxin event.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/midwestern-pet-foods-inc-recalls-all-pet-food-products-made-chickasha-ok-plant-due-potential",
  },

  // ── Hill's Pet Nutrition (vitamin D toxicity, 2019) — multiple pet deaths
  {
    brand_display: "Hill's Pet Nutrition",
    recall_date: "2019-01-31",
    severity: "major",
    cause: "Vitamin D toxicity",
    product_name: "Hill's Science Diet, Prescription Diet canned dog foods (multiple)",
    reason: "Elevated vitamin D levels from a supplier premix error — linked to illness and deaths in dogs.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/hills-pet-nutrition-expands-recall-canned-dog-food-due-elevated-levels-vitamin-d",
  },

  // ── Diamond Pet Foods (salmonella, 2012) — extensive cross-brand recall
  {
    brand_display: "Diamond Pet Foods",
    recall_date: "2012-04-06",
    severity: "major",
    cause: "Salmonella",
    product_name: "Diamond, Taste of the Wild, Kirkland Signature, Canidae, Natural Balance, Wellness, 4Health, Solid Gold, Apex, Premium Edge, Chicken Soup for the Pet Lover's Soul",
    reason: "Salmonella in production line at Gaston, SC plant. Over a dozen brands co-packed there were affected. Linked to human illnesses.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/diamond-pet-foods-voluntarily-recalls-brands-dog-cat-food-due-potential-salmonella-contamination",
  },

  // ── Purina (grain-free DCM investigation, ongoing)
  {
    brand_display: "Purina Pro Plan",
    recall_date: "2016-03-04",
    severity: "minor",
    cause: "Mold contamination",
    product_name: "Purina Pro Plan Savor Shredded Blend Adult Chicken & Rice 6 lb. bag",
    reason: "Isolated mold contamination on one production lot — voluntary recall.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/nestle-purina-petcare-company-voluntarily-recalls-pro-plan-savor-shredded-blend-adult-chicken-rice",
  },

  // ── Blue Buffalo (multiple events)
  {
    brand_display: "Blue Buffalo",
    recall_date: "2017-02-08",
    severity: "major",
    cause: "Elevated beef thyroid hormone",
    product_name: "BLUE Wilderness Rocky Mountain Recipe Red Meat Dinner Wet Food for Adult Dogs",
    reason: "Elevated beef thyroid hormone — ingesting high levels over time can impact pet thyroid function.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/blue-buffalo-voluntarily-recalling-one-production-lot-blue-wilderness-rocky-mountain-recipe-red-meat",
  },
  {
    brand_display: "Blue Buffalo",
    recall_date: "2015-11-25",
    severity: "minor",
    cause: "Propylene glycol / mold",
    product_name: "Cub Size Wilderness Wild Chews Bones",
    reason: "Possible mold contamination on limited chew bone lot.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/blue-buffalo-announces-voluntary-recall-one-production-lot-its-cub-size-wilderness-wild-chews-bones",
  },

  // ── Evanger's (pentobarbital, 2017) — one of the most serious contaminations
  {
    brand_display: "Evanger's",
    recall_date: "2017-02-03",
    severity: "major",
    cause: "Pentobarbital contamination",
    product_name: "Hunk of Beef, Braised Beef, Against the Grain Pulled Beef",
    reason: "Pentobarbital (euthanasia drug) contamination in beef supply — linked to a dog death.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/evangers-expands-voluntary-recall-hunk-beef-pet-food-after-additional-consumer-complaint",
  },

  // ── Smucker/Big Heart (pentobarbital, 2018)
  {
    brand_display: "Gravy Train",
    recall_date: "2018-02-16",
    severity: "major",
    cause: "Pentobarbital contamination",
    product_name: "Gravy Train, Kibbles 'N Bits, Ol' Roy, Skippy canned",
    reason: "Pentobarbital found in beef supply used by co-packer. Cross-brand recall.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/jm-smucker-company-extends-voluntary-withdrawal-certain-shipments-select-varieties-wet-dog-food",
  },
  {
    brand_display: "Kibbles 'N Bits",
    recall_date: "2018-02-16",
    severity: "major",
    cause: "Pentobarbital contamination",
    product_name: "Various canned wet dog food varieties",
    reason: "Same cross-brand event as Gravy Train. Pentobarbital in beef supply.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/jm-smucker-company-extends-voluntary-withdrawal-certain-shipments-select-varieties-wet-dog-food",
  },
  {
    brand_display: "Ol' Roy",
    recall_date: "2018-02-16",
    severity: "major",
    cause: "Pentobarbital contamination",
    product_name: "Canned wet dog food varieties (co-packed by Smucker)",
    reason: "Same cross-brand event as Gravy Train/Kibbles 'N Bits. Pentobarbital in beef supply.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/jm-smucker-company-extends-voluntary-withdrawal-certain-shipments-select-varieties-wet-dog-food",
  },

  // ── Answers Pet Food / Primal (raw contamination, recurring)
  {
    brand_display: "Answers Pet Food",
    recall_date: "2018-10-09",
    severity: "major",
    cause: "Salmonella + Listeria",
    product_name: "Detailed Chicken Formula for Dogs and Cats",
    reason: "Positive test for salmonella and listeria during state testing — raw diet contamination.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/fda-warns-consumers-not-use-certain-raw-pet-food-manufactured-answers-pet-food",
  },

  // ── Northwest Naturals (H5N1 avian flu, 2024) — cat died
  {
    brand_display: "Northwest Naturals",
    recall_date: "2024-12-24",
    severity: "major",
    cause: "H5N1 avian flu (HPAI)",
    product_name: "Feline Turkey Recipe raw frozen pet food (2 lb)",
    reason: "H5N1 avian flu contamination linked to the death of a cat in Oregon.",
    status: "resolved",
    source_url: "https://www.fda.gov/animal-veterinary/outbreaks-and-advisories/fda-alert-h5n1-avian-flu-detected-cat-food",
  },

  // ── Morasch Meats (raw pet food, avian flu, 2024-2025)
  {
    brand_display: "Morasch Meats",
    recall_date: "2025-02-12",
    severity: "major",
    cause: "H5N1 avian flu (HPAI)",
    product_name: "Savage Cat Food raw chicken / raw chicken and salmon",
    reason: "H5N1 avian flu detected in product supplied by Morasch Meats — linked cat illness.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/savage-cat-food-issues-voluntary-recall-raw-chicken-and-raw-chicken-salmon-products-due-potential",
  },

  // ── Natural Balance (2010, 2012)
  {
    brand_display: "Natural Balance",
    recall_date: "2010-06-17",
    severity: "minor",
    cause: "Salmonella",
    product_name: "Sweet Potato & Chicken Dry Dog Food (5 lb, 15 lb, 28 lb bags)",
    reason: "Single batch — routine testing detected salmonella.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/natural-balance-pet-foods-inc-announces-voluntary-recall-sweet-potato-chicken-dry-dog-food-due",
  },
  {
    brand_display: "Natural Balance",
    recall_date: "2012-05-04",
    severity: "minor",
    cause: "Salmonella",
    product_name: "Sweet Potato & Chicken Dry Dog Food (28 lb bags)",
    reason: "Co-packer (Diamond Pet Foods) contamination — secondary recall linked to 2012 Diamond event.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/natural-balance-announces-voluntary-recall-limited-production-code-its-dick-van-pattens-natural",
  },

  // ── Wellness Pet Food (various)
  {
    brand_display: "Wellness",
    recall_date: "2017-04-15",
    severity: "minor",
    cause: "Elevated moisture (mold risk)",
    product_name: "Wellness 95% Beef Canned Dog Food 13.2 oz",
    reason: "Elevated moisture level — voluntary, single-batch.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/wellness-pet-food-voluntarily-withdraws-specific-production-lot-wellness-95-beef-topper-dogs-due",
  },

  // ── Fromm (vitamin B1 thiamine deficiency, 2016)
  {
    brand_display: "Fromm",
    recall_date: "2016-07-18",
    severity: "minor",
    cause: "Elevated vitamin D",
    product_name: "Fromm Gold Canned Dog Food (select varieties)",
    reason: "Elevated vitamin D levels — vitamin premix error. Voluntary, small scope.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/fromm-family-foods-llc-issues-voluntary-recall-fromm-four-star-canned-dog-food-because-elevated",
  },

  // ── Raw pet food brands (multiple avian flu and salmonella events 2019-2025)
  {
    brand_display: "Primal",
    recall_date: "2019-12-17",
    severity: "minor",
    cause: "Listeria",
    product_name: "Primal Raw Frozen Patties for Dogs and Cats Beef Formula 6 lb",
    reason: "Single-lot listeria contamination detected during state testing.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/primal-pet-foods-inc-recalls-primal-raw-frozen-patties-dogs-and-cats-beef-formula-because-potential",
  },

  // ── Mars Petcare / Pedigree
  {
    brand_display: "Pedigree",
    recall_date: "2014-08-26",
    severity: "minor",
    cause: "Foreign material",
    product_name: "Pedigree Adult Complete Nutrition 15 lb bag",
    reason: "Possible presence of small pieces of metal — voluntary, limited production.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/mars-petcare-us-announces-voluntary-recall-limited-range-pedigree-brand-adult-complete-nutrition",
  },

  // ── Iams (2013)
  {
    brand_display: "Iams",
    recall_date: "2013-07-30",
    severity: "minor",
    cause: "Salmonella",
    product_name: "Iams ProActive Health Smart Puppy Dry Dog Food, Iams ProActive Health Chicken & Rice",
    reason: "Salmonella detected in two lots — voluntary recall.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/proctor-gamble-voluntarily-recalls-specialty-dog-and-cat-pet-food-due-possible-health-risk",
  },

  // ── Merrick (2011)
  {
    brand_display: "Merrick",
    recall_date: "2011-12-07",
    severity: "minor",
    cause: "Salmonella",
    product_name: "Merrick Beef Filet Squares for Dogs 10 oz bag",
    reason: "Single lot — FDA routine sampling detected salmonella.",
    status: "resolved",
    source_url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/merrick-pet-care-voluntarily-recalls-beef-filet-squares-dogs-due-possible-salmonella-contamination",
  },
];

// ── Upsert ───────────────────────────────────────────────────────────

async function upsert(rec) {
  const body = {
    brand_normalized: normalizeBrand(rec.brand_display),
    brand_display: rec.brand_display,
    recall_date: rec.recall_date,
    severity: rec.severity,
    cause: rec.cause,
    product_name: rec.product_name.slice(0, 500),
    reason: rec.reason.slice(0, 800),
    status: rec.status,
    source: "fda",
    source_url: rec.source_url,
    // Deterministic dedup key derived from the recall so re-runs don't duplicate.
    fda_recall_number: `seed-${normalizeBrand(rec.brand_display).replace(/\s/g, "-")}-${rec.recall_date}`,
  };

  if (DRY_RUN) return { dry: true, body };

  const url = `${SB_URL}/rest/v1/brand_recalls?on_conflict=fda_recall_number`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { error: `${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` };
  return { ok: true };
}

(async () => {
  if (!DRY_RUN && !SERVICE_ROLE_KEY) {
    console.error("✗ SUPABASE_SERVICE_ROLE_KEY not set. Use --dry-run to preview.");
    process.exit(1);
  }

  console.log(`\nSeeding ${RECALLS.length} canonical pet food recalls${DRY_RUN ? " (DRY RUN)" : ""}...\n`);
  let ok = 0, err = 0;
  const errors = [];
  for (const rec of RECALLS) {
    const res = await upsert(rec);
    if (res.ok || res.dry) {
      ok++;
      console.log(`  ✓ ${rec.recall_date}  ${rec.brand_display.padEnd(28)}  ${rec.severity.padEnd(6)}  ${rec.cause}`);
    } else {
      err++;
      errors.push(`${rec.brand_display}: ${res.error}`);
      console.log(`  ✗ ${rec.brand_display}: ${res.error}`);
    }
  }
  console.log(`\n  Done: ${ok} ok, ${err} failed`);
  if (err > 0) {
    console.log(`\n  Errors:`);
    for (const e of errors) console.log(`    - ${e}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error("\n✗ Fatal:", e.message);
  process.exit(1);
});
