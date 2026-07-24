import { b as escape_html, i as head, n as derived, r as ensure_array_like, t as attr_class, y as attr } from "../../chunks/server.js";
//#region src/routes/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { data } = $$props;
		const games = derived(() => data.games ?? []);
		const statsDate = derived(() => data.meta?.generated_at ? new Date(data.meta.generated_at).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric"
		}) : null);
		const EXPLORE = [
			{
				href: "/stats/skaters",
				label: "Skater Ratings",
				hed: "Every skater, ranked.",
				sub: "HGB Rating, WAR, and impact score for all NHL forwards and defensemen. Sortable, filterable, exportable.",
				cta: "Browse Skaters"
			},
			{
				href: "/stats/goalies",
				label: "Goalie Stats",
				hed: "Between the pipes.",
				sub: "GSAx, save percentage, and HGB WAR for every goalie with 500+ minutes. Career trends included.",
				cta: "Browse Goalies"
			},
			{
				href: "/stats/teams",
				label: "Team Stats",
				hed: "32 teams, one table.",
				sub: "xGF%, HDCF%, shot share, and expected goals for every team at 5v5. Regular season and playoffs.",
				cta: "Browse Teams"
			},
			{
				href: "/stats/impact",
				label: "HGB Impact",
				hed: "Who showed up tonight.",
				sub: "Per-game impact scores updated nightly. See who's running hot and who's dragging their line.",
				cta: "View Impact"
			}
		];
		function gameHref(g) {
			return g?.game_id ? `/games/${g.game_id}` : "/results";
		}
		head("1uha8ag", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>HockeyGameBot — NHL Stats, Ratings &amp; Win Probability</title>`);
			});
			$$renderer.push(`<meta name="description" content="Advanced NHL stats, player ratings, and live win probability. HGB Rating, WAR, expected goals, and more — updated daily."/>`);
		});
		$$renderer.push(`<section class="mast svelte-1uha8ag"><div class="mast-ghost svelte-1uha8ag">HGB</div> <div class="mast-corners svelte-1uha8ag"><div class="corner tl svelte-1uha8ag"></div> <div class="corner tr svelte-1uha8ag"></div> <div class="corner bl svelte-1uha8ag"></div> <div class="corner br svelte-1uha8ag"></div></div> <div class="wrap mast-inner svelte-1uha8ag"><p class="eyebrow svelte-1uha8ag"><span class="pip svelte-1uha8ag"></span>2025–26 NHL Season</p> <div class="mast-card svelte-1uha8ag"><h1 class="svelte-1uha8ag">Advanced NHL <em class="svelte-1uha8ag">stats</em>,<br/>measured.</h1> <p class="dek svelte-1uha8ag">HGB Rating · WAR · Win Probability · Expected Goals `);
		if (statsDate()) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<span class="dek-date svelte-1uha8ag">· Data as of ${escape_html(statsDate())}</span>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></p></div></div></section> `);
		if (games().length > 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<section class="results-section svelte-1uha8ag"><div class="wrap"><div class="section-head svelte-1uha8ag"><h2 class="section-title svelte-1uha8ag">Yesterday's <em class="svelte-1uha8ag">results</em></h2> <a class="more-link svelte-1uha8ag" href="/results">All results →</a></div> <div class="results-grid svelte-1uha8ag"><!--[-->`);
			const each_array = ensure_array_like(games());
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let g = each_array[$$index];
				$$renderer.push(`<a class="result-card svelte-1uha8ag"${attr("href", gameHref(g))}><div class="result-teams svelte-1uha8ag"><div class="result-team svelte-1uha8ag"><span class="team-abbr svelte-1uha8ag">${escape_html(g.away_team)}</span> <span${attr_class("team-score svelte-1uha8ag", void 0, { "winner": g.away_score > g.home_score })}>${escape_html(g.away_score ?? "—")}</span></div> <div class="result-team svelte-1uha8ag"><span class="team-abbr svelte-1uha8ag">${escape_html(g.home_team)}</span> <span${attr_class("team-score svelte-1uha8ag", void 0, { "winner": g.home_score > g.away_score })}>${escape_html(g.home_score ?? "—")}</span></div></div> <div class="result-meta svelte-1uha8ag">${escape_html(g.game_state === "FINAL" ? "Final" : g.game_state ?? "")}
              ${escape_html(g.period > 3 && g.period_type === "OT" ? " · OT" : "")}
              ${escape_html(g.period > 3 && g.period_type === "SO" ? " · SO" : "")}</div></a>`);
			}
			$$renderer.push(`<!--]--></div></div></section>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <section class="explore-section svelte-1uha8ag"><div class="wrap"><div class="section-head svelte-1uha8ag"><h2 class="section-title svelte-1uha8ag">Explore the <em class="svelte-1uha8ag">numbers</em></h2> <span class="mono-label">Advanced stats · Every team · Every player</span></div> <div class="explore-grid svelte-1uha8ag"><!--[-->`);
		const each_array_1 = ensure_array_like(EXPLORE);
		for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
			let tile = each_array_1[$$index_1];
			$$renderer.push(`<a class="tile svelte-1uha8ag"${attr("href", tile.href)}><span class="tile-label svelte-1uha8ag">${escape_html(tile.label)}</span> <span class="tile-hed svelte-1uha8ag">${escape_html(tile.hed)}</span> <p class="tile-sub svelte-1uha8ag">${escape_html(tile.sub)}</p> <span class="tile-cta svelte-1uha8ag">${escape_html(tile.cta)} →</span></a>`);
		}
		$$renderer.push(`<!--]--></div></div></section>`);
	});
}
//#endregion
export { _page as default };
