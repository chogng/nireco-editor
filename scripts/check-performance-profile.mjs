import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileId = 'nireco-g0-r1-2026-07-16';
const corpusGeneratorVersion = '1.1.0';
const closureEvidenceVersion = 1;
const expectedVersions = {
  developmentSpec: '0.4.3',
  engineeringStandard: '0.1.1',
  roadmap: '0.1.2',
};
const expectedReferenceDevice = {
  Device: 'Mac Studio, model identifier `Mac14,13`',
  CPU: 'Apple M2 Max, 12 cores (8 performance + 4 efficiency)',
  Memory: '32 GB unified memory',
  Storage: 'Internal SSD，运行时至少保留 20% free space',
  OS: 'macOS 26.4.1 (`25E253`)',
  'Node.js': '25.2.1',
  pnpm: '11.9.0（repository pin）',
  Chrome: '150.0.7871.126',
  Safari: '26.4 (`21624.1.16.11.4`)',
};
const expectedFullCorpora = {
  S: {
    words: 15_000,
    documentNodes: 1_500,
    citations: 100,
    tables: 5,
    figures: 5,
    equations: 20,
  },
  M: {
    words: 75_000,
    documentNodes: 8_000,
    citations: 500,
    tables: 20,
    figures: 20,
    equations: 100,
  },
  L: {
    words: 200_000,
    documentNodes: 25_000,
    citations: 1_500,
    tables: 60,
    figures: 60,
    equations: 500,
  },
};
const expectedCorpora = Object.fromEntries(
  Object.entries(expectedFullCorpora).map(([name, corpus]) => [
    name,
    {
      words: corpus.words,
      documentNodes: corpus.documentNodes,
      citations: corpus.citations,
    },
  ]),
);
const expectedBudgets = {
  'Ordinary Transaction apply': {
    corpus: 'M',
    budget: 'P95 ≤ 10 ms',
  },
  'Model-to-DOM patch segment': {
    corpus: 'S and M',
    budget: 'P95 < 16 ms',
  },
  'End-to-end key-to-paint': {
    corpus: 'M',
    budget: 'P95 ≤ 50 ms',
  },
  'Local Snapshot open': {
    corpus: 'M',
    budget: '≤ 2 s',
  },
  'Ordinary search first results': {
    corpus: 'M',
    budget: '≤ 250 ms',
  },
  'Canonical serialize/hash agreement': {
    corpus: 'S/M/L, Browser/Node',
    budget: '100% identical',
  },
  'Transaction atomicity/inverse/replay': {
    corpus: 'S/M/L',
    budget: '100% conformance',
  },
  'Partial-accept dependency closure': {
    corpus: 'Proposal workload',
    budget: '100% correct',
  },
  'Composition/Paste/Undo data corruption': {
    corpus: 'Editor workload',
    budget: '0 events',
  },
};
const expectedActivationMatrix = {
  'Gate 0': {
    capability: 'Corpus/hash/evidence infrastructure + implemented correctness baselines',
    activatedSuites: 'Corpus identity; canonical serialize/hash; evidence validation',
    currentState: 'Active — no latency pass',
  },
  'Gate 1': {
    capability: 'Transaction/read',
    activatedSuites: 'Transaction apply; atomicity/inverse/replay; Snapshot open; read/search',
    currentState: 'Pending by design',
  },
  'Gate 2': {
    capability: 'Proposal',
    activatedSuites: 'Proposal validation; Semantic Diff; dependency closure',
    currentState: 'Pending by design',
  },
  N5: {
    capability: 'Editor',
    activatedSuites: 'DOM patch; key-to-paint; IME/Composition; Paste/Undo corruption',
    currentState: 'Pending by design',
  },
};
const expectedGateReportPendingSuites = {
  'Gate 1 Transaction/Read performance suites': 'Pending by design（not Pass）',
  'Gate 2 Proposal performance/correctness suites': 'Pending by design（not Pass）',
  'N5 Editor performance/correctness suites': 'Pending by design（not Pass）',
};
const currentLatencyClaim = '- Current latency claim: No latency suite has passed';
const expectedCalibrationMeasurement = {
  suite: 'm-replace-text-kernel-microbenchmark',
  warmups: 10,
  samples: 30,
};

