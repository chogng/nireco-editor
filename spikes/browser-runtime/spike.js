const editor = document.querySelector('#editor');
const modelState = document.querySelector('#model-state');
const transactionState = document.querySelector('#transaction-state');
const resultsList = document.querySelector('#results');
const runButton = document.querySelector('#run-all');
const runStatus = document.querySelector('#run-status');

if (
  !(editor instanceof HTMLElement) ||
  !(modelState instanceof HTMLElement) ||
  !(transactionState instanceof HTMLElement) ||
  !(resultsList instanceof HTMLOListElement) ||
  !(runButton instanceof HTMLButtonElement) ||
  !(runStatus instanceof HTMLElement)
) {
  throw new Error('Browser spike markup is incomplete.');
}

const MIME_FRAGMENT = 'application/x-nireco-fragment+json';
const FORBIDDEN_HTML = 'script,style,iframe,object,embed,link,meta,base';
const HASH_VECTOR_FIXTURE_PATH = 'contracts/comet-integration/fixtures/hash-preimages.json';
const PHASE = Object.freeze({
  applyingTransaction: 'ApplyingTransaction',
  composing: 'Composing',
  handlingNativeFallback: 'HandlingNativeFallback',
  idle: 'Idle',
  patchingDom: 'PatchingDOM',
  recoveringDivergence: 'RecoveringDivergence',
  restoringSelection: 'RestoringSelection',
});

const consoleObservations = {
  errors: 0,
  warnings: 0,
};
const nativeConsoleError = window.console.error.bind(window.console);
const nativeConsoleWarn = window.console.warn.bind(window.console);
window.console.error = (...values) => {
  consoleObservations.errors += 1;
  nativeConsoleError(...values);
};
window.console.warn = (...values) => {
  consoleObservations.warnings += 1;
  nativeConsoleWarn(...values);
};
window.addEventListener('error', () => {
  consoleObservations.errors += 1;
});
window.addEventListener('unhandledrejection', () => {
  consoleObservations.errors += 1;
});

class SpikeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SpikeError';
    this.code = code;
  }
}

const runtime = {
  composition: null,
  diagnostics: [],
  divergenceCount: 0,
  eventLog: [],
  model: {
    nodeId: 'text-node-1',
    revision: 1,
    text: 'Nireco model projection',
  },
  phase: PHASE.idle,
  projectionPending: false,
  readOnly: false,
  results: [],
  transactionSequence: 0,
  transactions: [],
  undoSequence: 0,
};

function assert(condition, message) {
  if (!condition) {
    throw new SpikeError('ASSERTION_FAILED', message);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function domText() {
  return editor.textContent ?? '';
}

function logEvent(type, detail = {}) {
  runtime.eventLog.push({
    detail,
    phase: runtime.phase,
    type,
  });
}

function ensureTextNode() {
  if (editor.childNodes.length !== 1 || editor.firstChild?.nodeType !== Node.TEXT_NODE) {
    editor.replaceChildren(document.createTextNode(domText()));
  }

  return editor.firstChild;
}

function isUtf16Boundary(text, offset) {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
    return false;
  }

  if (offset === 0 || offset === text.length) {
    return true;
  }

  const previous = text.charCodeAt(offset - 1);
  const next = text.charCodeAt(offset);
  const previousIsHighSurrogate = previous >= 0xd800 && previous <= 0xdbff;
  const nextIsLowSurrogate = next >= 0xdc00 && next <= 0xdfff;
  return !(previousIsHighSurrogate && nextIsLowSurrogate);
}

function requireUtf16Boundary(text, offset) {
  if (!isUtf16Boundary(text, offset)) {
    throw new SpikeError(
      'INVALID_UTF16_BOUNDARY',
      `Offset ${offset} is not a valid UTF-16 boundary for ${JSON.stringify(text)}.`,
    );
  }
}

function renderPanels() {
  modelState.textContent = JSON.stringify(
    {
      phase: runtime.phase,
      readOnly: runtime.readOnly,
      ...runtime.model,
    },
    null,
    2,
  );
  transactionState.textContent = JSON.stringify(runtime.transactions.slice(-3), null, 2);
}

function projectModel() {
  runtime.phase = PHASE.patchingDom;
  runtime.projectionPending = true;
  editor.replaceChildren(document.createTextNode(runtime.model.text));
  queueMicrotask(() => {
    runtime.projectionPending = false;
  });
  renderPanels();
}

function setDomSelection(start, end = start) {
  requireUtf16Boundary(runtime.model.text, start);
  requireUtf16Boundary(runtime.model.text, end);

  const textNode = ensureTextNode();
  const selection = window.getSelection();
  if (selection === null) {
    throw new SpikeError('SELECTION_UNAVAILABLE', 'window.getSelection() returned null.');
  }

  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  selection.removeAllRanges();
  selection.addRange(range);
}

function captureSelection() {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount !== 1) {
    throw new SpikeError('SELECTION_UNAVAILABLE', 'Exactly one DOM Range is required.');
  }

  const textNode = ensureTextNode();
  const range = selection.getRangeAt(0);
  if (range.startContainer !== textNode || range.endContainer !== textNode) {
    throw new SpikeError(
      'SELECTION_OUTSIDE_TEXT_NODE',
      'Selection must target the projected text.',
    );
  }

  requireUtf16Boundary(runtime.model.text, range.startOffset);
  requireUtf16Boundary(runtime.model.text, range.endOffset);
  return {
    end: {
      affinity: 'forward',
      nodeId: runtime.model.nodeId,
      revision: runtime.model.revision,
      utf16Offset: range.endOffset,
    },
    start: {
      affinity: 'forward',
      nodeId: runtime.model.nodeId,
      revision: runtime.model.revision,
      utf16Offset: range.startOffset,
    },
  };
}

