/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: contracts/comet-integration/schemas/manuscript.schema.json
 * Generator: json-schema-to-typescript
 * Generator version: 15.0.4
 * Source SHA-256: 2b308ceae17b92cb81b9e8f78dfc12ba6bfc1024f488a49eea3942ea4c764fea
 */

/**
 * Opaque identity. The preview contract intentionally does not freeze a UUID representation.
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "OpaqueId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "WorkspaceId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "RevisionId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TransactionId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ProposalChangeGroupId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "SessionId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "DebugId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "RequestId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TraceId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TaskId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ToolInvocationId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "CapabilityGrantId".
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "PolicySnapshotId".
 */
export type OpaqueId = string;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ContentHash".
 */
export type ContentHash = string;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "BlockNode".
 */
export type BlockNode =
  | SectionNode
  | ParagraphNode
  | HeadingNode
  | FigureNode
  | TableNode
  | DisplayEquationNode
  | BlockQuoteNode
  | CodeBlockNode
  | ListNode
  | HorizontalRuleNode
  | FootnoteNode;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "InlineNode".
 */
export type InlineNode =
  | TextNode
  | CitationNode
  | CrossReferenceNode
  | InlineEquationNode
  | FootnoteReferenceNode
  | HardBreakNode;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "Mark".
 */
export type Mark = SimpleMark | LinkMark;
/**
 * ASCII-visible canonical wire URI. Raw Unicode is forbidden and must be UTF-8 percent-encoded; percent escapes use uppercase hexadecimal. Nireco and Comet logical URIs are further constrained by LogicalResourceUri.
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceUri".
 */
export type ResourceUri = string;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "LimitedCellBlockNode".
 */
export type LimitedCellBlockNode = ParagraphNode | BlockQuoteNode | CodeBlockNode | ListNode;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "FootnoteBlockNode".
 */
export type FootnoteBlockNode = ParagraphNode | BlockQuoteNode | CodeBlockNode | ListNode;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "Rfc3339Timestamp".
 */
export type Rfc3339Timestamp = string;
/**
 * Canonical Comet-owned logical resource URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "CometResourceUri".
 */
export type CometResourceUri = string;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "EvidenceLocator".
 */
export type EvidenceLocator =
  | PageEvidenceLocator
  | SectionEvidenceLocator
  | TextQuoteEvidenceLocator
  | TimeEvidenceLocator
  | RecordEvidenceLocator;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ActorRef".
 */
export type ActorRef =
  HumanActorRef | CometAgentActorRef | ProductControllerActorRef | SystemActorRef;
/**
 * Canonical Nireco document URI under the Gate 0 logical URI profile.
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentUri".
 */
export type DocumentUri = string;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticPosition".
 */
export type SemanticPosition = TextPosition | NodeBoundaryPosition;
/**
 * Offset measured in UTF-16 code units. A service must additionally reject a value inside a surrogate pair.
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "Utf16Offset".
 */
export type Utf16Offset = number;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "Affinity".
 */
export type Affinity = 'before' | 'after';
/**
 * Untrusted, request-local correlation key. It is never a trusted Nireco identity.
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ClientRef".
 */
export type ClientRef = string;
/**
 * A JSON value used only at explicitly declared extension or patch boundaries.
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonArray".
 */
export type JsonArray = JsonValue[];
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentNode".
 */
export type DocumentNode =
  | ManuscriptNode
  | FrontMatterNode
  | BodyNode
  | BlockNode
  | InlineNode
  | FigureAssetNode
  | FigureCaptionNode
  | TableCaptionNode
  | TableRowNode
  | TableCellNode
  | ListItemNode
  | BibliographyPlaceholderNode;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "InsertableNode".
 */
export type InsertableNode =
  | FrontMatterNode
  | BodyNode
  | BlockNode
  | InlineNode
  | FigureAssetNode
  | FigureCaptionNode
  | TableCaptionNode
  | TableRowNode
  | TableCellNode
  | ListItemNode
  | BibliographyPlaceholderNode;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticTargetRef".
 */
export type SemanticTargetRef =
  NodeTargetRef | EntityTargetRef | RangeTargetRef | MetadataTargetRef;
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "CanonicalSegment".
 */
export type CanonicalSegment = string;
/**
 * Canonical logical URI: lowercase scheme and host; no userinfo, query, fragment, or port; at least two non-empty path segments; no trailing slash. Path case is preserved.
 *
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "LogicalResourceUri".
 */
export type LogicalResourceUri = string;

/**
 * Synthetic code-generation root. Runtime validation uses the normative Draft 2020-12 schema.
 */
