export interface Disposable {
  dispose(): void;
}

export interface AsyncDisposableResource {
  dispose(): Promise<void>;
}
