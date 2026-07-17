import type { ContentHash, EntityId, NodeId } from '../../base/ids/identifiers.js';
import type { ResourceUri } from '../../base/uri/resource-uri.js';
import type { CitationLocator } from '../academic-graph.js';

export type NodeKind =
  | 'bibliographyPlaceholder'
  | 'blockQuote'
  | 'body'
  | 'citation'
  | 'codeBlock'
  | 'crossReference'
  | 'displayEquation'
  | 'figure'
  | 'figureAsset'
  | 'figureCaption'
  | 'footnote'
  | 'footnoteReference'
  | 'frontMatter'
  | 'hardBreak'
  | 'heading'
  | 'horizontalRule'
  | 'inlineEquation'
  | 'list'
  | 'listItem'
  | 'manuscript'
  | 'paragraph'
  | 'section'
  | 'table'
  | 'tableCaption'
  | 'tableCell'
  | 'tableRow'
  | 'text';

export type EmptyAttributes = Readonly<Record<string, never>>;

export type Mark =
  | {
      readonly type: 'bold';
    }
  | {
      readonly type: 'italic';
    }
  | {
      readonly type: 'underline';
    }
  | {
      readonly type: 'strike';
    }
  | {
      readonly type: 'code';
    }
  | {
      readonly type: 'link';
      readonly href: ResourceUri;
      readonly title?: string;
    }
  | {
      readonly type: 'subscript';
    }
  | {
      readonly type: 'superscript';
    };

export interface ManuscriptNode {
  readonly id: NodeId;
  readonly type: 'manuscript';
  readonly attrs: EmptyAttributes;
  readonly children:
    | readonly [BodyNode]
    | readonly [FrontMatterNode, BodyNode]
    | readonly [BodyNode, BibliographyPlaceholderNode]
    | readonly [FrontMatterNode, BodyNode, BibliographyPlaceholderNode];
}

export interface FrontMatterNode {
  readonly id: NodeId;
  readonly type: 'frontMatter';
  readonly attrs: EmptyAttributes;
  readonly children: readonly [];
}

export interface BodyNode {
  readonly id: NodeId;
  readonly type: 'body';
  readonly attrs: EmptyAttributes;
  readonly children: readonly [BlockNode, ...BlockNode[]];
}

export interface SectionNode {
  readonly id: NodeId;
  readonly type: 'section';
  readonly attrs: {
    readonly level: number;
  };
  readonly children: readonly [HeadingNode, ...SectionBodyNode[]];
}

export interface HeadingNode {
  readonly id: NodeId;
  readonly type: 'heading';
  readonly attrs: {
    readonly level: number;
  };
  readonly children: readonly InlineNode[];
}

export interface ParagraphNode {
  readonly id: NodeId;
  readonly type: 'paragraph';
  readonly attrs: {
    readonly alignment: 'start' | 'center' | 'end' | 'justify';
  };
  readonly children: readonly InlineNode[];
}

export interface FigureNode {
  readonly id: NodeId;
  readonly type: 'figure';
  readonly attrs: {
    readonly entityId?: EntityId;
    readonly label?: string;
  };
  readonly children: readonly [FigureAssetNode] | readonly [FigureAssetNode, FigureCaptionNode];
}

export interface FigureAssetNode {
  readonly id: NodeId;
  readonly type: 'figureAsset';
  readonly attrs: {
    readonly uri: ResourceUri;
    readonly contentHash: ContentHash;
    readonly altText: string;
  };
}

export interface FigureCaptionNode {
  readonly id: NodeId;
  readonly type: 'figureCaption';
  readonly attrs: EmptyAttributes;
  readonly children: readonly InlineNode[];
}

export interface TableNode {
  readonly id: NodeId;
  readonly type: 'table';
  readonly attrs: {
    readonly entityId?: EntityId;
    readonly label?: string;
  };
  readonly children:
    | readonly [TableRowNode, ...TableRowNode[]]
    | readonly [TableCaptionNode, TableRowNode, ...TableRowNode[]];
}

export interface TableCaptionNode {
  readonly id: NodeId;
  readonly type: 'tableCaption';
  readonly attrs: EmptyAttributes;
  readonly children: readonly InlineNode[];
}

