const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

config.resolver.blockList = [
  /supabase\/functions\/.*/,
];

module.exports = config;
