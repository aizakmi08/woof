const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const path = require("node:path");

const config = getSentryExpoConfig(__dirname);

config.resolver.blockList = [
  /supabase\/functions\/.*/,
];

// Metro still resolves statically imported modules inside `__DEV__` branches.
// Resolve QA-only modules to inert release stubs so fixtures are absent from
// production artifacts, not merely hidden from navigation.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (!context.dev) {
    const normalizedName = moduleName.replace(/\\/g, "/").replace(/\.js$/, "");
    if (normalizedName.endsWith("/services/devQaFixtures")) {
      return {
        type: "sourceFile",
        filePath: path.join(__dirname, "release-stubs", "devQaFixtures.js"),
      };
    }
    if (normalizedName.endsWith("/screens/DevQAScreen")) {
      return {
        type: "sourceFile",
        filePath: path.join(__dirname, "release-stubs", "DevQAScreen.js"),
      };
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
