import fs from "node:fs";
import path from "node:path";

const ROOTS = [
  "docs",
  "screens",
  "services",
  "supabase/functions",
];

const FILES = [
  "app.config.js",
  "app.json",
  "legal.js",
  "store.config.json",
];

const EXTENSIONS = new Set([".html", ".js", ".json", ".ts"]);

const BLOCKED_PATTERNS = [
  {
    label: "DogFoodAdvisor source claim",
    regex: /\bDogFoodAdvisor\b/i,
  },
  {
    label: "CatFoodAdvisor source claim",
    regex: /\bCatFoodAdvisor\b/i,
  },
  {
    label: "customer review claim",
    regex: /\bcustomer reviews?\b|\breview summaries\b|\breal reviews?\b|\bverified reviews?\b/i,
  },
  {
    label: "recall claim",
    regex: /\brecall alerts?\b|\brecall history\b/i,
  },
  {
    label: "veterinary approval claim",
    regex: /\bveterinary approved\b|\bvet approved\b/i,
  },
  {
    label: "guaranteed safety claim",
    regex: /\bguaranteed safe\b|\bguaranteed safety\b/i,
  },
  {
    label: "medical diagnosis claim",
    regex: /\bmedical diagnosis\b|\bmedical diagnoses\b/i,
  },
];

const failures = [];

function walk(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function lineAllowed(line, previousLine) {
  const combined = `${previousLine}\n${line}`;

  return (
    /BLOCKED_REMOTE_COPY_PATTERN/.test(combined) ||
    /\bDo NOT invent\b/i.test(line) ||
    /\brejected?\b|\bblocked\b|\bforbidden\b|\bunsupported\b/i.test(line)
  );
}

function checkFile(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previousLine = index > 0 ? lines[index - 1] : "";

    for (const { label, regex } of BLOCKED_PATTERNS) {
      if (!regex.test(line)) continue;
      if (lineAllowed(line, previousLine)) continue;

      failures.push(`${file}:${index + 1}: remove unsupported ${label}`);
    }
  }
}

const files = [
  ...FILES.filter((file) => fs.existsSync(file)),
  ...ROOTS.flatMap(walk),
].sort();

for (const file of files) {
  checkFile(file);
}

const runtimeBrandFiles = [
  ...FILES.filter((file) => fs.existsSync(file)),
  ...["screens", "services", "supabase/functions"].flatMap(walk),
];
for (const file of runtimeBrandFiles) {
  if (/bowlproof/i.test(fs.readFileSync(file, "utf8"))) {
    failures.push(`${file}: release runtime must use the Woof brand, not Bowlproof`);
  }
}

const embeddedLegal = fs.readFileSync("legal.js", "utf8");
const hostedTerms = fs.readFileSync("docs/terms.html", "utf8");
const hostedSupport = fs.readFileSync("docs/support.html", "utf8");
const embeddedAndHostedTerms = [embeddedLegal, hostedTerms];
for (const source of embeddedAndHostedTerms) {
  for (const requiredCopy of [
    "Free results show the overall score, quick stats, a summary verdict, verification details, and the full ingredient list.",
    "Scan history is included with free use and is not a paid feature.",
    "unlimited scans, detailed ingredient explanations, quality breakdown, and nutrition facts",
    "Current pricing is shown in the app and App Store.",
  ]) {
    if (!source.includes(requiredCopy)) {
      failures.push(`Free/Pro copy contract missing: ${requiredCopy}`);
    }
  }
}

if (/first 3 ingredients|saved scan history require|\$4\.99\/week|\$7\.99\/month|\$29\.99\/year/i.test(hostedTerms)) {
  failures.push("docs/terms.html: remove obsolete free-result gates or hard-coded subscription prices");
}

if (
  !hostedSupport.includes("Scan history and the full ingredient list remain available with free results.")
  || /Pro include[^<]*saved scan history|full ingredient breakdowns/i.test(hostedSupport)
) {
  failures.push("docs/support.html: support copy must keep history and the full ingredient list in the free tier");
}

const storeDescription = JSON.parse(fs.readFileSync("store.config.json", "utf8"))
  ?.apple?.info?.["en-US"]?.description || "";
if (/Pro unlocks[^\n.]*saved history/i.test(storeDescription)) {
  failures.push("store.config.json: scan history must not be described as a Pro-only benefit");
}

if (failures.length > 0) {
  console.error("Claim safety check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Claim safety check passed (${files.length} files checked)`);
