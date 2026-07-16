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
  const harnessPath = path.join(
    packageRoot,
    'contracts',
    'comet-integration',
    'comet-consumer',
    'harness.mjs',
  );
  const expectedPath = path.join(
    packageRoot,
    'contracts',
    'comet-integration',
    'comet-consumer',
    'evidence-report.json',
  );

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

  console.log('Packed Contract consumer resolved and passed from an isolated install.');
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
