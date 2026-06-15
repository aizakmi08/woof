#!/usr/bin/env node
/**
 * Mega-Scraper — Build a complete pet food ingredient database.
 *
 * Runs all phases in sequence to populate the database with
 * every US pet food product and pre-compute analysis results.
 *
 * Phases:
 *   1. OPFF Import    — Free API bulk import (thousands of products)
 *   2. Catalog Scrape — DogFoodAdvisor + Chewy + brand sites
 *   3. Gap Fill       — Google search for missing/incomplete products
 *   4. Pre-Analyze    — Run Claude analysis on all products
 *
 * Usage:
 *   node scripts/mega-scraper/run.js                    # Run all phases
 *   node scripts/mega-scraper/run.js --phase=1          # OPFF only
 *   node scripts/mega-scraper/run.js --phase=2          # Catalogs only
 *   node scripts/mega-scraper/run.js --phase=2 --source=dfa   # DFA only
 *   node scripts/mega-scraper/run.js --phase=3          # Gap fill only
 *   node scripts/mega-scraper/run.js --phase=3 --discover     # Gap fill + discovery
 *   node scripts/mega-scraper/run.js --phase=4          # Analysis only
 *   node scripts/mega-scraper/run.js --phase=4 --batch=50     # Analyze 50 products
 *   node scripts/mega-scraper/run.js --status           # Show DB stats
 */

const { dbGetAll, dbGetCount, log } = require("./lib");
const { execSync } = require("child_process");
const path = require("path");

async function showStatus() {
  const all = await dbGetAll();
  const total = all.length;
  const bySource = {};
  let complete = 0, partial = 0;

  for (const p of all) {
    bySource[p.source] = (bySource[p.source] || 0) + 1;
    if (p.ingredient_count >= 20) complete++;
    else partial++;
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log("  DATABASE STATUS");
  console.log("══════════════════════════════════════════════════");
  console.log(`Total products:     ${total}`);
  console.log(`Complete (≥20):     ${complete} (${Math.round(complete / total * 100)}%)`);
  console.log(`Partial (<20):      ${partial}`);
  console.log(`Avg ingredients:    ${Math.round(all.reduce((s, p) => s + p.ingredient_count, 0) / total)}`);
  console.log("");
  console.log("By source:");
  Object.entries(bySource).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => {
    console.log(`  ${s.padEnd(20)} ${c}`);
  });
}

function runPhase(script, args = []) {
  const fullPath = path.join(__dirname, script);
  const cmd = `node "${fullPath}" ${args.join(" ")}`;
  console.log(`\n>>> Running: ${cmd}\n`);
  try {
    execSync(cmd, { stdio: "inherit", timeout: 3600000 }); // 1hr timeout
  } catch (err) {
    console.error(`Phase failed: ${err.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--status")) {
    await showStatus();
    return;
  }

  const phaseArg = args.find(a => a.startsWith("--phase="));
  const phase = phaseArg ? parseInt(phaseArg.split("=")[1]) : 0;
  const passthrough = args.filter(a => !a.startsWith("--phase="));

  console.log("══════════════════════════════════════════════════");
  console.log("  🐾 MEGA-SCRAPER — PET FOOD DATABASE BUILDER");
  console.log("══════════════════════════════════════════════════");

  await showStatus();

  if (phase === 0 || phase === 1) {
    runPhase("phase1-opff.js");
  }

  if (phase === 0 || phase === 2) {
    runPhase("phase2-catalog.js", passthrough);
  }

  if (phase === 0 || phase === 3) {
    runPhase("phase3-gaps.js", passthrough);
  }

  if (phase === 0 || phase === 4) {
    runPhase("phase4-analyze.js", passthrough);
  }

  console.log("\n");
  await showStatus();
}

main().catch(console.error);
