/**
 * NHL game-type taxonomy — the SINGLE source of truth for reading the type out of an
 * NHL game_id.
 *
 * An NHL game id is `SSSSTTNNNN`: 4-digit season start year, a 2-digit TYPE, then a
 * 4-digit number. This module exists because that type was decoded in two places
 * (the games-table chip and the ticket-stub detail cell), each with its own
 * `if` ladder that silently defaulted to "Regular Season" — which is how All-Star
 * games shipped mislabelled (user report, 2026-07-31). Adding a future type must be a
 * ONE-line change here, not a hunt through render code.
 *
 * House rule: never silently default — but never leak the raw code to consumers either.
 * Product decision (2026-08-09): an unrecognised code still FAILS LOUD in the console
 * (once per code), and `code` stays populated for diagnostics/tests — but the
 * consumer-facing strings DECLINE to claim a type ('' chip, '—' label) rather than
 * rendering "Type 00" at a fan. Mapping an unknown code to "Regular Season" remains
 * forbidden: we say nothing rather than say something wrong.
 */

export type NhlGameType = {
  /** Stable key for the type. `unknown` for anything not in the taxonomy. */
  kind: 'preseason' | 'regular' | 'playoff' | 'allstar' | 'tournament' | 'unknown' | 'none';
  /** Long label for prose surfaces (e.g. the ticket stub's "Game Type" cell). */
  label: string;
  /** Short ALL-CAPS chip label; '' means "don't show a chip" (the regular-season case). */
  chip: string;
  /** The raw 2-digit code, for diagnostics. '' when there is no NHL id. */
  code: string;
};

const NONE: NhlGameType = { kind: 'none', label: '—', chip: '', code: '' };

/**
 * Codes we've seen emitted by an unknown-type game, so a table of 100 unknown rows
 * warns ONCE per code rather than once per row per render (this runs inside a cell
 * renderer). Module-scoped: dedup persists for the page session.
 */
const warnedCodes = new Set<string>();

/** Decode the type from an NHL game_id. Manual/absent ids yield `kind: 'none'`. */
export function nhlGameType(gameId: string | null | undefined): NhlGameType {
  // Manual games carry no NHL id — make no type claim at all.
  if (!gameId || gameId.startsWith('manual-')) return NONE;

  const code = gameId.slice(4, 6);
  switch (code) {
    case '01':
      return { kind: 'preseason', label: 'Preseason', chip: 'PRE', code };
    // Regular season is the overwhelming majority — no chip, so the table stays quiet.
    case '02':
      return { kind: 'regular', label: 'Regular Season', chip: '', code };
    case '03':
      return { kind: 'playoff', label: 'Playoffs', chip: 'PLAYOFF', code };
    case '04':
      return { kind: 'allstar', label: 'All-Star', chip: 'ALL-STAR', code };
    // Best-on-best / international tournaments run under NHL game ids. Confirmed by
    // production data: 2024190002 = "4 Nations Face-Off" at Centre Bell (2025-02-13).
    // Labelled generically — one observed tournament isn't enough to claim code 19
    // ALWAYS means 4 Nations, and the event's real name is carried by special_event.
    case '19':
      return { kind: 'tournament', label: 'Tournament', chip: 'TOURNAMENT', code };
    default:
      // FAIL LOUD, ONCE per code — to the DEVELOPER, in the console. Consumers get
      // nothing: no chip and a neutral em-dash label, same as the no-id case. Bad
      // data must never be presented as confident truth ("Regular Season"), and a
      // raw code ("TYPE 00") is developer noise leaking into a fan-facing surface.
      // `code` is still returned so diagnostics and tests can see what was rejected.
      if (!warnedCodes.has(code)) {
        warnedCodes.add(code);
        console.warn(
          `[PuckPassport] unrecognised NHL game type "${code}" (e.g. game_id ${gameId}) — ` +
            `suppressed in the UI. Add it to nhl-game-type.ts.`,
        );
      }
      return { kind: 'unknown', label: '—', chip: '', code };
  }
}