const paths = {
  developmentSpec: 'NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md',
  engineeringStandard: 'NIRECO_COMET_ENGINEERING_CODING_STANDARD.md',
  roadmap: 'NIRECO_COMET_ROADMAP.md',
  referenceProfile: 'docs/performance/reference-profile.md',
  closureEvidence: 'docs/performance/g0-b005-closure-evidence.md',
  gateReport: 'docs/gates/gate-0-report.md',
  riskRegister: 'docs/risks/gate-0-risk-register.md',
  bootstrapPlan: 'docs/plans/gate-0-bootstrap-plan.md',
  manifest: 'contracts/comet-integration/contract.manifest.json',
  packageJson: 'package.json',
  corpusLock: 'docs/performance/reference-corpus-lock.json',
  calibrationMeasurement: 'docs/performance/m-replace-text-kernel-measurement-2026-07-16.json',
};

const errors = [];
const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([name, relativePath]) => [
      name,
      await readFile(path.join(repositoryRoot, relativePath), 'utf8'),
    ]),
  ),
);

const developmentSpec = requireString(sources['developmentSpec'], paths.developmentSpec);
const engineeringStandard = requireString(
  sources['engineeringStandard'],
  paths.engineeringStandard,
);
const roadmap = requireString(sources['roadmap'], paths.roadmap);
const referenceProfile = requireString(sources['referenceProfile'], paths.referenceProfile);
const closureEvidence = requireString(sources['closureEvidence'], paths.closureEvidence);
const gateReport = requireString(sources['gateReport'], paths.gateReport);
const riskRegister = requireString(sources['riskRegister'], paths.riskRegister);
const bootstrapPlan = requireString(sources['bootstrapPlan'], paths.bootstrapPlan);
const manifest = parseJson(requireString(sources['manifest'], paths.manifest), paths.manifest);
const packageJson = parseJson(
  requireString(sources['packageJson'], paths.packageJson),
  paths.packageJson,
);
const corpusLock = parseJson(
  requireString(sources['corpusLock'], paths.corpusLock),
  paths.corpusLock,
);
const calibrationMeasurement = parseJson(
  requireString(sources['calibrationMeasurement'], paths.calibrationMeasurement),
  paths.calibrationMeasurement,
);

checkVersion(paths.developmentSpec, developmentSpec, expectedVersions.developmentSpec);
checkVersion(paths.roadmap, roadmap, expectedVersions.roadmap);
checkVersion(paths.engineeringStandard, engineeringStandard, expectedVersions.engineeringStandard);

const specSection = extractSection(
  developmentSpec,
  '### 28.1 性能档位',
  '### 28.2 正确性优先级',
  paths.developmentSpec,
);
const roadmapSection = extractSection(
  roadmap,
  '### 15.1 文档规模',
  '### 15.2 Core 目标',
  paths.roadmap,
);
const referenceSection = extractSection(
  referenceProfile,
  '## Canonical corpora',
  '## Workload definitions',
  paths.referenceProfile,
);
const referenceDeviceSection = extractSection(
  referenceProfile,
  '## Reference device R1',
  '## Controlled run conditions',
  paths.referenceProfile,
);
const budgetsSection = extractSection(
  referenceProfile,
  '## Frozen budgets',
  '## Required result artifact',
  paths.referenceProfile,
);
const referenceActivationSection = extractSection(
  referenceProfile,
  '## Capability activation and staged calibration policy',
  '## Workload definitions',
  paths.referenceProfile,
);
const roadmapActivationSection = extractSection(
  roadmap,
  '### 15.0 能力激活矩阵',
  '### 15.1 文档规模',
  paths.roadmap,
);
const closureActivationSection = extractSection(
  closureEvidence,
  '## Capability activation',
  '## Evidence',
  paths.closureEvidence,
);
const planActivationSection = extractSection(
  bootstrapPlan,
  '## Calibration activation',
  '## Execution slices',
  paths.bootstrapPlan,
);

