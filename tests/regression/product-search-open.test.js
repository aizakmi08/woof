const mockResolveProduct = jest.fn();
const mockTrackEvent = jest.fn();

jest.mock("../../components/AppText", () => {
  const ReactNative = require("react-native");
  return {
    AppText: ReactNative.Text,
    AppTextInput: ReactNative.TextInput,
  };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return { SafeAreaView: View };
});
jest.mock("lucide-react-native", () => {
  const React = require("react");
  const Icon = () => React.createElement(React.Fragment);
  return new Proxy({}, { get: () => Icon });
});
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn() }));
jest.mock("../../services/productCatalog", () => ({
  catalogProductToVerifiedProduct: (product) => product,
  collapseRepeatedIdentityText: (value) => String(value || "").replace(/\s+/g, " ").trim(),
  getCatalogProduct: jest.fn(),
  labelOcrSearchQueries: () => [],
  resolveProduct: (...args) => mockResolveProduct(...args),
}));
jest.mock("../../services/labelOcr", () => ({
  labelOcrIsAvailable: () => false,
  recognizeLabelText: jest.fn(),
}));
jest.mock("../../services/catalogQuality", () => ({
  productIsVerifiedReady: () => true,
}));
jest.mock("../../services/catalogSearchCache", () => ({
  getCachedCatalogSearch: async () => null,
  saveCachedCatalogSearch: async () => null,
}));
jest.mock("../../services/catalogCoverage", () => ({
  logCatalogLookupEvent: jest.fn(),
  logCatalogVerificationGapEvent: jest.fn(),
}));
jest.mock("../../services/analytics", () => ({
  trackEvent: (...args) => mockTrackEvent(...args),
}));
jest.mock("../../services/logger", () => ({
  createLogger: () => ({ debug: jest.fn() }),
}));
jest.mock("../../services/labelResolution", () => ({
  LABEL_RESOLUTION_DECISIONS: {
    EXACT_CONFIRMED: "exact_confirmed",
    RECOGNIZERS_DISAGREE: "recognizers_disagree",
    NO_EXACT_VARIANT: "no_exact_variant",
    TIMED_OUT: "timed_out",
  },
  productFormulaKey: (product) => product.cacheKey || "",
  reconcileLabelOutcomes: jest.fn(),
}));
jest.mock("../../services/runtimeConfig", () => ({
  getLabelResolutionConfig: async () => ({ source: "test", reconciliationTimeoutMs: 1000 }),
}));
jest.mock("../../theme", () => ({
  useTheme: () => ({
    bg: "#000",
    card: "#111",
    fill: "#222",
    separator: "#333",
    surface: "#222",
    textPrimary: "#fff",
    textSecondary: "#ccc",
    textTertiary: "#999",
    buttonPrimary: "#fff",
    buttonText: "#000",
  }),
  Colors: { scoreExcellent: "#0a0", scoreConcerning: "#a00" },
  Spacing: { screenPadding: 16 },
  Shadows: {},
}));
jest.mock("../../config/brand", () => ({ BRAND_NAME: "Woof" }));
jest.mock("../../services/catalogEvidenceConsent", () => ({
  requestCatalogEvidenceConsent: async () => true,
}));
jest.mock("../../services/auth", () => ({
  useAuth: () => ({ profile: null, canScan: () => true, remainingScans: () => 3 }),
}));
jest.mock("../../services/petProfile", () => ({
  normalizePetProfile: () => ({ petType: "" }),
}));
jest.mock("../../services/performanceTimings", () => ({
  logCaptureToResult: jest.fn(),
  logLabelScanStageTimings: jest.fn(),
  navigationTimingParams: () => ({}),
}));
jest.mock("../../services/devQaFixtures", () => ({
  DEV_QA_DRY_BAG_BOUNDARY_PRODUCTS: [],
  DEV_QA_PET_RESULT: {},
  DEV_QA_SEARCH_PRODUCTS: [],
}));
jest.mock("../../services/verifiedScoring", () => ({
  buildVerifiedPetFoodAnalysis: jest.fn(),
}));

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Image } from "react-native";
import ProductSearchScreen from "../../screens/ProductSearchScreen";

Image.prefetch = jest.fn(() => Promise.resolve(true));

const catalogProduct = {
  id: "fixture:natures-logic",
  cacheKey: "fixture:natures-logic",
  productName: "Canine Rabbit Meal Feast",
  brand: "Nature's Logic",
  productLine: "Distinction",
  flavor: "Rabbit Meal",
  lifeStage: "adult",
  foodForm: "dry",
  packageSize: "8 lb bag",
  petType: "dog",
  ingredientCount: 5,
  ingredientsText: "Rabbit meal, millet, chicken fat, dried carrot, vitamins",
  source: "woof_catalog",
  sourceKind: "catalog",
  sourceQuality: "manufacturer",
  ingredientVerificationStatus: "manufacturer",
  imageVerificationStatus: "manufacturer",
  imageUrl: "https://example.test/product.jpg",
};

test("pressing a typed catalog result navigates to its score", async () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
  };
  mockResolveProduct.mockResolvedValue({
    products: [catalogProduct],
    status: "exact",
    verificationState: { state: "verified_ready" },
    searchedQuery: "Nature's Logic",
    queryWasCorrected: false,
  });

  const screen = await render(
    <ProductSearchScreen
      navigation={navigation}
      route={{ params: { initialQuery: "Nature's Logic" } }}
    />
  );

  const row = await screen.findByRole("button", {
    name: /Nature's Logic.*Verified/i,
  }, { timeout: 2000 });
  fireEvent.press(row);

  await waitFor(() => {
    expect(navigation.navigate).toHaveBeenCalledWith("Results", expect.objectContaining({
      mode: "catalog",
      cacheKey: catalogProduct.cacheKey,
    }));
  });
  expect(mockTrackEvent).toHaveBeenCalledWith(
    "catalog_product_opened",
    expect.objectContaining({ selection_mode: "manual_search_result" })
  );
});
