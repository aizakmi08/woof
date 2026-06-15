#!/usr/bin/env node
/**
 * seed-brand-metadata.js — Hand-curated brand_metadata for the top ~40 pet
 * food brands in the app's database. Same pattern as seed-brand-recalls.js:
 * reliable day-1 authoritative data, ScrapingBee enrichment fills the rest.
 *
 * Data points come from each brand's public quality pages, About sections,
 * AAFCO-feed-trial disclosures, and industry databases. Where a brand spans
 * multiple processing methods (Orijen kibble + Orijen freeze-dried treats),
 * processing_methods lists all and primary_processing picks the one users are
 * most likely to encounter.
 *
 * Usage:
 *   node scripts/seed-brand-metadata.js            # upsert
 *   node scripts/seed-brand-metadata.js --dry-run  # preview
 *
 * Env: SUPABASE_SERVICE_ROLE_KEY (required for write)
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

// ── Curated brand dataset ────────────────────────────────────────────
// Fields:
//   brand_display         — canonical name
//   processing_methods    — all known methods (array)
//   primary_processing    — dominant one
//   testing_transparency  — high | moderate | low | unknown
//   testing_details       — short human-readable summary
//   certifications        — list of relevant certifications
//   third_party_tested    — true if the brand explicitly discloses 3rd-party testing
//   country_of_manufacture
//   owns_facility         — true = own manufacturing; false = co-packed
//   website_url

const BRANDS = [
  // ── Top-tier transparent brands (high testing, single-processing, own facility)
  {
    brand_display: "Orijen",
    processing_methods: ["extruded", "freeze-dried"],
    primary_processing: "extruded",
    testing_transparency: "high",
    testing_details: "Champion Petfoods publishes DogRisk and third-party lab test results. SQF Food Safety Certified at Level 3.",
    certifications: ["SQF Level 3", "HACCP"],
    third_party_tested: true,
    country_of_manufacture: "USA/Canada",
    owns_facility: true,
    website_url: "https://www.orijenpetfoods.com",
  },
  {
    brand_display: "Acana",
    processing_methods: ["extruded"],
    primary_processing: "extruded",
    testing_transparency: "high",
    testing_details: "Same parent (Champion Petfoods) and kitchens as Orijen. Third-party lab testing, SQF-certified.",
    certifications: ["SQF Level 3", "HACCP"],
    third_party_tested: true,
    country_of_manufacture: "USA/Canada",
    owns_facility: true,
    website_url: "https://www.acanapetfoods.com",
  },
  {
    brand_display: "Stella & Chewy's",
    processing_methods: ["freeze-dried", "raw", "canned", "extruded"],
    primary_processing: "freeze-dried",
    testing_transparency: "high",
    testing_details: "High-pressure processing (HPP) disclosed for raw lines. SQF-certified facility. Publishes batch testing.",
    certifications: ["SQF", "HPP-processed"],
    third_party_tested: true,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.stellaandchewys.com",
  },
  {
    brand_display: "Open Farm",
    processing_methods: ["extruded", "freeze-dried", "air-dried"],
    primary_processing: "extruded",
    testing_transparency: "high",
    testing_details: "Certified Humane & Global Animal Partnership sourcing. TRU Traceability — every ingredient traceable via lot code. SQF-certified.",
    certifications: ["SQF", "Certified Humane", "Ocean Wise"],
    third_party_tested: true,
    country_of_manufacture: "Canada",
    owns_facility: false,
    website_url: "https://www.openfarmpet.com",
  },
  {
    brand_display: "Fromm",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "Family-owned, 5 generations. AAFCO feed-trial testing disclosed. Less public testing transparency than Champion Petfoods but strong track record.",
    certifications: ["AAFCO feed trials"],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://frommfamily.com",
  },
  {
    brand_display: "Farmina",
    processing_methods: ["extruded"],
    primary_processing: "extruded",
    testing_transparency: "high",
    testing_details: "Vacuum-processing technology, low-oxidation. Full nutrient panels published on website. ISO 9001 certified.",
    certifications: ["ISO 9001", "ISO 22000"],
    third_party_tested: true,
    country_of_manufacture: "Italy/Serbia",
    owns_facility: true,
    website_url: "https://www.farmina.com",
  },
  {
    brand_display: "Ziwi Peak",
    processing_methods: ["air-dried", "canned"],
    primary_processing: "air-dried",
    testing_transparency: "high",
    testing_details: "New Zealand free-range, grass-fed sourcing. Proprietary slow air-drying (vs. cheap dehydration). MPI-audited.",
    certifications: ["MPI (NZ) audited"],
    third_party_tested: true,
    country_of_manufacture: "New Zealand",
    owns_facility: true,
    website_url: "https://ziwipets.com",
  },
  {
    brand_display: "The Honest Kitchen",
    processing_methods: ["air-dried"],
    primary_processing: "air-dried",
    testing_transparency: "high",
    testing_details: "Human-grade manufacturing (the only pet food brand to achieve this FDA standard). Dehydrated at low temps.",
    certifications: ["Human-Grade (FDA)", "SQF"],
    third_party_tested: true,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.thehonestkitchen.com",
  },
  {
    brand_display: "Primal",
    processing_methods: ["freeze-dried", "raw"],
    primary_processing: "freeze-dried",
    testing_transparency: "moderate",
    testing_details: "HPP processing on raw lines since 2018. Has had 1 minor listeria recall (2019). Some batch testing disclosed.",
    certifications: ["HPP-processed"],
    third_party_tested: true,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://primalpetfoods.com",
  },

  // ── Mid-tier mainstream (extruded kibble, moderate-to-low transparency)
  {
    brand_display: "Blue Buffalo",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "Owned by General Mills. Claims 'cold-formed' LifeSource Bits. Limited public testing documentation. Multiple recalls 2015-2017.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://bluebuffalo.com",
  },
  {
    brand_display: "Merrick",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "Owned by Nestlé Purina. USA-sourced ingredients. Minor salmonella recall 2011.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.merrickpetcare.com",
  },
  {
    brand_display: "Wellness",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "WellPet LLC. Multiple AAFCO-feed-trial tested formulas. Limited public 3rd-party testing info.",
    certifications: ["AAFCO feed trials"],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.wellnesspetfood.com",
  },
  {
    brand_display: "Wellness CORE",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "High-protein line from WellPet LLC. Grain-free and grain-inclusive formulas.",
    certifications: ["AAFCO feed trials"],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.wellnesspetfood.com/core",
  },
  {
    brand_display: "Nutro",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Owned by Mars Petcare. Non-GMO claim on some lines. Limited public testing disclosure.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.nutro.com",
  },
  {
    brand_display: "Natural Balance",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "L.I.D. (Limited Ingredient Diet) lines popular for allergies. 2 salmonella recalls (2010, 2012 — both co-packer-driven).",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.naturalbalanceinc.com",
  },
  {
    brand_display: "Canidae",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "Family-owned. Sun Valley, CA kitchen. Pure line is grain-free limited-ingredient.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.canidae.com",
  },
  {
    brand_display: "Taste of the Wild",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Made by Diamond Pet Foods. Inherited Diamond's 2012 salmonella recall cross-brand impact. Grain-free focus.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.tasteofthewildpetfood.com",
  },
  {
    brand_display: "Victor",
    processing_methods: ["extruded"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Mid Am Pet Food. Working-breed focus. Minor recalls flagged 2020-2021 aflatoxin adjacent to Midwestern events.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://victorpetfood.com",
  },
  {
    brand_display: "Diamond",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Co-packer for many brands. Responsible for 2012 major salmonella recall that affected dozens of brands.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://diamondpet.com",
  },
  {
    brand_display: "Diamond Naturals",
    processing_methods: ["extruded"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Budget natural line from Diamond Pet Foods. Same facility history as Diamond / Taste of the Wild.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.diamondpet.com/naturals",
  },
  {
    brand_display: "Kirkland Signature",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Costco's private label, manufactured by Diamond Pet Foods. Inherited 2012 Diamond recall.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.costco.com",
  },

  // ── Large-company mainstream (Purina, Hill's, RC, etc.)
  {
    brand_display: "Purina Pro Plan",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "Nestlé Purina. Extensive AAFCO feed-trial testing. Owns manufacturing. Prescription-adjacent via Purina Veterinary Diets.",
    certifications: ["AAFCO feed trials"],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.purinaproplan.com",
  },
  {
    brand_display: "Purina ONE",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "Nestlé Purina. Mass-market line. AAFCO feed trials but limited 3rd-party testing disclosure.",
    certifications: ["AAFCO feed trials"],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.purinaone.com",
  },
  {
    brand_display: "Purina Beneful",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Nestlé Purina mass-market line. Contains artificial colors and preservatives.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.beneful.com",
  },
  {
    brand_display: "Beneful",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "See Purina Beneful.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.beneful.com",
  },
  {
    brand_display: "Hill's Science Diet",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "Hill's Pet Nutrition (Colgate-Palmolive). Vet-recommended. Major 2019 vitamin D recall. Extensive AAFCO feed trials.",
    certifications: ["AAFCO feed trials"],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.hillspet.com",
  },
  {
    brand_display: "Hills Science Diet",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "See Hill's Science Diet.",
    certifications: ["AAFCO feed trials"],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.hillspet.com",
  },
  {
    brand_display: "Royal Canin",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "moderate",
    testing_details: "Mars Petcare. Breed-specific and prescription lines. AAFCO feed trials. Owns manufacturing.",
    certifications: ["AAFCO feed trials"],
    third_party_tested: false,
    country_of_manufacture: "USA/France",
    owns_facility: true,
    website_url: "https://www.royalcanin.com",
  },
  {
    brand_display: "Iams",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Mars Petcare (formerly P&G). Mass-market mainstream kibble.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.iams.com",
  },
  {
    brand_display: "Eukanuba",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Mars Petcare. Premium-priced mainstream kibble. Same manufacturing as Iams.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.eukanuba.com",
  },
  {
    brand_display: "Pedigree",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Mars Petcare. Budget mainstream. Contains artificial flavors and by-product meals.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.pedigree.com",
  },
  {
    brand_display: "Cesar",
    processing_methods: ["canned"],
    primary_processing: "canned",
    testing_transparency: "low",
    testing_details: "Mars Petcare. Wet food targeted at small dogs. High gravy/broth content.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.cesar.com",
  },

  // ── Budget/lower-tier (extruded with artificial ingredients, low transparency)
  {
    brand_display: "Ol' Roy",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Walmart private label. Budget tier with BHA preservatives and artificial colors. Pentobarbital cross-brand event in 2018 (Smucker co-packer).",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.walmart.com",
  },
  {
    brand_display: "Ol Roy",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "See Ol' Roy.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.walmart.com",
  },
  {
    brand_display: "Kibbles 'N Bits",
    processing_methods: ["extruded"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Big Heart Pet Foods (Smucker). Budget mainstream with artificial colors. 2018 pentobarbital cross-brand recall.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.kibblesnbits.com",
  },
  {
    brand_display: "Gravy Train",
    processing_methods: ["canned"],
    primary_processing: "canned",
    testing_transparency: "low",
    testing_details: "Big Heart Pet Foods (Smucker). 2018 pentobarbital cross-brand recall.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.gravytrain.com",
  },
  {
    brand_display: "Alpo",
    processing_methods: ["canned", "extruded"],
    primary_processing: "canned",
    testing_transparency: "low",
    testing_details: "Nestlé Purina budget wet-food line.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.alpo.com",
  },
  {
    brand_display: "Rachael Ray Nutrish",
    processing_methods: ["extruded", "canned"],
    primary_processing: "extruded",
    testing_transparency: "low",
    testing_details: "Ainsworth Pet Nutrition (Smucker). 'Real' first-ingredient claims mixed with by-products downstream.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.nutrish.com",
  },

  // ── Cat-specific brands
  {
    brand_display: "Fancy Feast",
    processing_methods: ["canned"],
    primary_processing: "canned",
    testing_transparency: "low",
    testing_details: "Nestlé Purina premium cat food wet line. Gourmet / Classic Paté popular among cat owners.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.fancyfeast.com",
  },
  {
    brand_display: "Friskies",
    processing_methods: ["canned", "extruded"],
    primary_processing: "canned",
    testing_transparency: "low",
    testing_details: "Nestlé Purina budget cat-food line.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.friskies.com",
  },
  {
    brand_display: "Sheba",
    processing_methods: ["canned"],
    primary_processing: "canned",
    testing_transparency: "low",
    testing_details: "Mars Petcare cat wet-food line.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.sheba.com",
  },
  {
    brand_display: "Tiki Cat",
    processing_methods: ["canned"],
    primary_processing: "canned",
    testing_transparency: "moderate",
    testing_details: "Whole-protein focus. Human-grade ingredient claims on some lines.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "Thailand",
    owns_facility: false,
    website_url: "https://tikipets.com",
  },
  {
    brand_display: "Weruva",
    processing_methods: ["canned"],
    primary_processing: "canned",
    testing_transparency: "moderate",
    testing_details: "BPA-free lined cans. Human-grade ingredient claims. Manufactured in Thailand.",
    certifications: ["BPA-free cans"],
    third_party_tested: false,
    country_of_manufacture: "Thailand",
    owns_facility: false,
    website_url: "https://weruva.com",
  },

  // ── DTC / fresh
  {
    brand_display: "The Farmer's Dog",
    processing_methods: ["baked"],
    primary_processing: "baked",
    testing_transparency: "moderate",
    testing_details: "Gently-cooked fresh food, DTC subscription. Human-grade facility. Vet-formulated recipes.",
    certifications: ["Human-Grade (FDA)"],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.thefarmersdog.com",
  },
  {
    brand_display: "Ollie",
    processing_methods: ["baked"],
    primary_processing: "baked",
    testing_transparency: "moderate",
    testing_details: "Gently-cooked fresh food, DTC subscription. Human-grade facility.",
    certifications: ["Human-Grade (FDA)"],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: false,
    website_url: "https://www.myollie.com",
  },
  {
    brand_display: "Just Food For Dogs",
    processing_methods: ["baked"],
    primary_processing: "baked",
    testing_transparency: "high",
    testing_details: "Retail kitchens open to the public. Published feeding trials and digestibility studies. Human-grade.",
    certifications: ["Human-Grade (FDA)", "Published feeding trials"],
    third_party_tested: true,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://www.justfoodfordogs.com",
  },
  {
    brand_display: "Freshpet",
    processing_methods: ["baked"],
    primary_processing: "baked",
    testing_transparency: "moderate",
    testing_details: "Refrigerated fresh food sold in retail. Manufactures own product in Bethlehem PA kitchens.",
    certifications: [],
    third_party_tested: false,
    country_of_manufacture: "USA",
    owns_facility: true,
    website_url: "https://freshpet.com",
  },
];

// ── Upsert ───────────────────────────────────────────────────────────

async function upsert(b) {
  const body = {
    brand_normalized: normalizeBrand(b.brand_display),
    brand_display: b.brand_display,
    processing_methods: b.processing_methods,
    primary_processing: b.primary_processing,
    testing_transparency: b.testing_transparency,
    testing_details: b.testing_details,
    certifications: b.certifications,
    third_party_tested: b.third_party_tested,
    country_of_manufacture: b.country_of_manufacture,
    owns_facility: b.owns_facility,
    website_url: b.website_url,
    source: "seed",
    confidence: 0.95,
    last_scraped_at: new Date().toISOString(),
  };

  if (DRY_RUN) return { dry: true, body };

  const url = `${SB_URL}/rest/v1/brand_metadata?on_conflict=brand_normalized`;
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

  console.log(`\nSeeding ${BRANDS.length} brand metadata records${DRY_RUN ? " (DRY RUN)" : ""}...\n`);
  let ok = 0, err = 0;
  const errors = [];
  for (const b of BRANDS) {
    const res = await upsert(b);
    if (res.ok || res.dry) {
      ok++;
      const certs = b.certifications.length ? `[${b.certifications.slice(0, 2).join(", ")}]` : "";
      console.log(`  ✓ ${b.brand_display.padEnd(26)}  ${b.primary_processing.padEnd(12)} ${b.testing_transparency.padEnd(8)} ${certs}`);
    } else {
      err++;
      errors.push(`${b.brand_display}: ${res.error}`);
      console.log(`  ✗ ${b.brand_display}: ${res.error}`);
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
