/**
 * GlobalPlayerSearch — Command-center player finder for /stats hero.
 * Thin wrapper around PlayerSearch that navigates to /players/{slug}.
 * Reuses all search logic, keyboard nav, and HGB styling from PlayerSearch.
 */

import PlayerSearch, { type PlayerSearchItem } from './PlayerSearch';

export type { PlayerSearchItem };

export default function GlobalPlayerSearch({ players }: { players: PlayerSearchItem[] }) {
  return (
    <PlayerSearch
      players={players}
      placeholder="Search players — McDavid, Celebrini, Hughes…"
      navigateTo={false}
      maxResults={8}
      onSelect={p => { window.location.href = `/stats/player/${p.slug}`; }}
    />
  );
}
