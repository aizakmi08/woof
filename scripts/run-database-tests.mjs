import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectionString = process.env.TEST_DATABASE_URL
  || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
let assertions = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

async function connect() {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function asRole(role, userId, callback) {
  const client = await connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('request.jwt.claim.role', $1, true)", [role]);
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId || ""]);
    const value = await callback(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function applyFoundation(client) {
  await client.query(read("tests/database/bootstrap.sql"));
  for (const migration of [
    "supabase/migrations/061_scan_entitlements.sql",
    "supabase/migrations/063_scan_reversal.sql",
    "supabase/migrations/069_consume_scan_reversed_retry.sql",
    "supabase/migrations/066_profile_write_security.sql",
    "supabase/migrations/067_delete_account_privacy.sql",
    "supabase/migrations/070_security_advisor_hardening.sql",
  ]) {
    await client.query(read(migration));
  }

  const hardeningMigration = fs.readdirSync(path.join(root, "supabase/migrations"))
    .find((name) => name.endsWith("_quality_regimen_security_hardening.sql"));
  if (hardeningMigration) {
    await client.query(read(`supabase/migrations/${hardeningMigration}`));
  }

  const queryMigration = read("supabase/migrations/20260831234813_fix_catalog_possessive_prefix_search.sql");
  const helperEnd = queryMigration.indexOf("REVOKE ALL ON FUNCTION public.catalog_bounded_prefix_tsquery");
  assert(helperEnd > 0, "query-safety migration must expose the bounded prefix helper");
  await client.query(queryMigration.slice(0, helperEnd));
}

async function seedUsers(client) {
  await client.query(
    "INSERT INTO auth.users (id, email) VALUES ($1, 'a@example.test'), ($2, 'b@example.test')",
    [userA, userB]
  );
  await client.query(
    "INSERT INTO public.profiles (id, scan_count, is_pro) VALUES ($1, 0, false), ($2, 0, false)",
    [userA, userB]
  );
}

async function testQuota(admin) {
  const spoof = await asRole("authenticated", userA, (client) => client.query(
    "SELECT public.consume_scan($1, 'spoof-one', 'barcode', 999) AS result",
    [userB]
  ));
  assert(spoof.rows[0].result.scan_count === 1, "authenticated scan must count against caller");
  assert(spoof.rows[0].result.remaining === 2, "authenticated caller must not override free limit");
  const counts = await admin.query("SELECT id, scan_count FROM public.profiles ORDER BY id");
  assert(Number(counts.rows[0].scan_count) === 1, "caller profile must be incremented");
  assert(Number(counts.rows[1].scan_count) === 0, "spoofed profile must not be incremented");

  const duplicate = await asRole("authenticated", userA, (client) => client.query(
    "SELECT public.consume_scan($1, 'spoof-one', 'photo', 0) AS result",
    [userB]
  ));
  assert(duplicate.rows[0].result.scan_count === 1, "same scan_id must be idempotent");

  await asRole("authenticated", userA, (client) => client.query(
    "SELECT public.consume_scan(NULL, 'scan-two', 'photo', 3)"
  ));
  const third = await asRole("authenticated", userA, (client) => client.query(
    "SELECT public.consume_scan(NULL, 'scan-three', 'photo', 3) AS result"
  ));
  const fourth = await asRole("authenticated", userA, (client) => client.query(
    "SELECT public.consume_scan(NULL, 'scan-four', 'photo', 3) AS result"
  ));
  assert(third.rows[0].result.allowed === true && third.rows[0].result.scan_count === 3,
    "third free scan must be allowed");
  assert(fourth.rows[0].result.allowed === false && fourth.rows[0].result.reason === "free_limit_reached",
    "fourth free scan must be denied");

  const reversed = await asRole("service_role", null, (client) => client.query(
    "SELECT public.reverse_scan($1, 'scan-three', 'analysis_failed') AS result",
    [userA]
  ));
  assert(reversed.rows[0].result.reversed === true && reversed.rows[0].result.scan_count === 2,
    "service reversal must restore one free scan");
  const consumedAgain = await asRole("authenticated", userA, (client) => client.query(
    "SELECT public.consume_scan(NULL, 'scan-three', 'photo', 3) AS result"
  ));
  assert(consumedAgain.rows[0].result.counted === true && consumedAgain.rows[0].result.scan_count === 3,
    "reusing a reversed scan id must consume again");

  await admin.query("UPDATE public.profiles SET is_pro = true, scan_count = 3 WHERE id = $1", [userB]);
  const pro = await asRole("authenticated", userB, (client) => client.query(
    "SELECT public.consume_scan(NULL, 'pro-one', 'barcode', 0) AS result"
  ));
  assert(pro.rows[0].result.reason === "pro" && pro.rows[0].result.counted === false,
    "active Pro scan must bypass quota without incrementing");
}

async function testConcurrentIdempotency(admin) {
  const userC = "33333333-3333-4333-8333-333333333333";
  await admin.query("INSERT INTO auth.users (id) VALUES ($1)", [userC]);
  await admin.query("INSERT INTO public.profiles (id) VALUES ($1)", [userC]);
  const results = await Promise.allSettled([
    asRole("authenticated", userC, (client) => client.query(
      "SELECT public.consume_scan(NULL, 'same-concurrent-id', 'photo', 3) AS result"
    )),
    asRole("authenticated", userC, (client) => client.query(
      "SELECT public.consume_scan(NULL, 'same-concurrent-id', 'photo', 3) AS result"
    )),
  ]);
  assert(results.every((result) => result.status === "fulfilled"),
    `concurrent same-id consumption must not error: ${results.map((result) => result.reason?.message || result.status).join(", ")}`);
  const profile = await admin.query("SELECT scan_count FROM public.profiles WHERE id = $1", [userC]);
  assert(Number(profile.rows[0].scan_count) === 1, "concurrent same scan_id must count exactly once");
}

async function testRlsAndCatalog(admin) {
  await admin.query(
    "INSERT INTO public.scan_history (id, user_id, product_name) VALUES ('a-row', $1, 'A'), ('b-row', $2, 'B')",
    [userA, userB]
  );
  const visible = await asRole("authenticated", userA, (client) => client.query(
    "SELECT id FROM public.scan_history ORDER BY id"
  ));
  assert(visible.rows.map((row) => row.id).join(",") === "a-row", "RLS must hide user B history from user A");

  let crossWriteFailed = false;
  try {
    await asRole("authenticated", userA, (client) => client.query(
      "UPDATE public.scan_history SET product_name = 'stolen' WHERE user_id = $1",
      [userB]
    ));
  } catch {
    crossWriteFailed = true;
  }
  const unchanged = await admin.query("SELECT product_name FROM public.scan_history WHERE id = 'b-row'");
  assert(crossWriteFailed || unchanged.rows[0].product_name === "B", "RLS must block cross-user history writes");

  const visibleProfiles = await asRole("authenticated", userA, (client) => client.query(
    "SELECT id FROM public.profiles ORDER BY id"
  ));
  assert(visibleProfiles.rows.map((row) => row.id).join(",") === userA,
    "RLS must hide user B profile from user A");

  await admin.query(
    "INSERT INTO public.analytics_events (user_id, session_id, event_name) VALUES ($1, 'b-session', 'private-b')",
    [userB]
  );
  let analyticsReadFailed = false;
  try {
    await asRole("authenticated", userA, (client) => client.query(
      "SELECT * FROM public.analytics_events WHERE user_id = $1",
      [userB]
    ));
  } catch {
    analyticsReadFailed = true;
  }
  assert(analyticsReadFailed, "authenticated users must not read analytics event rows");

  let analyticsCrossWriteFailed = false;
  try {
    await asRole("authenticated", userA, (client) => client.query(
      "INSERT INTO public.analytics_events (user_id, session_id, event_name) VALUES ($1, 'spoof', 'spoof')",
      [userB]
    ));
  } catch {
    analyticsCrossWriteFailed = true;
  }
  assert(analyticsCrossWriteFailed, "analytics RLS must reject rows attributed to another user");

  const ownUsage = await asRole("authenticated", userA, (client) => client.query(
    "SELECT DISTINCT user_id FROM public.scan_usage_events"
  ));
  assert(ownUsage.rows.every((row) => row.user_id === userA),
    "scan usage RLS must hide other users' rows");

  let usageWriteFailed = false;
  try {
    await asRole("authenticated", userA, (client) => client.query(
      "UPDATE public.scan_usage_events SET free_limit = 999 WHERE user_id = $1",
      [userA]
    ));
  } catch {
    usageWriteFailed = true;
  }
  assert(usageWriteFailed, "authenticated users must not mutate scan usage rows directly");

  await admin.query(
    "INSERT INTO public.product_events (user_id, event_name, session_id) VALUES ($1, 'private-b', 'b-product-session')",
    [userB]
  );
  let productEventReadFailed = false;
  try {
    await asRole("authenticated", userA, (client) => client.query("SELECT * FROM public.product_events"));
  } catch {
    productEventReadFailed = true;
  }
  assert(productEventReadFailed, "authenticated users must not read product event rows");

  let productEventWriteFailed = false;
  try {
    await asRole("authenticated", userA, (client) => client.query(
      "INSERT INTO public.product_events (user_id, event_name, session_id) VALUES ($1, 'injected', 'injected')",
      [userA]
    ));
  } catch {
    productEventWriteFailed = true;
  }
  assert(productEventWriteFailed, "authenticated users must not write product event rows directly");

  let entitlementWriteFailed = false;
  try {
    await asRole("authenticated", userA, (client) => client.query(
      "UPDATE public.profiles SET is_pro = true, scan_count = 0 WHERE id = $1",
      [userA]
    ));
  } catch {
    entitlementWriteFailed = true;
  }
  assert(entitlementWriteFailed, "authenticated users must not write is_pro or scan_count");

  await admin.query("INSERT INTO public.product_data (cache_key, product_name) VALUES ('catalog:one', 'Catalog One')");
  const catalogRead = await asRole("authenticated", userA, (client) => client.query(
    "SELECT cache_key FROM public.product_data"
  ));
  assert(catalogRead.rows.length === 1, "authenticated catalog reads must remain available");
  let catalogWriteFailed = false;
  try {
    await asRole("authenticated", userA, (client) => client.query(
      "INSERT INTO public.product_data (cache_key, product_name) VALUES ('catalog:evil', 'Injected')"
    ));
  } catch {
    catalogWriteFailed = true;
  }
  assert(catalogWriteFailed, "client roles must not write product_data");

  let privateReadFailed = false;
  try {
    await asRole("authenticated", userA, (client) => client.query(
      "SELECT * FROM public.catalog_private_evidence"
    ));
  } catch {
    privateReadFailed = true;
  }
  assert(privateReadFailed, "private catalog evidence must not be readable by authenticated users");
}

async function testLegacyRpcAuthorization(admin) {
  for (const signature of [
    "public.get_human_food_count_today(uuid)",
    "public.increment_human_food_count(uuid)",
    "public.increment_scan_count(uuid)",
  ]) {
    const result = await admin.query(
      "SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS allowed",
      [signature]
    );
    assert(result.rows[0].allowed === false, `${signature} must not be callable by authenticated clients`);
  }
}

async function testDeletion(admin) {
  await admin.query(
    "INSERT INTO public.product_events (user_id, event_name, session_id, metadata) VALUES ($1, 'search_result_tapped', 'session-user-a', '{\"query\":\"private search\"}')",
    [userA]
  );
  await asRole("authenticated", userA, (client) => client.query("SELECT public.delete_own_account()"));
  const retained = await admin.query(
    "SELECT count(*)::INTEGER AS count FROM public.product_events WHERE session_id = 'session-user-a'"
  );
  assert(retained.rows[0].count === 0, "account deletion must remove product_events instead of anonymizing typed queries");
}

async function testQuerySafety(admin) {
  const corpus = [
    "Nature's Logic",
    "Hill’s Science Diet",
    "Newman's Own",
    "Stella & Chewy's",
    "I and Love and You",
    "Go! Solutions",
    "Ziwi-Peak",
    "ACANA 2026",
    "Élan's Café",
    "🐕 -- '' & paste junk",
  ];
  const startedAt = performance.now();
  for (const query of corpus) {
    const result = await admin.query(
      "SELECT public.catalog_bounded_prefix_tsquery($1)::TEXT AS query",
      [query]
    );
    const built = result.rows[0].query || "";
    assert(!/\'[a-z0-9]\':\*/i.test(built), `one-character prefix escaped query safety for ${query}: ${built}`);
  }
  const durationMs = performance.now() - startedAt;
  assert(durationMs < 500, `query-shape corpus exceeded 500 ms: ${durationMs.toFixed(1)} ms`);
  const bounded = await admin.query(
    "SELECT numnode(public.catalog_bounded_prefix_tsquery($1)) AS nodes",
    ["token01 token02 token03 token04 token05 token06 token07 token08 token09 token10 token11 token12 token13 token14"]
  );
  // numnode counts the 12 lexemes plus the 11 AND operators.
  assert(Number(bounded.rows[0].nodes) <= 23, "prefix query must cap term count at 12");
}

async function main() {
  let admin;
  try {
    admin = await connect();
  } catch (error) {
    console.error(`BLOCKED(database): cannot connect to disposable Postgres at ${connectionString}: ${error.message}`);
    process.exit(2);
  }

  try {
    await applyFoundation(admin);
    await seedUsers(admin);
    await testQuota(admin);
    await testConcurrentIdempotency(admin);
    await testRlsAndCatalog(admin);
    await testLegacyRpcAuthorization(admin);
    await testDeletion(admin);
    await testQuerySafety(admin);
    console.log(`Database integration tests passed (${assertions} assertions).`);
  } finally {
    await admin.end();
  }
}

main().catch((error) => {
  console.error(`Database integration tests failed after ${assertions} assertions: ${error.stack || error.message}`);
  process.exit(1);
});