checkCorpora(paths.developmentSpec, parseSpecCorpora(specSection));
checkCorpora(paths.roadmap, parseTableCorpora(roadmapSection));
checkFullCorpora(paths.referenceProfile, parseFullTableCorpora(referenceSection));
checkFullCorpora(paths.closureEvidence, parseFullTableCorpora(closureEvidence));
checkExactRecord(
  `${paths.referenceProfile} reference device/runtime`,
  parseTwoColumnTable(referenceDeviceSection),
  expectedReferenceDevice,
);
checkExactRecord(
  `${paths.referenceProfile} frozen budgets`,
  parseBudgetTable(budgetsSection),
  expectedBudgets,
);
for (const [label, section] of [
  [paths.referenceProfile, referenceActivationSection],
  [paths.roadmap, roadmapActivationSection],
  [paths.closureEvidence, closureActivationSection],
  [paths.bootstrapPlan, planActivationSection],
]) {
  checkExactRecord(
    `${label} capability activation matrix`,
    parseActivationTable(section),
    expectedActivationMatrix,
  );
}

for (const legacyValue of ['20,000', '100,000', '300,000']) {
  if (specSection.includes(legacyValue)) {
    errors.push(
      `${paths.developmentSpec} §28.1 still contains legacy corpus value ${legacyValue}.`,
    );
  }
}

if (!referenceProfile.includes(`Profile ID: \`${profileId}\``)) {
  errors.push(`${paths.referenceProfile} does not pin profile ID ${profileId}.`);
}
if (
  !referenceProfile.includes(
    '- Status: Accepted staged baseline definition; activation matrix machine-verified; no latency suite has passed',
  )
) {
  errors.push(`${paths.referenceProfile} must state the accepted staged no-latency-pass status.`);
}
if (!closureEvidence.includes('- Status: Closed')) {
  errors.push(`${paths.closureEvidence} must record G0-B005 as Closed.`);
}
if (!closureEvidence.includes(`- Closure evidence version: ${closureEvidenceVersion}`)) {
  errors.push(
    `${paths.closureEvidence} must pin closure evidence version ${closureEvidenceVersion}.`,
  );
}
if (!closureEvidence.includes(`- Reference profile: \`${profileId}\``)) {
  errors.push(`${paths.closureEvidence} does not reference ${profileId}.`);
}
if (!closureEvidence.includes('- Calibration policy: Staged by capability')) {
  errors.push(`${paths.closureEvidence} must record staged capability calibration.`);
}
if (
  !closureEvidence.includes(
    '- Gate 0 baseline: Active — corpus/hash/evidence infrastructure and implemented correctness baselines only',
  )
) {
  errors.push(`${paths.closureEvidence} must constrain the active Gate 0 baseline.`);
}

for (const [label, source] of [
  [paths.referenceProfile, referenceProfile],
  [paths.roadmap, roadmap],
  [paths.closureEvidence, closureEvidence],
  [paths.gateReport, gateReport],
  [paths.riskRegister, riskRegister],
  [paths.bootstrapPlan, bootstrapPlan],
]) {
  if (!source.includes(currentLatencyClaim)) {
    errors.push(`${label} must state "${currentLatencyClaim}".`);
  }
}

