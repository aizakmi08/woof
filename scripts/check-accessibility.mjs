import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const INTERACTIVE_TAGS = new Set(["Pressable", "TouchableOpacity", "TouchableHighlight"]);
const SEARCH_ROOTS = ["App.js", "screens"];
const failures = [];

function gitFiles(args) {
  const output = execFileSync("git", args, {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function isScreenFile(filePath) {
  return filePath === "App.js" || (filePath.startsWith("screens/") && path.extname(filePath) === ".js");
}

function lineNumberForIndex(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function openingTagEnd(source, startIndex) {
  let quote = null;
  let braceDepth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];

    if (quote) {
      if (char === quote && previous !== "\\") quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    if (char === ">" && braceDepth === 0) {
      return index + 1;
    }
  }

  return -1;
}

function interactiveOpeningTags(source) {
  const tags = [];
  const tagRegex = /<(Pressable|TouchableOpacity|TouchableHighlight)\b/g;
  let match;

  while ((match = tagRegex.exec(source)) !== null) {
    const end = openingTagEnd(source, match.index);
    if (end === -1) continue;

    tags.push({
      name: match[1],
      start: match.index,
      text: source.slice(match.index, end),
    });
  }

  return tags;
}

function checkFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");

  for (const tag of interactiveOpeningTags(source)) {
    if (!/\bonPress(?:=|\b)/.test(tag.text)) continue;
    if (/\baccessible=\{false\}/.test(tag.text)) continue;

    const line = lineNumberForIndex(source, tag.start);

    if (!/\baccessibilityRole=/.test(tag.text)) {
      failures.push(`${filePath}:${line} ${tag.name} with onPress is missing accessibilityRole`);
    }

    if (!/\baccessibilityLabel=/.test(tag.text)) {
      failures.push(`${filePath}:${line} ${tag.name} with onPress is missing accessibilityLabel`);
    }
  }
}

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => (
      channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ));
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function checkDarkPaletteContrast() {
  const themeSource = fs.readFileSync("theme.js", "utf8");
  const darkPalette = themeSource.match(/dark:\s*\{([\s\S]*?)\n\s*\},/);
  if (!darkPalette) {
    failures.push("theme.js dark palette could not be inspected");
    return;
  }

  const color = (name) => {
    const match = darkPalette[1].match(new RegExp(`${name}:\\s*\"(#[0-9A-Fa-f]{6})\"`));
    return match?.[1] || null;
  };
  const surfaces = ["bg", "card", "surface"];
  const textColors = ["textSecondary", "textTertiary"];

  for (const textName of textColors) {
    const foreground = color(textName);
    if (!foreground) {
      failures.push(`theme.js dark.${textName} must be a six-digit hex color`);
      continue;
    }

    for (const surfaceName of surfaces) {
      const background = color(surfaceName);
      if (!background) {
        failures.push(`theme.js dark.${surfaceName} must be a six-digit hex color`);
        continue;
      }
      const ratio = contrastRatio(foreground, background);
      if (ratio < 4.5) {
        failures.push(
          `theme.js dark.${textName} contrast on ${surfaceName} is ${ratio.toFixed(2)}:1; expected at least 4.5:1`
        );
      }
    }
  }
}

const trackedFiles = gitFiles(["ls-files", "-z"]);
const untrackedFiles = gitFiles(["ls-files", "--others", "--exclude-standard", "-z"]);
const filesToCheck = [...new Set([...trackedFiles, ...untrackedFiles])]
  .filter(isScreenFile)
  .filter((filePath) => SEARCH_ROOTS.some((root) => filePath === root || filePath.startsWith(`${root}/`)))
  .sort();

for (const filePath of filesToCheck) {
  checkFile(filePath);
}

checkDarkPaletteContrast();

if (failures.length > 0) {
  console.error("Accessibility check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Accessibility check passed (${filesToCheck.length} files checked)`);
