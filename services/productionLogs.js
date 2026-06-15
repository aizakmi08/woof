const isDev =
  typeof __DEV__ !== "undefined"
    ? __DEV__
    : process.env.NODE_ENV !== "production";

if (!isDev && !globalThis.__WOOF_PRODUCTION_LOG_FILTER_INSTALLED__) {
  globalThis.__WOOF_PRODUCTION_LOG_FILTER_INSTALLED__ = true;
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}