if (!gateReport.includes('- Open technical blocker count: **0**')) {
  errors.push(`${paths.gateReport} must record zero open technical blockers.`);
}
if (!riskRegister.includes('- Overall Gate 0 blocker count: **0**')) {
  errors.push(`${paths.riskRegister} must record zero Gate 0 technical blockers.`);
}
if (!hasRiskStatus(riskRegister, 'R-G0-017', 'Mitigated')) {
  errors.push(`${paths.riskRegister} must record R-G0-017 as Mitigated.`);
}
if (!bootstrapPlan.includes('Complete（policy/control only；no latency pass）')) {
  errors.push(`${paths.bootstrapPlan} must keep G0-M complete without a latency-pass claim.`);
}
checkExactRecord(
  `${paths.gateReport} pending suite statuses`,
  parseGateReportPendingSuites(gateReport),
  expectedGateReportPendingSuites,
);
for (const [label, source] of [
  [paths.referenceProfile, referenceProfile],
  [paths.roadmap, roadmap],
  [paths.closureEvidence, closureEvidence],
  [paths.gateReport, gateReport],
  [paths.riskRegister, riskRegister],
  [paths.bootstrapPlan, bootstrapPlan],
]) {
  for (const claim of findContradictoryPerformancePassClaims(source)) {
    errors.push(`${label} contains a contradictory positive performance claim: ${claim}`);
  }
}

const packageMetadata = readRecord(packageJson, 'nireco', paths.packageJson);
checkScalar(
  `${paths.packageJson} nireco.developmentSpecVersion`,
  packageMetadata?.['developmentSpecVersion'],
  expectedVersions.developmentSpec,
);
checkScalar(
  `${paths.packageJson} nireco.engineeringStandardVersion`,
  packageMetadata?.['engineeringStandardVersion'],
  expectedVersions.engineeringStandard,
);
checkScalar(
  `${paths.packageJson} nireco.roadmapVersion`,
  packageMetadata?.['roadmapVersion'],
  expectedVersions.roadmap,
);
const packageProfile = readRecord(
  packageMetadata,
  'referencePerformanceProfile',
  `${paths.packageJson} nireco`,
);
checkScalar(
  `${paths.packageJson} referencePerformanceProfile.id`,
  packageProfile?.['id'],
  profileId,
);
checkFullCorpora(
  `${paths.packageJson} nireco.referencePerformanceProfile.corpora`,
  readRecord(packageProfile, 'corpora', `${paths.packageJson} nireco.referencePerformanceProfile`),
);

const normativeSources = readRecord(manifest, 'normativeSources', paths.manifest);
checkManifestSourceVersion(normativeSources, 'spec', expectedVersions.developmentSpec);
checkManifestSourceVersion(normativeSources, 'roadmap', expectedVersions.roadmap);
checkManifestSourceVersion(
  normativeSources,
  'engineeringStandard',
  expectedVersions.engineeringStandard,
);

const performanceEvidence = readRecord(manifest, 'performanceEvidence', paths.manifest);
checkScalar(
  `${paths.manifest} performanceEvidence.blocker`,
  performanceEvidence?.['blocker'],
  'G0-B005',
);
checkScalar(
  `${paths.manifest} performanceEvidence.status`,
  performanceEvidence?.['status'],
  'closed',
);
checkScalar(
  `${paths.manifest} performanceEvidence.profileId`,
  performanceEvidence?.['profileId'],
  profileId,
);
checkScalar(
  `${paths.manifest} performanceEvidence.profilePath`,
  performanceEvidence?.['profilePath'],
  '../../docs/performance/reference-profile.md',
);
checkScalar(
  `${paths.manifest} performanceEvidence.closureEvidencePath`,
  performanceEvidence?.['closureEvidencePath'],
  '../../docs/performance/g0-b005-closure-evidence.md',
);
checkScalar(
  `${paths.manifest} performanceEvidence.corpusIdentityPath`,
  performanceEvidence?.['corpusIdentityPath'],
  'performance/reference-corpus-lock.json',
);
checkScalar(
  `${paths.manifest} performanceEvidence.corpusGeneratorVersion`,
  performanceEvidence?.['corpusGeneratorVersion'],
  corpusGeneratorVersion,
);
checkScalar(
  `${paths.manifest} performanceEvidence.closureEvidenceVersion`,
  performanceEvidence?.['closureEvidenceVersion'],
  closureEvidenceVersion,
);
checkScalar(
  `${paths.manifest} performanceEvidence.verificationCommand`,
  performanceEvidence?.['verificationCommand'],
  'pnpm check:performance-profile',
);
checkScalar(
  `${paths.manifest} performanceEvidence.corpusVerificationCommand`,
  performanceEvidence?.['corpusVerificationCommand'],
  'pnpm check:reference-corpora',
);
checkScalar(
  `${paths.manifest} performanceEvidence.corpusHistoryVerificationCommand`,
  performanceEvidence?.['corpusHistoryVerificationCommand'],
  'pnpm check:reference-corpus-history',
);
checkFullCorpora(
  `${paths.manifest} performanceEvidence.corpora`,
  readRecord(performanceEvidence, 'corpora', `${paths.manifest} performanceEvidence`),
);
checkCalibrationMeasurement(calibrationMeasurement, corpusLock);

