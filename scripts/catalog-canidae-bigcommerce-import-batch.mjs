import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_SITEMAP_URL = "https://canidae.com/xmlsitemap.php?type=products&page=1";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/canidae";
const DEFAULT_SOURCE = "canidae";
const DEFAULT_BRAND = "CANIDAE";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_FETCH_DELAY_MS = 250;
const DEFAULT_FETCH_RETRIES = 3;
const CSV_HEADERS = [
  "cache_key",
  "gtin",
  "product_name",
  "brand",
  "product_line",
  "flavor",
  "life_stage",
  "food_form",
  "package_size",
  "pet_type",
  "ingredient_statement",
  "product_image_url",
  "product_url",
  "is_complete_food",
  "guaranteed_analysis",
  "source_quality",
  "ingredient_verification_status",
  "image_verification_status",
];
const NON_COMPLETE_FOOD_IDENTITY_PATTERNS = [
  /\b(test product|sample|bundle)\b/i,
  /\b(treat|treats|snack|snacks|chew|chews|jerky|biscuit|biscuits|dental)\b/i,
  /\b(topper|toppers|meal topper|food topper|protein topper|mixer|mixers|meal mixer|meal enhancer|enhancer|enhancers)\b/i,
  /\b(?:gravy|sauce)\s+(?:topper|toppers|mixer|mixers|enhancer|enhancers)\b/i,
  /\b(?:topper|toppers|mixer|mixers|enhancer|enhancers)\s+(?:gravy|sauce)\b/i,
  /\b(bone broth|broth topper|broth toppers|stock)\b/i,
  /\b(puree|purees|puree|purees|bisque|bisques|lickable|lickables)\b/i,
  /\b(supplement|supplements|complement|complementary|vitamin pack|probiotic)\b/i,
];
const INGREDIENT_NAME_OVERRIDES = new Map([
  ["dl-methionine", "DL-Methionine"],
  ["d-calcium-pantothenate", "D-Calcium Pantothenate"],
  ["l-ascorbyl-2-polyphosphate", "L-Ascorbyl-2-Polyphosphate"],
  ["vitamin-b12-supplement", "Vitamin B12 Supplement"],
  ["vitamin-d3-supplement", "Vitamin D3 Supplement"],
  ["omega-3-fatty-acids", "Omega-3 Fatty Acids"],
  ["omega-6-fatty-acids", "Omega-6 Fatty Acids"],
  ["mixed-tocopherols", "Mixed Tocopherols"],
]);
const PRODUCT_JSON_FALLBACKS = new Map([
  [1016, {
    source_url: "https://cdn11.bigcommerce.com/s-lnkn0tcvqc/images/stencil/1280x1280/products/1016/1776/640461003662_Canidae_ALS_Large_Breed_Multi-Protein_40lbs_07_Ingredients__74437.1764708368.png?c=1",
    ingredient_verification_status: "label_ocr_verified",
    ingredient_statement: "Chicken, oatmeal, barley, whole grain sorghum, millet, peas, chicken meal (source of glucosamine and chondroitin sulfate), flaxseed, turkey meal (source of glucosamine and chondroitin sulfate), lamb meal (source of glucosamine and chondroitin sulfate), fish meal (source of glucosamine and chondroitin sulfate), rice bran, chicken fat, dried yeast, natural flavor, Threonine, salt, DL-Methionine, potassium chloride, menhaden fish oil, choline chloride, taurine, Tryptophan, mixed tocopherols (a preservative), vitamin E supplement, zinc proteinate, zinc sulfate, L-ascorbyl-2-polyphosphate, ferrous sulfate, iron proteinate, niacin supplement, copper sulfate, copper proteinate, vitamin A supplement, sodium selenite, manganese sulfate, thiamine mononitrate, manganese proteinate, d-calcium pantothenate, riboflavin supplement, pyridoxine hydrochloride, vitamin B12 supplement, calcium iodate, dried Bacillus amyloliquefaciens fermentation product, folic acid, vitamin D3 supplement, biotin, green tea extract, rosemary extract",
    guaranteed_analysis: "Crude Protein (min.) 24.00%, Crude Fat (min.) 10.00%, Crude Fiber (max.) 4.50%, Moisture (max.) 10.00%, Docosahexaenoic Acid (DHA) (min.) 0.03%, Calcium (min.) 1.20%, Phosphorus (min.) 0.75%, Zinc (min.) 100.00 mg/kg, Selenium (min.) 0.40 mg/kg, Vitamin E (min.) 50.00 IU/kg, Omega-6 Fatty Acids* (min.) 1.70%, Omega-3 Fatty Acids* (min.) 0.80%, Arachidonic Acid (ARA)* (min.) 0.03%, Ascorbic Acid (Vitamin C)* (min.) 30.00 mg/kg, Taurine* (min.) 0.15%, Glucosamine* (min.) 600 mg/kg, Chondroitin Sulfate* (min.) 700 mg/kg, Total Microorganisms* (min.) 50,000 CFU/g (Bacillus amyloliquefaciens), Calorie Content (Calculated): ME (kcal/kg) 3,390, ME (kcal/g) 3.390, ME (kcal/lb) 1,537, ME (kcal/cup) 462",
  }],
]);

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/&frac14;/gi, "1/4")
    .replace(/&frac12;/gi, "1/2")
    .replace(/&frac34;/gi, "3/4")
    .replace(/&hellip;|&#8230;/gi, "...")
    .replace(/&trade;/gi, "")
    .replace(/&reg;/gi, "")
    .replace(/&copy;/gi, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function stripTags(html) {
  return decodeEntities(String(html || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|td|th|section|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function normalizeUrl(value, baseUrl = "https://canidae.com/") {
  const text = compact(value);
  if (!text || /^data:/i.test(text)) return "";
  try {
    return new URL(text.replace(/^\/\//, "https://"), baseUrl).toString();
  } catch {
    return text;
  }
}

function normalizeBigCommerceImage(value) {
  return normalizeUrl(value).replace("{:size}", "1280x1280").replace("/stencil/original/", "/stencil/1280x1280/");
}

function normalizeGtin(value) {
  const digits = compact(value).replace(/[^0-9]/g, "");
  return digits.length >= 8 ? digits : "";
}

function normalizeSkuGtin(value) {
  const text = compact(value);
  return /^\d{8,14}$/.test(text) ? text : "";
}

function normalizeText(value) {
  return compact(decodeEntities(value))
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[^\x00-\x7F]/g, " ")
    .replace(/[^a-z0-9\s&/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithRetry(url, {
  accept,
  retries = DEFAULT_FETCH_RETRIES,
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "WoofCatalogVerifier/1.0 (CANIDAE official BigCommerce import)",
        "Accept": accept,
      },
    });
    if (response.ok) return response;

    lastError = new Error(`${url}: HTTP ${response.status}`);
    if (response.status !== 429 || attempt === retries) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1));
  }
  throw lastError;
}

async function fetchText(url, accept = "text/html,application/xhtml+xml") {
  const response = await fetchWithRetry(url, { accept });
  return response.text();
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url, { accept: "application/json" });
  return response.json();
}

function productUrlsFromSitemap(xml, maxUrls) {
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map(([, value]) => normalizeUrl(decodeEntities(value), "https://canidae.com/"))
    .filter((url) => /^https:\/\/canidae\.com\/[^/?#]+\/?$/i.test(url))
    .filter((url) => !/\/test-product-/i.test(url));
  return [...new Set(urls)].slice(0, maxUrls);
}

function parseBootstrapData(html) {
  const match = html.match(/window\.stencilBootstrap\("product",\s*"((?:\\.|[^"\\])*)"\)/);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(JSON.parse(`"${match[1]}"`));
  } catch {
    return null;
  }
}

function storefrontApiToken(data) {
  return compact(data?.settings?.storefront_api?.token);
}

async function fetchStorefrontProduct(data) {
  const token = storefrontApiToken(data);
  const productId = Number(data?.productId || data?.product?.id);
  if (!token || !Number.isFinite(productId)) return null;

  const query = `
    query Product($id: Int!) {
      site {
        product(entityId: $id) {
          entityId
          name
          sku
          upc
          gtin
          mpn
          path
          defaultImage { url(width: 1280) }
          variants(first: 50) {
            edges {
              node {
                entityId
                sku
                upc
                gtin
                mpn
                defaultImage { url(width: 1280) }
                options {
                  edges {
                    node {
                      displayName
                      values { edges { node { label } } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const response = await fetch("https://canidae.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "User-Agent": "WoofCatalogVerifier/1.0 (CANIDAE official BigCommerce import)",
    },
    body: JSON.stringify({ query, variables: { id: productId } }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.data?.site?.product || null;
}

function titleizeToken(token) {
  const text = compact(token);
  if (!text) return "";
  if (/^(dl|d|l)$/i.test(text)) return text.toUpperCase();
  if (/^[a-z]+\d+$/i.test(text)) return text.toUpperCase();
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function ingredientNameFromOfficialId(value) {
  const id = compact(value).toLowerCase();
  if (!id) return "";
  if (INGREDIENT_NAME_OVERRIDES.has(id)) return INGREDIENT_NAME_OVERRIDES.get(id);

  return id
    .split("-")
    .map(titleizeToken)
    .filter(Boolean)
    .join(" ");
}

function ingredientStatement(productJson) {
  const direct = compact(productJson?.ingredient_statement);
  if (direct) return direct;

  const ingredients = Array.isArray(productJson?.["full-ingredients"])
    ? productJson["full-ingredients"]
    : [];
  const names = ingredients.map(ingredientNameFromOfficialId).filter(Boolean);
  return names.length >= 5 ? names.join(", ") : "";
}

function guaranteedAnalysis(productJson) {
  const direct = compact(productJson?.guaranteed_analysis);
  if (direct) return direct;

  const rows = Array.isArray(productJson?.["guaranteed-analysis"])
    ? productJson["guaranteed-analysis"]
    : [];
  const analysisRows = rows
    .filter((row) => Array.isArray(row) && row.length >= 2)
    .map((row) => compact(`${row[0]} ${row[1]}`))
    .filter(Boolean);
  const calorie = compact(productJson?.["calorie-content"]);
  if (calorie) analysisRows.push(`Calorie Content ${stripTags(calorie)}`);
  return analysisRows.join(", ");
}

function cleanProductName(value) {
  return compact(decodeEntities(value))
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[®™]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function customField(product, name) {
  const fields = Array.isArray(product?.custom_fields) ? product.custom_fields : [];
  const field = fields.find((item) => normalizeText(item?.name) === normalizeText(name));
  return compact(field?.value);
}

function optionLabels(product, storefrontProduct) {
  const values = [];
  for (const option of Array.isArray(product?.options) ? product.options : []) {
    if (!/size/i.test(compact(option?.display_name))) continue;
    for (const value of Array.isArray(option?.values) ? option.values : []) {
      if (compact(value?.label)) values.push(compact(value.label));
    }
  }
  const variants = storefrontProduct?.variants?.edges || [];
  for (const edge of variants) {
    for (const optionEdge of edge?.node?.options?.edges || []) {
      if (!/size/i.test(compact(optionEdge?.node?.displayName))) continue;
      for (const valueEdge of optionEdge?.node?.values?.edges || []) {
        if (compact(valueEdge?.node?.label)) values.push(compact(valueEdge.node.label));
      }
    }
  }
  return [...new Set(values)];
}

function packageSizeFromText(value) {
  const text = compact(value).replace(/[_-]+/g, " ");
  const match = text.match(/\b\d+(?:\.\d+)?\s?(?:lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|ct|count|pack)\b/i);
  return compact(match?.[0] || "")
    .replace(/(\d)(lb|lbs|oz|kg|g|ct|pack)\b/i, "$1 $2")
    .replace(/\blb\b/i, "lb")
    .replace(/\blbs\b/i, "lbs")
    .replace(/\boz\b/i, "oz");
}

function inferPetType(product, productUrl) {
  const text = normalizeText([
    product?.title,
    product?.name,
    product?.brand?.name,
    Array.isArray(product?.category) ? product.category.join(" ") : product?.category,
    productUrl,
  ].join(" "));
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferLifeStage(productName, product) {
  const field = customField(product, "Life Stage");
  if (field) return field.toLowerCase();

  const text = normalizeText(productName);
  if (/\ball life stages\b/.test(text)) return "all life stages";
  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult\b/.test(text)) return "adult";
  return "";
}

function inferFoodForm(productName, product) {
  const field = customField(product, "Texture");
  if (field) return field.toLowerCase();

  const text = normalizeText([
    productName,
    Array.isArray(product?.category) ? product.category.join(" ") : product?.category,
  ].join(" "));
  if (/\bwet|can|canned|pate|pat[eé]|stew|gravy|morsel|morsels|minced|chunks|shreds|in broth\b/.test(text)) return "wet";
  if (/\bdry|kibble\b/.test(text)) return "dry";
  return "";
}

function inferProductLine(productName) {
  const name = cleanProductName(productName).replace(/^Canidae\s+/i, "");
  const lines = [
    "All Life Stages High Protein",
    "All Life Stages",
    "PURE Farm to Bowl",
    "Pure Farm to Bowl",
    "PURE Petite",
    "Pure Petite",
    "PURE",
    "Pure",
    "Goodness",
    "Balanced Bowl",
    "Under The Sun",
    "Under the Sun",
  ];
  for (const line of lines) {
    if (new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(name)) {
      return line.replace(/^Pure\b/, "PURE").replace("Under The Sun", "Under the Sun");
    }
  }
  return name.split(/\s+(?:Dry|Wet)\s+/i)[0] || "";
}

function inferFlavor(productName, productLine, product) {
  const field = customField(product, "Flavor");
  if (field) return field;

  const name = cleanProductName(productName)
    .replace(/^Canidae\s+/i, "")
    .replace(new RegExp(`^${productLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "")
    .replace(/\b(?:dry|wet|dog|cat|puppy|kitten|food|for small breed dogs?|for indoor cats?|grain free|with real)\b/gi, " ")
    .replace(/\s+/g, " ");
  const recipeMatch = name.match(/\b([A-Z][A-Za-z&,\s'-]{2,90}?\b(?:Recipe|Formula))\b/);
  if (recipeMatch?.[1]) return compact(recipeMatch[1]);
  const proteinMatch = name.match(/\b(chicken|beef|turkey|salmon|lamb|duck|tuna|whitefish|mackerel|bison|boar|venison|goat|shrimp)(?:\s*(?:&|and|with|,)\s*(?:chicken|beef|turkey|salmon|lamb|duck|tuna|whitefish|mackerel|bison|boar|venison|goat|shrimp|rice|barley|oatmeal|pumpkin|carrots|peas|potato|sweet potato|green beans))*\b/i);
  return compact(proteinMatch?.[0] || "");
}

function inferCompleteFood({ productName, productLine, productUrl, productJson }) {
  const text = [productName, productLine, productUrl].map(compact).join(" ");
  if (NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(text))) return "false";
  const aafco = compact(productJson?.aafco);
  if (aafco && /formulated to meet|complete and balanced/i.test(stripTags(aafco))) return "true";
  return "true";
}

function imageUrls(product, storefrontProduct) {
  const values = [
    storefrontProduct?.defaultImage?.url,
    product?.main_image?.data,
    ...(Array.isArray(product?.images) ? product.images.map((image) => image?.data) : []),
  ];
  return values.map(normalizeBigCommerceImage).filter(Boolean);
}

function primaryImage(product, storefrontProduct) {
  return normalizeBigCommerceImage(storefrontProduct?.defaultImage?.url)
    || normalizeBigCommerceImage(product?.main_image?.data)
    || imageUrls(product, storefrontProduct)[0]
    || "";
}

function gtinsFromImages(images) {
  const gtins = [];
  for (const image of images) {
    for (const match of image.matchAll(/(?<!\d)(\d{12,14})(?!\d)/g)) {
      gtins.push(match[1]);
    }
  }
  return [...new Set(gtins.map(normalizeGtin).filter(Boolean))];
}

function packageSizeForGtin(images, gtin) {
  const image = images.find((url) => url.includes(gtin));
  return packageSizeFromText(image || "");
}

function productGtins(product, storefrontProduct, images) {
  const candidates = [
    storefrontProduct?.gtin,
    storefrontProduct?.upc,
    product?.gtin,
    product?.upc,
    ...gtinsFromImages(images),
  ].map(normalizeGtin).filter(Boolean);
  candidates.push(...[
    storefrontProduct?.sku,
    product?.sku,
  ].map(normalizeSkuGtin).filter(Boolean));
  return [...new Set(candidates)];
}

function baseRow({ data, storefrontProduct, productJson, productUrl }) {
  const product = data.product || {};
  const productName = cleanProductName(storefrontProduct?.name || product.title || product.name || product.page_title);
  const images = imageUrls(product, storefrontProduct);
  const productLine = inferProductLine(productName);
  const sizeLabels = optionLabels(product, storefrontProduct);
  const packageSize = sizeLabels.join(", ")
    || packageSizeFromText(productName)
    || packageSizeFromText(product?.weight?.formatted);
  return {
    productId: Number(data.productId || product.id),
    productName,
    productLine,
    flavor: inferFlavor(productName, productLine, product),
    lifeStage: inferLifeStage(productName, product),
    foodForm: inferFoodForm(productName, product),
    packageSize,
    petType: inferPetType(product, productUrl),
    ingredients: ingredientStatement(productJson),
    imageUrl: primaryImage(product, storefrontProduct),
    images,
    isCompleteFood: inferCompleteFood({
      productName,
      productLine,
      productUrl,
      productJson,
    }),
    guaranteedAnalysis: guaranteedAnalysis(productJson),
    ingredientVerificationStatus: compact(productJson?.ingredient_verification_status) || "manufacturer",
    gtins: productGtins(product, storefrontProduct, images),
  };
}

function feedRowsForProduct(args) {
  const row = baseRow(args);
  const gtins = row.gtins.length > 0 ? row.gtins : [""];
  return gtins.map((gtin) => {
    const packageSize = packageSizeForGtin(row.images, gtin) || row.packageSize;
    return {
      cache_key: `${DEFAULT_SOURCE}:${row.productId || normalizeText(row.productName).replace(/\s+/g, "-")}:${gtin || "no-gtin"}`,
      gtin,
      product_name: row.productName,
      brand: DEFAULT_BRAND,
      product_line: row.productLine,
      flavor: row.flavor,
      life_stage: row.lifeStage,
      food_form: row.foodForm,
      package_size: packageSize,
      pet_type: row.petType,
      ingredient_statement: row.ingredients,
      product_image_url: row.imageUrl,
      product_url: args.productUrl,
      is_complete_food: row.isCompleteFood,
      guaranteed_analysis: row.guaranteedAnalysis,
      source_quality: "manufacturer",
      ingredient_verification_status: row.ingredientVerificationStatus,
      image_verification_status: "manufacturer",
    };
  });
}

function writeCsv(filePath, rows) {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((value) => compact(value)));
}

function sqlManifest(sqlDir) {
  const manifestPath = path.join(sqlDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function runOfficialImport(feedPath, sqlDir, source, sqlChunkSize) {
  const result = spawnSync(process.execPath, [
    OFFICIAL_FEED_IMPORT_SCRIPT,
    "--file", feedPath,
    "--source", source,
    "--source-quality", "manufacturer",
    "--ingredient-verification", "manufacturer",
    "--image-verification", "manufacturer",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
    "--expected-brand", DEFAULT_BRAND,
  ], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error([
      `${OFFICIAL_FEED_IMPORT_SCRIPT} failed with status ${result.status}`,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

async function main() {
  const sitemapUrl = compact(getArg("--sitemap-url")) || DEFAULT_SITEMAP_URL;
  const outputDir = compact(getArg("--output-dir")) || DEFAULT_OUTPUT_DIR;
  const source = compact(getArg("--source")) || DEFAULT_SOURCE;
  const maxUrls = positiveInteger(getArg("--max-urls"), 250);
  const urlOffset = nonNegativeInteger(getArg("--url-offset"), 0);
  const urlLimit = positiveInteger(getArg("--url-limit"), null);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const fetchDelayMs = nonNegativeInteger(getArg("--fetch-delay-ms"), DEFAULT_FETCH_DELAY_MS);

  fs.mkdirSync(outputDir, { recursive: true });
  const urlsPath = path.join(outputDir, "urls.txt");
  const feedPath = path.join(outputDir, "feed.csv");
  const sqlDir = path.join(outputDir, "sql");
  const reportPath = path.join(outputDir, "report.json");
  const evidencePath = path.join(outputDir, "product-json-evidence.json");

  const sitemap = await fetchText(sitemapUrl, "application/xml,text/xml");
  const allUrls = productUrlsFromSitemap(sitemap, maxUrls);
  const urls = urlLimit === null
    ? allUrls.slice(urlOffset)
    : allUrls.slice(urlOffset, urlOffset + urlLimit);
  fs.writeFileSync(urlsPath, `${urls.join("\n")}\n`, "utf8");

  const rows = [];
  const evidence = [];
  const warnings = [];

  for (const [index, productUrl] of urls.entries()) {
    if (index > 0) await sleep(fetchDelayMs);
    try {
      const html = await fetchText(productUrl);
      const data = parseBootstrapData(html);
      if (!data?.product) {
        warnings.push(`${productUrl}: missing BigCommerce product bootstrap data`);
        continue;
      }
      const productJsonUrl = compact(data?.ingredientsJSONPath?.string);
      if (!productJsonUrl) {
        warnings.push(`${productUrl}: missing official ingredientsJSONPath`);
        continue;
      }
      let productJson = null;
      let productJsonEvidenceUrl = productJsonUrl;
      let usedFallback = false;
      try {
        productJson = await fetchJson(productJsonUrl);
      } catch (error) {
        const fallback = PRODUCT_JSON_FALLBACKS.get(Number(data.productId || data.product?.id));
        if (!fallback) throw error;
        productJson = fallback;
        productJsonEvidenceUrl = fallback.source_url;
        usedFallback = true;
        warnings.push(`${productUrl}: official product JSON missing; used official package-image ingredient fallback`);
      }
      const storefrontProduct = await fetchStorefrontProduct(data);
      const productRows = feedRowsForProduct({
        data,
        storefrontProduct,
        productJson,
        productUrl,
      });
      rows.push(...productRows);
      evidence.push({
        product_url: productUrl,
        product_id: data.productId || data.product?.id || null,
        product_json_url: productJsonEvidenceUrl,
        used_package_image_fallback: usedFallback,
        feed_rows: productRows.length,
        gtins: productRows.map((row) => row.gtin).filter(Boolean),
        ingredient_count: Array.isArray(productJson?.["full-ingredients"]) ? productJson["full-ingredients"].length : 0,
      });
    } catch (error) {
      warnings.push(`${productUrl}: ${error.message || error}`);
    }
  }

  writeCsv(feedPath, rows);
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  const importResult = runOfficialImport(feedPath, sqlDir, source, sqlChunkSize);
  const manifest = sqlManifest(sqlDir);
  const csvRows = parseCsv(fs.readFileSync(feedPath, "utf8"));
  const header = csvRows[0] || [];
  const dataRows = csvRows.slice(1);
  const completeIndex = header.indexOf("is_complete_food");
  const ingredientIndex = header.indexOf("ingredient_statement");
  const imageIndex = header.indexOf("product_image_url");
  const gtinIndex = header.indexOf("gtin");
  const petTypeIndex = header.indexOf("pet_type");

  const report = {
    generated_at: new Date().toISOString(),
    brand: DEFAULT_BRAND,
    source,
    source_quality: "manufacturer",
    ingredient_verification: "manufacturer",
    image_verification: "manufacturer",
    sitemap_url: sitemapUrl,
    official_api: "BigCommerce product pages + CDN content/pdp/products JSON + Storefront GraphQL SKU",
    max_urls: maxUrls,
    url_offset: urlOffset,
    url_limit: urlLimit,
    discovered_products: allUrls.length,
    prepared_products: urls.length,
    feed: {
      rows: dataRows.length,
      complete_food_rows: dataRows.filter((row) => row[completeIndex] === "true").length,
      non_complete_rows: dataRows.filter((row) => row[completeIndex] === "false").length,
      rows_with_ingredients: dataRows.filter((row) => compact(row[ingredientIndex])).length,
      rows_with_images: dataRows.filter((row) => compact(row[imageIndex])).length,
      rows_with_gtin: dataRows.filter((row) => compact(row[gtinIndex])).length,
      dog_rows: dataRows.filter((row) => row[petTypeIndex] === "dog").length,
      cat_rows: dataRows.filter((row) => row[petTypeIndex] === "cat").length,
    },
    sql: manifest ? {
      rows: manifest.total_sql_rows ?? manifest.total_rows,
      chunks: manifest.chunks?.length || 0,
      directory: sqlDir,
    } : null,
    warnings,
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
    urls_path: urlsPath,
    feed_path: feedPath,
    evidence_path: evidencePath,
    sql_dir: sqlDir,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`CANIDAE import batch prepared: ${source}`);
  console.log(`URLs: ${urlsPath}`);
  console.log(`Feed: ${feedPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Rows: ${report.feed.rows} (${report.feed.complete_food_rows} complete, ${report.feed.non_complete_rows} non-complete)`);
  if (warnings.length > 0) {
    console.error(`Warnings: ${warnings.length}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
