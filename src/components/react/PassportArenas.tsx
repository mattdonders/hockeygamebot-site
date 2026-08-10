/**
 * PassportArenas — the full arena-collection island for /puck-passport/arenas.
 *
 * This is a thin wrapper, not a reimplementation: it mounts AttendedTracker in
 * its "arenas-only" render variant, so the Home Arenas meter (counter/pips/rung
 * copy) and the per-venue visit breakdown are the EXACT SAME code path the
 * /puck-passport dashboard's Home Arenas section uses (same `viewArenas`,
 * `pipTeams`, `venueBreakdown`, `renderArenaMeter`). See PassportGames.tsx for
 * the identical pattern this mirrors (Block 2A).
 */
import AttendedTracker from './AttendedTracker';

export default function PassportArenas() {
  return <AttendedTracker variant="arenas-only" />;
}
