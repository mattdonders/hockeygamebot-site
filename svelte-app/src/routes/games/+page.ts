import type { PageLoad } from './$types';

const API = 'https://api.hockeygamebot.com';

function yesterday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const load: PageLoad = async ({ fetch, url }) => {
  const date = url.searchParams.get('date') ?? yesterday();

  let games: any[] = [];
  let error: string | null = null;

  try {
    const res = await fetch(`${API}/v1/schedule/${date}`);
    if (res.ok) {
      const body = await res.json();
      games = body?.games ?? (Array.isArray(body) ? body : []);
    } else if (res.status !== 404) {
      error = `API error ${res.status}`;
    }
  } catch {
    error = 'Network error';
  }

  return { date, games, error };
};
