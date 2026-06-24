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
      placeholder="Search players & goalies — McDavid, Shesterkin, Hughes…"
      navigateTo={false}
      maxResults={8}
      onSelect={p => {
        const path = p.type === 'goalie' ? `/stats/goalies/${p.slug}` : `/stats/player/${p.slug}`;
        window.location.href = path;
      }}
    />
  );
}
