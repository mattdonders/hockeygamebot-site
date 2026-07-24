import { b as escape_html, i as head, n as derived, o as stringify, r as ensure_array_like, t as attr_class, y as attr } from "../../../../chunks/server.js";
//#region src/routes/stats/skaters/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { data } = $$props;
		let sortKey = "war";
		let posFilter = "ALL";
		let query = "";
		const filtered = derived(() => {
			let rows = data.players;
			if (query.trim());
			return rows;
		});
		const sorted = derived(() => [...filtered()].sort((a, b) => {
			const va = a[sortKey] ?? -Infinity;
			return (b[sortKey] ?? -Infinity) - va;
		}));
		const COLS = [
			{
				key: "gp",
				label: "GP",
				title: "Games Played",
				align: "right"
			},
			{
				key: "goals",
				label: "G",
				title: "Goals",
				align: "right"
			},
			{
				key: "assists",
				label: "A",
				title: "Assists",
				align: "right"
			},
			{
				key: "points",
				label: "Pts",
				title: "Points",
				align: "right"
			},
			{
				key: "g60",
				label: "G/60",
				title: "Goals per 60 min",
				align: "right"
			},
			{
				key: "p60",
				label: "P/60",
				title: "Points per 60 min",
				align: "right"
			},
			{
				key: "ixg",
				label: "ixG",
				title: "Individual Expected Goals (cumulative)",
				align: "right"
			},
			{
				key: "war",
				label: "WAR",
				title: "Wins Above Replacement",
				align: "right"
			},
			{
				key: "gs",
				label: "GS",
				title: "Avg Game Score",
				align: "right"
			},
			{
				key: "rapm",
				label: "RAPM",
				title: "Regularized Adjusted Plus-Minus",
				align: "right"
			}
		];
		function fmtVal(p, key) {
			const v = p[key];
			if (v == null) return "—";
			if (key === "rapm") return v > 0 ? `+${v.toFixed(3)}` : v.toFixed(3);
			if (key === "war" || key === "gs") return v.toFixed(2);
			if (key === "p60" || key === "g60") return v.toFixed(2);
			if (key === "ixg") return v.toFixed(1);
			return String(v);
		}
		function isPos(v) {
			return v != null && v > 0;
		}
		function isNeg(v) {
			return v != null && v < 0;
		}
		head("1dtc3mi", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Skater Ratings — HockeyGameBot</title>`);
			});
			$$renderer.push(`<meta name="description" content="NHL skater leaderboard: WAR, Game Score, RAPM, points, and expected goals. Sortable, filterable."/>`);
		});
		$$renderer.push(`<section class="mast svelte-1dtc3mi"><div class="mast-ghost svelte-1dtc3mi">SKATERS</div> <div class="mast-corners svelte-1dtc3mi"><div class="corner tl svelte-1dtc3mi"></div> <div class="corner tr svelte-1dtc3mi"></div> <div class="corner bl svelte-1dtc3mi"></div> <div class="corner br svelte-1dtc3mi"></div></div> <div class="wrap mast-inner svelte-1dtc3mi"><p class="eyebrow svelte-1dtc3mi"><span class="pip svelte-1dtc3mi"></span>2025–26 NHL Season</p> <div class="mast-card svelte-1dtc3mi"><h1 class="svelte-1dtc3mi">Skater <em class="svelte-1dtc3mi">ratings</em></h1> <p class="dek svelte-1dtc3mi">WAR · Game Score · RAPM · Expected Goals · ${escape_html(sorted().length)} skaters</p></div></div></section> <div class="controls-bar svelte-1dtc3mi"><div class="wrap controls-inner svelte-1dtc3mi"><div class="pos-chips svelte-1dtc3mi"><!--[-->`);
		const each_array = ensure_array_like([
			"ALL",
			"F",
			"D"
		]);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let p = each_array[$$index];
			$$renderer.push(`<button${attr_class("chip svelte-1dtc3mi", void 0, { "active": posFilter === p })}>${escape_html(p === "ALL" ? "All Skaters" : p === "F" ? "Forwards" : "Defense")}</button>`);
		}
		$$renderer.push(`<!--]--></div> <div class="search-wrap svelte-1dtc3mi"><input class="search svelte-1dtc3mi" type="search" placeholder="Search player or team…"${attr("value", query)}/></div></div></div> <div class="table-wrap svelte-1dtc3mi"><div class="wrap"><div class="table-scroll svelte-1dtc3mi"><table class="svelte-1dtc3mi"><thead class="svelte-1dtc3mi"><tr class="svelte-1dtc3mi"><th class="col-rank svelte-1dtc3mi" scope="col">#</th><th class="col-player svelte-1dtc3mi" scope="col">Player</th><th class="col-pos svelte-1dtc3mi" scope="col">Pos</th><!--[-->`);
		const each_array_1 = ensure_array_like(COLS);
		for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
			let col = each_array_1[$$index_1];
			$$renderer.push(`<th${attr_class("col-stat svelte-1dtc3mi", void 0, { "active": sortKey === col.key })} scope="col"${attr("title", col.title)}>${escape_html(col.label)} `);
			if (sortKey === col.key) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<span class="sort-arrow svelte-1dtc3mi">${escape_html("↓")}</span>`);
			} else {
				$$renderer.push("<!--[-1-->");
				$$renderer.push(`<span class="sort-arrow muted svelte-1dtc3mi">↕</span>`);
			}
			$$renderer.push(`<!--]--></th>`);
		}
		$$renderer.push(`<!--]--></tr></thead><tbody class="svelte-1dtc3mi"><!--[-->`);
		const each_array_2 = ensure_array_like(sorted());
		for (let i = 0, $$length = each_array_2.length; i < $$length; i++) {
			let p = each_array_2[i];
			$$renderer.push(`<tr class="svelte-1dtc3mi"><td class="col-rank td-rank svelte-1dtc3mi">${escape_html(i + 1)}</td><td class="col-player td-player svelte-1dtc3mi"><a${attr("href", `/stats/player/${stringify(p.slug)}`)} class="svelte-1dtc3mi"><span class="player-name svelte-1dtc3mi">${escape_html(p.display_name)}</span> <span class="player-team svelte-1dtc3mi">${escape_html(p.team)}</span></a></td><td class="col-pos td-pos svelte-1dtc3mi">${escape_html(p.pos)}</td><!--[-->`);
			const each_array_3 = ensure_array_like(COLS);
			for (let $$index_2 = 0, $$length = each_array_3.length; $$index_2 < $$length; $$index_2++) {
				let col = each_array_3[$$index_2];
				$$renderer.push(`<td${attr_class("col-stat td-stat svelte-1dtc3mi", void 0, {
					"active-col": sortKey === col.key,
					"pos-val": col.key === "war" || col.key === "rapm" ? isPos(p[col.key]) : false,
					"neg-val": col.key === "war" || col.key === "rapm" ? isNeg(p[col.key]) : false
				})}>${escape_html(fmtVal(p, col.key))}</td>`);
			}
			$$renderer.push(`<!--]--></tr>`);
		}
		$$renderer.push(`<!--]--></tbody></table> `);
		if (sorted().length === 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="empty-state svelte-1dtc3mi"><span class="empty-icon svelte-1dtc3mi">—</span> <p>No players match your filters.</p></div>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div> <p class="table-footer svelte-1dtc3mi">${escape_html(sorted().length)} of ${escape_html(data.players.length)} skaters · Minimum 20 GP · Click any column header to sort</p></div></div>`);
	});
}
//#endregion
export { _page as default };
