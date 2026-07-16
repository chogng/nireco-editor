import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(repositoryRoot, 'package.json');
const documentNames = [
  'NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md',
  'NIRECO_COMET_ENGINEERING_CODING_STANDARD.md',
  'NIRECO_COMET_ROADMAP.md',
];
const expectedReferences = new Map([
  [
    'NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md',
    new Set(['NIRECO_COMET_ENGINEERING_CODING_STANDARD.md', 'NIRECO_COMET_ROADMAP.md']),
  ],
  [
    'NIRECO_COMET_ENGINEERING_CODING_STANDARD.md',
    new Set(['NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md', 'NIRECO_COMET_ROADMAP.md']),
  ],
  [
    'NIRECO_COMET_ROADMAP.md',
    new Set([
      'NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md',
      'NIRECO_COMET_ENGINEERING_CODING_STANDARD.md',
    ]),
  ],
]);
const configurationFiles = [
  '.editorconfig',
  '.github/ADR_TEMPLATE.md',
  '.github/CODEOWNERS',
  '.github/ISSUE_TEMPLATE/engineering-exception.yml',
  '.github/pull_request_template.md',
  '.github/workflows/ci.yml',
  'eslint.config.mjs',
  'prettier.config.mjs',
  'scripts/check-architecture.mjs',
  'scripts/check-document-versions.mjs',
  'scripts/check-generated.mjs',
  'tsconfig.base.json',
  'tsconfig.browser.json',
  'tsconfig.build.json',
  'tsconfig.contract.json',
  'tsconfig.core.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.test.json',
  'vitest.config.ts',
];

function extractFrontMatter(documentName, source) {
  const match = /^---\n(?<frontMatter>[\s\S]*?)\n---(?:\n|$)/u.exec(source);
  if (match?.groups?.frontMatter === undefined) {
    throw new Error(`${documentName} does not contain valid YAML front matter.`);
  }
  return match.groups.frontMatter;
}

function extractScalar(frontMatter, fieldName) {
  const expression = new RegExp(`^${fieldName}:\\s*(?<value>[^\\n]+)\\s*$`, 'mu');
  return expression.exec(frontMatter)?.groups?.value.trim();
}

function extractVersionReferences(frontMatter) {
  const references = new Map();
  const expression = /(?<document>NIRECO_[A-Z0-9_]+\.md)\s+v(?<version>\d+\.\d+\.\d+)/gu;

  for (const match of frontMatter.matchAll(expression)) {
    const documentName = match.groups?.document;
    const version = match.groups?.version;
    if (documentName !== undefined && version !== undefined) {
      references.set(documentName, version);
    }
  }

  return references;
}

async function computeConfigurationHash() {
  const hash = createHash('sha256');
  for (const relativePath of configurationFiles) {
    const contents = await readFile(path.join(repositoryRoot, relativePath));
    hash.update(relativePath);
    hash.update('\0');
    hash.update(contents);
    hash.update('\0');
  }
  return `sha256-${hash.digest('hex')}`;
}

async function listMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && !['.git', 'coverage', 'dist', 'node_modules'].includes(entry.name)) {
      files.push(...(await listMarkdownFiles(path.join(directory, entry.name))));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files.sort();
}

const errors = [];
const documents = new Map();

for (const documentName of documentNames) {
  const source = await readFile(path.join(repositoryRoot, documentName), 'utf8');
  try {
    const frontMatter = extractFrontMatter(documentName, source);
    const version = extractScalar(frontMatter, 'version');
    if (version === undefined) {
      errors.push(`${documentName}: missing front matter version.`);
      continue;
    }
    documents.set(documentName, {
      frontMatter,
      references: extractVersionReferences(frontMatter),
      version,
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

for (const [documentName, document] of documents) {
  const requiredReferences = expectedReferences.get(documentName) ?? new Set();
  for (const requiredDocumentName of requiredReferences) {
    const referencedVersion = document.references.get(requiredDocumentName);
    const actualVersion = documents.get(requiredDocumentName)?.version;
    if (referencedVersion === undefined) {
      errors.push(`${documentName}: missing pinned reference to ${requiredDocumentName}.`);
    } else if (actualVersion !== referencedVersion) {
      errors.push(
        `${documentName}: references ${requiredDocumentName} v${referencedVersion}, ` +
          `but the document is v${actualVersion ?? 'unknown'}.`,
      );
    }
  }
}

const standardDocumentName = 'NIRECO_COMET_ENGINEERING_CODING_STANDARD.md';
const standardDocument = documents.get(standardDocumentName);
const canonicalFilename =
  standardDocument === undefined
    ? undefined
    : extractScalar(standardDocument.frontMatter, 'canonical_filename');
if (canonicalFilename !== standardDocumentName) {
  errors.push(
    `${standardDocumentName}: canonical_filename must be exactly ${standardDocumentName}.`,
  );
}

const authorityDeclarations = [];
for (const filePath of await listMarkdownFiles(repositoryRoot)) {
  const contents = await readFile(filePath, 'utf8');
  if (contents.includes(`canonical_filename: ${standardDocumentName}`)) {
    authorityDeclarations.push(path.relative(repositoryRoot, filePath).split(path.sep).join('/'));
  }
}
if (authorityDeclarations.length !== 1 || authorityDeclarations[0] !== standardDocumentName) {
  errors.push(
    `Exactly one canonical engineering standard is required; found: ` +
      `${authorityDeclarations.join(', ') || 'none'}.`,
  );
}

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const packageMetadata = packageJson.nireco;
const packageVersionChecks = [
  ['developmentSpecVersion', 'NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md'],
  ['engineeringStandardVersion', 'NIRECO_COMET_ENGINEERING_CODING_STANDARD.md'],
  ['roadmapVersion', 'NIRECO_COMET_ROADMAP.md'],
];

for (const [metadataField, documentName] of packageVersionChecks) {
  const pinnedVersion = packageMetadata?.[metadataField];
  const documentVersion = documents.get(documentName)?.version;
  if (pinnedVersion !== documentVersion) {
    errors.push(
      `package.json nireco.${metadataField} is ${String(pinnedVersion)}, ` +
        `but ${documentName} is v${documentVersion ?? 'unknown'}.`,
    );
  }
}

const configurationHash = await computeConfigurationHash();
if (process.argv.includes('--print-hash')) {
  console.log(configurationHash);
  process.exit(0);
}

if (packageMetadata?.configurationHash !== configurationHash) {
  errors.push(
    `package.json nireco.configurationHash is ${String(packageMetadata?.configurationHash)}; ` +
      `expected ${configurationHash}.`,
  );
}

if (errors.length > 0) {
  console.error('Document version checks failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Document versions and engineering configuration hash are consistent (${configurationHash}).`,
  );
}
