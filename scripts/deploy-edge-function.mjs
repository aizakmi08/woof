import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const FUNCTIONS_DIR = "supabase/functions";
const MANAGEMENT_API_BASE = "https://api.supabase.com/v1";

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function projectRefFromEnv() {
  const explicit = compact(process.env.SUPABASE_PROJECT_REF);
  if (explicit) return explicit;

  const url = compact(process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL);
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  return match?.[1] || "";
}

function listFiles(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, base));
    } else if (entry.isFile()) {
      files.push({
        absolutePath: fullPath,
        zipPath: path.relative(base, fullPath).split(path.sep).join("/"),
      });
    }
  }

  return files.sort((a, b) => a.zipPath.localeCompare(b.zipPath));
}

function crc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = crc32Table();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2)
  );
  const dosDate = (
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate()
  );
  return { dosDate, dosTime };
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const data = fs.readFileSync(file.absolutePath);
    const name = Buffer.from(file.zipPath);
    const checksum = crc32(data);
    const { dosDate, dosTime } = dosDateTime(fs.statSync(file.absolutePath).mtime);

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
    ]);

    localParts.push(localHeader, data);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function readAuditVersion(functionName) {
  const sourcePath = path.join(FUNCTIONS_DIR, functionName, "index.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  return source.match(/const\s+FUNCTION_AUDIT_VERSION\s*=\s*["']([^"']+)["']/)?.[1] || null;
}

async function deploy({ projectRef, functionName, zip, verifyJwt }) {
  const token = compact(process.env.SUPABASE_ACCESS_TOKEN);
  if (!token) {
    throw new Error("Set SUPABASE_ACCESS_TOKEN to deploy. Run with --dry-run to inspect the artifact without deploying.");
  }

  const metadata = {
    name: functionName,
    entrypoint_path: "index.ts",
    verify_jwt: verifyJwt,
  };
  const form = new FormData();
  form.append("file", new Blob([zip], { type: "application/zip" }), `${functionName}.zip`);
  form.append("metadata", JSON.stringify(metadata));

  const response = await fetch(`${MANAGEMENT_API_BASE}/projects/${projectRef}/functions/deploy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Deploy failed (${response.status}): ${text.slice(0, 1000)}`);
  }

  return text ? JSON.parse(text) : { ok: true };
}

async function main() {
  const functionName = compact(getArg("--function", "analyze"));
  const projectRef = compact(getArg("--project-ref")) || projectRefFromEnv();
  const dryRun = hasArg("--dry-run");
  const verifyJwt = !hasArg("--no-verify-jwt");
  const functionDir = path.join(FUNCTIONS_DIR, functionName);

  if (!projectRef) {
    throw new Error("Set SUPABASE_PROJECT_REF, SUPABASE_URL, or pass --project-ref.");
  }
  if (!fs.existsSync(path.join(functionDir, "index.ts"))) {
    throw new Error(`Missing ${functionDir}/index.ts`);
  }

  const files = listFiles(functionDir);
  const zip = buildZip(files);
  const sha256 = crypto.createHash("sha256").update(zip).digest("hex");
  const auditVersion = readAuditVersion(functionName);

  const summary = {
    projectRef,
    functionName,
    verifyJwt,
    auditVersion,
    files: files.map((file) => file.zipPath),
    zipBytes: zip.length,
    zipSha256: sha256,
  };

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
    return;
  }

  const result = await deploy({ projectRef, functionName, zip, verifyJwt });
  console.log(JSON.stringify({ deployed: true, ...summary, result }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
