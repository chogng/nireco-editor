import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'json-schema-to-typescript';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractRoot = path.join(repositoryRoot, 'contracts', 'comet-integration');
const schemaRoot = path.join(contractRoot, 'schemas');
const generatedRoot = path.join(contractRoot, 'generated-types');
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
const generatorVersion = packageJson.devDependencies?.['json-schema-to-typescript'];
const shouldWrite = process.argv.includes('--write');

if (generatorVersion === undefined) {
  throw new Error('package.json must pin json-schema-to-typescript.');
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function generatedBanner(sourcePath, sourceHash) {
  return [
    '/**',
    ' * GENERATED FILE — DO NOT EDIT.',
    ` * Source: ${sourcePath}`,
    ' * Generator: json-schema-to-typescript',
    ` * Generator version: ${generatorVersion}`,
    ` * Source SHA-256: ${sourceHash}`,
    ' */',
  ].join('\n');
}

async function listSchemaFiles() {
  let entries;
  try {
    entries = await readdir(schemaRoot, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.schema.json'))
    .map((entry) => path.join(schemaRoot, entry.name))
    .sort();
}

function outputName(schemaPath) {
  return path.basename(schemaPath).replace(/\.schema\.json$/u, '.d.ts');
}

function rewriteSchemaReferences(value) {
  if (Array.isArray(value)) {
    return value.map(rewriteSchemaReferences);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const rewritten = {};
  const hasPrefixItems = Array.isArray(value.prefixItems);
  for (const [key, childValue] of Object.entries(value)) {
    if (
      key === '$id' ||
      key === '$schema' ||
      key === '$defs' ||
      key === 'prefixItems' ||
      (hasPrefixItems && key === 'items')
    ) {
      continue;
    }
    rewritten[key] =
      key === '$ref' && typeof childValue === 'string'
        ? childValue.replace(/^(?:[^#]+)?#\/\$defs\//u, '#/definitions/')
        : rewriteSchemaReferences(childValue);
  }
  if (hasPrefixItems) {
    rewritten.items = value.prefixItems.map(rewriteSchemaReferences);
    if (Object.hasOwn(value, 'items')) {
      rewritten.additionalItems = rewriteSchemaReferences(value.items);
    }
  }
  return rewritten;
}

function referencedSchemaNames(value, references = new Set()) {
  if (Array.isArray(value)) {
    for (const childValue of value) {
      referencedSchemaNames(childValue, references);
    }
    return references;
  }
  if (value === null || typeof value !== 'object') {
    return references;
  }

  for (const [key, childValue] of Object.entries(value)) {
    if (key === '$ref' && typeof childValue === 'string') {
      const match = /^(?<schema>[^#]+\.schema\.json)#\/\$defs\//u.exec(childValue);
      if (match?.groups?.schema !== undefined) {
        references.add(match.groups.schema);
      }
    } else {
      referencedSchemaNames(childValue, references);
    }
  }
  return references;
}

function collectTransitiveSchemas(entryName, schemas, collected = new Set()) {
  if (collected.has(entryName)) {
    return collected;
  }
  const schema = schemas.get(entryName);
  if (schema === undefined) {
    throw new Error(`Schema ${entryName} is referenced but not present in ${schemaRoot}.`);
  }

  collected.add(entryName);
  for (const referencedName of referencedSchemaNames(schema)) {
    collectTransitiveSchemas(referencedName, schemas, collected);
  }
  return collected;
}

function bundleSchema(entryName, schemas) {
  const entrySchema = schemas.get(entryName);
  if (entrySchema === undefined) {
    throw new Error(`Missing entry schema ${entryName}.`);
  }

  const definitions = {};
  const schemaNames = [...collectTransitiveSchemas(entryName, schemas)].sort();
  for (const schemaName of schemaNames) {
    const schema = schemas.get(schemaName);
    for (const [definitionName, definition] of Object.entries(schema?.$defs ?? {})) {
      if (definitions[definitionName] !== undefined) {
        throw new Error(`Duplicate contract definition name ${definitionName}.`);
      }
      definitions[definitionName] = rewriteSchemaReferences(definition);
    }
  }

  const bundled = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: `${moduleNamespace(entryName)} Schema Types`,
    description:
      'Synthetic code-generation root. Runtime validation uses the normative Draft 2020-12 schema.',
    type: 'object',
    additionalProperties: false,
    definitions,
    properties:
      typeof entrySchema.$ref === 'string'
        ? {
            contractValue: {
              $ref: entrySchema.$ref.replace(/^(?:[^#]+)?#\/\$defs\//u, '#/definitions/'),
            },
          }
        : {},
  };
  return bundled;
}

function moduleNamespace(schemaPath) {
  return path
    .basename(schemaPath)
    .replace(/\.schema\.json$/u, '')
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}`)
    .join('');
}

function normalizeGeneratedDeclaration(declaration) {
  if (!declaration.includes('export type JsonValue =')) {
    return declaration;
  }

  const normalized = declaration
    .replace(
      'export type JsonValue = (null | boolean | number | string | JsonArray | JsonObject) | undefined;',
      'export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;',
    )
    .replace(
      'export type JsonArray = JsonValue | undefined[];',
      'export type JsonArray = JsonValue[];',
    );

  if (
    normalized.includes(
      'export type JsonValue = (null | boolean | number | string | JsonArray | JsonObject) | undefined;',
    ) ||
    normalized.includes('export type JsonArray = JsonValue | undefined[];')
  ) {
    throw new Error('Unable to normalize recursive JsonValue declarations.');
  }

  return normalized;
}

async function buildExpectedOutputs(schemaPaths) {
  const outputs = new Map();
  const schemas = new Map();
  for (const schemaPath of schemaPaths) {
    schemas.set(path.basename(schemaPath), JSON.parse(await readFile(schemaPath, 'utf8')));
  }

  for (const schemaPath of schemaPaths) {
    const sourceContents = await readFile(schemaPath);
    const sourcePath = path.relative(repositoryRoot, schemaPath).split(path.sep).join('/');
    const bannerComment = generatedBanner(sourcePath, sha256(sourceContents));
    const entryName = path.basename(schemaPath);
    const declaration = await compile(
      bundleSchema(entryName, schemas),
      moduleNamespace(schemaPath),
      {
        bannerComment,
        cwd: schemaRoot,
        declareExternallyReferenced: true,
        enableConstEnums: false,
        format: true,
        strictIndexSignatures: true,
        style: {
          bracketSpacing: true,
          printWidth: 100,
          semi: true,
          singleQuote: true,
          tabWidth: 2,
          trailingComma: 'all',
          useTabs: false,
        },
        unknownAny: true,
        unreachableDefinitions: true,
      },
    );
    outputs.set(
      outputName(schemaPath),
      normalizeGeneratedDeclaration(declaration.replaceAll('\r\n', '\n')),
    );
  }

  const schemaInventoryParts = await Promise.all(
    schemaPaths.map(async (schemaPath) => {
      const sourcePath = path.relative(repositoryRoot, schemaPath).split(path.sep).join('/');
      return `${sourcePath}:${sha256(await readFile(schemaPath))}`;
    }),
  );
  const schemaInventory = schemaInventoryParts.join('\n');
  const indexBanner = generatedBanner(
    'contracts/comet-integration/schemas/*.schema.json',
    sha256(schemaInventory),
  );
  const exports = schemaPaths
    .map(
      (schemaPath) =>
        `export type * as ${moduleNamespace(schemaPath)} from ` +
        `'./${outputName(schemaPath).replace(/\.d\.ts$/u, '.js')}';`,
    )
    .join('\n');
  outputs.set('index.d.ts', `${indexBanner}\n\n${exports}\n`);

  return outputs;
}

async function listGeneratedFiles() {
  try {
    return (await readdir(generatedRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

const schemaPaths = await listSchemaFiles();
if (schemaPaths.length === 0) {
  console.error(
    'Generated-code check failed: contracts/comet-integration/schemas contains no schemas.',
  );
  process.exit(1);
}

const expectedOutputs = await buildExpectedOutputs(schemaPaths);
const generatedFiles = await listGeneratedFiles();
const expectedFiles = [...expectedOutputs.keys()].sort();

if (shouldWrite) {
  await mkdir(generatedRoot, { recursive: true });
  for (const [fileName, contents] of expectedOutputs) {
    await writeFile(path.join(generatedRoot, fileName), contents);
  }
  for (const staleFile of generatedFiles.filter((fileName) => !expectedOutputs.has(fileName))) {
    await rm(path.join(generatedRoot, staleFile));
  }
  console.log(`Generated ${expectedFiles.length} deterministic TypeScript declaration files.`);
  process.exit(0);
}

const errors = [];
for (const fileName of expectedFiles) {
  const expectedContents = expectedOutputs.get(fileName);
  let actualContents;
  try {
    actualContents = await readFile(path.join(generatedRoot, fileName), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      errors.push(`Missing ${path.relative(repositoryRoot, path.join(generatedRoot, fileName))}.`);
      continue;
    }
    throw error;
  }

  if (actualContents.replaceAll('\r\n', '\n') !== expectedContents) {
    errors.push(`${fileName} is stale; run pnpm generate.`);
  }
}

for (const staleFile of generatedFiles.filter((fileName) => !expectedOutputs.has(fileName))) {
  errors.push(`${staleFile} has no source schema; run pnpm generate.`);
}

if (errors.length > 0) {
  console.error('Generated-code check failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Generated-code check passed for ${schemaPaths.length} schemas and ` +
      `${expectedFiles.length} declarations.`,
  );
}
