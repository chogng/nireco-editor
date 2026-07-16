import type { EntityId, NodeId, RevisionId } from '../base/ids/identifiers.js';
import type { DocumentUri, ResourceUri } from '../base/uri/resource-uri.js';
import type { SemanticPosition } from './position/semantic-position.js';

export interface ResourceRef {
  readonly uri: ResourceUri;
}

export interface DocumentRef extends ResourceRef {
  readonly uri: DocumentUri;
  readonly revisionId: RevisionId;
}

export interface MutableDocumentTarget extends ResourceRef {
  readonly uri: DocumentUri;
  readonly baseRevisionId: RevisionId;
}

export interface NodeRef {
  readonly document: DocumentRef;
  readonly nodeId: NodeId;
}

export interface AcademicEntityRef {
  readonly document: DocumentRef;
  readonly entityId: EntityId;
}

export interface DocumentRangeRef {
  readonly document: DocumentRef;
  readonly start: SemanticPosition;
  readonly end: SemanticPosition;
}

export type SemanticTargetRef =
  | {
      readonly kind: 'node';
      readonly document: DocumentRef;
      readonly nodeId: NodeId;
    }
  | {
      readonly kind: 'academic-entity';
      readonly document: DocumentRef;
      readonly entityId: EntityId;
    }
  | {
      readonly kind: 'range';
      readonly document: DocumentRef;
      readonly start: SemanticPosition;
      readonly end: SemanticPosition;
    }
  | {
      readonly kind: 'metadata';
      readonly document: DocumentRef;
      readonly field: 'title' | 'authors' | 'abstract' | 'keywords';
    };