function nextUndoGroup(prefix) {
  runtime.undoSequence += 1;
  return `${prefix}-${runtime.undoSequence}`;
}

function applyReplacement({ end, kind, replacement, start, undoGroupId }) {
  if (runtime.readOnly) {
    throw new SpikeError('READ_ONLY_PROTECTION', 'The browser runtime is in read-only mode.');
  }

  requireUtf16Boundary(runtime.model.text, start);
  requireUtf16Boundary(runtime.model.text, end);
  assert(start <= end, 'Replacement start must not be after its end.');

  const baseRevision = runtime.model.revision;
  const before = runtime.model.text;
  runtime.phase = PHASE.applyingTransaction;
  runtime.model.text = `${before.slice(0, start)}${replacement}${before.slice(end)}`;
  runtime.model.revision += 1;
  runtime.transactionSequence += 1;

  const transaction = {
    baseRevision,
    id: `transaction-${runtime.transactionSequence}`,
    kind,
    operation: {
      endUtf16: end,
      replacement,
      startUtf16: start,
    },
    resultRevision: runtime.model.revision,
    undoGroupId,
  };
  runtime.transactions.push(transaction);
  logEvent('model.didCommitRevision', {
    resultRevision: transaction.resultRevision,
    transactionId: transaction.id,
  });

  projectModel();
  runtime.phase = PHASE.restoringSelection;
  setDomSelection(start + replacement.length);
  runtime.phase = PHASE.idle;
  renderPanels();
  return transaction;
}

function resetRuntime(text) {
  runtime.composition = null;
  runtime.diagnostics = [];
  runtime.divergenceCount = 0;
  runtime.eventLog = [];
  runtime.model = {
    nodeId: 'text-node-1',
    revision: 1,
    text,
  };
  runtime.phase = PHASE.idle;
  runtime.readOnly = false;
  runtime.transactionSequence = 0;
  runtime.transactions = [];
  runtime.undoSequence = 0;
  projectModel();
  runtime.phase = PHASE.restoringSelection;
  setDomSelection(text.length);
  runtime.phase = PHASE.idle;
  renderPanels();
}

