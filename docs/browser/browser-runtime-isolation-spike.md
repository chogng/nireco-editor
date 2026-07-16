# Gate 0 Browser Runtime Isolation Spike

- Execution date: 2026-07-16
- Decision: [ADR-017](../../adr/017-typescript-first-browser-runtime.md)
- Spike source: `spikes/browser-runtime/`
- Scope: isolated evidence only; no public Editor API

## Outcome

同一组浏览器场景在真实 headless Chrome 150 与 Playwright WebKit 26.5 中均为 **7/7 pass**，两个浏览器控制台均为 **0 error / 0 warning**。结果同时验证构建后的 portable SHA-256 在浏览器引擎中匹配 7-domain byte vectors，并关闭 Gate 0 对 DOM/IME/Selection/Clipboard 技术可行性与 controlled fallback 的证据缺口；它不替代 N5 的真实 OS 输入法和 Accessibility 浏览器矩阵。

| Scenario                                | Chrome 150 | WebKit 26.5 | Verified invariant                                                          |
| --------------------------------------- | ---------- | ----------- | --------------------------------------------------------------------------- |
| `browser-hash-byte-vectors`             | Pass       | Pass        | 构建后的 portable SHA-256 匹配 canonical JSON、UTF-8 hex 与 7-domain hashes |
| `beforeinput-to-transaction`            | Pass       | Pass        | `insertText` preventDefault；单 Transaction；DOM 仅跟随 Model               |
| `composition-single-transaction`        | Pass       | Pass        | 中文 Composition 结束时单 Transaction、单 Undo Group                        |
| `stale-composition-controlled-fallback` | Pass       | Pass        | Revision-bound target stale 时零 Transaction、Diagnostic、Model 重绘        |
| `selection-utf16-boundary`              | Pass       | Pass        | emoji 后 offset 映射为 UTF-16 `3`；surrogate 中间 offset fail closed        |
| `clipboard-sanitize-atomic-paste`       | Pass       | Pass        | HTML MIME 优先分类；script/handler 不执行；sanitize 后单 Transaction        |
| `dom-divergence-recovery`               | Pass       | Pass        | 未授权 mutation 不产生 Transaction；Model 重绘；连续三次后只读保护          |

Machine-readable results:

- [Chrome evidence](./evidence/chrome-150.json)
- [WebKit evidence](./evidence/webkit-26.5.json)
- [Evidence schema](./evidence/browser-spike-evidence.schema.json)

Committed screenshots produced by the same runs:

- [Chrome screenshot](./evidence/screenshots/chrome-150.png) —
  `sha256:213b239df46e7e803e5fd836fd7282dd2353bf87caac64300ee287be517e16cb`
- [WebKit screenshot](./evidence/screenshots/webkit-26.5.png) —
  `sha256:a2b781f8743e378e3f96621e826df8074f966ab936dc226f2b5e32cd9a4060a9`

The browser hash scenario fetched the non-ASCII fixture as raw UTF-8 bytes and recorded
`sha256:1349ec49c10944b08e6f8ccb87c994d89cb447fce7150964e3ad506c7aff28f1`
for `contracts/comet-integration/fixtures/hash-preimages.json` in both engines.

## Evidence integrity

`window.__nirecoSpikeEvidence` is the exact `run` object committed inside each evidence JSON; the
capture step does not summarize or rename page fields. The recorder validates that object against
`browser-spike-evidence.schema.json#/$defs/runEvidence`, requires the exact engine keys, capability
keys, scenario IDs, statuses, and observed values, then adds only capture metadata and the SHA-256
of the committed PNG.

`pnpm check:browser-spike-evidence` independently:

1. validates both complete JSON files against the committed schema;
2. compares the full engine identity and all six capability keys with the expected browser profile;
3. compares every observed scenario value, including the raw hash-vector fixture digest;
4. rereads both screenshots, verifies their PNG signature, and compares their actual byte hashes.

## Controlled fallback

