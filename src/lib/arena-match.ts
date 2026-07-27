// Match a photo's GPS coordinate to the nearest NHL arena.
import { NHL_ARENAS, type NhlArena } from './nhl-arenas';

/** Great-circle distance in kilometres between two lat/lon points (haversine). */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export type ArenaMatch = { arena: NhlArena; km: number };

// 5km window: tolerant of parking-lot / tailgate photos and small DB coord error,
// but tight enough that adjacent-metro arenas (MSG / Prudential / UBS are 12–30km
// apart) never cross-match. Relocated venues share an abbrev, so whichever era's
// building the photo is near still resolves to the right team.
export const ARENA_MATCH_MAX_KM = 5;

/** Nearest NHL arena within ARENA_MATCH_MAX_KM, or null if the coordinate isn't
 *  near any arena (a photo taken at home — correctly no match) OR is near-equidistant
 *  from two arenas (ambiguous — don't guess). Real NHL buildings are >10km apart, so
 *  the tie case is defensive, but a wrong pin is worse than no pin. */
export function nearestArena(lat: number, lon: number, maxKm = ARENA_MATCH_MAX_KM): ArenaMatch | null {
  const within: ArenaMatch[] = [];
  for (const a of NHL_ARENAS) {
    const km = haversineKm(lat, lon, a.lat, a.lon);
    if (km <= maxKm) within.push({ arena: a, km });
  }
  if (within.length === 0) return null;
  within.sort((x, y) => x.km - y.km);
  if (within.length > 1 && within[1].km - within[0].km < 0.5) return null; // ambiguous
  return within[0];
}
