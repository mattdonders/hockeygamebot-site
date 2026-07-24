import { b as escape_html, i as head, o as stringify, r as ensure_array_like, t as attr_class, y as attr } from "../../../chunks/server.js";
import "../../../chunks/client.js";
//#region src/routes/games/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { data } = $$props;
		function fmtDisplay(iso) {
			const [y, m, d] = iso.split("-").map(Number);
			return new Date(y, m - 1, d).toLocaleDateString("en-US", {
				weekday: "long",
				month: "long",
				day: "numeric",
				year: "numeric"
			});
		}
		function gameStatus(g) {
			if (!g.game_state) return "";
			const s = String(g.game_state).toUpperCase();
			if (s === "FINAL" || s === "OFF") {
				if (g.period > 3 && g.period_type === "OT") return "Final · OT";
				if (g.period > 3 && g.period_type === "SO") return "Final · SO";
				return "Final";
			}
			if (s === "LIVE" || s === "CRIT") return "Live";
			if (s === "FUT" || s === "PRE") return "Scheduled";
			return g.game_state;
		}
		function isLive(g) {
			const s = String(g.game_state ?? "").toUpperCase();
			return s === "LIVE" || s === "CRIT";
		}
		function isFinal(g) {
			const s = String(g.game_state ?? "").toUpperCase();
			return s === "FINAL" || s === "OFF";
		}
		head("6rw1dw", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Games · ${escape_html(data.date)} — HockeyGameBot</title>`);
			});
			$$renderer.push(`<meta name="description"${attr("content", `NHL game results and scores for ${stringify(data.date)}.`)}/>`);
		});
		$$renderer.push(`<section class="mast svelte-6rw1dw"><div class="mast-ghost svelte-6rw1dw">GAMES</div> <div class="mast-corners svelte-6rw1dw"><div class="corner tl svelte-6rw1dw"></div> <div class="corner tr svelte-6rw1dw"></div> <div class="corner bl svelte-6rw1dw"></div> <div class="corner br svelte-6rw1dw"></div></div> <div class="wrap mast-inner svelte-6rw1dw"><p class="eyebrow svelte-6rw1dw"><span class="pip svelte-6rw1dw"></span>NHL Schedule</p> <div class="mast-card svelte-6rw1dw"><h1 class="svelte-6rw1dw">Game <em class="svelte-6rw1dw">browser</em></h1> <p class="dek svelte-6rw1dw">Results, scores, and game data by date</p></div></div></section> <div class="date-bar svelte-6rw1dw"><div class="wrap date-inner svelte-6rw1dw"><button class="nav-btn svelte-6rw1dw" aria-label="Previous day">← Prev</button> <div class="date-center svelte-6rw1dw"><span class="date-label svelte-6rw1dw">${escape_html(fmtDisplay(data.date))}</span> <input class="date-input svelte-6rw1dw" type="date"${attr("value", data.date)}${attr("max", (/* @__PURE__ */ new Date()).toISOString().slice(0, 10))}/></div> <button class="nav-btn svelte-6rw1dw" aria-label="Next day">Next →</button></div></div> <div class="games-section svelte-6rw1dw"><div class="wrap">`);
		if (data.error) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="empty-state svelte-6rw1dw"><p class="empty-title svelte-6rw1dw">Error loading games</p> <p class="empty-sub svelte-6rw1dw">${escape_html(data.error)}</p></div>`);
		} else if (data.games.length === 0) {
			$$renderer.push("<!--[1-->");
			$$renderer.push(`<div class="empty-state svelte-6rw1dw"><div class="empty-icon svelte-6rw1dw"><svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"></circle><path d="M14 20h12M20 14v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg></div> <p class="empty-title svelte-6rw1dw">No games on this date</p> <p class="empty-sub svelte-6rw1dw">Try navigating to a date during the regular season or playoffs.</p></div>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<div class="games-grid svelte-6rw1dw"><!--[-->`);
			const each_array = ensure_array_like(data.games);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let g = each_array[$$index];
				$$renderer.push(`<div${attr_class("game-card svelte-6rw1dw", void 0, {
					"is-live": isLive(g),
					"is-final": isFinal(g)
				})}><div class="card-status svelte-6rw1dw"><span${attr_class("status-pill svelte-6rw1dw", void 0, {
					"live": isLive(g),
					"final": isFinal(g)
				})}>${escape_html(gameStatus(g))}</span></div> <div class="card-teams svelte-6rw1dw"><div${attr_class("team-row svelte-6rw1dw", void 0, { "winner": isFinal(g) && g.away_score > g.home_score })}><span class="team-abbr svelte-6rw1dw">${escape_html(g.away_team ?? g.awayTeam)}</span> `);
				if (g.away_score != null) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<span class="team-score svelte-6rw1dw">${escape_html(g.away_score)}</span>`);
				} else {
					$$renderer.push("<!--[-1-->");
					$$renderer.push(`<span class="team-score muted svelte-6rw1dw">—</span>`);
				}
				$$renderer.push(`<!--]--></div> <div${attr_class("team-row svelte-6rw1dw", void 0, { "winner": isFinal(g) && g.home_score > g.away_score })}><span class="team-abbr svelte-6rw1dw">${escape_html(g.home_team ?? g.homeTeam)}</span> `);
				if (g.home_score != null) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<span class="team-score svelte-6rw1dw">${escape_html(g.home_score)}</span>`);
				} else {
					$$renderer.push("<!--[-1-->");
					$$renderer.push(`<span class="team-score muted svelte-6rw1dw">—</span>`);
				}
				$$renderer.push(`<!--]--></div></div> `);
				if (g.venue || g.start_time_utc) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<div class="card-meta svelte-6rw1dw">`);
					if (g.venue) {
						$$renderer.push("<!--[0-->");
						$$renderer.push(`<span>${escape_html(g.venue)}</span>`);
					} else $$renderer.push("<!--[-1-->");
					$$renderer.push(`<!--]--> `);
					if (g.start_time_utc) {
						$$renderer.push("<!--[0-->");
						$$renderer.push(`<span>${escape_html(new Date(g.start_time_utc).toLocaleTimeString("en-US", {
							hour: "numeric",
							minute: "2-digit",
							timeZoneName: "short"
						}))}</span>`);
					} else $$renderer.push("<!--[-1-->");
					$$renderer.push(`<!--]--></div>`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]--></div>`);
			}
			$$renderer.push(`<!--]--></div> <p class="games-count svelte-6rw1dw">${escape_html(data.games.length)} game${escape_html(data.games.length !== 1 ? "s" : "")} · ${escape_html(fmtDisplay(data.date))}</p>`);
		}
		$$renderer.push(`<!--]--></div></div>`);
	});
}
//#endregion
export { _page as default };
