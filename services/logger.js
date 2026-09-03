const isDev = typeof __DEV__ !== "undefined" ? __DEV__ : false;

function log(method, args) {
  if (!isDev) return;
  const target = console[method] || console.log;
  target.apply(console, args);
}

export function createLogger(scope) {
  const prefix = scope ? `[${scope}]` : "[WOOF]";

  return {
    debug: (...args) => log("log", [prefix, ...args]),
    info: (...args) => log("log", [prefix, ...args]),
    warn: (...args) => log("warn", [prefix, ...args]),
    error: (...args) => log("error", [prefix, ...args]),
  };
}