1. Composition 开始时保存 `baseRevision + nodeId + UTF-16 range`。
2. Composition update 保留为 native buffer，不为同步投影重建 DOM。
3. Composition 结束时若 target 仍有效，把最终差异编译成单 Transaction；若 Revision 或 Node 已改变，取消候选结果、记录 `COMPOSITION_TARGET_STALE` 并从 Model 重绘。
4. MutationObserver 仅检测非投影、非 Composition mutation。未知差异不会被采纳为文档；它被重绘并记录 `DOM_DIVERGENCE`。
5. 连续三次未知 divergence 触发 `REPEATED_DOM_DIVERGENCE` 和只读保护，阻止继续写入。

## Security observation

Paste 场景同时提供恶意 `text/html` 与 plain-text fallback。Runtime 先选择 HTML MIME，在 inert `DOMParser` 文档中移除 `script/style/iframe/object/embed/link/meta/base`，只把解析后的文本编译成 Transaction。`script` 和 `onerror` 均未执行，原 HTML 未进入活动 DOM。

## Reproduction

先构建 Core，再从仓库根目录启动静态页面：

```sh
pnpm build
python3 -m http.server 4173 --bind 127.0.0.1 --directory .
```

使用 Codex Playwright CLI 打开页面。以下命令运行场景、导出页面原始 evidence、捕获可提交截图，并由 recorder 生成完整 evidence envelope：

```sh
export npm_config_cache=/tmp/nireco-playwright-npm-cache
export PLAYWRIGHT_BROWSERS_PATH=/tmp/nireco-playwright-browsers
export PWTEST_DAEMON_SESSION_DIR=/tmp/nireco-playwright-daemon
export PWCLI="${CODEX_HOME:-$HOME/.codex}/skills/playwright/scripts/playwright_cli.sh"

"$PWCLI" install-browser webkit
"$PWCLI" --session nireco-chrome open --browser chrome http://127.0.0.1:4173/spikes/browser-runtime/
"$PWCLI" --session nireco-chrome eval 'async () => window.__nirecoSpike.runAll()'
"$PWCLI" --session nireco-chrome console
"$PWCLI" --session nireco-chrome eval '() => window.__nirecoSpikeEvidence' --filename=/tmp/nireco-browser-spike-chrome.json
"$PWCLI" --session nireco-chrome screenshot --filename=docs/browser/evidence/screenshots/chrome-150.png --full-page
pnpm capture:browser-spike-evidence -- chrome /tmp/nireco-browser-spike-chrome.json

"$PWCLI" --session nireco-webkit open --browser webkit http://127.0.0.1:4173/spikes/browser-runtime/
"$PWCLI" --session nireco-webkit eval 'async () => window.__nirecoSpike.runAll()'
"$PWCLI" --session nireco-webkit console
"$PWCLI" --session nireco-webkit eval '() => window.__nirecoSpikeEvidence' --filename=/tmp/nireco-browser-spike-webkit.json
"$PWCLI" --session nireco-webkit screenshot --filename=docs/browser/evidence/screenshots/webkit-26.5.png --full-page
pnpm capture:browser-spike-evidence -- webkit /tmp/nireco-browser-spike-webkit.json

pnpm check:browser-spike-evidence

"$PWCLI" --session nireco-chrome close
"$PWCLI" --session nireco-webkit close
```

`spike.js` 在页面上暴露 `window.__nirecoSpike.runAll()` 与只读 evidence snapshot，但不进入 package export。
若浏览器版本升级，先更新 checker 中的精确 engine profile 与版本化文件名，再重新捕获；不得把旧 engine
identity 套到新截图上。

## Limits

- Composition 事件在真实浏览器引擎中分派，但未驱动 macOS 原生候选窗口；真实中文、日文、韩文 OS 输入法仍由 N5 浏览器矩阵验证。
- Spike 只投影一个 TextNode，证明 adapter boundary 与 failure semantics，不证明完整 block schema、grapheme deletion、drag/drop 或 Accessibility。
- WebKit 是 Playwright WebKit 引擎证据，不等同于所有已发布 Safari 版本。
