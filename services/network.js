import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { AppState } from "react-native";
import { classifyError } from "./errors";

/**
 * Lightweight online/offline detector with NO native deps (works in Expo Go).
 *
 * Strategy:
 *   1. Listen for fetch failures app-wide via reportNetworkError() — three
 *      consecutive network errors within 30s flips us to "offline".
 *   2. While offline, ping a known-good endpoint every 5s. First successful
 *      ping flips us back to "online".
 *   3. Re-check on app foreground (AppState change) so users coming back from
 *      airplane mode get the right state immediately.
 *
 * Components subscribe via the useNetwork() hook — when offline we hide the
 * scan button gracefully + show a banner instead of letting users hit silent
 * fetch failures.
 */

const NetworkContext = createContext({ isOnline: true, lastChecked: 0, recheck: () => {} });

// Module-level tracker so non-React code (claude.js, opff.js) can report errors.
let _failureTimes = [];
let _onlineState = true;
let _listeners = new Set();

function _setOnline(value) {
  if (_onlineState === value) return;
  _onlineState = value;
  _failureTimes = [];
  for (const l of _listeners) {
    try { l(value); } catch {}
  }
}

/**
 * Call from any catch block when a fetch fails. Three network-class errors
 * within 30s flips the app to offline mode.
 */
export function reportNetworkError(err) {
  const c = classifyError(err);
  if (c.kind !== "network" && c.kind !== "timeout") return;
  const now = Date.now();
  _failureTimes = _failureTimes.filter((t) => now - t < 30_000);
  _failureTimes.push(now);
  if (_failureTimes.length >= 3 && _onlineState) {
    console.log("[NET] 3 network errors in 30s — flipping to offline");
    _setOnline(false);
  }
}

/**
 * Call from any successful fetch. Resets the failure counter.
 */
export function reportNetworkSuccess() {
  _failureTimes = [];
  if (!_onlineState) {
    console.log("[NET] Successful request — flipping back online");
    _setOnline(true);
  }
}

const PING_URL = "https://www.gstatic.com/generate_204";
const PING_TIMEOUT_MS = 4000;

async function ping() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), PING_TIMEOUT_MS);
    const res = await fetch(PING_URL, { method: "HEAD", signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [lastChecked, setLastChecked] = useState(0);
  const pingTimerRef = useRef(null);

  // Subscribe to module-level state changes
  useEffect(() => {
    const listener = (online) => setIsOnline(online);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const recheck = useCallback(async () => {
    const ok = await ping();
    setLastChecked(Date.now());
    if (ok) {
      _setOnline(true);
    } else if (_onlineState) {
      // Single failed ping doesn't flip us offline (could be transient).
      // Real flip happens via reportNetworkError after 3 consecutive failures.
    }
    return ok;
  }, []);

  // While offline, poll every 5s. Stop when back online.
  useEffect(() => {
    if (isOnline) {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      return;
    }
    pingTimerRef.current = setInterval(async () => {
      const ok = await ping();
      if (ok) {
        _setOnline(true);
        setLastChecked(Date.now());
      }
    }, 5000);
    return () => {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    };
  }, [isOnline]);

  // Re-check on app foreground — users coming back from airplane mode shouldn't
  // wait for a failed scan to learn they're offline.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") recheck();
    });
    return () => sub.remove();
  }, [recheck]);

  return (
    <NetworkContext.Provider value={{ isOnline, lastChecked, recheck }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}

/**
 * Imperative check for non-React code (e.g. analysisService before starting work).
 * Returns the current cached state synchronously — no network call.
 */
export function isOnlineNow() {
  return _onlineState;
}
