//#region src/routes/+page.ts
var API = "https://api.hockeygamebot.com";
var load = async ({ fetch }) => {
	const d = /* @__PURE__ */ new Date();
	d.setUTCDate(d.getUTCDate() - 1);
	const yesterday = d.toISOString().slice(0, 10);
	const [schedRes, metaRes] = await Promise.allSettled([fetch(`${API}/v1/schedule/${yesterday}`).then((r) => r.ok ? r.json() : null), fetch(`${API}/v1/stats/meta`).then((r) => r.ok ? r.json() : null)]);
	return {
		yesterday,
		games: schedRes.status === "fulfilled" ? schedRes.value?.games ?? [] : [],
		meta: metaRes.status === "fulfilled" ? metaRes.value : null
	};
};
//#endregion
export { load };
