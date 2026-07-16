import fs from "node:fs";
import crypto from "node:crypto";

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sqlString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function readRows(sqlDir) {
  const manifest = JSON.parse(fs.readFileSync(`${sqlDir.replace(/\/+$/g, "")}/manifest.json`, "utf8"));
  const rows = [];

  for (const chunk of manifest.chunks || []) {
    const sql = fs.readFileSync(chunk.file, "utf8");
    for (const match of sql.matchAll(/decode\('([^']+)', 'base64'\)/g)) {
      rows.push(...JSON.parse(Buffer.from(match[1], "base64").toString("utf8")));
    }
  }

  return rows;
}

function printMissingUrlSql(rows, source) {
  const urls = [...new Set(rows.map((row) => compact(row.source_url)).filter(Boolean))].sort();
  const values = urls.map((url) => `(${sqlString(url)})`).join(",\n");
  console.log(`with local_source_urls(source_url) as (values
${values}
)
select
  count(*) as local_urls,
  count(p.id) as already_live,
  count(*) - count(p.id) as missing_live,
  coalesce(
    jsonb_agg(local_source_urls.source_url order by local_source_urls.source_url) filter (where p.id is null),
    '[]'::jsonb
  ) as missing_urls
from local_source_urls
left join product_data p
  on p.source = ${sqlString(source)}
 and p.source_url = local_source_urls.source_url;`);
}

function printMissingCacheKeySql(rows, source) {
  const cacheKeys = [...new Set(rows.map((row) => compact(row.cache_key)).filter(Boolean))].sort();
  const values = cacheKeys.map((cacheKey) => `(${sqlString(cacheKey)})`).join(",\n");
  console.log(`with local_cache_keys(cache_key) as (values
${values}
)
select
  count(*) as local_cache_keys,
  count(p.id) as already_live,
  count(*) - count(p.id) as missing_live,
  coalesce(
    jsonb_agg(local_cache_keys.cache_key order by local_cache_keys.cache_key) filter (where p.id is null),
    '[]'::jsonb
  ) as missing_cache_keys
from local_cache_keys
left join product_data p
  on p.source = ${sqlString(source)}
 and p.cache_key = local_cache_keys.cache_key;`);
}

function printMissingProductIdentitySql(rows, source) {
  const identities = [...new Map(rows
    .filter((row) => compact(row.product_name))
    .map((row) => [`${compact(row.brand)}\n${compact(row.product_name)}`, row]))
    .values()]
    .sort((left, right) => compact(left.product_name).localeCompare(compact(right.product_name)));
  const values = identities
    .map((row) => `(${sqlString(row.brand)}, ${sqlString(row.product_name)})`)
    .join(",\n");
  console.log(`with local_products(brand, product_name) as (values
${values}
),
normalized_local as (
  select
    brand,
    product_name,
    public.catalog_product_feed_identity_key(brand, product_name) as identity_key
  from local_products
)
select
  count(*) as local_products,
  count(p.id) as already_live,
  count(*) - count(p.id) as missing_live,
  coalesce(
    jsonb_agg(normalized_local.product_name order by normalized_local.product_name) filter (where p.id is null),
    '[]'::jsonb
  ) as missing_product_names
from normalized_local
left join product_data p
  on p.source = ${sqlString(source)}
 and public.catalog_product_feed_identity_key(p.brand, p.product_name) = normalized_local.identity_key;`);
}

function printRpcSql(rows) {
  const payload = JSON.stringify(rows);
  const payloadBase64 = Buffer.from(payload, "utf8").toString("base64");
  console.log(`select count(*) as upserted_rows
from public.upsert_catalog_product_feed(
  convert_from(decode(${sqlString(payloadBase64)}, 'base64'), 'UTF8')::jsonb
);`);
}

function md5(value) {
  return crypto.createHash("md5").update(String(value || ""), "utf8").digest("hex");
}

function printLiveHashCompareSql(rows, source) {
  const values = rows.map((row) => `(${[
    sqlString(row.source_url),
    sqlString(md5(row.ingredient_text)),
    sqlString(md5(row.image_url)),
  ].join(", ")})`).join(",\n");

  console.log(`with expected(source_url, ingredient_md5, image_md5) as (values
${values}
)
select
  count(*) as checked,
  count(p.id) as live_rows,
  count(*) filter (where p.id is null) as missing_rows,
  count(*) filter (where md5(coalesce(p.ingredient_text, '')) = expected.ingredient_md5) as ingredient_hash_matches,
  count(*) filter (where md5(coalesce(p.image_url, '')) = expected.image_md5) as image_hash_matches,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'url', expected.source_url,
        'live', p.id is not null,
        'ingredient_ok', md5(coalesce(p.ingredient_text, '')) = expected.ingredient_md5,
        'image_ok', md5(coalesce(p.image_url, '')) = expected.image_md5
      )
      order by expected.source_url
    ) filter (
      where p.id is null
         or md5(coalesce(p.ingredient_text, '')) <> expected.ingredient_md5
         or md5(coalesce(p.image_url, '')) <> expected.image_md5
    ),
    '[]'::jsonb
  ) as mismatches
from expected
left join product_data p
  on p.source = ${sqlString(source)}
 and p.source_url = expected.source_url;`);
}

