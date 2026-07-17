import os from 'node:os';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

import { HASH_DOMAINS, HASH_PREIMAGE_PREFIX } from '../dist/base/hashing/hash-preimage.js';
import { hashCanonicalJsonPortable, sha256Utf8 } from '../dist/base/hashing/portable-sha-256.js';
import { deepFreeze } from '../dist/base/immutability/deep-freeze.js';
import {
  parseOperationId,
  parseRevisionId,
  parseTransactionId,
} from '../dist/base/ids/identifiers.js';
import { createUuidV7 } from '../dist/base/ids/uuid-v7-allocator.js';
import { serializeCanonicalJson } from '../dist/base/serialization/canonical-json.js';
import {
  activateKernelDerivedDocumentSnapshotCache,
  cacheVerifiedFrozenDocumentSnapshot,
  getVerifiedDocumentSnapshotCache,
  retireVerifiedDocumentSnapshotCache,
} from '../dist/model/document-snapshot-cache.js';
import { createDocumentIndex } from '../dist/model/node/document-index.js';
import { createDocumentHashPayload } from '../dist/model/snapshot.js';
import { prepareKernelTransaction } from '../dist/model/transaction/transaction-kernel.js';
import {
  REFERENCE_CORPUS_GENERATOR_VERSION,
  REFERENCE_CORPUS_PROFILE_ID,
  generateReferenceCorpus,
} from '../dist/platform/node/performance/reference-corpus.js';

const samples = readPositiveIntegerArgument('--samples', 12);
const warmups = readNonnegativeIntegerArgument('--warmups', 5);
const replacements = ['x', '中', '🌍'];
const ids = createBenchmarkIdAllocator();
const generated = generateReferenceCorpus('M');
const target = findTextTarget(generated.snapshot.root);

const untrustedChain = createChain(generateReferenceCorpus('M').snapshot, false);
const untrusted = measureContinuousChain(untrustedChain, warmups, samples);

const trustedSnapshot = deepFreeze(generateReferenceCorpus('M').snapshot);
const cacheStarted = performance.now();
assertOk(
  cacheVerifiedFrozenDocumentSnapshot(trustedSnapshot),
  'trusted Snapshot cache registration',
);
const trustedCacheRegistrationMilliseconds = performance.now() - cacheStarted;
const trustedChain = createChain(trustedSnapshot, true);
const trusted = measureContinuousChain(trustedChain, warmups, samples);
retireVerifiedDocumentSnapshotCache(trustedChain.snapshot);

const indexMilliseconds = measure(samples, () => {
  const indexed = createDocumentIndex(generated.snapshot);
  assertOk(indexed, 'DocumentIndex baseline');
});
const serializeMilliseconds = measure(samples, () => {
  const serialized = serializeCanonicalJson(createDocumentHashPayload(generated.snapshot));
  assertOk(serialized, 'canonical serialization baseline');
});
const canonical = serializeCanonicalJson(createDocumentHashPayload(generated.snapshot));
assertOk(canonical, 'canonical serialization setup');
const preimage = `${HASH_PREIMAGE_PREFIX}${HASH_DOMAINS.documentContent}\0${canonical.value}`;
const sha256Milliseconds = measure(samples, () => {
  sha256Utf8(preimage);
});

