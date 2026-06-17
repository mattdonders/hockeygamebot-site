import type { PageLoad } from './$types';

const API = 'https://api.hockeygamebot.com';

export const load: PageLoad = async ({ fetch }) => {
  const res = await fetch(`${API}/v1/stats/players`);
  const all: any[] = res.ok ? await res.json() : [];

  const players = all
    .filter((p) => p.pos_group !== 'G' && p.gp >= 20)
    .map((p) => {
      const toi60 = (p.toi_avg_sec * p.gp) / 3600 || 1;
      const points = p.goals + p.assists;
      return {
        player_id: p.player_id as number,
        slug: p.slug as string,
        display_name: p.display_name as string,
        team: p.team_abbrev as string,
        pos: p.pos as string,
        pos_group: p.pos_group as string,
        gp: p.gp as number,
        goals: p.goals as number,
        assists: p.assists as number,
        points,
        toi_pg: +(p.toi_avg_sec / 60).toFixed(1),
        g60: +p.rates_per_60.goals.toFixed(2),
        p60: +(points / toi60).toFixed(2),
        ixg: +(p.rates_per_60.ixg * toi60).toFixed(1),
        war: p.war != null ? +p.war.toFixed(2) : null,
        gs: p.avg_gs_display != null ? +p.avg_gs_display.toFixed(2) : null,
        rapm: p.rapm != null ? +p.rapm.toFixed(3) : null,
        gs_pct: p.gs_pct as number,
      };
    });

  return { players };
};
