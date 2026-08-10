/**
 * PassportPlayers — the full players-seen island for /puck-passport/players.
 *
 * This is a thin wrapper, not a reimplementation: it mounts AttendedTracker in
 * its "players-only" render variant, so the ranked list is the EXACT SAME code
 * path the /puck-passport dashboard's Players Seen preview uses (same
 * `viewSeenPlayers`, `sortedSeenPlayers`, `seenCols`, `renderPlayersSection`).
 * See PassportGames.tsx / PassportArenas.tsx for the identical pattern this
 * mirrors (Blocks 2A and 2B).
 */
import AttendedTracker from './AttendedTracker';

export default function PassportPlayers() {
  return <AttendedTracker variant="players-only" />;
}
