import ts from "typescript";

const STATIC_PROPERTY_KINDS = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NumericLiteral,
]);

export function assertRestrictedVisualAst(source, allowedHelpers) {
  const file = parse(source, "visual");
  let callCount = 0;
  for (const statement of file.statements) {
    if (ts.isEmptyStatement(statement)) continue;
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
      reject(file, statement, "visual source allows only top-level helper call statements");
    }
    const call = statement.expression;
    if (!ts.isIdentifier(call.expression) || !allowedHelpers.includes(call.expression.text)) {
      reject(file, call.expression, `visual call must target one of: ${allowedHelpers.join(", ")}`);
    }
    callCount += 1;
    for (const argument of call.arguments) assertLiteralValue(file, argument, "visual helper argument");
  }
  if (callCount === 0) throw new Error("visual source must call at least one helper");
}

export function assertRestrictedGraphAst(source) {
  const file = parse(source, "graph");
  const declared = new Set();
  const calls = new Set();

  for (const statement of file.statements) {
    if (ts.isEmptyStatement(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      if (statement.modifiers?.length) {
        reject(file, statement, "graph declarations cannot have export or declare modifiers");
      }
      if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
        reject(file, statement, "graph declarations must use const");
      }
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          reject(file, declaration, "graph declarations need a simple identifier and initializer");
        }
        assertGraphValue(file, declaration.initializer, declared, calls);
        declared.add(declaration.name.text);
      }
      continue;
    }
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
      const name = graphCallName(statement.expression.expression);
      if (name !== "section" && name !== "connect") {
        reject(file, statement.expression, "top-level graph statements must call section(...) or connect(...)");
      }
      calls.add(name);
      for (const argument of statement.expression.arguments) assertGraphValue(file, argument, declared, calls);
      continue;
    }
    reject(file, statement, "graph source allows only const declarations and section/connect calls");
  }
  for (const required of ["node", "section", "connect"]) {
    if (!calls.has(required)) throw new Error(`graph source must call ${required}(...)`);
  }
}

function parse(source, contract) {
  const file = ts.createSourceFile(
    `generated-${contract}.ts`,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  if (file.parseDiagnostics.length > 0) {
    const diagnostic = file.parseDiagnostics[0];
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    const start = diagnostic.start ?? 0;
    const { line, character } = file.getLineAndCharacterOfPosition(start);
    throw new Error(`Invalid ${contract} source syntax at ${line + 1}:${character + 1}: ${message}`);
  }
  return file;
}

function assertLiteralValue(file, node, context) {
  if (
    ts.isStringLiteral(node)
    || ts.isNumericLiteral(node)
    || node.kind === ts.SyntaxKind.TrueKeyword
    || node.kind === ts.SyntaxKind.FalseKeyword
    || node.kind === ts.SyntaxKind.NullKeyword
  ) return;
  if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operator) && ts.isNumericLiteral(node.operand)) return;
  if (ts.isParenthesizedExpression(node)) return assertLiteralValue(file, node.expression, context);
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) reject(file, element, `${context} cannot use spread syntax`);
      assertLiteralValue(file, element, context);
    }
    return;
  }
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || !STATIC_PROPERTY_KINDS.has(property.name.kind)) {
        reject(file, property, `${context} objects allow only static property assignments`);
      }
      assertSafePropertyName(file, property.name);
      assertLiteralValue(file, property.initializer, context);
    }
    return;
  }
  reject(file, node, `${context} must be literal data, not ${ts.SyntaxKind[node.kind]}`);
}

function assertGraphValue(file, node, declared, calls) {
  if (
    ts.isStringLiteral(node)
    || ts.isNumericLiteral(node)
    || node.kind === ts.SyntaxKind.TrueKeyword
    || node.kind === ts.SyntaxKind.FalseKeyword
    || node.kind === ts.SyntaxKind.NullKeyword
  ) return;
  if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operator) && ts.isNumericLiteral(node.operand)) return;
  if (ts.isParenthesizedExpression(node)) return assertGraphValue(file, node.expression, declared, calls);
  if (ts.isIdentifier(node)) {
    if (!declared.has(node.text)) reject(file, node, `unknown graph identifier: ${node.text}`);
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) reject(file, element, "graph arrays cannot use spread syntax");
      assertGraphValue(file, element, declared, calls);
    }
    return;
  }
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isShorthandPropertyAssignment(property) && !property.objectAssignmentInitializer) {
        assertSafePropertyName(file, property.name);
        if (!declared.has(property.name.text)) reject(file, property.name, `unknown graph identifier: ${property.name.text}`);
        continue;
      }
      if (!ts.isPropertyAssignment(property) || !STATIC_PROPERTY_KINDS.has(property.name.kind)) {
        reject(file, property, "graph objects allow only static property assignments");
      }
      assertSafePropertyName(file, property.name);
      assertGraphPropertyName(file, property.name);
      assertGraphValue(file, property.initializer, declared, calls);
    }
    return;
  }
  if (ts.isCallExpression(node)) {
    const name = graphCallName(node.expression);
    if (!name) reject(file, node.expression, "unknown graph call target");
    calls.add(name);
    for (const argument of node.arguments) assertGraphValue(file, argument, declared, calls);
    return;
  }
  reject(file, node, `graph value cannot use ${ts.SyntaxKind[node.kind]}`);
}

function graphCallName(expression) {
  if (ts.isIdentifier(expression) && ["node", "section", "connect"].includes(expression.text)) {
    return expression.text;
  }
  if (
    ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === "layout"
    && ["row", "column"].includes(expression.name.text)
  ) {
    return expression.name.text;
  }
  return null;
}

function assertSafePropertyName(file, name) {
  const value = ts.isIdentifier(name) ? name.text : name.text;
  if (["__proto__", "constructor", "prototype"].includes(String(value))) {
    reject(file, name, `forbidden property name: ${value}`);
  }
}

function assertGraphPropertyName(file, name) {
  const value = ts.isIdentifier(name) ? name.text : name.text;
  if (["children", "minWidth", "minHeight", "x", "y"].includes(String(value))) {
    reject(file, name, `graph geometry property is runner-owned: ${value}`);
  }
}

function reject(file, node, message) {
  const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
  throw new Error(`${message} at ${line + 1}:${character + 1}`);
}
