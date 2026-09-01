import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_NAME = "label-lookup";
const FUNCTION_AUDIT_VERSION = "2026-09-01-edge-package-form-identity-v20";
const MAX_IMAGE_B64_LENGTH = 2_400_000;
// On-device OCR runs in parallel and handles the common fast path. The second,
// shorter attempt is only for transient provider failures and stays within the
// client's bounded reconciliation window.
const CLAUDE_ATTEMPT_TIMEOUTS_MS = [4_800, 1_800];
const PRIMARY_LABEL_MODEL = Deno.env.get("LABEL_LOOKUP_MODEL") || "claude-haiku-4-5-20251001";
const LABEL_MAX_TOKENS = 240;

const DEFAULT_BROWSER_ORIGINS = new Set([
  "http://localhost:19006",
  "http://localhost:3000",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://127.0.0.1:19006",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8082",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Expose-Headers": "X-Woof-Function-Name, X-Woof-Function-Audit-Version, X-Woof-Label-Model, X-Woof-Label-Attempt",
  "Vary": "Origin",
};

const DEPLOYMENT_HEADERS = {
  "X-Woof-Function-Name": FUNCTION_NAME,
  "X-Woof-Function-Audit-Version": FUNCTION_AUDIT_VERSION,
};

const LABEL_LOOKUP_PROMPT = `Identify a dog or cat food from its front-package photo or retailer product listing.

Use visible front-package text and, when present, the visible retailer product title as identity evidence. A photo of a computer/phone screen or a product page is valid input: do not return found=false merely because page UI, prices, ratings, or controls are visible. Transcribe only visible identity text. The productName must include every prominent variant term needed to distinguish the exact package, including product line, puppy/kitten/senior or age, small/large breed, indoor, veterinary diet, recipe, wild-caught, grain-free, and texture words when visible. Never return only the brand when more identity text is readable.

Separate the product identity from benefit badges and marketing claims. Phrases beginning with Supports, For, Made With, or Guaranteed are not automatically a product line, recipe, or condition. For example, "Supports Sensitive Skin & Stomach Guaranteed" on a Nutro package is a benefit badge: copy it to marketingClaims, but do not add Sensitive to productName, productLine, flavor, or searchQuery unless Sensitive is also visibly part of the main product title. Put the exact main-label phrases used for identity in identityEvidence and excluded badges in marketingClaims.

Return the consumer-facing brand in brand, not a corporate parent. For Purina packages, use Beneful, Moist & Meaty, Purina ONE, Pro Plan, Fancy Feast, Friskies, Cat Chow, or Dog Chow when that name is visible; do not reduce those brands to Purina. Put a line such as Originals, RawMix, or Complete Essentials in productLine. Put every prominent protein or named recipe such as Farm-Raised Beef, Burger with Cheddar, or Wild Ocean in flavor as well as productName when visible.

Determine petType independently and carefully. Use visible DOG/CAT wording plus unmistakable package evidence such as a dog or cat silhouette, species icon, or animal photo. A small cat silhouette printed on the front label is positive cat evidence and outranks learned familiarity with similarly named dog products. When no DOG or DOGS wording is visible, never return dog merely because the recipe or brand also sells dog food. Return unknown when the package does not provide reliable species evidence. For foodForm, preserve freeze-dried when it is visibly stated instead of reducing it to dry. Use unmistakable physical package evidence too: a multi-pound upright bag or visible kibble is dry, while a single can, tray, or pouch is wet. A bag must not become wet merely because its net weight is written in ounces. A multi-can or multi-pouch case can have a total weight in pounds and is still wet. Marketing copy such as "meaty morsels in every bite" does not make a multi-pound bag wet. If package form evidence conflicts, return an empty foodForm instead of guessing.

Classify productCategory only from wording visibly printed on the centered package. Use complete_food for a normal dog/cat food, treat/topper/mixer/supplement only when that category is explicitly visible, and unknown when uncertain. Copy the exact short visible phrases supporting the category into categoryEvidence. Text on neighboring products, shelf tags, search results, reviews, recommendations, or navigation must not classify the centered product. If complete-food and non-complete wording conflict, return productCategory unknown. Never infer ingredients, scores, reviews, recalls, or nutrition. If the package is not pet food or the identity is unreadable, return found=false. Return only compact JSON with no markdown.

Use this exact JSON shape:
{
  "found": true | false,
  "productName": "visible product name or empty string",
  "brand": "visible brand or empty string",
  "productLine": "visible product line/sub-brand or empty string",
  "flavor": "visible flavor or recipe, e.g. Chicken & Brown Rice, or empty string",
  "lifeStage": "visible life stage, e.g. puppy, adult, senior, kitten, or empty string",
  "foodForm": "visible form, e.g. dry, wet, pate, freeze-dried, fresh, or empty string",
  "packageSize": "visible size/weight/count, e.g. 24 lb, 3 oz, 12 cans, or empty string",
  "petType": "dog" | "cat" | "unknown",
  "productCategory": "complete_food" | "treat" | "topper" | "mixer" | "supplement" | "unknown",
  "categoryEvidence": ["up to 4 exact short visible phrases supporting productCategory"],
  "identityEvidence": ["up to 6 exact short main-label phrases used for identity"],
  "marketingClaims": ["up to 4 excluded benefit-badge phrases"],
  "confidence": 0.0-1.0
}`;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function configuredAllowedOrigins(): Set<string> {
  const configured = Deno.env.get("WOOF_ALLOWED_ORIGINS") || "";
  const origins = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_BROWSER_ORIGINS, ...origins]);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  if (!origin) {
    return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS, "Access-Control-Allow-Origin": "*" };
  }

  if (configuredAllowedOrigins().has(origin)) {
    return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS, "Access-Control-Allow-Origin": origin };
  }

  return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS };
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = CORS_HEADERS,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...DEPLOYMENT_HEADERS,
      ...headers,
      ...extraHeaders,
      "Content-Type": "application/json",
    },
  });
}

