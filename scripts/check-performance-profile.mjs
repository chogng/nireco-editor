import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileId = 'nireco-g0-r1-2026-07-16';
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
const expectedCorpora = {
  S: {
    words: 15_000,
    documentNodes: 1_500,
    citations: 100,
  },
  M: {
    words: 75_000,
    documentNodes: 8_000,
    citations: 500,
  },
  L: {
    words: 200_000,
    documentNodes: 25_000,
    citations: 1_500,
  },
};
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

const paths = {
  developmentSpec: 'NIRECO_AGENT_NATIVE_EDITOR_DEVELOPMENT_SPEC.md',
  engineeringStandard: 'NIRECO_COMET_ENGINEERING_CODING_STANDARD.md',
  roadmap: 'NIRECO_COMET_ROADMAP.md',
  referenceProfile: 'docs/performance/reference-profile.md',
  closureEvidence: 'docs/performance/g0-b005-closure-evidence.md',
  manifest: 'contracts/comet-integration/contract.manifest.json',
  packageJson: 'package.json',
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
const manifest = parseJson(requireString(sources['manifest'], paths.manifest), paths.manifest);
const packageJson = parseJson(
  requireString(sources['packageJson'], paths.packageJson),
  paths.packageJson,
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

checkCorpora(paths.developmentSpec, parseSpecCorpora(specSection));
checkCorpora(paths.roadmap, parseTableCorpora(roadmapSection));
checkCorpora(paths.referenceProfile, parseTableCorpora(referenceSection));
checkCorpora(paths.closureEvidence, parseTableCorpora(closureEvidence));
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
    '- Status: Accepted baseline definition; corpus alignment machine-verified; measurements not yet recorded',
  )
) {
  errors.push(`${paths.referenceProfile} must state that measurements are not yet recorded.`);
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
if (!closureEvidence.includes('- Benchmark calibration: Pending')) {
  errors.push(`${paths.closureEvidence} must record benchmark calibration as Pending.`);
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
checkCorpora(
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
  `${paths.manifest} performanceEvidence.closureEvidenceVersion`,
  performanceEvidence?.['closureEvidenceVersion'],
  closureEvidenceVersion,
);
checkScalar(
  `${paths.manifest} performanceEvidence.verificationCommand`,
  performanceEvidence?.['verificationCommand'],
  'pnpm check:performance-profile',
);
checkCorpora(
  `${paths.manifest} performanceEvidence.corpora`,
  readRecord(performanceEvidence, 'corpora', `${paths.manifest} performanceEvidence`),
);

if (errors.length > 0) {
  console.error('Performance profile checks failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Performance profile ${profileId} has frozen device/runtime, budgets and corpora; ` +
      'normative versions and evidence pointers are aligned across the repository.',
  );
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

function checkCorpora(label, actual) {
  if (!isRecord(actual)) {
    errors.push(`${label} does not contain a corpus object.`);
    return;
  }
  for (const [corpus, expected] of Object.entries(expectedCorpora)) {
    const actualCorpus = actual[corpus];
    if (!isRecord(actualCorpus)) {
      errors.push(`${label} is missing corpus ${corpus}.`);
      continue;
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
