const mockRpc = jest.fn();

jest.mock("../../services/supabase", () => ({
  supabase: { rpc: (...args) => mockRpc(...args) },
}));
jest.mock("../../services/claude", () => ({ identifyProductLabel: jest.fn() }));
jest.mock("../../services/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import {
  consumeCatalogProduct,
  searchCatalogProducts,
} from "../../services/productCatalog";
import { rawVerifiedCatalogRow } from "../fixtures/catalogRows";

function rpcResponse(response) {
  return { abortSignal: () => Promise.resolve(response) };
}

describe("catalog quota boundary", () => {
  beforeEach(() => mockRpc.mockReset());

  test("search requests only teaser data", async () => {
    const row = rawVerifiedCatalogRow();
    const teaser = {
      cache_key: row.cache_key,
      product_name: row.product_name,
      brand: row.brand,
      gtin: row.gtin,
      product_line: row.product_line,
      flavor: row.flavor,
      life_stage: row.life_stage,
      food_form: row.food_form,
      package_size: row.package_size,
      pet_type: row.pet_type,
      ingredient_count: row.ingredient_count,
      source: row.source,
      source_quality: row.source_quality,
      ingredient_verification_status: row.ingredient_verification_status,
      image_verification_status: row.image_verification_status,
      verified_at: row.verified_at,
      image_url: row.image_url,
      source_url: row.source_url,
      rank: 10,
    };
    mockRpc.mockReturnValue(rpcResponse({ data: [teaser], error: null }));

    const products = await searchCatalogProducts("Nature's Logic", { petType: "dog" });

    expect(mockRpc).toHaveBeenCalledWith(
      "search_verified_product_teasers",
      expect.objectContaining({ q: "nature s logic" })
    );
    expect(products).toHaveLength(1);
    expect(products[0].ingredientCount).toBe(row.ingredient_count);
    expect(products[0].ingredients).toEqual([]);
    expect(products[0].ingredientsText).toBe("");
  });

  test("full data is returned only by atomic quota consumption", async () => {
    const row = rawVerifiedCatalogRow();
    mockRpc.mockReturnValue(rpcResponse({
      data: {
        allowed: true,
        reason: "free_scan_consumed",
        scan_usage: { allowed: true, scan_count: 1, remaining: 2 },
        product: row,
      },
      error: null,
    }));

    const result = await consumeCatalogProduct({
      cacheKey: row.cache_key,
      scanId: "catalog-attempt",
      scanMode: "catalog",
    });

    expect(mockRpc).toHaveBeenCalledWith("consume_verified_catalog_product", {
      p_cache_key: row.cache_key,
      p_scan_id: "catalog-attempt",
      p_scan_mode: "catalog",
    });
    expect(result.product.ingredients).toEqual(row.ingredients);
    expect(result.product.hasPublishedNutrients).toBe(true);
    expect(result.scanUsage.remaining).toBe(2);
  });

  test("quota denial never produces a product", async () => {
    mockRpc.mockReturnValue(rpcResponse({
      data: {
        allowed: false,
        reason: "free_limit_reached",
        scan_usage: { allowed: false, scan_count: 3, remaining: 0 },
        product: null,
      },
      error: null,
    }));

    await expect(consumeCatalogProduct({
      cacheKey: "catalog:four",
      scanId: "catalog-fourth",
    })).rejects.toMatchObject({
      code: "SCAN_LIMIT_REACHED",
      reason: "free_limit_reached",
      scanUsage: { remaining: 0 },
    });
  });
});