if (errors.length > 0) {
  console.error('Performance profile checks failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Performance profile ${profileId} has frozen device/runtime, budgets and corpora; ` +
      'the staged activation matrix and no-latency-pass claim are fail-closed across the repository.',
  );
}

function checkCalibrationMeasurement(measurement, lockedCorpora) {
  const label = paths.calibrationMeasurement;
  checkScalar(`${label} profileId`, measurement['profileId'], profileId);
  checkScalar(`${label} activationMilestone`, measurement['activationMilestone'], 'Gate 1');
  checkScalar(`${label} suite`, measurement['suite'], expectedCalibrationMeasurement.suite);
  checkScalar(`${label} claimStatus`, measurement['claimStatus'], 'measurement-only');
  checkScalar(`${label} dirty`, measurement['dirty'], true);
  if ('status' in measurement || 'result' in measurement || 'commit' in measurement) {
    errors.push(`${label} must remain a dirty measurement-only artifact without a pass result.`);
  }

  const workload = readRecord(measurement, 'workload', label);
  checkScalar(
    `${label} workload.warmups`,
    workload?.['warmups'],
    expectedCalibrationMeasurement.warmups,
  );
  checkScalar(
    `${label} workload.samples`,
    workload?.['samples'],
    expectedCalibrationMeasurement.samples,
  );
  checkScalar(
    `${label} workload.correctnessOracle`,
    workload?.['correctnessOracle'],
    'full canonical document SHA-256 after every warmup and sample; trusted cache canonical-text equality',
  );

  const corpora = readRecord(lockedCorpora, 'corpora', paths.corpusLock);
  const lockedM = readRecord(corpora, 'M', `${paths.corpusLock} corpora`);
  const fixture = readRecord(measurement, 'fixture', label);
  if (lockedM !== undefined) {
    checkExactRecord(`${label} fixture`, fixture ?? {}, {
      name: lockedM['name'],
      generatorVersion: lockedM['generatorVersion'],
      seed: lockedM['seed'],
      rawChecksum: lockedM['rawChecksum'],
      documentHash: lockedM['documentHash'],
      counts: lockedM['counts'],
    });
  }

  const metrics = readRecord(measurement, 'metrics', label);
  const raw = readRecord(measurement, 'raw', label);
  const samples = expectedCalibrationMeasurement.samples;
  checkMeasurementSeries(
    `${label} untrustedKernelApplyMilliseconds`,
    metrics?.['untrustedKernelApplyMilliseconds'],
    raw?.['untrustedKernelApplyMilliseconds'],
    samples,
  );
  checkMeasurementSeries(
    `${label} trustedKernelApplyMilliseconds`,
    metrics?.['trustedKernelApplyMilliseconds'],
    raw?.['trustedKernelApplyMilliseconds'],
    samples,
  );
  const oracle = readRecord(metrics, 'timerExcludedFullOracleMilliseconds', `${label} metrics`);
  checkMeasurementSeries(
    `${label} untrustedOracleMilliseconds`,
    oracle?.['untrusted'],
    raw?.['untrustedOracleMilliseconds'],
    samples,
  );
  checkMeasurementSeries(
    `${label} trustedOracleMilliseconds`,
    oracle?.['trusted'],
    raw?.['trustedOracleMilliseconds'],
    samples,
  );
  checkMeasurementSeries(
    `${label} trustedCacheActivationMilliseconds`,
    metrics?.['trustedCacheActivationMilliseconds'],
    raw?.['trustedCacheActivationMilliseconds'],
    samples,
  );
  const baselines = readRecord(metrics, 'componentBaselinesMilliseconds', `${label} metrics`);
  for (const [summaryName, rawName] of [
    ['documentIndexValidateAndBuild', 'documentIndexMilliseconds'],
    ['documentPayloadCanonicalSerialize', 'canonicalSerializeMilliseconds'],
    ['documentPreimagePortableSha256', 'portableSha256Milliseconds'],
  ]) {
    checkMeasurementSeries(
      `${label} ${summaryName}`,
      baselines?.[summaryName],
      raw?.[rawName],
      samples,
    );
  }
  checkNonnegativeFinite(
    `${label} trustedCacheRegistrationMilliseconds`,
    metrics?.['trustedCacheRegistrationMilliseconds'],
  );
  checkPositiveFinite(`${label} peakRssBytes`, metrics?.['peakRssBytes']);
}