function readClipboardPayload(clipboardData) {
  if (clipboardData === null) {
    throw new SpikeError('CLIPBOARD_UNAVAILABLE', 'Paste did not expose clipboardData.');
  }

  const types = Array.from(clipboardData.types);
  if (types.includes(MIME_FRAGMENT)) {
    const parsed = JSON.parse(clipboardData.getData(MIME_FRAGMENT));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('text' in parsed) ||
      typeof parsed.text !== 'string'
    ) {
      throw new SpikeError('INVALID_NIRECO_FRAGMENT', 'Structured clipboard fragment is invalid.');
    }
    return { classification: MIME_FRAGMENT, text: parsed.text };
  }

  if (types.includes('text/html')) {
    const parsed = new DOMParser().parseFromString(clipboardData.getData('text/html'), 'text/html');
    for (const forbidden of parsed.querySelectorAll(FORBIDDEN_HTML)) {
      forbidden.remove();
    }
    return {
      classification: 'text/html',
      text: parsed.body.textContent ?? '',
    };
  }

  if (types.includes('text/plain')) {
    return {
      classification: 'text/plain',
      text: clipboardData.getData('text/plain'),
    };
  }

  throw new SpikeError('UNSUPPORTED_CLIPBOARD_MIME', 'Clipboard has no supported MIME payload.');
}

function minimalReplacement(before, after) {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }
  while (prefix > 0 && (!isUtf16Boundary(before, prefix) || !isUtf16Boundary(after, prefix))) {
    prefix -= 1;
  }

  let beforeSuffix = before.length;
  let afterSuffix = after.length;
  while (
    beforeSuffix > prefix &&
    afterSuffix > prefix &&
    before[beforeSuffix - 1] === after[afterSuffix - 1]
  ) {
    beforeSuffix -= 1;
    afterSuffix -= 1;
  }
  while (
    beforeSuffix < before.length &&
    (!isUtf16Boundary(before, beforeSuffix) || !isUtf16Boundary(after, afterSuffix))
  ) {
    beforeSuffix += 1;
    afterSuffix += 1;
  }

  return {
    end: beforeSuffix,
    replacement: after.slice(prefix, afterSuffix),
    start: prefix,
  };
}

editor.addEventListener('beforeinput', (event) => {
  logEvent('beforeinput', {
    data: event.data,
    inputType: event.inputType,
    isComposing: event.isComposing,
  });

  if (runtime.readOnly) {
    event.preventDefault();
    return;
  }

  if (runtime.phase === PHASE.composing && event.inputType === 'insertCompositionText') {
    if (runtime.composition !== null) {
      runtime.composition.buffer = event.data ?? '';
    }
    return;
  }

  if (event.inputType === 'insertText') {
    event.preventDefault();
    const selection = captureSelection();
    applyReplacement({
      end: selection.end.utf16Offset,
      kind: 'insertText',
      replacement: event.data ?? '',
      start: selection.start.utf16Offset,
      undoGroupId: nextUndoGroup('typing'),
    });
    return;
  }

  if (event.inputType === 'insertFromPaste') {
    event.preventDefault();
  }
});

editor.addEventListener('compositionstart', (event) => {
  if (runtime.readOnly) {
    return;
  }

  const selection = captureSelection();
  runtime.composition = {
    baseRevision: runtime.model.revision,
    baseText: runtime.model.text,
    buffer: event.data,
    end: selection.end.utf16Offset,
    nodeId: runtime.model.nodeId,
    start: selection.start.utf16Offset,
    undoGroupId: nextUndoGroup('composition'),
  };
  runtime.phase = PHASE.composing;
  logEvent('compositionstart', clone(runtime.composition));
  renderPanels();
});

editor.addEventListener('compositionupdate', (event) => {
  if (runtime.composition !== null) {
    runtime.composition.buffer = event.data;
  }
  logEvent('compositionupdate', { data: event.data });
});

editor.addEventListener('compositionend', (event) => {
  const composition = runtime.composition;
  logEvent('compositionend', { data: event.data });
  if (composition === null) {
    return;
  }

  runtime.composition = null;
  if (
    runtime.model.revision !== composition.baseRevision ||
    runtime.model.nodeId !== composition.nodeId
  ) {
    runtime.phase = PHASE.handlingNativeFallback;
    runtime.diagnostics.push({
      code: 'COMPOSITION_TARGET_STALE',
      message: 'Composition was cancelled because its revision-bound target became stale.',
    });
    projectModel();
    runtime.phase = PHASE.idle;
    renderPanels();
    return;
  }

  const replacement = minimalReplacement(composition.baseText, domText());
  applyReplacement({
    ...replacement,
    kind: 'composition',
    undoGroupId: composition.undoGroupId,
  });
});

