import { builtinModules } from 'node:module';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repositoryRoot, 'src');
const coreLayers = new Set(['base', 'model', 'proposal', 'workspace']);
const knownLayers = new Set([
  'academic',
  'base',
  'codecs',
  'editor',
  'entrypoints',
  'features',
  'integration',
  'model',
  'platform',
  'proposal',
  'public',
  'services',
  'storage',
  'workspace',
]);
const forbiddenDirectoryNames = new Set([
  'agent-host',
  'external-agent-sdk',
  'model-adapters',
  'planner',
  'prompts',
  'public-mcp',
]);
const forbiddenRuntimePackagePatterns = [
  /^@comet\//u,
  /^@langchain\//u,
  /^@openai\/agents(?:\/|$)/u,
  /^block-?suite(?:\/|$)/u,
  /^ckeditor(?:\/|$)/u,
  /^langchain(?:\/|$)/u,
  /^lexical(?:\/|$)/u,
  /^openai(?:\/|$)/u,
  /^prosemirror(?:-|\/|$)/u,
  /^slate(?:-|\/|$)/u,
  /^textbus(?:\/|$)/u,
];
const nodeBuiltins = new Set(
  builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`]),
);
const allowedDependencies = new Map([
  ['base', new Set()],
  ['model', new Set(['base'])],
  ['workspace', new Set(['base', 'model'])],
  ['proposal', new Set(['base', 'model', 'workspace'])],
  ['academic', new Set(['base', 'model'])],
  ['services', new Set(['academic', 'base', 'model', 'proposal', 'workspace'])],
  ['editor', new Set(['base', 'model', 'proposal', 'workspace'])],
  ['storage', new Set(['base', 'model', 'workspace'])],
  ['codecs', new Set(['academic', 'base', 'model'])],
  [
    'platform',
    new Set([
      'academic',
      'base',
      'codecs',
      'model',
      'proposal',
      'services',
      'storage',
      'workspace',
    ]),
  ],
  [
    'features',
    new Set([
      'academic',
      'base',
      'codecs',
      'editor',
      'model',
      'platform',
      'proposal',
      'services',
      'storage',
      'workspace',
    ]),
  ],
  ['integration', new Set(['academic', 'base', 'model', 'proposal', 'services', 'workspace'])],
  [
    'public',
    new Set([
      'academic',
      'base',
      'codecs',
      'editor',
      'features',
      'integration',
      'model',
      'platform',
      'proposal',
      'services',
      'storage',
      'workspace',
    ]),
  ],
  [
    'entrypoints',
    new Set([
      'academic',
      'base',
      'codecs',
      'editor',
      'features',
      'integration',
      'model',
      'platform',
      'proposal',
      'public',
      'services',
      'storage',
      'workspace',
    ]),
  ],
]);

const diagnostics = [];
const dependencyGraph = new Map();

function toRepositoryPath(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function sourceLayer(filePath) {
  const relativePath = path.relative(sourceRoot, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return undefined;
  }

  return relativePath.split(path.sep)[0];
}

function addDiagnostic(filePath, sourceFile, node, message) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  diagnostics.push(
    `${toRepositoryPath(filePath)}:${position.line + 1}:${position.character + 1} ${message}`,
  );
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listTypeScriptFiles(directory) {
  if (!(await pathExists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'generated' || entry.name === 'generated-types') {
          return [];
        }
        return listTypeScriptFiles(entryPath);
      }

      return /\.(?:cts|mts|tsx?|d\.ts)$/u.test(entry.name) ? [entryPath] : [];
    }),
  );

  return nestedFiles.flat().sort();
}

function moduleSpecifierFromNode(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }

  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteralLike(node.argument.literal)
  ) {
    return node.argument.literal.text;
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length === 1
  ) {
    const [argument] = node.arguments;
    return argument !== undefined && ts.isStringLiteralLike(argument) ? argument.text : undefined;
  }

  return undefined;
}

function isTypeOnlyModuleReference(node) {
  if (ts.isImportTypeNode(node)) {
    return true;
  }

  if (ts.isExportDeclaration(node)) {
    return node.isTypeOnly;
  }

  if (ts.isImportDeclaration(node)) {
    const importClause = node.importClause;
    if (importClause === undefined || importClause.name !== undefined) {
      return importClause?.isTypeOnly ?? false;
    }
    if (importClause.isTypeOnly) {
      return true;
    }
    const namedBindings = importClause.namedBindings;
    return (
      namedBindings !== undefined &&
      ts.isNamedImports(namedBindings) &&
      namedBindings.elements.length > 0 &&
      namedBindings.elements.every((element) => element.isTypeOnly)
    );
  }

  return false;
}

function candidatePaths(importerPath, specifier) {
  const unresolvedPath = path.resolve(path.dirname(importerPath), specifier);
  const extension = path.extname(unresolvedPath);
  const withoutRuntimeExtension = /\.(?:c|m)?js$/u.test(extension)
    ? unresolvedPath.slice(0, -extension.length)
    : unresolvedPath;

  return [
    unresolvedPath,
    `${withoutRuntimeExtension}.ts`,
    `${withoutRuntimeExtension}.tsx`,
    `${withoutRuntimeExtension}.mts`,
    `${withoutRuntimeExtension}.cts`,
    path.join(unresolvedPath, 'index.ts'),
    path.join(unresolvedPath, 'index.tsx'),
    path.join(unresolvedPath, 'index.mts'),
    path.join(unresolvedPath, 'index.cts'),
  ];
}

async function resolveRelativeImport(importerPath, specifier, sourceFiles) {
  if (!specifier.startsWith('.')) {
    return undefined;
  }

  for (const candidatePath of candidatePaths(importerPath, specifier)) {
    const normalizedPath = path.normalize(candidatePath);
    if (sourceFiles.has(normalizedPath)) {
      return normalizedPath;
    }
  }

  return undefined;
}

function isForbiddenRuntimePackage(specifier) {
  return forbiddenRuntimePackagePatterns.some((pattern) => pattern.test(specifier));
}

function isPropertyAccess(node, objectName, propertyName) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === objectName &&
    node.name.text === propertyName
  );
}

function inspectRuntimeBoundary(filePath, sourceFile, node, layer) {
  if (ts.isIdentifier(node) && node.text === 'ChangeSet') {
    addDiagnostic(
      filePath,
      sourceFile,
      node,
      'ChangeSet is forbidden; use Operation, Transaction, or ProposalChangeGroup.',
    );
  }

  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require'
  ) {
    addDiagnostic(
      filePath,
      sourceFile,
      node,
      'CommonJS require() is forbidden in production source.',
    );
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    (isPropertyAccess(node.left, 'module', 'exports') ||
      (ts.isPropertyAccessExpression(node.left) &&
        ts.isIdentifier(node.left.expression) &&
        node.left.expression.text === 'exports'))
  ) {
    addDiagnostic(
      filePath,
      sourceFile,
      node,
      'CommonJS exports are forbidden in production source.',
    );
  }

  if (
    (ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'eval') ||
    (ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Function')
  ) {
    addDiagnostic(filePath, sourceFile, node, 'Dynamic code execution is forbidden.');
  }

  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'console'
  ) {
    addDiagnostic(filePath, sourceFile, node, 'Production code must use an injected logger.');
  }

  if (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'innerHTML' &&
    !toRepositoryPath(filePath).includes('/sanitizer/')
  ) {
    addDiagnostic(
      filePath,
      sourceFile,
      node,
      'innerHTML is only allowed inside an explicit sanitizer boundary.',
    );
  }

  if (layer === undefined || !coreLayers.has(layer)) {
    return;
  }

  const isAmbientNetworkCall =
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['fetch', 'setInterval', 'setTimeout'].includes(node.expression.text);
  const isAmbientConstructor =
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['Date', 'WebSocket', 'XMLHttpRequest'].includes(node.expression.text);
  const isNondeterministicProperty =
    isPropertyAccess(node, 'Date', 'now') ||
    isPropertyAccess(node, 'Math', 'random') ||
    isPropertyAccess(node, 'crypto', 'randomUUID') ||
    isPropertyAccess(node, 'performance', 'now') ||
    (ts.isPropertyAccessExpression(node) && isPropertyAccess(node.expression, 'process', 'env'));

  if (isAmbientNetworkCall || isAmbientConstructor || isNondeterministicProperty) {
    addDiagnostic(
      filePath,
      sourceFile,
      node,
      'Core must receive time, IDs, scheduling, and I/O through explicit interfaces.',
    );
  }
}

async function inspectImport(filePath, sourceFile, node, specifier, sourceFiles) {
  const layer = sourceLayer(filePath);

  if (isForbiddenRuntimePackage(specifier)) {
    addDiagnostic(
      filePath,
      sourceFile,
      node,
      `Nireco production source must not depend on agent/editor runtime package "${specifier}".`,
    );
  }

  if (layer !== undefined && coreLayers.has(layer) && nodeBuiltins.has(specifier)) {
    addDiagnostic(
      filePath,
      sourceFile,
      node,
      `Core layer "${layer}" must not import Node built-in "${specifier}".`,
    );
  }

  if (specifier.startsWith('@comet-internal/nireco-editor')) {
    addDiagnostic(
      filePath,
      sourceFile,
      node,
      'Production source must not self-import through the published package boundary.',
    );
  }

  if (!specifier.startsWith('.')) {
    return;
  }

  const rawTargetPath = path.resolve(path.dirname(filePath), specifier);
  const testsRoot = path.join(repositoryRoot, 'tests');
  if (rawTargetPath === testsRoot || rawTargetPath.startsWith(`${testsRoot}${path.sep}`)) {
    addDiagnostic(filePath, sourceFile, node, 'Production source must not import tests/.');
  }

  const targetPath = await resolveRelativeImport(filePath, specifier, sourceFiles);
  if (targetPath === undefined) {
    return;
  }

  if (!isTypeOnlyModuleReference(node)) {
    dependencyGraph.get(filePath)?.add(targetPath);
  }

  const targetLayer = sourceLayer(targetPath);
  if (layer === undefined || targetLayer === undefined || layer === targetLayer) {
    return;
  }

  const allowedLayers = allowedDependencies.get(layer);
  if (allowedLayers === undefined || !allowedLayers.has(targetLayer)) {
    addDiagnostic(
      filePath,
      sourceFile,
      node,
      `Layer "${layer}" must not depend on "${targetLayer}".`,
    );
  }

  const targetSegments = path.relative(sourceRoot, targetPath).split(path.sep);
  if (targetSegments.some((segment) => segment === 'internal' || segment === 'private')) {
    addDiagnostic(
      filePath,
      sourceFile,
      node,
      `Layer "${layer}" must not deep-import the private implementation of "${targetLayer}".`,
    );
  }
}

function findCycles(files) {
  const state = new Map();
  const stack = [];
  const reportedCycles = new Set();

  function visit(filePath) {
    state.set(filePath, 'visiting');
    stack.push(filePath);

    for (const dependencyPath of dependencyGraph.get(filePath) ?? []) {
      const dependencyState = state.get(dependencyPath);
      if (dependencyState === 'visiting') {
        const cycleStart = stack.indexOf(dependencyPath);
        const cycle = [...stack.slice(cycleStart), dependencyPath].map(toRepositoryPath);
        const cycleKey = cycle.join(' -> ');
        if (!reportedCycles.has(cycleKey)) {
          diagnostics.push(`${cycle[0]}:1:1 Circular dependency: ${cycleKey}`);
          reportedCycles.add(cycleKey);
        }
      } else if (dependencyState === undefined) {
        visit(dependencyPath);
      }
    }

    stack.pop();
    state.set(filePath, 'visited');
  }

  for (const filePath of files) {
    if (state.get(filePath) === undefined) {
      visit(filePath);
    }
  }
}

const files = await listTypeScriptFiles(sourceRoot);
const sourceFiles = new Set(files.map(path.normalize));

for (const filePath of files) {
  dependencyGraph.set(filePath, new Set());
  const repositoryPath = toRepositoryPath(filePath);
  const pathSegments = repositoryPath.split('/');
  const layer = sourceLayer(filePath);

  if (pathSegments.some((segment) => forbiddenDirectoryNames.has(segment))) {
    diagnostics.push(`${repositoryPath}:1:1 Forbidden Nireco directory name.`);
  }

  if (layer === undefined || !knownLayers.has(layer)) {
    diagnostics.push(`${repositoryPath}:1:1 Unknown top-level source layer "${layer ?? ''}".`);
  }

  if (
    path.basename(filePath).match(/^index\.(?:cts|mts|tsx?)$/u) !== null &&
    layer !== 'entrypoints' &&
    layer !== 'public'
  ) {
    diagnostics.push(
      `${repositoryPath}:1:1 Internal barrel files are forbidden outside public entrypoints.`,
    );
  }

  const sourceText = await readFile(filePath, 'utf8');
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const pendingImports = [];
  function visit(node) {
    const specifier = moduleSpecifierFromNode(node);
    if (specifier !== undefined) {
      pendingImports.push(inspectImport(filePath, sourceFile, node, specifier, sourceFiles));
    }

    inspectRuntimeBoundary(filePath, sourceFile, node, layer);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  await Promise.all(pendingImports);
}

findCycles(files);

if (diagnostics.length > 0) {
  console.error('Architecture checks failed:\n');
  for (const diagnostic of diagnostics.sort()) {
    console.error(`- ${diagnostic}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Architecture checks passed for ${files.length} production TypeScript files.`);
}