function checkMeasurementSeries(label, summaryValue, rawValue, expectedSamples) {
  if (!Array.isArray(rawValue)) {
    errors.push(`${label} raw measurements are not an array.`);
    return;
  }
  if (rawValue.length !== expectedSamples) {
    errors.push(`${label} has ${rawValue.length} raw samples; expected ${expectedSamples}.`);
  }
  if (
    !rawValue.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
  ) {
    errors.push(`${label} contains a non-finite or negative raw measurement.`);
    return;
  }
  if (!isRecord(summaryValue)) {
    errors.push(`${label} summary is not an object.`);
    return;
  }
  const expected = summarizeMeasurements(rawValue);
  checkExactKeySet(label, summaryValue, Object.keys(expected));
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = summaryValue[field];
    if (
      typeof actualValue !== 'number' ||
      !Number.isFinite(actualValue) ||
      Math.abs(actualValue - expectedValue) > 1e-9
    ) {
      errors.push(
        `${label}.${field} is ${String(actualValue)}; expected raw-derived ${expectedValue}.`,
      );
    }
  }
}

function summarizeMeasurements(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    samples: values.length,
    median: measurementPercentile(sorted, 0.5),
    p95: measurementPercentile(sorted, 0.95),
    p99: measurementPercentile(sorted, 0.99),
    max: sorted.at(-1),
    mean,
    standardDeviation: Math.sqrt(variance),
  };
}

function measurementPercentile(sorted, quantile) {
  const rank = (sorted.length - 1) * quantile;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (rank - lower);
}

function checkExactKeySet(label, value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const canonicalExpectedKeys = [...expectedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(canonicalExpectedKeys)) {
    errors.push(
      `${label} keys are ${actualKeys.join(', ')}; expected ${canonicalExpectedKeys.join(', ')}.`,
    );
  }
}

function checkNonnegativeFinite(label, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push(`${label} must be a nonnegative finite number.`);
  }
}

function checkPositiveFinite(label, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push(`${label} must be a positive finite number.`);
  }
}

