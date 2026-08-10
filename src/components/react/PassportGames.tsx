/**
 * PassportGames — the full-history island for /puck-passport/games.
 *
 * This is a thin wrapper, not a reimplementation: it mounts AttendedTracker in
 * its "games-only" render variant, so the full history table + the destructive
 * remove/stub actions are the EXACT SAME code path the /puck-passport dashboard
 * uses (same `games` source, same `removeGame`, same `handleStub`/`gameCols`).
 * A prop-gated render branch — not a copy-pasted or hand-extracted duplicate —
 * is the safest way to share this logic given how entangled removeGame/handleStub
 * are with the rest of AttendedTracker's state (summary, badges, catalog); see
 * the Block 2A report for why a standalone data hook was not attempted.
 */
import AttendedTracker from './AttendedTracker';

export default function PassportGames() {
  return <AttendedTracker variant="games-only" />;
}