editor.addEventListener('paste', (event) => {
  event.preventDefault();
  const payload = readClipboardPayload(event.clipboardData);
  const selection = captureSelection();
  applyReplacement({
    end: selection.end.utf16Offset,
    kind: 'paste',
    replacement: payload.text,
    start: selection.start.utf16Offset,
    undoGroupId: nextUndoGroup('paste'),
  });
  logEvent('clipboard.classified', { mime: payload.classification });
});

const mutationObserver = new MutationObserver(() => {
  if (
    runtime.projectionPending ||
    runtime.phase === PHASE.composing ||
    domText() === runtime.model.text
  ) {
    return;
  }

  runtime.phase = PHASE.recoveringDivergence;
  runtime.divergenceCount += 1;
  runtime.diagnostics.push({
    code: 'DOM_DIVERGENCE',
    observedText: domText(),
    recovery: 'rerender-model-projection',
  });
  if (runtime.divergenceCount >= 3) {
    runtime.readOnly = true;
    runtime.diagnostics.push({
      code: 'REPEATED_DOM_DIVERGENCE',
      recovery: 'read-only-protection',
    });
  }
  projectModel();
  runtime.phase = PHASE.idle;
  renderPanels();
});
mutationObserver.observe(editor, {
  characterData: true,
  childList: true,
  subtree: true,
});

function dispatchComposition(type, data) {
  return editor.dispatchEvent(
    new CompositionEvent(type, {
      bubbles: true,
      cancelable: true,
      data,
    }),
  );
}

function dispatchCompositionBeforeInput(data) {
  return editor.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data,
      inputType: 'insertCompositionText',
      isComposing: true,
    }),
  );
}

function settle() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function scenarioBrowserHashVectors() {
  const [preimageModule, shaModule, response] = await Promise.all([
    import('../../dist/base/hashing/hash-preimage.js'),
    import('../../dist/base/hashing/portable-sha-256.js'),
    fetch(`../../${HASH_VECTOR_FIXTURE_PATH}`, {
      cache: 'no-store',
    }),
  ]);
  assert(response.ok, `Hash vector request failed with HTTP ${response.status}.`);
  const vectorText = await response.text();
  const vectorSet = JSON.parse(vectorText);
  assert(
    vectorSet.profile === preimageModule.HASH_PREIMAGE_PROFILE,
    'Browser hash profile must match the compiled Core profile.',
  );
  assert(Array.isArray(vectorSet.vectors), 'Browser hash vectors must be an array.');

  const hasher = new shaModule.PortableSha256ContentHasher();
  for (const vector of vectorSet.vectors) {
    const created = preimageModule.createCanonicalHashPreimage(vector.domain, vector.payload);
    assert(created.type === 'ok', `${vector.name}: canonical preimage must be valid.`);
    assert(
      created.canonicalJson === vector.canonicalJson,
      `${vector.name}: canonical JSON drifted in the browser.`,
    );
    assert(
      bytesToHex(shaModule.encodeUtf8(created.preimage)) === vector.preimageUtf8Hex,
      `${vector.name}: UTF-8 preimage bytes drifted in the browser.`,
    );
    assert(
      (await hasher.hashUtf8(created.preimage)) === vector.expectedHash,
      `${vector.name}: SHA-256 output drifted in the browser.`,
    );
  }

  return {
    fixture: {
      path: HASH_VECTOR_FIXTURE_PATH,
      sha256: await hasher.hashUtf8(vectorText),
    },
    profile: vectorSet.profile,
    vectorsMatched: vectorSet.vectors.length,
  };
}

async function scenarioBeforeInput() {
  resetRuntime('hello');
  const acceptedByBrowser = editor.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: '!',
      inputType: 'insertText',
    }),
  );
  await settle();

  assert(!acceptedByBrowser, 'insertText beforeinput must be prevented.');
  assert(runtime.model.text === 'hello!', 'insertText must update the authoritative model.');
  assert(domText() === runtime.model.text, 'DOM projection must follow the committed model.');
  assert(runtime.transactions.length === 1, 'insertText must produce one transaction.');
  return {
    defaultPrevented: !acceptedByBrowser,
    modelText: runtime.model.text,
    transactionCount: runtime.transactions.length,
  };
}

