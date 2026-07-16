import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv from 'ajv';

const CAPABILITY_KEYS = [
  'beforeInputEvent',
  'clipboardEvent',
  'compositionEvent',
  'dataTransfer',
  'mutationObserver',
  'selection',
];
const CAPABILITIES = Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, true]));
const CAPTURE_TOOL = '@playwright/cli via Codex wrapper';
const EVIDENCE_SCHEMA_PATH = 'docs/browser/evidence/browser-spike-evidence.schema.json';
const HASH_VECTOR_FIXTURE_PATH = 'contracts/comet-integration/fixtures/hash-preimages.json';
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

const profiles = {
  chrome: {
    browser: 'chrome',
    engine: {
      family: 'Chromium',
      platform: 'MacIntel',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36',
      version: '150.0.0.0',
    },
    evidencePath: 'docs/browser/evidence/chrome-150.json',
    screenshotPath: 'docs/browser/evidence/screenshots/chrome-150.png',
  },
  webkit: {
    browser: 'webkit',
    engine: {
      family: 'WebKit',
      platform: 'MacIntel',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15',
      version: '26.5',
    },
    evidencePath: 'docs/browser/evidence/webkit-26.5.json',
    screenshotPath: 'docs/browser/evidence/screenshots/webkit-26.5.png',
  },
};

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function formatAjvErrors(errors) {
  return errors
    ?.map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

function expectedScenarioResults(fixtureSha256) {
  return [
    {
      id: 'browser-hash-byte-vectors',
      observed: {
        fixture: {
          path: HASH_VECTOR_FIXTURE_PATH,
          sha256: fixtureSha256,
        },
        profile: 'nireco-hash-preimage-1',
        vectorsMatched: 7,
      },
      status: 'pass',
    },
    {
      id: 'beforeinput-to-transaction',
      observed: {
        defaultPrevented: true,
        modelText: 'hello!',
        transactionCount: 1,
      },
      status: 'pass',
    },
    {
      id: 'composition-single-transaction',
      observed: {
        modelText: '论文方法',
        transactionCount: 1,
        undoGroupId: 'composition-1',
      },
      status: 'pass',
    },
    {
      id: 'stale-composition-controlled-fallback',
      observed: {
        diagnostic: 'COMPOSITION_TARGET_STALE',
        modelText: '外部提交',
        transactionCount: 0,
      },
      status: 'pass',
    },
    {
      id: 'selection-utf16-boundary',
      observed: {
        invalidBoundaryCode: 'INVALID_UTF16_BOUNDARY',
        validUtf16Offset: 3,
      },
      status: 'pass',
    },
    {
      id: 'clipboard-sanitize-atomic-paste',
      observed: {
        modelText: '引用：安全内容',
        scriptExecuted: false,
        transactionCount: 1,
      },
      status: 'pass',
    },
    {
      id: 'dom-divergence-recovery',
      observed: {
        divergenceCount: 3,
        readOnly: true,
        transactionCount: 0,
      },
      status: 'pass',
    },
  ];
}

function assertRunEvidence(run, profile, fixtureSha256, sourceLabel) {
  assert.deepEqual(
    Object.keys(run.engine).sort(),
    ['family', 'platform', 'userAgent', 'version'],
    `${sourceLabel}: engine keys drifted`,
  );
  assert.deepEqual(
    run.engine,
    profile.engine,
    `${sourceLabel}: engine identity does not match the committed profile`,
  );
  assert.deepEqual(
    Object.keys(run.capabilities).sort(),
    [...CAPABILITY_KEYS].sort(),
    `${sourceLabel}: capability keys drifted`,
  );
  assert.deepEqual(
    run.capabilities,
    CAPABILITIES,
    `${sourceLabel}: a required browser capability is missing`,
  );
  assert.deepEqual(
    run.console,
    { errors: 0, warnings: 0 },
    `${sourceLabel}: browser console is not clean`,
  );
  assert.equal(run.scope, 'isolated-gate-0-spike', `${sourceLabel}: scope drifted`);
  assert.deepEqual(
    run.scenarioResults,
    expectedScenarioResults(fixtureSha256),
    `${sourceLabel}: scenario IDs, statuses, or observed values drifted`,
  );
  assert.deepEqual(
    run.summary,
    { failed: 0, passed: 7, total: 7 },
    `${sourceLabel}: summary does not match the exact scenario set`,
  );
}

async function readPngAndDigest(path, sourceLabel) {
  const absolutePath = resolve(path);
  const metadata = await stat(absolutePath);
  assert.ok(metadata.isFile(), `${sourceLabel}: screenshot is not a file`);
  assert.ok(metadata.size > PNG_SIGNATURE.length, `${sourceLabel}: screenshot is empty`);
  const bytes = await readFile(absolutePath);
  assert.ok(
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    `${sourceLabel}: screenshot is not a PNG`,
  );
  return sha256(bytes);
}

const schema = JSON.parse(await readFile(resolve(EVIDENCE_SCHEMA_PATH), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true });
const validateEvidence = ajv.compile(schema);
const validateRunEvidence = ajv.compile({
  $defs: schema.$defs,
  ...schema.$defs.runEvidence,
});
const fixtureBytes = await readFile(resolve(HASH_VECTOR_FIXTURE_PATH));
const fixtureSha256 = sha256(fixtureBytes);

async function checkProfile(profileId, profile) {
  const evidence = JSON.parse(await readFile(resolve(profile.evidencePath), 'utf8'));
  assert.ok(
    validateEvidence(evidence),
    `${profile.evidencePath}: committed evidence does not match ${EVIDENCE_SCHEMA_PATH}: ${formatAjvErrors(
      validateEvidence.errors,
    )}`,
  );
  assert.equal(evidence.evidenceVersion, 2, `${profile.evidencePath}: evidenceVersion drifted`);
  assert.deepEqual(
    evidence.capture,
    {
      browser: profile.browser,
      screenshot: {
        path: profile.screenshotPath,
        sha256: evidence.capture.screenshot.sha256,
      },
      tool: CAPTURE_TOOL,
    },
    `${profile.evidencePath}: capture metadata or keys drifted`,
  );
  assertRunEvidence(evidence.run, profile, fixtureSha256, profile.evidencePath);

  const actualScreenshotSha256 = await readPngAndDigest(
    profile.screenshotPath,
    profile.evidencePath,
  );
  assert.equal(
    evidence.capture.screenshot.sha256,
    actualScreenshotSha256,
    `${profile.evidencePath}: screenshot SHA-256 does not match the committed PNG bytes`,
  );

  return profileId;
}

async function recordProfile(profileId, runEvidencePath) {
  const profile = profiles[profileId];
  assert.ok(
    profile !== undefined,
    `Unknown browser profile ${JSON.stringify(profileId)}; expected chrome or webkit`,
  );
  assert.ok(
    runEvidencePath !== undefined,
    'Recording requires a page evidence JSON path created by playwright-cli eval --filename',
  );

  const run = JSON.parse(await readFile(resolve(runEvidencePath), 'utf8'));
  assert.ok(
    validateRunEvidence(run),
    `${runEvidencePath}: page evidence does not match the committed run schema: ${formatAjvErrors(
      validateRunEvidence.errors,
    )}`,
  );
  assertRunEvidence(run, profile, fixtureSha256, runEvidencePath);

  const screenshotSha256 = await readPngAndDigest(profile.screenshotPath, runEvidencePath);
  const evidence = {
    evidenceVersion: 2,
    capture: {
      browser: profile.browser,
      screenshot: {
        path: profile.screenshotPath,
        sha256: screenshotSha256,
      },
      tool: CAPTURE_TOOL,
    },
    run,
  };
  assert.ok(
    validateEvidence(evidence),
    `${profile.evidencePath}: generated evidence is invalid: ${formatAjvErrors(
      validateEvidence.errors,
    )}`,
  );
  await writeFile(resolve(profile.evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Recorded ${profileId} browser spike evidence in ${profile.evidencePath}.`);
}

const argumentsAfterNode = process.argv.slice(2);
if (argumentsAfterNode[1] === '--') {
  argumentsAfterNode.splice(1, 1);
}
const [command, profileId, runEvidencePath] = argumentsAfterNode;
if (command === '--record') {
  await recordProfile(profileId, runEvidencePath);
} else {
  assert.equal(
    command,
    undefined,
    `Unknown argument ${JSON.stringify(command)}; use --record <chrome|webkit> <run-json>`,
  );

  const checkedProfiles = [];
  for (const [currentProfileId, profile] of Object.entries(profiles)) {
    checkedProfiles.push(await checkProfile(currentProfileId, profile));
  }

  for (const requiredArtifact of [
    'adr/017-typescript-first-browser-runtime.md',
    'docs/browser/browser-runtime-isolation-spike.md',
    EVIDENCE_SCHEMA_PATH,
    'spikes/browser-runtime/index.html',
    'spikes/browser-runtime/spike.js',
  ]) {
    await readFile(resolve(requiredArtifact));
  }

  console.log(`Browser spike evidence is byte-verified across ${checkedProfiles.join(' and ')}.`);
}
