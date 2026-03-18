const OPFF_BASE = "https://world.openpetfoodfacts.org";

function normalizeProduct(raw) {
  const p = raw.product || raw;

  const nutriments = p.nutriments || {};

  return {
    productName: p.product_name || p.product_name_en || "",
    brand: p.brands || "",
    petType: detectPetType(p),
    barcode: p.code || p._id || "",
    ingredientsText: p.ingredients_text || p.ingredients_text_en || "",
    ingredients: (p.ingredients || []).map((ing) => ({
      id: ing.id || "",
      text: ing.text || "",
      percent: ing.percent_estimate ?? null,
    })),
    nutriments: {
      protein: nutriments.proteins_100g ?? nutriments.proteins ?? null,
      fat: nutriments.fat_100g ?? nutriments.fat ?? null,
      fiber:
        nutriments.fiber_100g ??
        nutriments["crude-fiber_100g"] ??
        nutriments.fiber ??
        null,
      energy: nutriments["energy-kcal_100g"] ?? nutriments.energy_100g ?? null,
    },
    nutriscoreGrade: p.nutriscore_grade || p.nutrition_grades || null,
    novaGroup: p.nova_group ?? null,
    imageUrl: p.image_url || p.image_front_url || null,
  };
}

function detectPetType(p) {
  const text = [
    p.product_name,
    p.categories,
    p.categories_tags?.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes("dog") || text.includes("chien")) return "dog";
  if (text.includes("cat") || text.includes("chat")) return "cat";
  return "unknown";
}

export async function lookupBarcode(barcode) {
  console.log("[OPFF] lookupBarcode called with:", barcode);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const url = `${OPFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json`;
    console.log("[OPFF] GET", url);
    const response = await fetch(url, {
      headers: { "User-Agent": "Woof App - pet food scanner" },
      signal: controller.signal,
    });

    console.log("[OPFF] lookupBarcode response status:", response.status);

    if (!response.ok) {
      console.log("[OPFF] lookupBarcode failed — HTTP", response.status);
      return { found: false };
    }

    const data = await response.json();

    if (!data.product || data.status === 0) {
      console.log("[OPFF] lookupBarcode — product not found in response");
      return { found: false };
    }

    const product = normalizeProduct(data);
    console.log("[OPFF] lookupBarcode — FOUND:", product.productName, "|", product.brand);
    return { found: true, product };
  } catch (err) {
    console.log("[OPFF] lookupBarcode error:", err.message);
    return { found: false };
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchByName(name) {
  console.log("[OPFF] searchByName called with:", name);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const url = `${OPFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(name)}&json=true&page_size=5`;
    console.log("[OPFF] GET", url);
    const response = await fetch(url, {
      headers: { "User-Agent": "Woof App - pet food scanner" },
      signal: controller.signal,
    });

    console.log("[OPFF] searchByName response status:", response.status);

    if (!response.ok) {
      console.log("[OPFF] searchByName failed — HTTP", response.status);
      return { found: false };
    }

    const data = await response.json();

    if (!data.products || data.products.length === 0) {
      console.log("[OPFF] searchByName — no results found");
      return { found: false };
    }

    const product = normalizeProduct(data.products[0]);
    console.log("[OPFF] searchByName — FOUND:", product.productName, "| results:", data.products.length);
    return { found: true, product };
  } catch (err) {
    console.log("[OPFF] searchByName error:", err.message);
    return { found: false };
  } finally {
    clearTimeout(timeout);
  }
}