export interface ManuscriptSchemaTypes {
  contractValue?: DocumentSnapshot;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentSnapshot".
 */
export interface DocumentSnapshot {
  format: 'nireco-document';
  formatVersion: '1.0.0-preview.1';
  schemaId: 'nireco.manuscript';
  schemaVersion: '1.0.0-preview.1';
  revisionId: OpaqueId;
  documentHash: ContentHash;
  metadata: ManuscriptMetadata;
  root: ManuscriptNode;
  academicGraph: AcademicGraphSnapshot;
  settings: DocumentSemanticSettings;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ManuscriptMetadata".
 */
export interface ManuscriptMetadata {
  title: string;
  /**
   * @maxItems 1024
   */
  authors: ManuscriptAuthor[];
  abstract: string;
  /**
   * @maxItems 1024
   */
  keywords: string[];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ManuscriptAuthor".
 */
export interface ManuscriptAuthor {
  id?: OpaqueId;
  name: string;
  given?: string;
  family?: string;
  orcid?: string;
  affiliations?: string[];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ManuscriptNode".
 */
export interface ManuscriptNode {
  id: OpaqueId;
  type: 'manuscript';
  attrs: EmptyAttributes;
  children:
    | [BodyNode]
    | [FrontMatterNode, BodyNode]
    | [BodyNode, BibliographyPlaceholderNode]
    | [FrontMatterNode, BodyNode, BibliographyPlaceholderNode];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "EmptyAttributes".
 */
export interface EmptyAttributes {}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "BodyNode".
 */
export interface BodyNode {
  id: OpaqueId;
  type: 'body';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [BlockNode, ...BlockNode[]];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "SectionNode".
 */
export interface SectionNode {
  id: OpaqueId;
  type: 'section';
  attrs: {
    level: number;
  };
  /**
   * A section starts with exactly one direct heading.
   *
   * @minItems 1
   */
  children: [HeadingNode, ...BlockNode[]];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "HeadingNode".
 */
export interface HeadingNode {
  id: OpaqueId;
  type: 'heading';
  attrs: {
    level: number;
  };
  children: InlineNode[];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TextNode".
 */
export interface TextNode {
  id: OpaqueId;
  type: 'text';
  value: string;
  marks: Mark[];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "SimpleMark".
 */
export interface SimpleMark {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'subscript' | 'superscript';
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "LinkMark".
 */
export interface LinkMark {
  type: 'link';
  href: ResourceUri;
  title?: string;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "CitationNode".
 */
export interface CitationNode {
  id: OpaqueId;
  type: 'citation';
  attrs: {
    citationId: OpaqueId;
    referenceId: OpaqueId;
    locator?: CitationLocator;
    prefix?: string;
    suffix?: string;
  };
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "CitationLocator".
 */
export interface CitationLocator {
  label: 'page' | 'chapter' | 'section' | 'paragraph' | 'figure' | 'table' | 'timestamp' | 'record';
  value: string;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "CrossReferenceNode".
 */
export interface CrossReferenceNode {
  id: OpaqueId;
  type: 'crossReference';
  attrs: {
    targetEntityId: OpaqueId;
    label?: string;
  };
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "InlineEquationNode".
 */
export interface InlineEquationNode {
  id: OpaqueId;
  type: 'inlineEquation';
  attrs: {
    source: string;
  };
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "FootnoteReferenceNode".
 */
export interface FootnoteReferenceNode {
  id: OpaqueId;
  type: 'footnoteReference';
  attrs: {
    footnoteNodeId: OpaqueId;
  };
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "HardBreakNode".
 */
export interface HardBreakNode {
  id: OpaqueId;
  type: 'hardBreak';
  attrs: EmptyAttributes;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ParagraphNode".
 */
export interface ParagraphNode {
  id: OpaqueId;
  type: 'paragraph';
  attrs: {
    alignment: 'start' | 'center' | 'end' | 'justify';
  };
  children: InlineNode[];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "FigureNode".
 */
export interface FigureNode {
  id: OpaqueId;
  type: 'figure';
  attrs: {
    entityId?: OpaqueId;
    label?: string;
  };
  children: [FigureAssetNode] | [FigureAssetNode, FigureCaptionNode];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "FigureAssetNode".
 */
export interface FigureAssetNode {
  id: OpaqueId;
  type: 'figureAsset';
  attrs: {
    uri: ResourceUri;
    contentHash: ContentHash;
    altText: string;
  };
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "FigureCaptionNode".
 */
export interface FigureCaptionNode {
  id: OpaqueId;
  type: 'figureCaption';
  attrs: EmptyAttributes;
  children: InlineNode[];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TableNode".
 */
export interface TableNode {
  id: OpaqueId;
  type: 'table';
  attrs: {
    entityId?: OpaqueId;
    label?: string;
  };
  /**
   * A table has one or more rows and at most one caption. Conformance additionally enforces that a caption, when present, is the first child.
   *
   * @minItems 1
   */
  children: {
    [k: string]: unknown | undefined;
  } & [TableCaptionNode | TableRowNode, ...(TableCaptionNode | TableRowNode)[]];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TableCaptionNode".
 */
export interface TableCaptionNode {
  id: OpaqueId;
  type: 'tableCaption';
  attrs: EmptyAttributes;
  children: InlineNode[];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TableRowNode".
 */
export interface TableRowNode {
  id: OpaqueId;
  type: 'tableRow';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [TableCellNode, ...TableCellNode[]];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TableCellNode".
 */
export interface TableCellNode {
  id: OpaqueId;
  type: 'tableCell';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [ParagraphNode, ...LimitedCellBlockNode[]];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "BlockQuoteNode".
 */
export interface BlockQuoteNode {
  id: OpaqueId;
  type: 'blockQuote';
  attrs: EmptyAttributes;
  /**
   * @minItems 1
   */
  children: [BlockNode, ...BlockNode[]];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "CodeBlockNode".
 */
export interface CodeBlockNode {
  id: OpaqueId;
  type: 'codeBlock';
  attrs: {
    language?: string;
  };
  /**
   * @maxItems 1
   */
  children: [] | [TextNode];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ListNode".
 */
export interface ListNode {
  id: OpaqueId;
  type: 'list';
  attrs: {
    [k: string]: unknown | undefined;
  };
  /**
   * @minItems 1
   */
  children: [ListItemNode, ...ListItemNode[]];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ListItemNode".
 */
export interface ListItemNode {
  id: OpaqueId;
  type: 'listItem';
  attrs: EmptyAttributes;
  /**
   * A list item starts with a paragraph.
   *
   * @minItems 1
   */
  children: [ParagraphNode, ...BlockNode[]];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "DisplayEquationNode".
 */
export interface DisplayEquationNode {
  id: OpaqueId;
  type: 'displayEquation';
  attrs: {
    source: string;
    label?: string;
    entityId?: OpaqueId;
  };
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "HorizontalRuleNode".
 */
export interface HorizontalRuleNode {
  id: OpaqueId;
  type: 'horizontalRule';
  attrs: EmptyAttributes;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "FootnoteNode".
 */
export interface FootnoteNode {
  id: OpaqueId;
  type: 'footnote';
  attrs: {
    label?: string;
  };
  /**
   * @minItems 1
   */
  children: [FootnoteBlockNode, ...FootnoteBlockNode[]];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "FrontMatterNode".
 */
export interface FrontMatterNode {
  id: OpaqueId;
  type: 'frontMatter';
  attrs: EmptyAttributes;
  /**
   * The preview reserves the structural front-matter node, while title/authors/abstract/keywords live in DocumentSnapshot.metadata.
   *
   * @maxItems 0
   */
  children: [];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "BibliographyPlaceholderNode".
 */
export interface BibliographyPlaceholderNode {
  id: OpaqueId;
  type: 'bibliographyPlaceholder';
  attrs: {
    heading: string;
  };
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicGraphSnapshot".
 */
export interface AcademicGraphSnapshot {
  referenceSnapshots: ReferenceSnapshot[];
  evidenceLinks: EvidenceLink[];
  claims: ClaimEntity[];
  claimEvidenceRelations: ClaimEvidenceRelation[];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ReferenceSnapshot".
 */
export interface ReferenceSnapshot {
  id: OpaqueId;
  externalUri?: ResourceUri;
  /**
   * Intentional open exception: CSL-JSON is an externally governed map and is preserved as canonical JSON.
   */
  cslJson: {
    [k: string]: unknown | undefined;
  };
  metadataHash: ContentHash;
  capturedAt: Rfc3339Timestamp;
  sourceProvider?: string;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "EvidenceLink".
 */
export interface EvidenceLink {
  id: OpaqueId;
  uri: CometResourceUri;
  sourceUri: ResourceUri;
  sourceContentHash: ContentHash;
  locator: EvidenceLocator;
  excerpt?: string;
  excerptHash?: ContentHash;
  verificationStatus: 'verified' | 'provisional' | 'metadata-only' | 'stale' | 'rejected';
  verifiedBy?: ActorRef;
  verifiedAt?: Rfc3339Timestamp;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "PageEvidenceLocator".
 */
export interface PageEvidenceLocator {
  kind: 'page';
  page: number;
  pageLabel?: string;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "SectionEvidenceLocator".
 */
export interface SectionEvidenceLocator {
  kind: 'section';
  section: string;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TextQuoteEvidenceLocator".
 */
export interface TextQuoteEvidenceLocator {
  kind: 'text-quote';
  exact: string;
  prefix?: string;
  suffix?: string;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TimeEvidenceLocator".
 */
export interface TimeEvidenceLocator {
  kind: 'time';
  startSeconds: number;
  endSeconds?: number;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "RecordEvidenceLocator".
 */
export interface RecordEvidenceLocator {
  kind: 'record';
  recordKey: string;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "HumanActorRef".
 */
export interface HumanActorRef {
  type: 'human';
  id: OpaqueId;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "CometAgentActorRef".
 */
export interface CometAgentActorRef {
  type: 'comet-agent';
  id: OpaqueId;
  workflowId: string;
  modelRef?: string;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ProductControllerActorRef".
 */
export interface ProductControllerActorRef {
  type: 'product-controller';
  id: OpaqueId;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "SystemActorRef".
 */
export interface SystemActorRef {
  type: 'system';
  id: OpaqueId;
  role: 'importer' | 'migration' | 'validator' | 'recovery';
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ClaimEntity".
 */
export interface ClaimEntity {
  id: OpaqueId;
  anchor: PersistentAnchor;
  textSnapshot: string;
  textHash: ContentHash;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "PersistentAnchor".
 */
export interface PersistentAnchor {
  document: DocumentRef;
  primary: SemanticPosition;
  targetNodeId?: OpaqueId;
  textQuote?: TextQuote;
  pathHint?: OpaqueId[];
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRef".
 */
export interface DocumentRef {
  uri: DocumentUri;
  revisionId: OpaqueId;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TextPosition".
 */
export interface TextPosition {
  kind: 'text';
  textNodeId: OpaqueId;
  utf16Offset: Utf16Offset;
  affinity: Affinity;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeBoundaryPosition".
 */
export interface NodeBoundaryPosition {
  kind: 'node-boundary';
  parentNodeId: OpaqueId;
  childIndex: number;
  affinity: Affinity;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "TextQuote".
 */
export interface TextQuote {
  exact: string;
  prefix?: string;
  suffix?: string;
  normalizedHash?: ContentHash;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ClaimEvidenceRelation".
 */
export interface ClaimEvidenceRelation {
  claimId: OpaqueId;
  evidenceId: OpaqueId;
  relation: 'supports' | 'partially-supports' | 'contradicts' | 'context-only' | 'unclear';
  assessedBy: ActorRef;
  confidence?: number;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentSemanticSettings".
 */
export interface DocumentSemanticSettings {
  language: string;
  citationStyle: string;
  headingNumbering: boolean;
  bibliographyEnabled: boolean;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "JsonObject".
 */
export interface JsonObject {
  [k: string]: JsonValue;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "SemanticRange".
 */
export interface SemanticRange {
  anchor: SemanticPosition;
  focus: SemanticPosition;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeRef".
 */
export interface NodeRef {
  document: DocumentRef;
  nodeId: OpaqueId;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "AcademicEntityRef".
 */
export interface AcademicEntityRef {
  document: DocumentRef;
  entityId: OpaqueId;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "DocumentRangeRef".
 */
export interface DocumentRangeRef {
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "MetadataTargetRef".
 */
export interface MetadataTargetRef {
  kind: 'metadata';
  document: DocumentRef;
  field: 'title' | 'authors' | 'abstract' | 'keywords';
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "NodeTargetRef".
 */
export interface NodeTargetRef {
  kind: 'node';
  document: DocumentRef;
  nodeId: OpaqueId;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "EntityTargetRef".
 */
export interface EntityTargetRef {
  kind: 'academic-entity';
  document: DocumentRef;
  entityId: OpaqueId;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "RangeTargetRef".
 */
export interface RangeTargetRef {
  kind: 'range';
  document: DocumentRef;
  start: SemanticPosition;
  end: SemanticPosition;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "ResourceRef".
 */
export interface ResourceRef {
  uri: ResourceUri;
}
/**
 * This interface was referenced by `ManuscriptSchemaTypes`'s JSON-Schema
 * via the `definition` "MutableDocumentTarget".
 */
export interface MutableDocumentTarget {
  uri: DocumentUri;
  baseRevisionId: OpaqueId;
}
