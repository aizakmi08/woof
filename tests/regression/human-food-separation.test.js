const mockGetSession = jest.fn();

jest.mock("../../services/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
      refreshSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));
jest.mock("../../config/env", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
}));
jest.mock("../../services/analytics", () => ({
  trackEvent: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../services/logger", () => ({
  createLogger: () => ({ debug: jest.fn() }),
}));
jest.mock("expo/fetch", () => ({}));

import { analyzeHumanFood } from "../../services/claude";

function apiResponse(overrides = {}) {
  return {
    ok: true,
    json: async () => ({
      content: [{
        text: JSON.stringify({
          foodName: "Unidentified food",
          petType: "dog",
          safetyLevel: "unidentified",
          overallScore: 99,
          summary: "The item could not be identified.",
          explanation: "The image does not provide enough evidence.",
          toxicCompounds: [],
          symptoms: "N/A",
          portions: "Do not feed until identified.",
          benefits: [],
          alternatives: ["Known dog-safe food"],
          ageGuidance: {
            puppiesOrKittens: "caution",
            adults: "caution",
            seniors: "caution",
            note: "Identification is required for every age.",
          },
          preparation: "Identify the food first.",
          ...overrides,
        }),
      }],
    }),
    text: async () => "",
  };
}

describe("human-food trust boundary", () => {
  test("unidentified human food resolves to caution and cannot receive a pet-food score", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: "user-a" },
        },
      },
      error: null,
    });
    global.fetch = jest.fn(async () => apiResponse());

    const result = await analyzeHumanFood("base64-image", "dog");

    expect(result.safetyLevel).toBe("caution");
    expect(result).not.toHaveProperty("overallScore");
  });
});
