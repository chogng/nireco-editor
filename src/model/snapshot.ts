import type { ContentHash, EntityId, RevisionId } from '../base/ids/identifiers.js';
import type { AcademicGraphSnapshot } from './academic-graph.js';
import type { ManuscriptNode } from './node/manuscript-node.js';

export const DOCUMENT_FORMAT = 'nireco-document';
export const DOCUMENT_FORMAT_VERSION = '1.0.0-preview.1';
export const MANUSCRIPT_SCHEMA_ID = 'nireco.manuscript';
export const MANUSCRIPT_SCHEMA_VERSION = '1.0.0-preview.1';

export interface ManuscriptAuthor {
  readonly id?: EntityId;
  readonly name: string;
  readonly given?: string;
  readonly family?: string;
  readonly orcid?: string;
  readonly affiliations?: readonly string[];
}

export interface ManuscriptMetadata {
  readonly title: string;
  readonly authors: readonly ManuscriptAuthor[];
  readonly abstract: string;
  readonly keywords: readonly string[];
}

export interface DocumentSemanticSettings {
  readonly language: string;
  readonly citationStyle: string;
  readonly headingNumbering: boolean;
  readonly bibliographyEnabled: boolean;
}

export interface DocumentContent {
  readonly format: typeof DOCUMENT_FORMAT;
  readonly formatVersion: typeof DOCUMENT_FORMAT_VERSION;
  readonly schemaId: typeof MANUSCRIPT_SCHEMA_ID;
  readonly schemaVersion: typeof MANUSCRIPT_SCHEMA_VERSION;
  readonly metadata: ManuscriptMetadata;
  readonly root: ManuscriptNode;
  readonly academicGraph: AcademicGraphSnapshot;
  readonly settings: DocumentSemanticSettings;
}

export interface DocumentSnapshot extends DocumentContent {
  readonly revisionId: RevisionId;
  readonly documentHash: ContentHash;
}

export interface DocumentHashPayload {
  readonly schemaId: typeof MANUSCRIPT_SCHEMA_ID;
  readonly schemaVersion: typeof MANUSCRIPT_SCHEMA_VERSION;
  readonly metadata: ManuscriptMetadata;
  readonly root: ManuscriptNode;
  readonly academicGraph: AcademicGraphSnapshot;
  readonly settings: DocumentSemanticSettings;
}

export function createDocumentHashPayload(snapshot: DocumentSnapshot): DocumentHashPayload {
  return {
    schemaId: snapshot.schemaId,
    schemaVersion: snapshot.schemaVersion,
    metadata: snapshot.metadata,
    root: snapshot.root,
    academicGraph: snapshot.academicGraph,
    settings: snapshot.settings,
  };
}