const artifact = {
  profileId: REFERENCE_CORPUS_PROFILE_ID,
  activationMilestone: 'Gate 1',
  suite: 'm-replace-text-kernel-microbenchmark',
  claimStatus: 'measurement-only',
  dirty: true,
  fixture: {
    name: 'M',
    generatorVersion: REFERENCE_CORPUS_GENERATOR_VERSION,
    seed: generated.metadata.seed,
    rawChecksum: generated.metadata.rawChecksum,
    documentHash: generated.metadata.documentHash,
    counts: generated.metadata.counts,
  },
  workload: {
    warmups,
    samples,
    mode: 'continuous successful commit chain',
    targetNodeId: target.id,
    initialTargetUtf16Length: target.value.length,
    replacements,
    timedRegion: 'prepareKernelTransaction only; transaction construction and oracle excluded',
    correctnessOracle:
      'full canonical document SHA-256 after every warmup and sample; trusted cache canonical-text equality',
    trustedFastPath:
      'exact process-local identity registered only after full schema/hash/deep-freeze verification',
  },
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    release: os.release(),
    cpu: os.cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  metrics: {
    untrustedKernelApplyMilliseconds: summarize(untrusted.kernelMilliseconds),
    trustedKernelApplyMilliseconds: summarize(trusted.kernelMilliseconds),
    timerExcludedFullOracleMilliseconds: {
      untrusted: summarize(untrusted.oracleMilliseconds),
      trusted: summarize(trusted.oracleMilliseconds),
    },
    trustedCacheRegistrationMilliseconds,
    trustedCacheActivationMilliseconds: summarize(trusted.cacheActivationMilliseconds),
    componentBaselinesMilliseconds: {
      documentIndexValidateAndBuild: summarize(indexMilliseconds),
      documentPayloadCanonicalSerialize: summarize(serializeMilliseconds),
      documentPreimagePortableSha256: summarize(sha256Milliseconds),
    },
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
  },
  raw: {
    untrustedKernelApplyMilliseconds: untrusted.kernelMilliseconds,
    trustedKernelApplyMilliseconds: trusted.kernelMilliseconds,
    untrustedOracleMilliseconds: untrusted.oracleMilliseconds,
    trustedOracleMilliseconds: trusted.oracleMilliseconds,
    trustedCacheActivationMilliseconds: trusted.cacheActivationMilliseconds,
    documentIndexMilliseconds: indexMilliseconds,
    canonicalSerializeMilliseconds: serializeMilliseconds,
    portableSha256Milliseconds: sha256Milliseconds,
  },
};

process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);

function createChain(snapshot, trusted) {
  return {
    snapshot,
    trusted,
    target: findTextTarget(snapshot.root),
    revision: createRevision(snapshot, null, 0, ids.transaction()),
    sequence: 0,
  };
}

function measureContinuousChain(chain, warmupCount, sampleCount) {
  for (let index = 0; index < warmupCount; index += 1) {
    applyNext(chain, index);
  }
  const kernelMilliseconds = [];
  const oracleMilliseconds = [];
  const cacheActivationMilliseconds = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const measured = applyNext(chain, warmupCount + index);
    kernelMilliseconds.push(measured.kernelMilliseconds);
    oracleMilliseconds.push(measured.oracleMilliseconds);
    cacheActivationMilliseconds.push(measured.cacheActivationMilliseconds);
  }
  return {
    kernelMilliseconds,
    oracleMilliseconds,
    cacheActivationMilliseconds,
  };
}

