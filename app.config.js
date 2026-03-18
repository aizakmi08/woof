require("dotenv").config();

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    GOOGLE_WEB_CLIENT_ID: process.env.GOOGLE_WEB_CLIENT_ID,
    REVENUECAT_API_KEY_IOS: process.env.REVENUECAT_API_KEY_IOS,
    REVENUECAT_API_KEY_ANDROID: process.env.REVENUECAT_API_KEY_ANDROID,
  },
});
