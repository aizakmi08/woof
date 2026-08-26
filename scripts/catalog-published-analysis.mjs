const CORE_NUTRIENTS = new Map([
  ["protein", "protein"],
  ["crude protein", "protein"],
  ["fat", "fat"],
  ["crude fat", "fat"],
  ["fiber", "fiber"],
  ["fibre", "fiber"],
  ["crude fiber", "fiber"],
  ["crude fibre", "fiber"],
  ["moisture", "moisture"],
  ["ash", "ash"],
  ["calcium", "calcium"],
  ["phosphorus", "phosphorus"],
]);

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function cellText(value) {
  return compact(decodeEntities(stripTags(value)));
}

function normalizedLabel(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[®™*¹²³]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nutrientKey(value) {
  const label = normalizedLabel(value);
  return CORE_NUTRIENTS.get(label) || null;
}

function percentValue(value) {
  const text = compact(value).replace(/,/g, "");
  if (!/%/.test(text)) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

function numberValues(value) {
  return [...String(value || "").matchAll(/(?<![A-Za-z])\d[\d,]*(?:\.\d+)?/g)]
    .map(([number]) => Number(number.replace(/,/g, "")))
    .filter(Number.isFinite);
}

function tableMatrix(tableHtml) {
  const rows = [];
  for (const rowMatch of String(tableHtml || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map((match) => cellText(match[1]));
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function tableAnalysisLabel(context) {
  if (/actual\s+analysis/i.test(context)) return "Actual Analysis";
  if (/typical\s+analysis/i.test(context)) return "Typical Analysis";
  if (/average\s+nutrient(?:\s*&\s*caloric\s+content)?/i.test(context)) {
    return "Average Nutrient & Caloric Content";
  }
  return "";
}

function analysisPayload(values, {
  publisherLabel,
  sourceFormat,
  sourceUrl,
} = {}) {
  const coreCount = ["protein", "fat", "fiber", "ash", "calcium", "phosphorus"]
    .filter((key) => Number.isFinite(values[key])).length;
  if (coreCount < 3 || !Number.isFinite(values.protein) || !Number.isFinite(values.fat)) return null;

  return {
    typical_analysis: {
      ...values,
      analysis_type: "typical",
      basis: "dry_matter",
      source_url: sourceUrl,
      source_format: sourceFormat,
      publisher_label: publisherLabel,
    },
    published_analysis_source: {
      status: "extracted",
      analysis_type: "typical",
      basis: "dry_matter",
      publisher_label: publisherLabel,
      source_format: sourceFormat,
      source_url: sourceUrl,
    },
  };
}

export function extractPublishedAnalysisFromHtml(html, sourceUrl) {
  const source = String(html || "");
  const values = {};
  let publisherLabel = "";

  for (const tableMatch of source.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const tableHtml = tableMatch[0];
    const matrix = tableMatrix(tableHtml);
    if (matrix.length < 2) continue;

    const tableStart = tableMatch.index || 0;
    const context = cellText(source.slice(Math.max(0, tableStart - 9000), tableStart + Math.min(tableHtml.length, 1200)));
    const label = tableAnalysisLabel(`${context} ${matrix.flat().join(" ")}`);
    if (!label) continue;

    let dryMatterColumn = -1;
    let headerRowIndex = -1;
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 4); rowIndex += 1) {
      let column = matrix[rowIndex].findIndex((cell, columnIndex) => (
        columnIndex > 0 && /\bdry\s+matter(?:\s+analysis)?\s+basis\b/i.test(cell)
      ));
      if (column === -1) {
        column = matrix[rowIndex].findIndex((cell, columnIndex) => (
          columnIndex > 0 && /\bdry\s+matter\b/i.test(cell)
        ));
      }
      if (column !== -1) {
        dryMatterColumn = column;
        headerRowIndex = rowIndex;
        break;
      }
    }
    if (dryMatterColumn < 1) continue;

    for (const row of matrix.slice(headerRowIndex + 1)) {
      const key = nutrientKey(row[0]);
      if (!key || values[key] !== undefined) continue;
      const value = percentValue(row[dryMatterColumn]);
      if (value !== null) values[key] = value;
    }
    publisherLabel ||= label;
  }

  return analysisPayload(values, {
    publisherLabel,
    sourceFormat: "html_table",
    sourceUrl,
  });
}

export function extractPublishedAnalysisFromText(text, sourceUrl) {
  const normalized = String(text || "").replace(/\r/g, "\n");
  const sectionMatch = normalized.match(
    /\b(TYPICAL\s+ANALYSIS|ACTUAL\s+ANALYSIS|AVERAGE\s+NUTRIENT(?:\s*&\s*CALORIC\s+CONTENT)?)\b[\s\S]{0,300}?\b(?:AS[-\s]?IS|AS[-\s]?FED)\s+BASIS\b[\s\S]{0,120}?\bDRY\s+MATTER\s+BASIS\b([\s\S]{0,12000}?)(?=\n\s*(?:\*|NUTRITIONAL\s+ADEQUACY|INGREDIENTS|FEEDING\s+(?:GUIDE|GUIDELINES|INSTRUCTIONS)|$))/i
  );
  if (!sectionMatch) return null;

  const publisherLabel = compact(sectionMatch[1]).replace(/\s+/g, " ");
  const values = {};
  for (const rawLine of sectionMatch[2].split(/\n+/)) {
    const line = compact(rawLine);
    if (!line || !/%/.test(line)) continue;
    const labelMatch = line.match(/^([A-Za-z][A-Za-z\s-]*?)\s+%\s+(.+)$/);
    if (!labelMatch) continue;
    const key = nutrientKey(labelMatch[1]);
    if (!key || values[key] !== undefined || key === "moisture") continue;
    const numbers = numberValues(labelMatch[2]);
    if (numbers.length >= 2) values[key] = numbers[numbers.length - 1];
  }

  return analysisPayload(values, {
    publisherLabel: /^actual/i.test(publisherLabel) ? "Actual Analysis" : "Typical Analysis",
    sourceFormat: "pdf_text",
    sourceUrl,
  });
}

function absoluteUrl(value, baseUrl) {
  try {
    return new URL(compact(value), baseUrl).toString();
  } catch {
    return "";
  }
}

export function publishedAnalysisPdfSource(html, baseUrl) {
  const source = String(html || "");
  for (const match of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].match(/\bhref\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/i)?.[1];
    if (!href) continue;
    const title = match[1].match(/\btitle\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const label = compact(`${cellText(match[2])} ${decodeEntities(title)}`);
    if (!/\b(?:typical|actual)\s+analysis\b|\b(?:view\s+)?complete\s+nutritional\s+profile\b|\bnutrient\s+profile\b/i.test(label)) {
      continue;
    }
    const sourceUrl = absoluteUrl(href, baseUrl);
    if (!/^https:\/\//i.test(sourceUrl)) continue;
    return {
      publisher_label: label,
      source_format: "pdf",
      source_url: sourceUrl,
    };
  }
  return null;
}

function objectValue(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Plain text is preserved as an adequacy statement below.
  }
  return { adequacy_statement: compact(value) };
}

export function mergePublishedAnalysis(existing, analysis, source = null) {
  if (!analysis && !source) return existing || "";
  const merged = {
    ...objectValue(existing),
    ...(analysis || {}),
  };
  if (!analysis && source) {
    merged.published_analysis_source = {
      ...source,
      status: "requires_verified_extraction",
    };
  }
  return JSON.stringify(merged);
}
