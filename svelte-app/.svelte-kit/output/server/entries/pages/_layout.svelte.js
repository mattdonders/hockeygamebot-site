import { b as escape_html, i as head, r as ensure_array_like, t as attr_class, y as attr } from "../../chunks/server.js";
import { t as page } from "../../chunks/state.js";
//#region src/routes/+layout.svelte
function _layout($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { children } = $$props;
		const navLinks = [
			{
				href: "/games",
				label: "Games"
			},
			{
				href: "/stats/skaters",
				label: "Skaters"
			},
			{
				href: "/stats/goalies",
				label: "Goalies"
			},
			{
				href: "/stats/teams",
				label: "Teams"
			},
			{
				href: "/stats/lines",
				label: "Lines"
			},
			{
				href: "/stats/impact",
				label: "Impact"
			},
			{
				href: "/playoffs/2026",
				label: "Playoffs"
			},
			{
				href: "/results",
				label: "Results"
			}
		];
		function isActive(href) {
			return page.url.pathname === href || page.url.pathname.startsWith(href + "/");
		}
		head("12qhfyh", $$renderer, ($$renderer) => {
			$$renderer.push(`<meta charset="utf-8"/> <meta name="viewport" content="width=device-width, initial-scale=1"/>`);
		});
		$$renderer.push(`<nav class="nav svelte-12qhfyh"><div class="wrap nav-inner svelte-12qhfyh"><a class="brand svelte-12qhfyh" href="/">Hockey<span class="dot svelte-12qhfyh"></span>Gamebot</a> <div class="nav-links svelte-12qhfyh"><!--[-->`);
		const each_array = ensure_array_like(navLinks);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let l = each_array[$$index];
			$$renderer.push(`<a${attr("href", l.href)}${attr_class("svelte-12qhfyh", void 0, { "active": isActive(l.href) })}>${escape_html(l.label)}</a>`);
		}
		$$renderer.push(`<!--]--></div></div></nav> `);
		children($$renderer);
		$$renderer.push(`<!----> <footer class="footer svelte-12qhfyh"><div class="wrap footer-inner svelte-12qhfyh"><span class="footer-wordmark svelte-12qhfyh">Hockey<span class="dot svelte-12qhfyh"></span>Gamebot</span> <span class="mono-label">5v5 · NHL · 2025–26 · Data via HGB Analytics</span></div></footer>`);
	});
}
//#endregion
export { _layout as default };
