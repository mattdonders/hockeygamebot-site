//#region src/routes/stats/skaters/+page.ts
var API = "https://api.hockeygamebot.com";
var load = async ({ fetch }) => {
	const res = await fetch(`${API}/v1/stats/players`);
	return { players: (res.ok ? await res.json() : []).filter((p) => p.pos_group !== "G" && p.gp >= 20).map((p) => {
		const toi60 = p.toi_avg_sec * p.gp / 3600 || 1;
		const points = p.goals + p.assists;
		return {
			player_id: p.player_id,
			slug: p.slug,
			display_name: p.display_name,
			team: p.team_abbrev,
			pos: p.pos,
			pos_group: p.pos_group,
			gp: p.gp,
			goals: p.goals,
			assists: p.assists,
			points,
			toi_pg: +(p.toi_avg_sec / 60).toFixed(1),
			g60: +p.rates_per_60.goals.toFixed(2),
			p60: +(points / toi60).toFixed(2),
			ixg: +(p.rates_per_60.ixg * toi60).toFixed(1),
			war: p.war != null ? +p.war.toFixed(2) : null,
			gs: p.avg_gs_display != null ? +p.avg_gs_display.toFixed(2) : null,
			rapm: p.rapm != null ? +p.rapm.toFixed(3) : null,
			gs_pct: p.gs_pct
		};
	}) };
};
//#endregion
export { load };