async function scenarioComposition() {
  resetRuntime('论文');
  dispatchComposition('compositionstart', '');
  dispatchCompositionBeforeInput('方法');
  dispatchComposition('compositionupdate', '方法');

  editor.replaceChildren(document.createTextNode('论文方法'));
  const nativeText = ensureTextNode();
  const nativeSelection = document.createRange();
  nativeSelection.setStart(nativeText, nativeText.length);
  nativeSelection.collapse(true);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(nativeSelection);
  dispatchComposition('compositionend', '方法');
  await settle();

  assert(runtime.model.text === '论文方法', 'Composition text must commit to the model.');
  assert(runtime.transactions.length === 1, 'One composition must produce one transaction.');
  assert(
    runtime.transactions[0].undoGroupId.startsWith('composition-'),
    'Composition transaction must own one composition undo group.',
  );
  return {
    modelText: runtime.model.text,
    transactionCount: runtime.transactions.length,
    undoGroupId: runtime.transactions[0].undoGroupId,
  };
}

async function scenarioStaleCompositionFallback() {
  resetRuntime('主分支');
  dispatchComposition('compositionstart', '');
  dispatchCompositionBeforeInput('候选');
  editor.replaceChildren(document.createTextNode('主分支候选'));

  runtime.model.text = '外部提交';
  runtime.model.revision += 1;
  dispatchComposition('compositionend', '候选');
  await settle();

  assert(runtime.transactions.length === 0, 'Stale composition must not create a transaction.');
  assert(domText() === '外部提交', 'Stale composition DOM must be restored from the model.');
  assert(
    runtime.diagnostics.some((item) => item.code === 'COMPOSITION_TARGET_STALE'),
    'Stale composition must emit a diagnostic.',
  );
  return {
    diagnostic: 'COMPOSITION_TARGET_STALE',
    modelText: runtime.model.text,
    transactionCount: runtime.transactions.length,
  };
}

async function scenarioSelectionBridge() {
  resetRuntime('A🌍B');
  setDomSelection(3);
  const valid = captureSelection();
  assert(valid.start.utf16Offset === 3, 'Selection after emoji must map to UTF-16 offset 3.');

  const textNode = ensureTextNode();
  const invalidRange = document.createRange();
  invalidRange.setStart(textNode, 2);
  invalidRange.collapse(true);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(invalidRange);

  let invalidCode = null;
  try {
    captureSelection();
  } catch (error) {
    if (error instanceof SpikeError) {
      invalidCode = error.code;
    } else {
      throw error;
    }
  }
  assert(
    invalidCode === 'INVALID_UTF16_BOUNDARY',
    'Selection inside a surrogate pair must fail closed.',
  );
  return {
    invalidBoundaryCode: invalidCode,
    validUtf16Offset: valid.start.utf16Offset,
  };
}

async function scenarioClipboard() {
  resetRuntime('引用：');
  window.__nirecoInjected = false;

  const clipboard = new DataTransfer();
  clipboard.setData(
    'text/html',
    '<b>安全内容</b><img src="x" onerror="window.__nirecoInjected=true"><script>window.__nirecoInjected=true</script>',
  );
  clipboard.setData('text/plain', 'plain fallback');
  const pasteEvent = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: clipboard,
  });
  editor.dispatchEvent(pasteEvent);
  await settle();

  assert(pasteEvent.defaultPrevented, 'Paste must prevent native direct DOM insertion.');
  assert(runtime.model.text === '引用：安全内容', 'Sanitized HTML text must commit to the model.');
  assert(window.__nirecoInjected === false, 'Clipboard scripts and handlers must not execute.');
  assert(runtime.transactions.length === 1, 'Paste must produce one atomic transaction.');
  assert(
    runtime.eventLog.some(
      (entry) => entry.type === 'clipboard.classified' && entry.detail.mime === 'text/html',
    ),
    'Clipboard MIME classification must be observable.',
  );
  return {
    modelText: runtime.model.text,
    scriptExecuted: window.__nirecoInjected,
    transactionCount: runtime.transactions.length,
  };
}

