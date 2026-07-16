import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runConsumerHarness } from '../../contracts/comet-integration/comet-consumer/harness.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const consumerRoot = path.join(repositoryRoot, 'contracts/comet-integration/comet-consumer');

test('independent Comet consumer matches the committed evidence report', async () => {
  const actual = await runConsumerHarness();
  const expected = JSON.parse(
    await readFile(path.join(consumerRoot, 'evidence-report.json'), 'utf8'),
  );
  assert.deepEqual(actual, expected);
});

test('consumer code imports only public package and Contract Bundle surfaces', async () => {
  const codeFiles = [...(await collectCodeFiles(consumerRoot)), fileURLToPath(import.meta.url)];
  const allowedPackageSpecifiers = new Set([
    '@comet-internal/nireco-editor',
    '@comet-internal/nireco-editor/protocol',
    '@comet-internal/nireco-editor/comet-internal',
    '@comet-internal/nireco-editor/contract-types/integration',
  ]);
  for (const codeFile of codeFiles) {
    const source = await readFile(codeFile, 'utf8');
    assert.doesNotMatch(
      source,
      /\bimport\s*\(\s*(?!['"])/u,
      `${path.relative(repositoryRoot, codeFile)} contains a computed dynamic import.`,
    );
    const specifiers = [
      ...source.matchAll(/(?:from\s+|import\s*\()['"](?<specifier>[^'"]+)['"]/gu),
    ].map((match) => match.groups?.specifier ?? '');
    for (const specifier of specifiers) {
      const privatePackagePath =
        specifier.startsWith('@comet-internal/nireco-editor/src') ||
        specifier.startsWith('@comet-internal/nireco-editor/dist');
      const privateRelativePath = /^(?:\.\.?\/)+(?:.*\/)?(?:src|dist)(?:\/|$)/u.test(specifier);
      assert.equal(
        privatePackagePath || privateRelativePath,
        false,
        `${path.relative(repositoryRoot, codeFile)} imports private path ${specifier}.`,
      );
      if (specifier.startsWith('@comet-internal/nireco-editor')) {
        assert.ok(
          allowedPackageSpecifiers.has(specifier),
          `${path.relative(repositoryRoot, codeFile)} imports an undeclared package surface ${specifier}.`,
        );
      }
      if (codeFile.startsWith(`${consumerRoot}${path.sep}`) && specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(codeFile), specifier);
        assert.ok(
          resolved.startsWith(`${consumerRoot}${path.sep}`),
          `${path.relative(repositoryRoot, codeFile)} imports outside the consumer boundary.`,
        );
      }
    }
  }

  const harnessSource = await readFile(path.join(consumerRoot, 'harness.mjs'), 'utf8');
  assert.match(harnessSource, /from '@comet-internal\/nireco-editor'/u);
  assert.match(harnessSource, /from '@comet-internal\/nireco-editor\/comet-internal'/u);
});

async function collectCodeFiles(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectCodeFiles(entryPath);
      }
      return /\.(?:[cm]?js|ts)$/u.test(entry.name) ? [entryPath] : [];
    }),
  );
  return nested.flat().sort();
}
