export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  throwIfCancellationRequested(): void;
}

export const nonCancellingToken: CancellationToken = Object.freeze({
  isCancellationRequested: false,
  throwIfCancellationRequested(): void {},
});
