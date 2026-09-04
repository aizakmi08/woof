import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default;
const APP_ROOTS = ["App.js", "components/", "config/", "screens/", "services/"];

function isEmptyObject(node) {
  return node?.type === "ObjectExpression" && node.properties.length === 0;
}

function containsExplicitNull(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "NullLiteral") return true;
  return Object.entries(node).some(([key, value]) => {
    if (["loc", "start", "end", "extra", "leadingComments", "trailingComments"].includes(key)) {
      return false;
    }
    if (Array.isArray(value)) return value.some(containsExplicitNull);
    return containsExplicitNull(value);
  });
}

function functionName(functionPath) {
  if (functionPath.node.type === "FunctionDeclaration") return functionPath.node.id?.name || "anonymous";
  if (functionPath.parentPath?.isVariableDeclarator()) return functionPath.parentPath.node.id?.name || "anonymous";
  return "anonymous";
}

function functionBinding(functionPath) {
  const name = functionName(functionPath);
  if (name === "anonymous") return null;
  return functionPath.parentPath?.scope?.getBinding(name)
    || functionPath.scope.getBinding(name)
    || null;
}

function hasDefensiveNormalization(functionPath, parameterName) {
  let normalized = false;
  const isNormalization = (node) => node?.type === "LogicalExpression"
    && node.operator === "||"
    && node.left?.type === "Identifier"
    && node.left.name === parameterName
    && isEmptyObject(node.right);

  functionPath.traverse({
    VariableDeclarator(variablePath) {
      if (isNormalization(variablePath.node.init)) normalized = true;
    },
    AssignmentExpression(assignmentPath) {
      if (isNormalization(assignmentPath.node.right)) normalized = true;
    },
  });
  return normalized;
}

function assignmentPatternsIn(parameter) {
  if (!parameter) return [];
  if (parameter.type === "AssignmentPattern") {
    return [parameter, ...assignmentPatternsIn(parameter.left)];
  }
  if (parameter.type === "ObjectPattern") {
    return parameter.properties.flatMap((property) => (
      property.type === "ObjectProperty" ? assignmentPatternsIn(property.value) : []
    ));
  }
  if (parameter.type === "ArrayPattern") {
    return parameter.elements.flatMap((element) => assignmentPatternsIn(element));
  }
  if (parameter.type === "RestElement") return assignmentPatternsIn(parameter.argument);
  return [];
}

export function findNullableDefaultParamRisks(source, filename = "unknown.js") {
  const ast = parse(source, {
    sourceType: "unambiguous",
    plugins: ["jsx", "optionalChaining", "nullishCoalescingOperator"],
  });
  const defaultObjectTargets = new Map();
  const nullableBindings = new Set();

  traverse(ast, {
    Function(functionPath) {
      const parameters = [];
      functionPath.node.params.forEach((parameter, index) => {
        if (
          parameter.type === "AssignmentPattern"
          && parameter.left.type === "Identifier"
          && isEmptyObject(parameter.right)
          && !hasDefensiveNormalization(functionPath, parameter.left.name)
        ) {
          parameters.push({ index, name: parameter.left.name });
        }
      });
      if (parameters.length === 0) return;
      const binding = functionBinding(functionPath);
      if (binding) defaultObjectTargets.set(binding, { name: functionName(functionPath), parameters });
    },
    VariableDeclarator(variablePath) {
      if (
        variablePath.node.id.type === "ArrayPattern"
        && variablePath.node.id.elements[0]?.type === "Identifier"
        && variablePath.node.init?.type === "CallExpression"
        && variablePath.node.init.callee?.type === "Identifier"
        && variablePath.node.init.callee.name === "useState"
        && containsExplicitNull(variablePath.node.init.arguments[0])
      ) {
        const binding = variablePath.scope.getBinding(variablePath.node.id.elements[0].name);
        if (binding) nullableBindings.add(binding);
      } else if (variablePath.node.id.type === "Identifier" && containsExplicitNull(variablePath.node.init)) {
        const binding = variablePath.scope.getBinding(variablePath.node.id.name);
        if (binding) nullableBindings.add(binding);
      }
    },
  });

  let changed = true;
  while (changed) {
    changed = false;
    traverse(ast, {
      Function(functionPath) {
        for (const functionParameter of functionPath.node.params) {
          for (const parameter of assignmentPatternsIn(functionParameter)) {
            if (
              parameter.left.type !== "Identifier"
              || parameter.right.type !== "Identifier"
            ) continue;
            const sourceBinding = functionPath.scope.getBinding(parameter.right.name);
            const targetBinding = functionPath.scope.getBinding(parameter.left.name);
            if (sourceBinding && targetBinding && nullableBindings.has(sourceBinding) && !nullableBindings.has(targetBinding)) {
              nullableBindings.add(targetBinding);
              changed = true;
            }
          }
        }
      },
    });
  }

  const findings = [];
  traverse(ast, {
    CallExpression(callPath) {
      if (callPath.node.callee.type !== "Identifier") return;
      const target = defaultObjectTargets.get(callPath.scope.getBinding(callPath.node.callee.name));
      if (!target) return;

      for (const parameter of target.parameters) {
        const argument = callPath.node.arguments[parameter.index];
        const argumentBinding = argument?.type === "Identifier"
          ? callPath.scope.getBinding(argument.name)
          : null;
        if (!containsExplicitNull(argument) && !(argumentBinding && nullableBindings.has(argumentBinding))) continue;
        findings.push({
          file: filename,
          line: callPath.node.loc?.start.line || 1,
          functionName: target.name,
          parameterName: parameter.name,
        });
      }
    },
  });
  return findings;
}

function repositoryFiles() {
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    encoding: "buffer",
  });
  return Buffer.concat([tracked, untracked])
    .toString("utf8")
    .split("\0")
    .filter((file) => file.endsWith(".js"))
    .filter((file) => APP_ROOTS.some((root) => file === root || file.startsWith(root)))
    .filter((file, index, files) => files.indexOf(file) === index)
    .sort();
}

const badFixture = `
  function title(value = {}) { return value.name; }
  function Screen() {
    const [value] = useState(null);
    return title(value);
  }
`;
if (findNullableDefaultParamRisks(badFixture, "regression-fixture.js").length !== 1) {
  throw new Error("Nullable-default regression fixture was not detected");
}

const fixedFixture = `
  function title(value = {}) {
    const safeValue = value || {};
    return safeValue.name;
  }
  function Screen() {
    const [value] = useState(null);
    return title(value);
  }
`;
if (findNullableDefaultParamRisks(fixedFixture, "fixed-fixture.js").length !== 0) {
  throw new Error("Defensively normalized nullable-default fixture was rejected");
}

const findings = repositoryFiles().flatMap((file) => (
  findNullableDefaultParamRisks(fs.readFileSync(path.resolve(file), "utf8"), file)
));

if (findings.length > 0) {
  console.error("Nullable default-parameter safety check failed:");
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line}: ${finding.functionName}(${finding.parameterName} = {}) `
      + "can receive an explicitly nullable value; normalize null inside the callee."
    );
  }
  process.exit(1);
}

console.log(
  `Nullable default-parameter safety check passed (${repositoryFiles().length} app files; regression fixture detected).`
);
