import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  REFERENCE_CORPUS_GENERATOR_VERSION,
  REFERENCE_CORPUS_PROFILE_ID,
  generateReferenceCorpus,
} from '../dist/platform/node/performance/reference-corpus.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const locks = [
  {
    label: 'repository documentation lock',
    path: path.join(repositoryRoot, 'docs/performance/reference-corpus-lock.json'),
  },
  {
    label: 'packed contract identity artifact',
    path: path.join(
      repositoryRoot,
      'contracts/comet-integration/performance/reference-corpus-lock.json',
    ),
  },
];
const parsedLocks = await Promise.all(
  locks.map(async ({ label, path: lockPath }) => ({
    label,
    lock: JSON.parse(await readFile(lockPath, 'utf8')),
  })),
);
const corpusNames = ['S', 'M', 'L'];
const errors = [];

for (const { label, lock } of parsedLocks) {
  if (lock.profileId !== REFERENCE_CORPUS_PROFILE_ID) {
    errors.push(
      `${label} profileId ${String(lock.profileId)} does not match ` + REFERENCE_CORPUS_PROFILE_ID,
    );
  }
  if (lock.generatorVersion !== REFERENCE_CORPUS_GENERATOR_VERSION) {
    errors.push(
      `${label} generatorVersion ${String(lock.generatorVersion)} does not match ` +
        REFERENCE_CORPUS_GENERATOR_VERSION,
    );
  }

  for (const name of corpusNames) {
    const generated = generateReferenceCorpus(name);
    const locked = lock.corpora?.[name];
    if (!isDeepStrictEqual(generated.metadata, locked)) {
      errors.push(
        `${label} ${name} identity drifted.\n` +
          `  locked:    ${JSON.stringify(locked)}\n` +
          `  generated: ${JSON.stringify(generated.metadata)}`,
      );
    }
  }
}

const [documentationLock, packedContractLock] = parsedLocks;
if (!isDeepStrictEqual(documentationLock?.lock, packedContractLock?.lock)) {
  errors.push(
    'repository documentation lock and packed contract identity artifact must be identical',
  );
}

if (errors.length > 0) {
  console.error('Reference corpus identity checks failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Reference corpora ${corpusNames.join('/')} match ${REFERENCE_CORPUS_PROFILE_ID} ` +
      `generator ${REFERENCE_CORPUS_GENERATOR_VERSION}, including the packed contract artifact, ` +
      'raw checksums and canonical hashes.',
  );
}
