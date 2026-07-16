import type { NirecoError, Result } from '../base/errors/nireco-error.js';
import type { ResourceUri } from '../base/uri/resource-uri.js';
import type { CreateModelOptions, INirecoModel } from './model.js';

export type CreateModelResult = Result<INirecoModel>;
export type ResolveModelResult = Result<INirecoModel>;

export interface IModelRegistry {
  create(options: CreateModelOptions): Promise<CreateModelResult>;
  resolve(uri: ResourceUri): Promise<ResolveModelResult>;
  get(uri: ResourceUri): INirecoModel | undefined;
  getAll(): readonly INirecoModel[];
  unload(uri: ResourceUri): Promise<Result<void>>;
}

export interface IModelSnapshotLoader {
  load(uri: ResourceUri): Promise<
    | {
        readonly type: 'loaded';
        readonly options: CreateModelOptions;
      }
    | {
        readonly type: 'error';
        readonly error: NirecoError;
      }
  >;
}