function requireString(value, label) {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} could not be read as text.`);
  }
  return value;
}

function parseJson(source, label) {
  try {
    const parsed = JSON.parse(source);
    if (!isRecord(parsed)) {
      throw new TypeError('top-level value is not an object');
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
  }
}

function extractSection(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    errors.push(`${label} is missing section markers ${startMarker} / ${endMarker}.`);
    return '';
  }
  return source.slice(start, end);
}

function parseSpecCorpora(section) {
  const corpora = {};
  for (const corpus of Object.keys(expectedCorpora)) {
    const expression = new RegExp(
      `^${corpus}：(?<words>[\\d,]+) words，约 (?<documentNodes>[\\d,]+) nodes，` +
        `(?<citations>[\\d,]+) citations$`,
      'mu',
    );
    const match = expression.exec(section);
    if (match?.groups === undefined) {
      errors.push(`${paths.developmentSpec} is missing the canonical ${corpus} corpus line.`);
      continue;
    }
    corpora[corpus] = parseCorpusFields(match.groups);
  }
  return corpora;
}

function parseTableCorpora(section) {
  const corpora = {};
  const expression =
    /^\|\s*(?<corpus>[SML])\s*\|\s*(?<words>[\d,]+)\s*\|\s*(?<documentNodes>[\d,]+)\s*\|\s*(?<citations>[\d,]+)\s*\|/gmu;
  for (const match of section.matchAll(expression)) {
    if (match.groups === undefined) {
      continue;
    }
    corpora[match.groups.corpus] = parseCorpusFields(match.groups);
  }
  return corpora;
}

function parseFullTableCorpora(section) {
  const corpora = {};
  const expression =
    /^\|\s*(?<corpus>[SML])\s*\|\s*(?<words>[\d,]+)\s*\|\s*(?<documentNodes>[\d,]+)\s*\|\s*(?<citations>[\d,]+)\s*\|\s*(?<tables>[\d,]+)\s*\|\s*(?<figures>[\d,]+)\s*\|\s*(?<equations>[\d,]+)\s*\|/gmu;
  for (const match of section.matchAll(expression)) {
    if (match.groups === undefined) {
      continue;
    }
    corpora[match.groups.corpus] = {
      ...parseCorpusFields(match.groups),
      tables: parseInteger(match.groups.tables),
      figures: parseInteger(match.groups.figures),
      equations: parseInteger(match.groups.equations),
    };
  }
  return corpora;
}

function parseTwoColumnTable(section) {
  const values = {};
  const expression = /^\|\s*(?<key>[^|]+?)\s*\|\s*(?<value>[^|]+?)\s*\|$/gmu;
  for (const match of section.matchAll(expression)) {
    if (match.groups === undefined) {
      continue;
    }
    const key = match.groups.key.trim();
    if (key === 'Component' || /^-+$/.test(key)) {
      continue;
    }
    values[key] = match.groups.value.trim();
  }
  return values;
}

function parseBudgetTable(section) {
  const budgets = {};
  const expression =
    /^\|\s*(?<metric>[^|]+?)\s*\|\s*(?<corpus>[^|]+?)\s*\|\s*(?<budget>[^|]+?)\s*\|$/gmu;
  for (const match of section.matchAll(expression)) {
    if (match.groups === undefined) {
      continue;
    }
    const metric = match.groups.metric.trim();
    if (metric === 'Metric' || /^-+$/.test(metric)) {
      continue;
    }
    budgets[metric] = {
      corpus: match.groups.corpus.trim(),
      budget: match.groups.budget.trim(),
    };
  }
  return budgets;
}

function parseActivationTable(section) {
  const activation = {};
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) {
      continue;
    }
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
    if (cells.length !== 4 || !(cells[0] in expectedActivationMatrix)) {
      continue;
    }
    activation[cells[0]] = {
      capability: cells[1],
      activatedSuites: cells[2],
      currentState: cells[3],
    };
  }
  return activation;
}

function parseGateReportPendingSuites(source) {
  const statuses = {};
  for (const line of source.split('\n')) {
    if (!line.startsWith('|')) {
      continue;
    }
    const cells = line
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
    const criterion = cells[0];
    if (cells.length === 3 && criterion in expectedGateReportPendingSuites) {
      statuses[criterion] = cells[2];
    }
  }
  return statuses;
}

function findContradictoryPerformancePassClaims(source) {
  const suitePattern = /(?:Gate 1|Gate 2|N5|Editor|latency suite)/iu;
  const passPattern = /(?:\bpass(?:ed)?\b|已通过|性能通过)/iu;
  const negationPattern =
    /(?:not\s+Pass|no latency|must not|Pending by design|不得|没有|尚未|未激活|不是|不表示|不能|不允许|只有[^。；]*才可标记|无[^|]*artifact)/iu;
  return source
    .replace(/```[\s\S]*?```/gu, '')
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replaceAll('\n', ' ').trim())
    .filter(
      (paragraph) =>
        suitePattern.test(paragraph) &&
        passPattern.test(paragraph) &&
        !negationPattern.test(paragraph),
    );
}

function parseCorpusFields(fields) {
  return {
    words: parseInteger(fields.words),
    documentNodes: parseInteger(fields.documentNodes),
    citations: parseInteger(fields.citations),
  };
}

function parseInteger(value) {
  return Number.parseInt(value.replaceAll(',', ''), 10);
}

function hasRiskStatus(source, riskId, expectedStatus) {
  const row = source.split('\n').find((line) => line.startsWith(`| ${riskId} `));
  if (row === undefined) {
    return false;
  }
  const cells = row
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
  return cells.at(-1) === expectedStatus;
}

function checkCorpora(label, actual) {
  checkCorporaAgainst(label, actual, expectedCorpora);
}

function checkFullCorpora(label, actual) {
  checkCorporaAgainst(label, actual, expectedFullCorpora);
}

function checkCorporaAgainst(label, actual, expectedCorporaShape) {
  if (!isRecord(actual)) {
    errors.push(`${label} does not contain a corpus object.`);
    return;
  }
  for (const corpus of Object.keys(actual)) {
    if (!(corpus in expectedCorporaShape)) {
      errors.push(`${label} contains unexpected corpus ${corpus}.`);
    }
  }
  for (const [corpus, expected] of Object.entries(expectedCorporaShape)) {
    const actualCorpus = actual[corpus];
    if (!isRecord(actualCorpus)) {
      errors.push(`${label} is missing corpus ${corpus}.`);
      continue;
    }
    for (const field of Object.keys(actualCorpus)) {
      if (!(field in expected)) {
        errors.push(`${label} ${corpus} contains unexpected field ${field}.`);
      }
    }
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (actualCorpus[field] !== expectedValue) {
        errors.push(
          `${label} ${corpus}.${field} is ${String(actualCorpus[field])}; ` +
            `expected ${String(expectedValue)}.`,
        );
      }
    }
  }
}

function checkVersion(label, source, expected) {
  const version = /^version:\s*(?<version>\d+\.\d+\.\d+)\s*$/mu.exec(source)?.groups?.version;
  checkScalar(`${label} front matter version`, version, expected);
}

function checkExactRecord(label, actual, expected) {
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  for (const key of expectedKeys) {
    if (!(key in actual)) {
      errors.push(`${label} is missing ${key}.`);
      continue;
    }
    const actualValue = actual[key];
    const expectedValue = expected[key];
    if (isRecord(expectedValue)) {
      if (!isRecord(actualValue)) {
        errors.push(`${label}.${key} is not an object.`);
        continue;
      }
      checkExactRecord(`${label}.${key}`, actualValue, expectedValue);
    } else {
      checkScalar(`${label}.${key}`, actualValue, expectedValue);
    }
  }
  for (const key of actualKeys) {
    if (!(key in expected)) {
      errors.push(`${label} contains unexpected entry ${key}.`);
    }
  }
}

function checkManifestSourceVersion(normativeSources, name, expected) {
  const source = readRecord(normativeSources, name, `${paths.manifest} normativeSources`);
  checkScalar(`${paths.manifest} normativeSources.${name}.version`, source?.['version'], expected);
}

function readRecord(parent, field, label) {
  if (!isRecord(parent)) {
    errors.push(`${label} is not an object.`);
    return undefined;
  }
  const value = parent[field];
  if (!isRecord(value)) {
    errors.push(`${label}.${field} is not an object.`);
    return undefined;
  }
  return value;
}

function checkScalar(label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label} is ${String(actual)}; expected ${expected}.`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
