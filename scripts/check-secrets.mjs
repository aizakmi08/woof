import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MAX_FILE_BYTES = 1024 * 1024;
const GIT_LIST_MAX_BUFFER = 64 * 1024 * 1024;
const ALLOWED_SECRET_FILENAMES = new Set([".env.example"]);
const IGNORED_PATH_PARTS = new Set([
  ".git",
  "node_modules",
  ".expo",
  "dist",
  "web-build",
]);

const SECRET_PATTERNS = [
  {
    name: "private key block",
    regex: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/gi,
  },
  {
    name: "Anthropic API key",
    regex: /sk-ant-[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "OpenAI API key",
    regex: /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/g,
  },
  {
    name: "Stripe secret key",
    regex: /sk_(?:live|test)_[A-Za-z0-9]{20,}/g,
  },
  {
    name: "Supabase JWT",
    regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "Supabase project URL",
    regex: /https:\/\/[a-z0-9]{20}\.supabase\.co/gi,
  },
  {
    name: "Google OAuth client id",
    regex: /\b\d{6,}-[a-z0-9_-]{20,}\.apps\.googleusercontent\.com\b/gi,
  },
  {
    name: "RevenueCat public SDK key",
    regex: /\b(?:appl|goog)_[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "generic secret assignment",
    regex: /\b(?:api[_-]?key|secret|service[_-]?role|auth[_-]?token|webhook[_-]?auth)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{24,}/gi,
  },
];

function gitFiles(args) {
  const output = execFileSync("git", args, {
    encoding: "buffer",
    maxBuffer: GIT_LIST_MAX_BUFFER,
  });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function isIgnoredPath(filePath) {
  return filePath
    .split(path.sep)
    .some((part) => IGNORED_PATH_PARTS.has(part));
}

function isLikelyBinary(buffer) {
  return buffer.includes(0);
}

function isPlaceholder(value) {
  return /your-|example|placeholder|sample|test-only|dummy|xxxx|<[^>]+>/i.test(value);
}

function masked(value) {
  const text = String(value).trim();
  if (text.length <= 12) return "[redacted]";
  return `${text.slice(0, 4)}...[redacted]...${text.slice(-4)}`;
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

function checkTrackedSecretFilenames(files, findings) {
  for (const file of files) {
    const name = path.basename(file);
    const isEnvFile = /^\.env(?:\.|$)/.test(name);
    const isCredentialFile = /\.(?:p8|p12|pem|key)$/.test(name)
      || /(?:service[-_]?account|credentials)\.json$/i.test(name);

    if ((isEnvFile || isCredentialFile) && !ALLOWED_SECRET_FILENAMES.has(name)) {
      findings.push({
        file,
        line: 1,
        kind: "sensitive filename is tracked",
        preview: name,
      });
    }
  }
}

function checkFile(file, findings) {
  if (isIgnoredPath(file)) return;
  if (!fs.existsSync(file)) return;

  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return;

  const buffer = fs.readFileSync(file);
  if (isLikelyBinary(buffer)) return;

  const text = buffer.toString("utf8");
  for (const pattern of SECRET_PATTERNS) {
    for (const match of text.matchAll(pattern.regex)) {
      const value = match[0];
      if (isPlaceholder(value)) continue;

      findings.push({
        file,
        line: lineNumberForIndex(text, match.index || 0),
        kind: pattern.name,
        preview: masked(value),
      });
    }
  }
}

const trackedFiles = gitFiles(["ls-files", "-z"]);
const untrackedFiles = gitFiles(["ls-files", "--others", "--exclude-standard", "-z"]);
const filesToScan = [...new Set([...trackedFiles, ...untrackedFiles])];
const findings = [];

checkTrackedSecretFilenames(trackedFiles, findings);

for (const file of filesToScan) {
  checkFile(file, findings);
}

if (findings.length > 0) {
  console.error("Secret scan failed. Review these locations without committing the values:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.kind} (${finding.preview})`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${filesToScan.length} files checked)`);
