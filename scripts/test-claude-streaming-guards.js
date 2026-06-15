#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const claudeSource = fs.readFileSync(path.join(root, "services/claude.js"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`claude streaming guard failed: ${message}`);
    process.exit(1);
  }
}

assert(
  claudeSource.includes("function _consumeSseRecord(record, onText)") &&
    claudeSource.includes("function _consumeSseText(input, state, onText, { flush = false } = {})"),
  "Claude streaming must use a shared buffered SSE parser"
);

assert(
  claudeSource.includes("state.buffer += input") &&
    claudeSource.includes("state.buffer.split(/\\r?\\n\\r?\\n/)") &&
    claudeSource.includes("state.buffer = records.pop() ?? \"\""),
  "SSE parser must preserve trailing partial records between ReadableStream chunks"
);

assert(
  claudeSource.includes("if (flush && state.buffer.trim())") &&
    claudeSource.includes("_consumeSseText(remaining, sseState") &&
    claudeSource.includes("{ flush: true }"),
  "streaming parser must flush the final buffered SSE record at EOF"
);

const streamingBlock = claudeSource.slice(
  claudeSource.indexOf("if (hasReadableStream) {"),
  claudeSource.indexOf("} else {", claudeSource.indexOf("if (hasReadableStream) {"))
);

assert(
  streamingBlock.includes("const sseState = { buffer: \"\", done: false }") &&
    streamingBlock.includes("_consumeSseText(chunk, sseState") &&
    !streamingBlock.includes("chunk.split(\"\\n\")") &&
    !streamingBlock.includes("remaining.split(\"\\n\")"),
  "ReadableStream path must not parse each chunk as complete SSE lines"
);

assert(
  /function extractTextFromSSE\(sseText\)[\s\S]{0,220}_consumeSseText\(sseText, state,[\s\S]{0,120}\{ flush: true \}/.test(claudeSource),
  "full-text SSE fallback must use the same parser as the streaming path"
);

assert(
  claudeSource.includes("function _analysisServerError(message, status)") &&
    claudeSource.includes("err.status = status") &&
    claudeSource.includes("err.retryable = status >= 500") &&
    claudeSource.includes("function _analysisErrorFromResponse(response)") &&
    claudeSource.includes("throw await _analysisErrorFromResponse(response)") &&
    claudeSource.includes("function _isNonRetryableAnalysisError(err)") &&
    claudeSource.includes("status >= 400 && status < 500") &&
    claudeSource.includes('err.code === "ANALYSIS_CLIENT_ERROR"') &&
    claudeSource.includes("free scan limit|daily free safety check|upgrade to pro|quota|unauthorized|forbidden|session expired"),
  "analyze HTTP failures must be typed so streaming fallback can distinguish quota/auth denials from retryable stream failures"
);

for (const fn of ["analyzeIngredients", "analyzeWithData", "analyzeHumanFood"]) {
  const start = claudeSource.indexOf(`export async function ${fn}`);
  const end = claudeSource.indexOf("\nexport async function ", start + 1);
  const body = claudeSource.slice(start, end === -1 ? undefined : end);
  assert(
    body.includes("if (_isNonRetryableAnalysisError(err)) throw err;") &&
      body.indexOf("if (_isNonRetryableAnalysisError(err)) throw err;") <
        body.indexOf("falling back to non-streaming"),
    `${fn} must not retry non-streaming after a non-retryable streaming analyze HTTP error`
  );
}

console.log("claude streaming guard passed");
