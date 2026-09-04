const mockResolveProduct = jest.fn();
const mockTrackEvent = jest.fn();
const mockReconcileLabelOutcomes = jest.fn();
let mockSavedPetType = "";

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
  reconcileLabelOutcomes: (...args) => mockReconcileLabelOutcomes(...args),
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
  normalizePetProfile: () => ({ petType: mockSavedPetType }),
}));
jest.mock("../../services/performanceTimings", () => ({
  logCaptureToResult: jest.fn(),
  logLabelScanStageTimings: jest.fn(),
  logTypedSearchComplete: jest.fn(),
  navigationTimingParams: () => ({}),
}));
jest.mock("../../services/devQaFixtures", () => ({
  DEV_QA_DRY_BAG_BOUNDARY_PRODUCTS: [],
  DEV_QA_PET_RESULT: {
    productName: "QA source result",
    brand: "QA Fixture",
    petType: "dog",
    overallScore: 82,
  },
  DEV_QA_SEARCH_PRODUCTS: [{
    cacheKey: "dev-qa-small-5lb",
    productName: "QA Small Breed Chicken Recipe",
    brand: "QA Fixture",
    petType: "dog",
    foodForm: "dry",
    packageSize: "5 lb bag",
    ingredientCount: 5,
    ingredientVerificationStatus: "manufacturer",
    imageVerificationStatus: "manufacturer",
    imageUrl: "https://qa.invalid/dev-product-5lb.png",
  }],
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
  rank: 10,
};

describe("typed catalog search", () => {
  beforeEach(() => {
    mockSavedPetType = "";
  });

  test("pressing a result navigates for free and Pro users", async () => {
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

  test("development search fixtures open Results without requiring the live quota RPC", async () => {
    const navigation = {
      goBack: jest.fn(),
      navigate: jest.fn(),
      replace: jest.fn(),
    };

    const screen = await render(
      <ProductSearchScreen
        navigation={navigation}
        route={{ params: { devFixture: "typed_results" } }}
      />
    );

    const row = await screen.findByRole("button", {
      name: /QA Fixture.*QA Small Breed Chicken Recipe.*5 lb bag.*Verified/i,
    }, { timeout: 2000 });
    fireEvent.press(row);

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith("Results", expect.objectContaining({
        mode: "catalog",
        cacheKey: "dev-qa-small-5lb",
        devFixtureResult: expect.objectContaining({
          productName: "QA Small Breed Chicken Recipe",
          brand: "QA Fixture",
          petType: "dog",
          overallScore: 82,
        }),
      }));
    });
  });

  test("changing label inputs mid-flight restarts lookup and clears loading", async () => {
    const navigation = {
      goBack: jest.fn(),
      navigate: jest.fn(),
      replace: jest.fn(),
    };
    const neverSettles = new Promise(() => {});
    mockResolveProduct
      .mockReturnValueOnce(neverSettles)
      .mockResolvedValueOnce({ products: [catalogProduct] });
    mockReconcileLabelOutcomes.mockReturnValue({
      products: [catalogProduct],
      selectedProduct: null,
      confirmedProduct: null,
      status: "candidates",
      confidence: 0.7,
      decision: "recognizers_disagree",
      verificationState: { state: "verified_ready" },
      identification: {
        found: true,
        labelRead: true,
        brand: "Nature's Logic",
        productName: "Canine Rabbit Meal Feast",
        searchQuery: "Nature's Logic Rabbit",
      },
      resolutionEvidence: {
        pathsAvailable: ["cloud_image"],
        agreementFields: [],
        disagreementFields: ["variant"],
        reasonCodes: ["no_exact_variant"],
        visualConfirmation: false,
        recognizedIdentity: { cloudImage: null, onDeviceOcr: null },
        confirmedCandidate: null,
        autoOpenFired: false,
        resultMode: "candidate_list",
      },
    });

    const firstRoute = {
      params: {
        labelImageBase64: "first-image",
        labelCaptureId: "capture-one",
      },
    };
    const screen = await render(
      <ProductSearchScreen navigation={navigation} route={firstRoute} />
    );
    expect(await screen.findByText("Reading product label...")).toBeTruthy();

    await screen.rerender(
      <ProductSearchScreen
        navigation={navigation}
        route={{
          params: {
            labelImageBase64: "second-image",
            labelCaptureId: "capture-two",
          },
        }}
      />
    );

    await screen.findByRole("button", {
      name: /Nature's Logic.*Verified/i,
    }, { timeout: 2000 });
    expect(screen.queryByText("Searching products...")).toBeNull();
    expect(mockResolveProduct).toHaveBeenCalledTimes(2);
  });

  test("a saved-species change mid-flight restarts label work instead of leaving a spinner", async () => {
    const navigation = {
      goBack: jest.fn(),
      navigate: jest.fn(),
      replace: jest.fn(),
    };
    mockResolveProduct
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({ products: [catalogProduct] });
    mockReconcileLabelOutcomes.mockReturnValue({
      products: [catalogProduct],
      selectedProduct: null,
      confirmedProduct: null,
      status: "candidates",
      confidence: 0.7,
      decision: "recognizers_disagree",
      verificationState: { state: "verified_ready" },
      identification: {
        found: true,
        labelRead: true,
        brand: "Nature's Logic",
        productName: "Canine Rabbit Meal Feast",
        searchQuery: "Nature's Logic Rabbit",
      },
      resolutionEvidence: {
        pathsAvailable: ["cloud_image"],
        agreementFields: [],
        disagreementFields: ["variant"],
        reasonCodes: ["no_exact_variant"],
        visualConfirmation: false,
        recognizedIdentity: { cloudImage: null, onDeviceOcr: null },
        confirmedCandidate: null,
        autoOpenFired: false,
        resultMode: "candidate_list",
      },
    });

    const props = {
      navigation,
      route: {
        params: {
          labelImageBase64: "same-image",
          labelCaptureId: "same-capture",
        },
      },
    };
    const screen = await render(<ProductSearchScreen {...props} />);
    expect(await screen.findByText("Reading product label...")).toBeTruthy();

    mockSavedPetType = "dog";
    await screen.rerender(<ProductSearchScreen {...props} />);

    await screen.findByRole("button", {
      name: /Nature's Logic.*Verified/i,
    }, { timeout: 2000 });
    expect(screen.queryByText("Searching products...")).toBeNull();
    expect(mockResolveProduct).toHaveBeenCalledTimes(2);
  });
});
