export interface RequestLease {
  readonly ownerKey: string;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  finish(): void;
}

export interface LatestRequestGuard {
  begin(ownerKey: string): RequestLease;
  dispose(): void;
}

interface ActiveRequest {
  ownerKey: string;
  controller: AbortController;
  generation: number;
}

export function createLatestRequestGuard(): LatestRequestGuard {
  let activeRequest: ActiveRequest | null = null;
  let generation = 0;

  return {
    begin(ownerKey) {
      activeRequest?.controller.abort();

      const request: ActiveRequest = {
        ownerKey,
        controller: new AbortController(),
        generation: (generation += 1),
      };
      activeRequest = request;

      return {
        ownerKey,
        signal: request.controller.signal,
        isCurrent() {
          return (
            activeRequest?.generation === request.generation &&
            activeRequest.ownerKey === request.ownerKey &&
            !request.controller.signal.aborted
          );
        },
        finish() {
          if (activeRequest?.generation === request.generation) {
            activeRequest = null;
          }
        },
      };
    },
    dispose() {
      activeRequest?.controller.abort();
      activeRequest = null;
    },
  };
}