export interface TableRowNode {
  readonly id: NodeId;
  readonly type: 'tableRow';
  readonly attrs: EmptyAttributes;
  readonly children: readonly [TableCellNode, ...TableCellNode[]];
}

export interface TableCellNode {
  readonly id: NodeId;
  readonly type: 'tableCell';
  readonly attrs: EmptyAttributes;
  readonly children: readonly [
    ParagraphNode,
    ...(ParagraphNode | BlockQuoteNode | CodeBlockNode | ListNode)[],
  ];
}

export interface DisplayEquationNode {
  readonly id: NodeId;
  readonly type: 'displayEquation';
  readonly attrs: {
    readonly source: string;
    readonly entityId?: EntityId;
    readonly label?: string;
  };
}

export interface BlockQuoteNode {
  readonly id: NodeId;
  readonly type: 'blockQuote';
  readonly attrs: EmptyAttributes;
  readonly children: readonly [BlockNode, ...BlockNode[]];
}

export interface CodeBlockNode {
  readonly id: NodeId;
  readonly type: 'codeBlock';
  readonly attrs: {
    readonly language?: string;
  };
  readonly children: readonly [] | readonly [TextNode];
}

export interface ListNode {
  readonly id: NodeId;
  readonly type: 'list';
  readonly attrs:
    | {
        readonly ordered: true;
        readonly start?: number;
      }
    | {
        readonly ordered: false;
        readonly start?: never;
      };
  readonly children: readonly [ListItemNode, ...ListItemNode[]];
}

export interface ListItemNode {
  readonly id: NodeId;
  readonly type: 'listItem';
  readonly attrs: EmptyAttributes;
  readonly children: readonly [ParagraphNode, ...BlockNode[]];
}

export interface HorizontalRuleNode {
  readonly id: NodeId;
  readonly type: 'horizontalRule';
  readonly attrs: EmptyAttributes;
}

export interface FootnoteNode {
  readonly id: NodeId;
  readonly type: 'footnote';
  readonly attrs: {
    readonly label?: string;
  };
  readonly children: readonly [FootnoteBlockNode, ...FootnoteBlockNode[]];
}

export interface BibliographyPlaceholderNode {
  readonly id: NodeId;
  readonly type: 'bibliographyPlaceholder';
  readonly attrs: {
    readonly heading: string;
  };
}

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

export type SectionBodyNode = Exclude<BlockNode, HeadingNode>;

export type FootnoteBlockNode = ParagraphNode | BlockQuoteNode | CodeBlockNode | ListNode;

export interface TextNode {
  readonly id: NodeId;
  readonly type: 'text';
  readonly value: string;
  readonly marks: readonly Mark[];
}

export interface CitationNode {
  readonly id: NodeId;
  readonly type: 'citation';
  readonly attrs: {
    readonly citationId: EntityId;
    readonly referenceId: EntityId;
    readonly locator?: CitationLocator;
    readonly prefix?: string;
    readonly suffix?: string;
  };
}

export interface CrossReferenceNode {
  readonly id: NodeId;
  readonly type: 'crossReference';
  readonly attrs: {
    readonly targetEntityId: EntityId;
    readonly label?: string;
  };
}

export interface InlineEquationNode {
  readonly id: NodeId;
  readonly type: 'inlineEquation';
  readonly attrs: {
    readonly source: string;
  };
}

export interface FootnoteReferenceNode {
  readonly id: NodeId;
  readonly type: 'footnoteReference';
  readonly attrs: {
    readonly footnoteNodeId: NodeId;
  };
}

export interface HardBreakNode {
  readonly id: NodeId;
  readonly type: 'hardBreak';
  readonly attrs: EmptyAttributes;
}

export type InlineNode =
  | TextNode
  | CitationNode
  | CrossReferenceNode
  | InlineEquationNode
  | FootnoteReferenceNode
  | HardBreakNode;

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

export type DocumentNode =
  | ManuscriptNode
  | FrontMatterNode
  | BodyNode
  | BlockNode
  | BibliographyPlaceholderNode
  | FigureAssetNode
  | FigureCaptionNode
  | TableCaptionNode
  | TableRowNode
  | TableCellNode
  | ListItemNode
  | InlineNode;
