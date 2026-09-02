let mockSession = { user: { id: "user-a" } };
const mockInsert = jest.fn(async () => ({ error: null }));

jest.mock("../../services/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
    },
    from: () => ({ insert: (...args) => mockInsert(...args) }),
  },
}));
jest.mock("expo-constants", () => ({
  expoConfig: { version: "1.2.4", runtimeVersion: "1.2.4" },
  nativeBuildVersion: "59",
  executionEnvironment: "test",
}));

import { trackEvent } from "../../services/analytics";

describe("analytics privacy execution", () => {
  test("redacts PII and secrets before the database insert", async () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature_value";
    const opaque = "A".repeat(100);
    await trackEvent("privacy_probe", {
      email: "person@example.com",
      web: "https://example.com/private?email=person@example.com",
      file: "/Users/person/Documents/secret.jpg",
      androidFile: "/storage/emulated/0/DCIM/private.jpg",
      jwt,
      apiKey: "sk-proj-abcdefghijklmnop123456",
      image: opaque,
      nested: { value: `Bearer ${jwt}` },
    });

    const inserted = mockInsert.mock.calls[0][0];
    const serialized = JSON.stringify(inserted.properties);
    expect(serialized).toContain("[email]");
    expect(serialized).toContain("[url]");
    expect(serialized).toContain("[file]");
    expect(serialized).toContain("[jwt]");
    expect(serialized).toContain("[secret]");
    expect(serialized).toContain("[redacted]");
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("/Users/person");
    expect(serialized).not.toContain(jwt);
    expect(serialized).not.toContain(opaque);
  });

  test("analytics session identifiers do not persist across accounts", async () => {
    mockSession = { user: { id: "user-a" } };
    await trackEvent("account_a_event");
    const accountASession = mockInsert.mock.calls[0][0].session_id;

    mockInsert.mockClear();
    mockSession = { user: { id: "user-b" } };
    await trackEvent("account_b_event");
    const accountBSession = mockInsert.mock.calls[0][0].session_id;

    expect(accountASession).not.toBe(accountBSession);
  });
});
