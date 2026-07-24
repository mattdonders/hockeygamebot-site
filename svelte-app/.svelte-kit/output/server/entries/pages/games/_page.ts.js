//#region src/routes/games/+page.ts
var API = "https://api.hockeygamebot.com";
function yesterday() {
	const d = /* @__PURE__ */ new Date();
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}
var load = async ({ fetch, url }) => {
	const date = url.searchParams.get("date") ?? yesterday();
	let games = [];
	let error = null;
	try {
		const res = await fetch(`${API}/v1/schedule/${date}`);
		if (res.ok) {
			const body = await res.json();
			games = body?.games ?? (Array.isArray(body) ? body : []);
		} else if (res.status !== 404) error = `API error ${res.status}`;
	} catch {
		error = "Network error";
	}
	return {
		date,
		games,
		error
	};
};
//#endregion
export { load };
