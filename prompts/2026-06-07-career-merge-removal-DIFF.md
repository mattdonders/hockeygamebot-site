# HOLD — stats-loader.ts career-merge removal (apply AFTER DE ships merged players.json)

**Status:** Do NOT apply yet. Only after DE embeds `career_seasons` into `players.json`
and removes the `player-career` endpoint.

**Why hold:** until players.json carries `career_seasons`, removing the merge would
strip career history from every player page.

**Prereq checks before applying:**
1. `players.json` objects contain a `career_seasons` array (DE confirmed shipped).
2. `stats-schemas.ts` already defines `career_seasons` (line ~133) — **no schema
   change needed**, Zod will validate + keep it.
3. Verify a **retired/traded player's** page still shows full career history (DE must
   embed career into *all* players who get a page, not just the 715 active).

---

## The diff (3 edits in `src/lib/stats-loader.ts`)

Note: it's not just "delete lines 64 + 72–78" — removing the fetch also requires
dropping `playerCareerData` from the destructuring, and the merge block must
collapse into a single `VALIDATED_PLAYERS` assignment (otherwise it's undefined).

### Edit 1 — drop `playerCareerData` from the Promise.all destructuring (line 55)
```diff
-const [playersData, leaderboardsData, playerGamesData, metaData, teamGameStatsData, goaliesData, linesData, playerShotsData, playerCareerData, seriesStatsData, seriesRecordsData, playerSeasonStatsData] = await Promise.all([
+const [playersData, leaderboardsData, playerGamesData, metaData, teamGameStatsData, goaliesData, linesData, playerShotsData, seriesStatsData, seriesRecordsData, playerSeasonStatsData] = await Promise.all([
```

### Edit 2 — remove the `player-career` fetch (line 64)
```diff
   _fetchJSON('player-shots').catch(() => ({})),
-  _fetchJSON('player-career').catch(() => ({})),
   _fetchJSON('series-stats').catch(() => ({ series: [], rounds: [] })),
```

### Edit 3 — collapse the merge (lines 70–79) into one line
```diff
-const VALIDATED_PLAYERS_RAW  = parseOrThrow(PlayerRecordsSchema,  playersData,        'players');
-
-// Merge career_seasons after Zod parsing — Zod strip mode rebuilds objects
-// from schema keys only, so mutations to raw data before parsing are lost.
-const careerMap: Record<string, { seasons: unknown[] }> = playerCareerData ?? {};
-const VALIDATED_PLAYERS = VALIDATED_PLAYERS_RAW.map(player => {
-  const career = careerMap[String(player.player_id)];
-  if (!career?.seasons?.length) return player;
-  return { ...player, career_seasons: career.seasons as typeof player.career_seasons };
-});
+// career_seasons is now embedded in players.json by the exporter (player-career
+// endpoint retired). Zod keeps it via the career_seasons schema field.
+const VALIDATED_PLAYERS = parseOrThrow(PlayerRecordsSchema, playersData, 'players');
```

### Also remove the `player-career` key from the endpoint map (if present)
Grep `_STATS_KEYS` / `_fetchJSON` paths in stats-loader.ts for a `'player-career'`
entry and remove it so the dead endpoint isn't referenced.

---

## Post-apply verification
- `npx tsc --noEmit` clean (no dangling `playerCareerData` / `VALIDATED_PLAYERS_RAW`).
- Player page career table renders for an **active** player (McDavid) AND a
  **retired/traded** player.
- One fewer build-time fetch in the CF Pages build log.
