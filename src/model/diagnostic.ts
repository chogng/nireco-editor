import type { RevisionId } from '../base/ids/identifiers.js';
import type { SemanticTargetRef } from './resource-ref.js';

export interface DiagnosticRelatedInformation {
  readonly message: string;
  readonly target?: SemanticTargetRef;
}

export interface ProposedFix {
  readonly kind: 'transaction-draft' | 'proposal-draft';
  readonly description: string;
}

export interface Diagnostic {
  readonly id: string;
  readonly source: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly target?: SemanticTargetRef;
  readonly basedOnRevisionId: RevisionId;
  readonly stale: boolean;
  readonly related?: readonly DiagnosticRelatedInformation[];
  readonly suggestedFix?: ProposedFix;
}