function cleanAndParse(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
    }
    throw new Error("Label response did not contain complete JSON");
  }
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function confidence(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeLookup(raw: Record<string, unknown>): Record<string, unknown> {
  const productName = optionalString(raw.productName);
  const brand = optionalString(raw.brand);
  const productLine = optionalString(raw.productLine);
  const flavor = optionalString(raw.flavor);
  const lifeStage = optionalString(raw.lifeStage);
  const foodForm = optionalString(raw.foodForm);
  const packageSize = optionalString(raw.packageSize);
  const rawPetType = optionalString(raw.petType).toLowerCase();
  const petType = ["dog", "cat", "unknown"].includes(rawPetType) ? rawPetType : "unknown";
  const rawProductCategory = optionalString(raw.productCategory).toLowerCase();
  const productCategory = [
    "complete_food",
    "treat",
    "topper",
    "mixer",
    "supplement",
    "unknown",
  ].includes(rawProductCategory)
    ? rawProductCategory
    : "unknown";
  const searchQuery = optionalString(raw.searchQuery) || [
    brand,
    productLine,
    productName,
    flavor,
    lifeStage,
    foodForm,
    packageSize,
  ].filter(Boolean).join(" ");
  const found = raw.found !== false && Boolean(productName || searchQuery);

  return {
    found,
    productName,
    brand,
    productLine,
    flavor,
    lifeStage,
    foodForm,
    packageSize,
    petType,
    productCategory,
    categoryEvidence: stringArray(raw.categoryEvidence).slice(0, 4),
    identityEvidence: stringArray(raw.identityEvidence).slice(0, 6),
    marketingClaims: stringArray(raw.marketingClaims).slice(0, 4),
    confidence: confidence(raw.confidence),
    searchQuery,
    visibleText: stringArray(raw.visibleText),
    notes: optionalString(raw.notes),
  };
}

async function requestLabelLookup({
  model,
  anthropicKey,
  imageBase64,
  timeoutMs,
}: {
  model: string;
  anthropicKey: string;
  imageBase64: string;
  timeoutMs: number;
}): Promise<{ response: Response; lookup?: Record<string, unknown>; errorText?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: LABEL_MAX_TOKENS,
        temperature: 0,
        system: LABEL_LOOKUP_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
              },
              {
                type: "text",
                text: "Return the visible product identity.",
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        response,
        errorText: await response.text().catch(() => ""),
      };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      return { response, errorText: "No label lookup response returned" };
    }

    return {
      response,
      lookup: normalizeLookup(cleanAndParse(text)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  const responseHeaders = corsHeaders(req);
  const json = (
    body: Record<string, unknown>,
    status = 200,
    extraHeaders: Record<string, string> = {},
  ) => jsonResponse(body, status, responseHeaders, extraHeaders);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: responseHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing auth token" }, 401);
  }

  let supabaseUrl: string;
  let serviceRoleKey: string;
  let anthropicKey: string;
  try {
    supabaseUrl = requiredEnv("SUPABASE_URL");
    serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    anthropicKey = requiredEnv("ANTHROPIC_API_KEY");
  } catch (err) {
    console.error("[LABEL_LOOKUP] Config error:", (err as Error).message);
    return json({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.substring(7));

  if (authError || !user) {
    return json({ error: "Invalid auth token" }, 401);
  }

  const { data: allowed, error: rateLimitError } = await supabase.rpc("check_rate_limit", {
    p_user_id: user.id,
    p_max_requests: 40,
    p_window_minutes: 60,
  });

  if (rateLimitError) {
    console.error("[LABEL_LOOKUP] Rate limit check failed:", rateLimitError.message);
  } else if (allowed === false) {
    return json({ error: "Rate limit exceeded. Please wait before scanning again." }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const imageBase64 = body.imageBase64;
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return json({ error: "imageBase64 is required" }, 400);
  }
  if (imageBase64.length > MAX_IMAGE_B64_LENGTH) {
    return json({ error: "Image too large. Please use a smaller image." }, 413);
  }

  try {
    let lastError = "Label lookup failed.";
    for (let attemptIndex = 0; attemptIndex < CLAUDE_ATTEMPT_TIMEOUTS_MS.length; attemptIndex += 1) {
      try {
        const attempt = await requestLabelLookup({
          model: PRIMARY_LABEL_MODEL,
          anthropicKey,
          imageBase64,
          timeoutMs: CLAUDE_ATTEMPT_TIMEOUTS_MS[attemptIndex],
        });
        if (attempt.lookup) {
          return json(attempt.lookup, 200, {
            "X-Woof-Label-Model": PRIMARY_LABEL_MODEL,
            "X-Woof-Label-Attempt": String(attemptIndex + 1),
          });
        }
        const status = attempt.response.status;
        lastError = attempt.errorText || `Label provider returned ${status}`;
        console.error(
          "[LABEL_LOOKUP] Claude API error:",
          PRIMARY_LABEL_MODEL,
          status,
          lastError.slice(0, 300),
        );
        const retryable = status === 408 || status === 429 || status >= 500;
        if (!retryable || attemptIndex === CLAUDE_ATTEMPT_TIMEOUTS_MS.length - 1) {
          return json(
            { error: "Label lookup failed. Please try again." },
            status >= 500 ? 502 : status,
          );
        }
      } catch (err) {
        lastError = (err as Error).message;
        console.error(
          "[LABEL_LOOKUP] Model response failed:",
          PRIMARY_LABEL_MODEL,
          `attempt=${attemptIndex + 1}`,
          lastError,
        );
        if (attemptIndex === CLAUDE_ATTEMPT_TIMEOUTS_MS.length - 1) {
          return json({ error: "Label lookup timed out. Search by name or try again." }, 504);
        }
      }
    }
    return json({ error: lastError }, 502);
  } catch (err) {
    console.error("[LABEL_LOOKUP] Failed:", (err as Error).message);
    return json({ error: "Label lookup failed. Please try again." }, 502);
  }
});
