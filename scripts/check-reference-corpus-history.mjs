import { execFile as execFileCallback } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsLockPath = 'docs/performance/reference-corpus-lock.json';
const bundleLockPath = 'contracts/comet-integration/performance/reference-corpus-lock.json';
const historyDirectory = 'contracts/comet-integration/performance/history';
const errors = [];

const currentDocsBytes = await readRepositoryFile(docsLockPath);
const currentBundleBytes = await readRepositoryFile(bundleLockPath);
const currentDocs = parseLock(currentDocsBytes, docsLockPath);
const currentBundle = parseLock(currentBundleBytes, bundleLockPath);

if (currentDocsBytes !== currentBundleBytes) {
  errors.push('The documentation and packed active corpus locks must be byte-identical.');
}
if (
  currentDocs !== undefined &&
  currentBundle !== undefined &&
  !isDeepStrictEqual(currentDocs, currentBundle)
) {
  errors.push('The documentation and packed active corpus locks must describe one identity.');
}

await validateCurrentHistory();

const baseRef = process.env['CORPUS_HISTORY_BASE_REF']?.trim();
if (baseRef !== undefined && baseRef !== '' && !/^0+$/u.test(baseRef)) {
  if (!/^[0-9A-Za-z._/-]+$/u.test(baseRef)) {
    errors.push('CORPUS_HISTORY_BASE_REF contains unsupported characters.');
  } else {
    await validateAgainstBase(baseRef);
  }
}

if (errors.length > 0) {
  console.error('Reference corpus append-only history checks failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    baseRef === undefined || baseRef === '' || /^0+$/u.test(baseRef)
      ? 'Reference corpus active locks and append-only history layout are valid.'
      : `Reference corpus identities preserve append-only history relative to ${baseRef}.`,
  );
}

async function validateAgainstBase(baseRef) {
  if (!(await gitCommitExists(baseRef))) {
    errors.push(
      `Could not resolve corpus history base ${baseRef}; CI must fetch the comparison commit.`,
    );
    return;
  }
  await validatePriorHistoryFiles(baseRef);

  const previousDocsBytes = await readGitFile(baseRef, docsLockPath);
  const previousBundleBytes = await readGitFile(baseRef, bundleLockPath);
  if ((previousDocsBytes === undefined) !== (previousBundleBytes === undefined)) {
    errors.push(
      `Base ${baseRef} contains only one active corpus lock; its evidence was already inconsistent.`,
    );
  }
  if (previousDocsBytes === undefined || previousBundleBytes === undefined) {
    return;
  }
  if (previousDocsBytes !== previousBundleBytes) {
    errors.push(`Base ${baseRef} active corpus locks were not byte-identical.`);
  }

  const previous = parseLock(previousBundleBytes, `${baseRef}:${bundleLockPath}`);
  if (previous === undefined || currentBundle === undefined) {
    return;
  }
  if (lockKey(previous) === lockKey(currentBundle)) {
    if (previousBundleBytes !== currentBundleBytes) {
      errors.push(
        `Corpus identity ${lockKey(previous)} changed in place; bump the generator/profile ` +
          'and archive the prior lock instead.',
      );
    }
  } else {
    const archivePath = `${historyDirectory}/${historyFileName(previous)}`;
    const archivedBytes = await readOptionalRepositoryFile(archivePath);
    if (archivedBytes === undefined) {
      errors.push(`The superseded corpus identity must be preserved at ${archivePath}.`);
    } else if (archivedBytes !== previousBundleBytes) {
      errors.push(`${archivePath} must preserve the prior active lock byte-for-byte.`);
    }
  }
}

async function validatePriorHistoryFiles(baseRef) {
  const previousHistoryPaths = await listGitHistoryFiles(baseRef);
  for (const previousPath of previousHistoryPaths) {
    const previousBytes = await readGitFile(baseRef, previousPath);
    const currentBytes = await readOptionalRepositoryFile(previousPath);
    if (previousBytes === undefined || currentBytes !== previousBytes) {
      errors.push(`Historical corpus artifact ${previousPath} was changed or removed.`);
    }
  }
}

async function gitCommitExists(baseRef) {
  try {
    await execFile('git', ['cat-file', '-e', `${baseRef}^{commit}`], {
      cwd: repositoryRoot,
    });
    return true;
  } catch {
    return false;
  }
}

async function validateCurrentHistory() {
  const directoryPath = path.join(repositoryRoot, historyDirectory);
  let entries;
  try {
    entries = await readdir(directoryPath, {
      withFileTypes: true,
    });
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }
    const relativePath = `${historyDirectory}/${entry.name}`;
    const bytes = await readRepositoryFile(relativePath);
    const lock = parseLock(bytes, relativePath);
    if (lock !== undefined && entry.name !== historyFileName(lock)) {
      errors.push(
        `${relativePath} must be named ${historyFileName(lock)} for its profile/version.`,
      );
    }
  }
}

async function listGitHistoryFiles(baseRef) {
  try {
    const result = await execFile(
      'git',
      ['ls-tree', '-r', '--name-only', baseRef, '--', historyDirectory],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
      },
    );
    return result.stdout
      .split('\n')
      .map((value) => value.trim())
      .filter((value) => value.endsWith('.json'));
  } catch {
    errors.push(`Could not inspect corpus history at base ${baseRef}.`);
    return [];
  }
}

async function readGitFile(baseRef, relativePath) {
  try {
    const result = await execFile('git', ['show', `${baseRef}:${relativePath}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout;
  } catch {
    return undefined;
  }
}

async function readRepositoryFile(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

async function readOptionalRepositoryFile(relativePath) {
  try {
    return await readRepositoryFile(relativePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

function parseLock(bytes, label) {
  try {
    const value = JSON.parse(bytes);
    if (
      value === null ||
      typeof value !== 'object' ||
      typeof value.profileId !== 'string' ||
      typeof value.generatorVersion !== 'string'
    ) {
      errors.push(`${label} is missing a string profileId or generatorVersion.`);
      return undefined;
    }
    return value;
  } catch {
    errors.push(`${label} is not valid JSON.`);
    return undefined;
  }
}

function lockKey(lock) {
  return `${lock.profileId}@${lock.generatorVersion}`;
}

function historyFileName(lock) {
  const profile = safeFileComponent(lock.profileId);
  const generator = safeFileComponent(lock.generatorVersion);
  return `${profile}--generator-${generator}.json`;
}

function safeFileComponent(value) {
  return value.replaceAll(/[^0-9A-Za-z._-]/gu, '_');
}

function isMissingFileError(error) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}
