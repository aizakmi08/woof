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
