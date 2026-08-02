/** Reuse a warm fix across map tab remounts within a session (20 min). */
export const USER_MAP_CENTER_TTL_MS = 20 * 60 * 1000;

export type UserMapCenter = { lat: number; lng: number };

type CachedUserCenter = UserMapCenter & { at: number };

let cached: CachedUserCenter | null = null;
let inFlight: Promise<UserMapCenter | null> | null = null;

function isFiniteCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

export function getCachedUserMapCenter(
  now: number = Date.now()
): UserMapCenter | null {
  if (!cached) return null;
  if (now - cached.at > USER_MAP_CENTER_TTL_MS) return null;
  return { lat: cached.lat, lng: cached.lng };
}

export function setCachedUserMapCenter(lat: number, lng: number): void {
  if (!isFiniteCoordinate(lat, lng)) return;
  cached = { lat, lng, at: Date.now() };
}

export function clearCachedUserMapCenter(): void {
  cached = null;
  inFlight = null;
}

/**
 * Session warm: one geolocation read (or TTL hit). Silent on deny/timeout.
 * Call on login / session hydrate so the map can open on the user, not Seoul.
 */
export function warmUserMapCenter(): Promise<UserMapCenter | null> {
  const hit = getCachedUserMapCenter();
  if (hit) return Promise.resolve(hit);
  if (inFlight) return inFlight;

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  inFlight = new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const center = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCachedUserMapCenter(center.lat, center.lng);
        inFlight = null;
        resolve(center);
      },
      () => {
        inFlight = null;
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: USER_MAP_CENTER_TTL_MS,
      }
    );
  });

  return inFlight;
}