async function scenarioDivergenceRecovery() {
  resetRuntime('权威模型');
  await settle();

  for (let index = 1; index <= 3; index += 1) {
    editor.replaceChildren(document.createTextNode(`扩展污染-${index}`));
    await settle();
    assert(domText() === runtime.model.text, 'Divergent DOM must be restored from the model.');
  }

  assert(runtime.transactions.length === 0, 'DOM recovery must not fabricate transactions.');
  assert(runtime.divergenceCount === 3, 'Each independent divergence must be diagnosed.');
  assert(runtime.readOnly, 'Repeated divergence must enter read-only protection.');
  return {
    divergenceCount: runtime.divergenceCount,
    readOnly: runtime.readOnly,
    transactionCount: runtime.transactions.length,
  };
}

const scenarios = [
  ['browser-hash-byte-vectors', scenarioBrowserHashVectors],
  ['beforeinput-to-transaction', scenarioBeforeInput],
  ['composition-single-transaction', scenarioComposition],
  ['stale-composition-controlled-fallback', scenarioStaleCompositionFallback],
  ['selection-utf16-boundary', scenarioSelectionBridge],
  ['clipboard-sanitize-atomic-paste', scenarioClipboard],
  ['dom-divergence-recovery', scenarioDivergenceRecovery],
];

function renderResults() {
  resultsList.replaceChildren(
    ...runtime.results.map((result) => {
      const item = document.createElement('li');
      item.dataset.status = result.status;
      item.textContent =
        result.status === 'pass'
          ? `${result.id}: pass`
          : `${result.id}: fail — ${result.error.message}`;
      return item;
    }),
  );

  const failures = runtime.results.filter((result) => result.status === 'fail').length;
  runStatus.dataset.status = failures === 0 ? 'pass' : 'fail';
  runStatus.textContent =
    failures === 0
      ? `${runtime.results.length}/${runtime.results.length} passed`
      : `${failures}/${runtime.results.length} failed`;
}

function detectEngine() {
  const userAgent = navigator.userAgent;
  const chromiumVersion = userAgent.match(/(?:HeadlessChrome|Chrome)\/([0-9.]+)/u)?.[1];
  if (chromiumVersion !== undefined) {
    return {
      family: 'Chromium',
      platform: navigator.platform,
      userAgent,
      version: chromiumVersion,
    };
  }

  const webkitVersion = userAgent.match(/Version\/([0-9.]+)/u)?.[1];
  if (
    webkitVersion !== undefined &&
    userAgent.includes('AppleWebKit/') &&
    userAgent.includes('Safari/')
  ) {
    return {
      family: 'WebKit',
      platform: navigator.platform,
      userAgent,
      version: webkitVersion,
    };
  }

  return {
    family: 'Unknown',
    platform: navigator.platform,
    userAgent,
    version: 'unknown',
  };
}

function evidence() {
  const passed = runtime.results.filter((result) => result.status === 'pass').length;
  return {
    capabilities: {
      beforeInputEvent: typeof InputEvent === 'function',
      clipboardEvent: typeof ClipboardEvent === 'function',
      compositionEvent: typeof CompositionEvent === 'function',
      dataTransfer: typeof DataTransfer === 'function',
      mutationObserver: typeof MutationObserver === 'function',
      selection: typeof window.getSelection === 'function',
    },
    console: clone(consoleObservations),
    engine: detectEngine(),
    scenarioResults: clone(runtime.results),
    scope: 'isolated-gate-0-spike',
    summary: {
      failed: runtime.results.length - passed,
      passed,
      total: runtime.results.length,
    },
  };
}

async function runAll() {
  runButton.disabled = true;
  runStatus.dataset.status = 'idle';
  runStatus.textContent = 'Running';
  runtime.results = [];
  renderResults();

  for (const [name, scenario] of scenarios) {
    try {
      const observed = await scenario();
      runtime.results.push({
        id: name,
        observed,
        status: 'pass',
      });
    } catch (error) {
      runtime.results.push({
        error: {
          code: error instanceof SpikeError ? error.code : 'UNEXPECTED_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
        id: name,
        status: 'fail',
      });
    }
    renderResults();
  }

  runButton.disabled = false;
  const collectedEvidence = evidence();
  window.__nirecoSpikeEvidence = collectedEvidence;
  return collectedEvidence;
}

runButton.addEventListener('click', () => {
  void runAll();
});

window.__nirecoSpike = Object.freeze({
  evidence,
  runAll,
});

resetRuntime(runtime.model.text);
