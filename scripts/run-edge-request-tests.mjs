import { spawn } from "node:child_process";
import process from "node:process";

const port = 8000;
const baseUrl = `http://127.0.0.1:${port}`;
const functions = [
  "analyze",
  "product-lookup",
  "label-lookup",
  "revenuecat-sync",
  "revenuecat-webhook",
];
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

async function waitForServer(child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`Deno server exited early: ${output().slice(-1_000)}`);
    }
    try {
      await fetch(baseUrl);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Deno server did not start: ${output().slice(-1_000)}`);
}

async function stopServer(child) {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}

async function withFunctionServer(name, callback) {
  let output = "";
  const child = spawn("deno", [
    "run",
    "--allow-all",
    `supabase/functions/${name}/index.ts`,
  ], {
    env: {
      ...process.env,
      REVENUECAT_WEBHOOK_AUTH: "quality-regimen-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  try {
    await waitForServer(child, () => output);
    await callback();
  } finally {
    await stopServer(child);
  }
}

async function request(init = {}) {
  return fetch(baseUrl, init);
}

async function testCommonBoundary(name) {
  await withFunctionServer(name, async () => {
    const method = await request({ method: "GET" });
    assert(method.status === 405, `${name} must reject GET with 405, received ${method.status}`);
    assert(method.headers.get("x-woof-function-name") === name,
      `${name} must expose its deployment identity header`);

    const preflight = await request({ method: "OPTIONS" });
    assert(preflight.status === 200, `${name} must answer CORS preflight`);

    const missingAuth = await request({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert(missingAuth.status === 401, `${name} must reject a missing credential`);
  });
}

for (const name of functions.filter((name) => name !== "revenuecat-webhook")) {
  await testCommonBoundary(name);
}

await withFunctionServer("revenuecat-webhook", async () => {
  const unauthorized = await request({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert(unauthorized.status === 401, "webhook must reject a missing shared secret");

  const malformed = await request({
    method: "POST",
    headers: {
      Authorization: "Bearer quality-regimen-secret",
      "Content-Type": "application/json",
    },
    body: "{",
  });
  assert(malformed.status === 400, "webhook must reject malformed JSON");

  const missingEvent = await request({
    method: "POST",
    headers: {
      Authorization: "Bearer quality-regimen-secret",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert(missingEvent.status === 400, "webhook must reject a missing event payload");
});

console.log(`Edge request-boundary tests passed (${assertions} assertions across ${functions.length} functions).`);