function printLiveCacheKeyHashCompareSql(rows, source) {
  const values = rows.map((row) => `(${[
    sqlString(row.cache_key),
    sqlString(row.source_url),
    sqlString(md5(row.ingredient_text)),
    sqlString(md5(row.image_url)),
  ].join(", ")})`).join(",\n");

  console.log(`with expected(cache_key, source_url, ingredient_md5, image_md5) as (values
${values}
)
select
  count(*) as checked,
  count(p.id) as live_rows,
  count(*) filter (where p.id is null) as missing_rows,
  count(*) filter (where md5(coalesce(p.ingredient_text, '')) = expected.ingredient_md5) as ingredient_hash_matches,
  count(*) filter (where md5(coalesce(p.image_url, '')) = expected.image_md5) as image_hash_matches,
  count(*) filter (where p.source_url = expected.source_url) as source_url_matches,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cache_key', expected.cache_key,
        'expected_url', expected.source_url,
        'live_url', p.source_url,
        'live', p.id is not null,
        'ingredient_ok', md5(coalesce(p.ingredient_text, '')) = expected.ingredient_md5,
        'image_ok', md5(coalesce(p.image_url, '')) = expected.image_md5,
        'source_url_ok', p.source_url = expected.source_url
      )
      order by expected.cache_key
    ) filter (
      where p.id is null
         or md5(coalesce(p.ingredient_text, '')) <> expected.ingredient_md5
         or md5(coalesce(p.image_url, '')) <> expected.image_md5
         or p.source_url <> expected.source_url
    ),
    '[]'::jsonb
  ) as mismatches
from expected
left join product_data p
  on p.source = ${sqlString(source)}
 and p.cache_key = expected.cache_key;`);
}

function printLiveProductIdentityHashCompareSql(rows, source) {
  const values = rows.map((row) => `(${[
    sqlString(row.brand),
    sqlString(row.product_name),
    sqlString(row.source_url),
    sqlString(md5(row.ingredient_text)),
    sqlString(md5(row.image_url)),
  ].join(", ")})`).join(",\n");

  console.log(`with expected(brand, product_name, source_url, ingredient_md5, image_md5) as (values
${values}
),
normalized_expected as (
  select
    brand,
    product_name,
    public.catalog_product_feed_identity_key(brand, product_name) as identity_key,
    source_url,
    ingredient_md5,
    image_md5
  from expected
)
select
  count(*) as checked,
  count(p.id) as live_rows,
  count(*) filter (where p.id is null) as missing_rows,
  count(*) filter (where md5(coalesce(p.ingredient_text, '')) = normalized_expected.ingredient_md5) as ingredient_hash_matches,
  count(*) filter (where md5(coalesce(p.image_url, '')) = normalized_expected.image_md5) as image_hash_matches,
  count(*) filter (where p.source_url = normalized_expected.source_url) as source_url_matches,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_name', normalized_expected.product_name,
        'expected_url', normalized_expected.source_url,
        'live_url', p.source_url,
        'live', p.id is not null,
        'ingredient_ok', md5(coalesce(p.ingredient_text, '')) = normalized_expected.ingredient_md5,
        'image_ok', md5(coalesce(p.image_url, '')) = normalized_expected.image_md5,
        'source_url_ok', p.source_url = normalized_expected.source_url
      )
      order by normalized_expected.product_name
    ) filter (
      where p.id is null
         or md5(coalesce(p.ingredient_text, '')) <> normalized_expected.ingredient_md5
         or md5(coalesce(p.image_url, '')) <> normalized_expected.image_md5
         or p.source_url <> normalized_expected.source_url
    ),
    '[]'::jsonb
  ) as mismatches
from normalized_expected
left join product_data p
  on p.source = ${sqlString(source)}
 and public.catalog_product_feed_identity_key(p.brand, p.product_name) = normalized_expected.identity_key;`);
}

function main() {
  const sqlDir = process.argv[2];
  const source = compact(process.argv[3]);
  if (!sqlDir || !source) {
    throw new Error("Usage: node scripts/catalog-sql-payload-summary.mjs <sql-dir> <source>");
  }

  const rows = readRows(sqlDir);
  const keys = new Set(rows.map((row) => compact(row.cache_key)).filter(Boolean));
  const urls = new Set(rows.map((row) => compact(row.source_url)).filter(Boolean));
  const mode = compact(process.argv[4] || "summary");

  if (mode === "missing-url-sql") {
    printMissingUrlSql(rows, source);
    return;
  }
  if (mode === "missing-cache-key-sql") {
    printMissingCacheKeySql(rows, source);
    return;
  }
  if (mode === "missing-product-identity-sql") {
    printMissingProductIdentitySql(rows, source);
    return;
  }
  if (mode === "rpc-for-urls") {
    const wanted = new Set(process.argv.slice(5).map(compact).filter(Boolean));
    printRpcSql(rows.filter((row) => wanted.has(compact(row.source_url))));
    return;
  }
  if (mode === "compare-live-hashes") {
    const wanted = new Set(process.argv.slice(5).map(compact).filter(Boolean));
    printLiveHashCompareSql(
      wanted.size ? rows.filter((row) => wanted.has(compact(row.source_url))) : rows,
      source,
    );
    return;
  }
  if (mode === "compare-live-cache-key-hashes") {
    const wanted = new Set(process.argv.slice(5).map(compact).filter(Boolean));
    printLiveCacheKeyHashCompareSql(
      wanted.size ? rows.filter((row) => wanted.has(compact(row.cache_key))) : rows,
      source,
    );
    return;
  }
  if (mode === "compare-live-product-identity-hashes") {
    const wanted = new Set(process.argv.slice(5).map(compact).filter(Boolean));
    printLiveProductIdentityHashCompareSql(
      wanted.size ? rows.filter((row) => wanted.has(compact(row.product_name))) : rows,
      source,
    );
    return;
  }

  console.log(JSON.stringify({
    rows: rows.length,
    unique_cache_keys: keys.size,
    unique_source_urls: urls.size,
    duplicate_cache_keys: rows.length - keys.size,
    duplicate_source_urls: rows.length - urls.size,
  }, null, 2));
}

main();