function applyNext(chain, index) {
  const replacement = replacements[index % replacements.length] ?? 'x';
  const transaction = {
    id: ids.transaction(),
    target: {
      uri: chain.revision.uri,
      baseRevisionId: chain.snapshot.revisionId,
    },
    actor: {
      type: 'human',
      id: 'benchmark-human',
    },
    operations: [
      {
        id: ids.operation(),
        type: 'replace-text',
        textNodeId: chain.target.id,
        startUtf16Offset: 0,
        endUtf16Offset: 0,
        replacement,
      },
    ],
    preconditions: [
      {
        kind: 'node-exists',
        nodeId: chain.target.id,
      },
      {
        kind: 'document-hash',
        expected: chain.snapshot.documentHash,
      },
    ],
    metadata: {
      source: 'human-input',
      undoGroupId: `benchmark-${index}`,
    },
    createdAt: '2026-07-20T00:00:00Z',
  };
  const nextRevisionId = ids.revision();
  const started = performance.now();
  const prepared = prepareKernelTransaction({
    transaction,
    headRevision: chain.revision,
    headSnapshot: chain.snapshot,
    nextRevisionId,
  });
  const kernelMilliseconds = performance.now() - started;
  assertOk(prepared, 'ReplaceText apply');

  const oracleStarted = performance.now();
  const oracle = hashCanonicalJsonPortable(
    HASH_DOMAINS.documentContent,
    createDocumentHashPayload(prepared.value.snapshot),
  );
  assertOk(oracle, 'full document hash oracle');
  if (oracle.hash !== prepared.value.snapshot.documentHash) {
    throw new Error('ReplaceText result diverged from the full canonical SHA-256 oracle.');
  }
  if (!chain.trusted && getVerifiedDocumentSnapshotCache(prepared.value.snapshot) !== undefined) {
    throw new Error('An untrusted Snapshot unexpectedly entered the identity fast path.');
  }
  const oracleMilliseconds = performance.now() - oracleStarted;

  let cacheActivationMilliseconds = 0;
  if (chain.trusted) {
    const activationStarted = performance.now();
    if (!activateKernelDerivedDocumentSnapshotCache(chain.snapshot, prepared.value.snapshot)) {
      throw new Error('The committed Snapshot cache could not be activated atomically.');
    }
    cacheActivationMilliseconds = performance.now() - activationStarted;
    const resultCache = getVerifiedDocumentSnapshotCache(prepared.value.snapshot);
    if (resultCache?.canonicalDocumentPayload !== oracle.canonicalJson) {
      throw new Error('Trusted cache canonical text diverged from the full serializer oracle.');
    }
  }

  const previousRevisionId = chain.snapshot.revisionId;
  chain.sequence += 1;
  chain.snapshot = prepared.value.snapshot;
  chain.revision = createRevision(
    chain.snapshot,
    previousRevisionId,
    chain.sequence,
    transaction.id,
  );
  return {
    kernelMilliseconds,
    oracleMilliseconds,
    cacheActivationMilliseconds,
  };
}

function createRevision(snapshot, parentRevisionId, sequence, transactionId) {
  return {
    id: snapshot.revisionId,
    uri: 'nireco://reference-r1/document/corpus-m',
    parentRevisionId,
    transactionId,
    sequence,
    documentHash: snapshot.documentHash,
    actor: {
      type: 'system',
      id: 'benchmark',
      role: 'validator',
    },
    createdAt: '2026-07-20T00:00:00Z',
    durability: 'snapshot',
  };
}

function measure(count, operation) {
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    operation(index);
    values.push(performance.now() - started);
  }
  return values;
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    samples: values.length,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1),
    mean,
    standardDeviation: Math.sqrt(variance),
  };
}

function percentile(sorted, quantile) {
  const rank = (sorted.length - 1) * quantile;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (rank - lower);
}

function findTextTarget(root) {
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node?.type === 'text' && node.value.length >= 16) {
      return node;
    }
    if (node !== undefined && 'children' in node) {
      pending.push(...node.children);
    }
  }
  throw new Error('The M corpus does not contain a suitable TextNode target.');
}

function createBenchmarkIdAllocator() {
  let sequence = 0;
  const next = (parse, label) => {
    sequence += 1;
    const randomBytes = new Uint8Array(10);
    randomBytes[8] = Math.floor(sequence / 256);
    randomBytes[9] = sequence % 256;
    const parsed = parse(
      createUuidV7({
        unixMilliseconds: 1_720_000_000_000,
        randomBytes,
      }),
    );
    if (parsed.type === 'invalid') {
      throw new Error(`Could not allocate benchmark ${label}.`);
    }
    return parsed.value;
  };
  return {
    operation: () => next(parseOperationId, 'Operation ID'),
    revision: () => next(parseRevisionId, 'Revision ID'),
    transaction: () => next(parseTransactionId, 'Transaction ID'),
  };
}

function assertOk(result, label) {
  if (result.type === 'error') {
    throw new Error(`${label} failed: ${result.error.safeMessage ?? result.error.reason}`);
  }
}

function readPositiveIntegerArgument(name, fallback) {
  const value = readArgument(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function readNonnegativeIntegerArgument(name, fallback) {
  const value = readArgument(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a nonnegative integer.`);
  }
  return parsed;
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
