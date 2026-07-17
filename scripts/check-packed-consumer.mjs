import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const repositoryRoot = process.cwd();
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'nireco-packed-consumer-'));

try {
  await writeFile(
    path.join(temporaryRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'nireco-packed-consumer-check',
        private: true,
        type: 'module',
      },
      null,
      2,
    )}\n`,
  );

  await run('pnpm', ['pack', '--pack-destination', temporaryRoot], repositoryRoot);
  const tarballs = (await readdir(temporaryRoot)).filter((entry) => entry.endsWith('.tgz'));
  assert.equal(tarballs.length, 1, 'pnpm pack must produce exactly one package tarball.');
  const tarballPath = path.join(temporaryRoot, tarballs[0]);

  await run(
    'pnpm',
    ['add', '--offline', '--ignore-scripts', '--save-exact', tarballPath],
    temporaryRoot,
  );
  await symlink(
    path.join(repositoryRoot, 'node_modules', 'ajv'),
    path.join(temporaryRoot, 'node_modules', 'ajv'),
    'junction',
  );

  const packageRoot = path.join(temporaryRoot, 'node_modules', '@comet-internal', 'nireco-editor');
  const contractRoot = path.join(packageRoot, 'contracts', 'comet-integration');
  const harnessPath = path.join(contractRoot, 'comet-consumer', 'harness.mjs');
  const expectedPath = path.join(contractRoot, 'comet-consumer', 'evidence-report.json');
  const manifestPath = path.join(contractRoot, 'contract.manifest.json');

  const resolution = await run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "console.log(import.meta.resolve('@comet-internal/nireco-editor'))",
    ],
    temporaryRoot,
  );
  const resolvedEntrypoint = fileURLToPath(resolution.stdout.trim());
  assert.ok(
    resolvedEntrypoint.startsWith(`${await realpath(temporaryRoot)}${path.sep}`),
    'The clean consumer must resolve inside its isolated installation.',
  );
  assert.ok(
    !resolvedEntrypoint.startsWith(`${await realpath(repositoryRoot)}${path.sep}`),
    'The clean consumer must not resolve the source checkout.',
  );
  assert.match(
    resolvedEntrypoint,
    /\/@comet-internal\/nireco-editor\/dist\/entrypoints\/main\.js$/u,
    'The clean consumer must resolve the package public entrypoint.',
  );

  const executed = await run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      'const harness = await import(process.argv[1]); console.log(JSON.stringify(await harness.runConsumerHarness()));',
      pathToFileURL(harnessPath).href,
    ],
    temporaryRoot,
  );
  const actual = JSON.parse(executed.stdout);
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
  assert.deepEqual(actual, expected);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(manifest.runtimeConformance, {
    supplementsJsonSchema: true,
    wellFormedUnicodeStrings: true,
    maximumManuscriptTreeDepth: 256,
    maximumInertJsonDepth: 1008,
    canonicalMarkOrder: [
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'link',
      'subscript',
      'superscript',
    ],
    maximumMarksPerType: 1,
    mutuallyExclusiveMarkSets: [['subscript', 'superscript']],
    maximumCometDocumentScopeIdsTotal: 1000,
    maximumCometDocumentContextDistance: 1000000,
    gate1ScopeVerificationCommand:
      'pnpm vitest run tests/unit/document-read-session-store.test.ts tests/unit/document-read-service.test.ts tests/unit/document-read-cursor.test.ts',
    maximumTransactionCanonicalUtf8Bytes: 8388608,
    maximumTransactionJsonValues: 262144,
    maximumTransactionOperations: 1024,
    maximumTransactionPreconditions: 4096,
    maximumTransactionToolInvocationIds: 1024,
    verificationCommand: 'pnpm vitest run tests/conformance/runtime-boundaries.conformance.ts',
  });
  const performanceEvidence = manifest.performanceEvidence;
  assert.equal(
    typeof performanceEvidence?.corpusIdentityPath,
    'string',
    'The packed manifest must name a corpus identity artifact.',
  );
  assert.equal(
    path.isAbsolute(performanceEvidence.corpusIdentityPath),
    false,
    'The packed corpus identity path must be relative to the Contract Bundle.',
  );

  const corpusIdentityPath = path.resolve(contractRoot, performanceEvidence.corpusIdentityPath);
  const contractRealRoot = await realpath(contractRoot);
  const corpusIdentityRealPath = await realpath(corpusIdentityPath);
  assert.ok(
    isPathInside(contractRealRoot, corpusIdentityRealPath),
    'The packed corpus identity path must resolve inside contracts/comet-integration.',
  );

  const corpusIdentity = JSON.parse(await readFile(corpusIdentityRealPath, 'utf8'));
  const corpusGenerator = await import(
    pathToFileURL(
      path.join(packageRoot, 'dist', 'platform', 'node', 'performance', 'reference-corpus.js'),
    ).href
  );
  assert.equal(corpusIdentity.profileId, performanceEvidence.profileId);
  assert.equal(corpusIdentity.profileId, corpusGenerator.REFERENCE_CORPUS_PROFILE_ID);
  assert.equal(corpusIdentity.generatorVersion, performanceEvidence.corpusGeneratorVersion);
  assert.equal(corpusIdentity.generatorVersion, corpusGenerator.REFERENCE_CORPUS_GENERATOR_VERSION);
  for (const corpusName of ['S', 'M', 'L']) {
    const generated = corpusGenerator.generateReferenceCorpus(corpusName);
    assert.deepEqual(
      corpusIdentity.corpora?.[corpusName],
      generated.metadata,
      `Packed corpus ${corpusName} identity must match the installed generator.`,
    );
    assert.deepEqual(
      corpusIdentity.corpora?.[corpusName]?.counts,
      performanceEvidence.corpora?.[corpusName],
      `Packed corpus ${corpusName} counts must match the manifest.`,
    );
  }

  console.log(
    'Packed Contract consumer and S/M/L corpus identity evidence passed from an isolated install.',
  );
} finally {
  await rm(temporaryRoot, {
    force: true,
    recursive: true,
  });
}

async function run(command, arguments_, cwd) {
  return execFile(command, arguments_, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function isPathInside(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}
