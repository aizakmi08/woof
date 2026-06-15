#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`history UI guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  /history\.slice\(0, showAllHistory \? history\.length : 3\)\.map/.test(homeSource),
  "expanded history must render every retained history row, not a second hard cap"
);

assert(
  !/history\.slice\(0, showAllHistory \? 10 : 3\)/.test(homeSource),
  "expanded history must not cap Show all at 10 entries"
);

assert(
  homeSource.includes('showAllHistory ? "Show less" : `Show all (${history.length})`'),
  "Show all copy must reflect the retained history count"
);

assert(
  homeSource.includes('import { getHistory, clearHistory, enrichHistoryImages } from "../services/history";') &&
    homeSource.includes("const historyLoadSeqRef = useRef(0)") &&
    homeSource.includes("const historyLoadAbortRef = useRef(null)") &&
    homeSource.includes("const historyImageEnrichAbortRef = useRef(null)") &&
    homeSource.includes("historyLoadAbortRef.current?.abort();") &&
    homeSource.includes("historyImageEnrichAbortRef.current?.abort();") &&
    homeSource.includes("const seq = ++historyLoadSeqRef.current;") &&
    homeSource.includes("const historyController = new AbortController();") &&
    homeSource.includes("historyLoadAbortRef.current = historyController;") &&
    homeSource.includes("historyController.abort(err);") &&
    homeSource.includes("getHistory({ signal: historyController.signal, enrichImages: false })") &&
    homeSource.includes("if (seq !== historyLoadSeqRef.current) return;") &&
    homeSource.includes("historyData.some((item) => !item.productImageUrl && item.cacheKey)") &&
    homeSource.includes("const enrichController = new AbortController();") &&
    homeSource.includes("historyImageEnrichAbortRef.current = enrichController;") &&
    homeSource.includes("enrichHistoryImages(historyData, { signal: enrichController.signal })") &&
    homeSource.includes("if (seq !== historyLoadSeqRef.current || historyImageEnrichAbortRef.current !== enrichController) return;") &&
    homeSource.includes('console.log("[HOME] History image enrichment failed:", err.message);') &&
    homeSource.includes("if (historyLoadAbortRef.current === historyController)") &&
    homeSource.includes("historyLoadAbortRef.current = null;") &&
    homeSource.includes("if (historyImageEnrichAbortRef.current === enrichController)") &&
    homeSource.includes("historyImageEnrichAbortRef.current = null;") &&
    homeSource.includes("if (seq === historyLoadSeqRef.current) setHistoryLoading(false);") &&
    /useFocusEffect\([\s\S]*?return \(\) => \{[\s\S]*?historyLoadSeqRef\.current \+= 1;[\s\S]*?historyLoadAbortRef\.current\?\.abort\(\);[\s\S]*?historyImageEnrichAbortRef\.current\?\.abort\(\);[\s\S]*?historyLoadAbortRef\.current = null;[\s\S]*?historyImageEnrichAbortRef\.current = null;[\s\S]*?setHistoryLoading\(false\);/.test(homeSource),
  "Home history loads must abort timed-out, superseded, blurred, and thumbnail-enrichment reads while ignoring stale responses/errors"
);

assert(
  /const handleHistoryPress = useCallback\(\(item\) => \{[\s\S]{0,120}const cacheKey = String\(item\.cacheKey \|\| ""\)\.trim\(\);[\s\S]{0,220}const cacheKeyPetType = cacheKey\.endsWith\("__dog"\)[\s\S]{0,180}const itemPetType = \["dog", "cat"\]\.includes\(item\.petType\) \? item\.petType : cacheKeyPetType;[\s\S]{0,220}navigation\.navigate\("Results", \{[\s\S]{0,80}mode: "history",[\s\S]{0,80}cacheKey,[\s\S]{0,120}\.\.\.\(item\.scanMode && \{ scanMode: item\.scanMode \}\),[\s\S]{0,120}\.\.\.\(itemPetType && \{ petType: itemPetType \}\),[\s\S]{0,160}historyAnalysis: item\.analysisPayload/.test(homeSource),
  "pet-food history taps must preserve scan mode and dog/cat route metadata so Results can replay species-specific local/shared cache rows"
);

assert(
  packageJson.includes('"test:history-ui": "node scripts/test-history-ui-guards.js"') &&
    packageJson.includes("npm run test:history-ui"),
  "history UI guard must be wired into package scripts"
);

console.log("history UI guard passed");
