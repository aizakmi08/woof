module.exports = {
  preset: "jest-expo",
  clearMocks: true,
  restoreMocks: true,
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
};
