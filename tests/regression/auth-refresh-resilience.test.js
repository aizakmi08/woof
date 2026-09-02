const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const mockSignOut = jest.fn();

jest.mock("../../services/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
      refreshSession: (...args) => mockRefreshSession(...args),
      signOut: (...args) => mockSignOut(...args),
    },
  },
}));
jest.mock("../../config/env", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
}));
jest.mock("../../services/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("../../services/logger", () => ({
  createLogger: () => ({ debug: jest.fn() }),
}));
jest.mock("expo/fetch", () => ({}));

import { identifyProductLabel } from "../../services/claude";
import { authRefreshFailurePolicy } from "../../services/entitlementResilience";

const expiringSession = {
  access_token: "old-access-token",
  refresh_token: "refresh-token",
  expires_at: Math.floor(Date.now() / 1000) + 20,
  user: { id: "user-a" },
};

const failureMatrix = [
  ["offline", { name: "TypeError", message: "Network request failed" }, "retry_keep_session"],
  ["DNS failure", { name: "TypeError", message: "getaddrinfo ENOTFOUND" }, "retry_keep_session"],
  ["server 500", { name: "AuthRetryableFetchError", status: 500, message: "Internal error" }, "retry_keep_session"],
  ["generic 401", { name: "HttpError", status: 401, message: "Gateway rejected request" }, "retry_keep_session"],
  ["revoked refresh token", { name: "AuthApiError", status: 400, code: "refresh_token_not_found" }, "sign_out"],
  ["expired refresh token", { name: "AuthApiError", status: 401, code: "invalid_refresh_token" }, "sign_out"],
  ["clock skew", { name: "AuthRetryableFetchError", message: "token used before issued" }, "retry_keep_session"],
];

describe("auth refresh resilience", () => {
  test.each(failureMatrix)("%s follows the explicit sign-out matrix", (_name, error, expected) => {
    expect(authRefreshFailurePolicy(error)).toBe(expected);
  });

  test("a network failure in the production label request keeps the local session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: expiringSession }, error: null });
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { name: "TypeError", message: "Network request failed" },
    });

    await expect(identifyProductLabel("base64-label")).rejects.toMatchObject({
      code: "AUTH_REFRESH_RETRYABLE",
    });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  test("a revoked token in the production label request signs out locally", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({ data: { session: expiringSession }, error: null });
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: {
        name: "AuthApiError",
        status: 400,
        code: "refresh_token_not_found",
        message: "Refresh token not found",
      },
    });

    await expect(identifyProductLabel("base64-label")).rejects.toThrow(
      "Session expired. Please sign in again."
    );
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
