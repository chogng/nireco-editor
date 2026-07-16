# ADR-011: Canonical JSON and SHA-256 Hashing

- Status: Accepted
- Decision date: 2026-07-16
- Owners: Nireco Core
- Gate: Gate 0
- Related specifications: Development Spec §§11, 29
- Supersedes: None
- Superseded by: None

## Context

此前 Contract 只冻结了 canonical JSON 方向和
`sha256:<lowercase-hex>` 输出外形，没有冻结 domain tag、UTF-8 byte
preimage、各类 hash 的字段边界以及跨 Browser/Node 的 byte-level vectors。
相同 JSON 若被当作 Document、Node 或 Transaction 使用，不能产生可互换的
hash；否则 precondition、replay、WAL、fixture 与治理 checksum 会发生类型混淆。

## Decision

采用 `nireco-hash-preimage-1`。所有协议 hash MUST 对下列 exact byte
sequence 计算 SHA-256：

```text
UTF8("NIRECO\0HASH\0V1\0" + domain + "\0" + canonicalJson(payload))
```

其中：

- `NIRECO`、`HASH`、`V1`、domain 与分隔符均为所示 ASCII octets；
- `\0` 是单个 `00` octet，不是两个字符 `\` 与 `0`；
- UTF-8 不带 BOM，不附加换行；
- canonical JSON 使用 `nireco-canonical-json-0.1`；
- object key 按 Unicode code point 排序，array 保持协议顺序；
- 不执行 Unicode normalization；
- 只接受 finite JSON numbers、dense arrays 与 plain/null-prototype objects；
- 协议对象在进入 encoder 前必须完成 schema validation，`undefined` 不得进入
  hash boundary；
- 输出固定为 `sha256:` 加 64 位 lowercase hexadecimal。

Domain 是 hash 类型的一部分。V1 的 payload envelope 与 domain 同时冻结：

| 用途                           | Domain                            | Exact payload envelope                                                                    |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------- |
| Document content/precondition  | `nireco.document-content.v1`      | `{schemaId,schemaVersion,metadata,root,academicGraph,settings}`                           |
| Transaction audit/replay       | `nireco.transaction.v1`           | 完整 schema-valid Transaction；不存在的 optional field 不编码                             |
| Node/precondition              | `nireco.node.v1`                  | 完整 schema-valid canonical Node                                                          |
| Academic entity/precondition   | `nireco.academic-entity.v1`       | 完整 schema-valid ReferenceSnapshot/EvidenceLink/ClaimEntity                              |
| Proposal Change Group identity | `nireco.proposal-change-group.v1` | ADR-012 exact eight-field identity object                                                 |
| Semantic Diff                  | `nireco.semantic-diff.v1`         | 完整 schema-valid Semantic Diff，排除未来可能加入的自指 hash 字段                         |
| Governance manifest            | `nireco.governance-manifest.v1`   | `{engineeringStandardVersion,files:[{path,rawSha256}]}`；`files` 先按 canonical path 排序 |

同一 canonical payload 在不同 domain 中 MUST 产生不同 hash。任何字段边界或
语义变化必须引入新 domain version；实现不得静默改变 `.v1`。

## Exact payload boundaries

### Document content

Document payload MUST 且只能包含：

```text
schemaId
schemaVersion
metadata
root
academicGraph
settings
```

它 MUST 排除 `format`、`formatVersion`、`revisionId`、`documentHash`、durability、
storage location、selection、view state、diagnostics 与其他 volatile metadata。
`document-hash` Transaction precondition 使用此 domain 和 payload。

### Transaction

Transaction payload 是 schema-valid Transaction 的完整 object，包括：

```text
id
target
actor
intent (when present)
operations (preserved order)
preconditions (preserved order)
metadata
createdAt
```

不得额外包裹 runtime state；若未来加入 `transactionHash` 字段，该字段本身必须
排除并由新协议版本明确说明。Operation order 是 apply 语义，MUST NOT 为 hash
重新排序。

### Node and academic entity

Node payload 是完整 schema-valid canonical node，包括可信 ID、type、attrs 以及
适用的 children/value/marks。`node-hash` precondition 使用该 domain。

Academic entity payload 是完整 schema-valid `ReferenceSnapshot`、`EvidenceLink` 或
`ClaimEntity`，并包括可信 Entity ID。`DeleteAcademicEntityOperation.expectedEntityHash`
使用该 domain。`ClaimEvidenceRelation` 没有独立 Entity ID，不属于此 domain；
link/unlink identity 由其 endpoint Entity IDs 与 relation kind 表达。当前
`UpdateAcademicEntityOperation` 没有 entity-hash precondition；未来增加时必须使用
完整更新前 entity payload，并同步 Contract 与 vectors。

### Proposal Change Group and Semantic Diff

Change Group UUIDv8 的 exact identity payload 由 ADR-012 冻结，并使用
`nireco.proposal-change-group.v1`。Semantic Diff hash（需要时）覆盖完整
schema-valid Diff object，排除尚未存在的自指 hash 字段。

### Governance manifest

治理 payload MUST 包含工程规范版本以及按 path Unicode code point order 排序的
文件清单。每一项包含：

```text
path
rawSha256
```

`rawSha256` 是对原始文件 bytes 的 lowercase SHA-256，用作叶节点 checksum；
整个 manifest object 再使用 `nireco.governance-manifest.v1` domain 计算协议
hash。文件路径使用 repository-relative `/` separators。

Golden fixture envelope 的 `expectedCanonicalSha256` 是 payload drift checksum，
不是协议内容 hash；它不得代替上述 domain-separated hash。

## Runtime implementation

Core 提供不依赖 Node、DOM、Web Crypto、clock 或 random 的 portable SHA-256 与
UTF-8 encoder。Node adapter 可使用 `node:crypto`，Browser 可使用 portable
实现或经同一 vectors 验证的 Web Crypto adapter。所有 adapter MUST 通过
byte-level vectors：

- canonical JSON string；
- complete preimage UTF-8 hex；
- expected `sha256:` output；
- non-ASCII UTF-8 case；
- same payload/different domain separation。

## Verification

- `fixtures/hash-preimages.json` 固定七个 V1 domain vectors；每条 vector 绑定
  具体 payload Schema ID，并在 hash 前通过 strict Schema validation。
- conformance test 同时运行 portable implementation 与 Node crypto。
- unit test 覆盖标准 SHA-256 `abc` vector、emoji UTF-8、canonical key order 与
  domain separation。
- manuscript fixture 的 `documentHash` 及 Transaction/Proposal document-hash
  precondition 使用 Document domain。
- generated contract types 和 fixture drift 继续由 Gate 0 checks 验证。

## Consequences

### Positive

- Browser、Node 与未来 Rust 可对 exact bytes 达成一致。
- Document、Node、Transaction 与治理 checksum 不会发生跨类型复用。
- precondition、replay 与审计不再依赖对象构造顺序。

### Costs and constraints

- domain 或字段边界变化是协议变化，必须新增版本和 fixtures。
- 普通 `JSON.stringify()` 或 raw file hash 不能冒充协议 hash。

## Alternatives considered

- **只 hash canonical JSON，不加 domain**：拒绝，因为存在跨类型重放和误比较。
- **用 JSON envelope 表达 domain**：拒绝，因为 envelope 字段自身仍需冻结，
  且容易被普通业务 payload 混淆。
- **Browser 与 Node 各自实现但无 byte vectors**：拒绝，因为无法证明 UTF-8 与
  preimage 一致。

## Deferred decisions and blockers

None for G0-B001. 新 hash 用途必须选择现有 domain 或通过 ADR 引入新版本，
不得复用含义不相符的 domain。
