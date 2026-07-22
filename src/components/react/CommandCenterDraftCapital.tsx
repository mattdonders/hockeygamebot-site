/**
 * CommandCenterDraftCapital — self-fetching draft-picks stack.
 *
 * Replaces the old /stats page's build-time draft-picks fetch (duplicated
 * client-side too) plus its ~140-line duplicated JSX for the two
 * "draftCapitalFirst" true/false branches. Single component, one client
 * fetch, gated entirely by isDraftCapitalWindowActive() — callers should
 * check the gate before rendering the island at all so it doesn't even
 * hydrate outside the window.
 */

import React, { useState, useEffect } from 'react';
import { fetchPrefs } from './DashboardPersonalized';

const API = 'https://api.hockeygamebot.com';

type DraftPick = {
  overall: number;
  round: number;
  pick_in_round: number;
  team: string;
  team_name: string;
  original_team: string | null;
  original_team_name: string | null;
  is_traded: boolean;
  protected: boolean;
  odds: number | null;
  top1_odds: number | null;
};

async function fetchDraftPicks(teams: string[]): Promise<DraftPick[]> {
  if (!teams.length) return [];
  const r = await fetch(`${API}/v1/stats/draft-picks`);
  if (!r.ok) return [];
  const data = await r.json();
  const picks: DraftPick[] = data.picks ?? [];
  return picks.filter(p => teams.includes(p.team)).sort((a, b) => a.overall - b.overall);
}

export function CommandCenterDraftCapital() {
  const [picks, setPicks] = useState<DraftPick[] | null>(null);

  useEffect(() => {
    fetchPrefs()
      .then(prefs => fetchDraftPicks(prefs.tracked_teams))
      .then(setPicks)
      .catch(() => setPicks([]));
  }, []);

  if (picks === null) return <div className="cc-idle">Loading…</div>;
  if (!picks.length) return <div className="cc-idle">No draft capital tracked for your teams.</div>;

  return (
    <div className="cc-draft-stack">
      {picks.map(p => (
        <div key={p.overall} className="cc-draft-row">
          <span className="cc-draft-overall">#{p.overall}</span>
          <span className="cc-draft-team">{p.team_name}</span>
          <span className="cc-draft-meta">
            Rd {p.round} · Pick {p.pick_in_round}
            {p.is_traded && p.original_team ? ` · via ${p.original_team}` : ''}
            {p.protected ? ' · Protected' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
