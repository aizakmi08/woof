import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FUNCTIONS_DIR = "supabase/functions";

function functionDirs() {
  return fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readConstant(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*["']([^"']+)["']`));
  return match ? match[1] : null;
}

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

const functions = functionDirs().map((name) => {
  const sourcePath = path.join(FUNCTIONS_DIR, name, "index.ts");
  const source = fs.readFileSync(sourcePath, "utf8");

  return {
    function_name: name,
    source_path: sourcePath,
    declared_function_name: readConstant(source, "FUNCTION_NAME"),
    audit_version: readConstant(source, "FUNCTION_AUDIT_VERSION"),
    sha256: sha256(source),
  };
});

console.log(JSON.stringify({ functions }, null, 2));
