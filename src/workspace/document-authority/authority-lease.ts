import type { ResourceUri } from '../../base/uri/resource-uri.js';
import type { AuthorityFence } from './durability-ports.js';

export interface AuthorityLease {
  readonly fence: AuthorityFence;
  isCurrent(): boolean;
  release(): void;
}

export type AuthorityLeaseResult =
  | {
      readonly type: 'acquired';
      readonly lease: AuthorityLease;
    }
  | {
      readonly type: 'unavailable';
      readonly currentOwnerId: string;
    };

export interface IAuthorityLeaseCoordinator {
  acquire(uri: ResourceUri, ownerId: string): AuthorityLeaseResult;
  isFenceCurrent(fence: AuthorityFence): boolean;
}

interface LeaseState {
  epoch: number;
  ownerId?: string;
}

export class InMemoryAuthorityLeaseCoordinator implements IAuthorityLeaseCoordinator {
  readonly #states = new Map<ResourceUri, LeaseState>();

  acquire(uri: ResourceUri, ownerId: string): AuthorityLeaseResult {
    const current = this.#states.get(uri);
    if (current?.ownerId !== undefined) {
      return {
        type: 'unavailable',
        currentOwnerId: current.ownerId,
      };
    }

    const nextEpoch = (current?.epoch ?? 0) + 1;
    const state: LeaseState = {
      epoch: nextEpoch,
      ownerId,
    };
    this.#states.set(uri, state);
    const fence: AuthorityFence = {
      uri,
      ownerId,
      epoch: nextEpoch,
    };
    let released = false;

    return {
      type: 'acquired',
      lease: {
        fence,
        isCurrent: () => !released && this.isFenceCurrent(fence),
        release: () => {
          if (released) {
            return;
          }
          released = true;
          const latest = this.#states.get(uri);
          if (latest?.ownerId === ownerId && latest.epoch === nextEpoch) {
            this.#states.set(uri, {
              epoch: nextEpoch,
            });
          }
        },
      },
    };
  }

  isFenceCurrent(fence: AuthorityFence): boolean {
    const current = this.#states.get(fence.uri);
    return current?.ownerId === fence.ownerId && current.epoch === fence.epoch;
  }
}
