function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function stripTrailingCatalogFormulaCode(value) {
  return compact(value)
    .replace(/(\.)\s+[A-Z][0-9]{6}([,;.]|$)/gu, "$1$2")
    .replace(/\s+[A-Z][0-9]{6}([,;.]|$)/gu, "$1")
    .replace(/\.;/g, ";")
    .replace(/\.,/g, ",")
    .trim();
}

function splitTopLevel(value) {
  const items = [];
  let current = "";
  let parenthesesDepth = 0;
  let squareBracketDepth = 0;
  let curlyBracketDepth = 0;

  const pushCurrent = () => {
    const item = compact(current);
    if (item) items.push(item);
    current = "";
  };

  for (const character of String(value || "")) {
    if (character === "(") parenthesesDepth += 1;
    else if (character === ")") parenthesesDepth = Math.max(0, parenthesesDepth - 1);
    else if (character === "[") squareBracketDepth += 1;
    else if (character === "]") squareBracketDepth = Math.max(0, squareBracketDepth - 1);
    else if (character === "{") curlyBracketDepth += 1;
    else if (character === "}") curlyBracketDepth = Math.max(0, curlyBracketDepth - 1);

    const isSeparator = character === "," || character === ";" || character === "\n";
    if (
      isSeparator
      && parenthesesDepth === 0
      && squareBracketDepth === 0
      && curlyBracketDepth === 0
    ) {
      pushCurrent();
    } else {
      current += character;
    }
  }

  pushCurrent();
  return items;
}

function recognizedGroupContents(value) {
  const groupName = "(?:trace\\s+)?(?:vitamins?|minerals?|amino\\s+acids?)";
  const square = value.match(new RegExp(`^${groupName}\\s*:?\\s*\\[([\\s\\S]*)\\]\\.?$`, "iu"));
  if (square) return square[1];
  const parentheses = value.match(new RegExp(`^${groupName}\\s*:?\\s*\\(([\\s\\S]*)\\)\\.?$`, "iu"));
  if (parentheses) return parentheses[1];
  const curly = value.match(new RegExp(`^${groupName}\\s*:?\\s*\\{([\\s\\S]*)\\}\\.?$`, "iu"));
  return curly?.[1] || null;
}

function cleanIngredientName(value) {
  return compact(value)
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .replace(/\.$/, "")
    .trim();
}

export function splitIngredientStatement(value) {
  const statement = stripTrailingCatalogFormulaCode(value);
  const output = [];

  for (const token of splitTopLevel(statement)) {
    const groupContents = recognizedGroupContents(token);
    if (groupContents != null) {
      output.push(...splitIngredientStatement(groupContents));
      continue;
    }

    const ingredient = cleanIngredientName(token);
    if (ingredient) output.push(ingredient);
  }

  const seen = new Set();
  return output.filter((ingredient) => {
    const key = ingredient.toLocaleLowerCase("en-US");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeIngredientEvidenceTerm(value) {
  return compact(value)
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Official Open Farm trace cards may prefix certified proteins with
    // "CH" (Certified Humane) or "G.A.P. Step N". Those are sourcing
    // certifications, not part of the ingredient identity.
    .replace(/^(?:g\.?\s*a\.?\s*p\.?\s*step\s*\d+|ch)\s+/iu, "")
    // Manufacturer PDP cards sometimes omit the vitamin-number alias that is
    // present on the linked label PDF. The chemical ingredient is unchanged.
    .replace(/\s*\(\s*vitamin\s+[a-z](?:\s*-\s*|\s*)\d+\s*\)\s*$/iu, "")
    // PDP copy alternates singular/plural for this same label ingredient.
    .replace(/\bnatural\s+flavors\b/gu, "natural flavor")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalIngredientEvidence(value) {
  const ingredients = Array.isArray(value)
    ? value
    : splitIngredientStatement(value);
  return JSON.stringify(
    ingredients
      .map(normalizeIngredientEvidenceTerm)
      .filter(Boolean)
  );
}
