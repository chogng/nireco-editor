export {
  canonicalizeResourceUri,
  isDocumentUri,
  isCanonicalResourceUri,
} from '../base/uri/resource-uri.js';
export { InMemoryModelRegistry } from '../workspace/in-memory-model-registry.js';

export type { NirecoError, Result } from '../base/errors/nireco-error.js';
export type { DocumentUri, ResourceUri } from '../base/uri/resource-uri.js';
export type { DocumentRef, SemanticTargetRef } from '../model/resource-ref.js';
export type { DocumentSnapshot } from '../model/snapshot.js';
export type { INirecoModel } from '../workspace/model.js';
export type { IModelRegistry } from '../workspace/model-registry.js';
