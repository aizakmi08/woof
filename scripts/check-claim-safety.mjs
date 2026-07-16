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

if (failures.length > 0) {
  console.error("Claim safety check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Claim safety check passed (${files.length} files checked)`);
