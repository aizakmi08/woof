import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const checker = require("license-checker-rseidelsohn");

function collectLicenses() {
  return new Promise((resolve, reject) => {
    checker.init({
      start: process.cwd(),
      production: true,
    }, (error, packages) => {
      if (error) reject(error);
      else resolve(packages || {});
    });
  });
}

function licenseText(info = {}) {
  return (Array.isArray(info.licenses) ? info.licenses.join(" OR ") : String(info.licenses || ""))
    .replace(/\*+$/g, "")
    .trim();
}

function hasOnlyStrongCopyleftChoice(license) {
  if (!/\b(?:A?GPL|SSPL)(?:-|\b)/i.test(license)) return false;
  const alternatives = license
    .replace(/[()]/g, "")
    .split(/\s+OR\s+/i)
    .map((value) => value.trim());
  return alternatives.every((value) => /\b(?:A?GPL|SSPL)(?:-|\b)/i.test(value));
}

const packages = await collectLicenses();
const findings = Object.entries(packages)
  .filter(([, info]) => info.private !== true)
  .flatMap(([name, info]) => {
    const license = licenseText(info);
    if (!license || /^(?:UNKNOWN|UNLICENSED)$/i.test(license)) {
      return [`${name}: ${license || "missing"}`];
    }
    if (hasOnlyStrongCopyleftChoice(license)) return [`${name}: ${license}`];
    return [];
  });

if (findings.length > 0) {
  throw new Error(`Production dependency license review failed:\n${findings.join("\n")}`);
}

const counts = new Map();
Object.values(packages).forEach((info) => {
  if (info.private === true) return;
  const license = licenseText(info);
  counts.set(license, (counts.get(license) || 0) + 1);
});
console.log(`Production dependency license check passed (${Object.keys(packages).length - 1} packages, ${counts.size} license expressions).`);
