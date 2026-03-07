export type GeolocationRequest<T> = () => Promise<T>;

export function createInFlightRequest<T>(request: GeolocationRequest<T>): GeolocationRequest<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) return inFlight;
    inFlight = request().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

export function isFreshPositionTimestamp(timestampMs: number, nowMs: number, maxAgeMs: number): boolean {
  if (!Number.isFinite(timestampMs) || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs)) {
    return false;
  }
  return nowMs - timestampMs <= maxAgeMs;
}
