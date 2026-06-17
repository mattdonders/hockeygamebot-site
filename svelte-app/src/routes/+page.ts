import type { PageLoad } from './$types';

const API = 'https://api.hockeygamebot.com';

export const load: PageLoad = async ({ fetch }) => {
  // Yesterday's date (UTC)
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);

  const [schedRes, metaRes] = await Promise.allSettled([
    fetch(`${API}/v1/schedule/${yesterday}`).then(r => r.ok ? r.json() : null),
    fetch(`${API}/v1/stats/meta`).then(r => r.ok ? r.json() : null),
  ]);

  return {
    yesterday,
    games: schedRes.status === 'fulfilled' ? (schedRes.value?.games ?? []) : [],
    meta:  metaRes.status === 'fulfilled'  ? metaRes.value : null,
  };
};
