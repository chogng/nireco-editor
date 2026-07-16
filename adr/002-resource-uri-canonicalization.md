# ADR-002: Resource URI Canonicalization

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Core
- Gate: Gate 0
- Related specifications: Development Spec §5
- Supersedes: None
- Superseded by: None

## Context

同一逻辑资源若可用多个字符串表示，Model Registry、Authority、缓存、权限和审计会把它们误认为不同文档。规范化又不能随意改变外部 URI 的路径语义。

## Decision

所有 URI 在进入 Registry、Authority、Contract key、缓存 key 或权限判断前，必须解析并转换为唯一 canonical string。V1 canonicalization 按下列顺序执行：

1. 解析为绝对 URI；V1 wire form 只允许 ASCII，Unicode 必须先按 URI 规则百分号编码；非法 URI、空白/控制字符和非法百分号编码立即拒绝。
2. scheme 转为 ASCII 小写；存在 authority 时仅 host 部分转为小写。
3. 百分号编码中的 ASCII unreserved octet（`ALPHA / DIGIT / "-" / "." / "_" / "~"`）解码；其他百分号编码保留并把十六进制数字转为大写。
4. 对 hierarchical path 解析 dot segments；该步骤在 unreserved 解码之后执行，因此编码的 `.` 也参与解析。
5. `http:80` 和 `https:443` 的默认端口移除；其他 scheme/port 不做该等价假设。
6. 路径段大小写保持，不执行 Unicode normalization。
7. 对 `nireco:` 和 `comet:` 额外应用受控资源规则。

`nireco:` 与 `comet:` URI：

- MUST 包含非空 authority host；
- MUST 包含至少两个非空 path segment；
- MUST NOT 包含 userinfo、query、fragment 或 port；
- 非根 path 的尾斜杠 MUST 移除；
- authority host 大小写不敏感，path segment 大小写敏感。

HTTP(S)、`file:`、`doi:` 和其他外部 URI 不执行尾斜杠折叠；例如 HTTP 的 `/a` 与 `/a/` 保持为不同身份。URI canonicalization 不执行文件系统 realpath、symlink 展开或大小写折叠。

## Normative examples

| Input                                                   | Result                                      |
| ------------------------------------------------------- | ------------------------------------------- |
| `NIRECO://Workspace-01/document/./draft/../Doc-7QH9V8/` | `nireco://workspace-01/document/Doc-7QH9V8` |
| `https://EXAMPLE.com:443/a/%7e/`                        | `https://example.com/a/~/`                  |
| `https://example.com/a/%2fb`                            | `https://example.com/a/%2Fb`                |
| `nireco://workspace-01/document`                        | Reject: fewer than two path segments        |
| `comet://workspace-01/source/source-28?q=x`             | Reject: query forbidden                     |

Canonicalization MUST be idempotent:

```text
canonicalize(canonicalize(input)) = canonicalize(input)
```

比较、散列 key 和 Registry lookup MUST 只使用 canonical output。调用方 MUST NOT 通过字符串拼接构造 `ResourceUri`。

## Contract and implementation impact

Contract decoder 应只产生 branded canonical `ResourceUri`。非 canonical 输入可以在可信边界被规范化，但持久化和输出只能使用 canonical form。错误必须区分 parse failure、unsupported structure 和 scheme-specific constraint violation。

## Verification

- Golden vectors 覆盖 scheme/host case、默认端口、保留/非保留百分号、dot segments、尾斜杠和拒绝案例。
- Property test 验证幂等性及 canonical output 再解析不漂移。
- Registry/Authority test 验证等价输入命中同一 key。
- Browser/Node 和未来 Rust codec 必须使用同一 vectors。

## Consequences

### Positive

- Model、权限和写入 Authority 不会因字符串别名发生分叉。
- 外部 HTTP 资源仍保留服务器定义的路径语义。

### Costs and constraints

- 所有入口都必须经过可信 canonicalizer。
- 新 scheme 若要定义额外等价规则，必须通过 ADR 和 golden vectors。

## Alternatives considered

- **原字符串比较**：拒绝，因为大小写、默认端口和百分号别名会产生重复身份。
- **对所有 URI 去尾斜杠**：拒绝，因为会合并 HTTP(S) 中可能不同的资源。
- **文件系统路径作为文稿身份**：拒绝，因为路径移动、symlink 和平台大小写规则不稳定。

## Deferred decisions and blockers

国际化 host 的允许范围和跨语言 host parser conformance 必须在加入相关 golden vector 前保持受控；不得由各 runtime 自行引入不同的 IDNA 行为。
