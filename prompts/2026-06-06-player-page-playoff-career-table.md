# Engineer Briefing — Player Page: Regular/Playoff Career Table Toggle

**Filed:** 2026-06-06
**Repo:** `hockeygamebot-site`
**Status:** Open. Data is ready — no pipeline work needed.
**Context:** Mitch Marner's 2025 playoff run with VGK went viral (24 points in 18 games vs. 14 points across his entire Leafs playoff career). The player page needs to show this story immediately.

---

## What we're building

Add a **Regular / Playoffs toggle** to the existing `PlayerCareerTable` component on `/stats/player/[slug]`. When set to Playoffs, the table switches to showing per-season playoff stats instead of regular season stats.

This is a **targeted upgrade to an existing component** — not a new page or new component.

---

## Data source

Already live: `GET https://api.hockeygamebot.com/v1/stats/player-season-stats`

Response shape:
```json
{
  "8478483": {
    "regular": [ ...season rows... ],
    "playoffs": [ ...season rows... ]
  }
}
```

The player page already fetches this endpoint (it powers the existing career table). The `playoffs` array is now populated — just needs to be wired to the toggle.

Each row in both arrays has identical shape:
```json
{
  "season": "2025-26",
  "team": "VGK",
  "pos": "R",
  "gp": 18,
  "toi_5v5_sec": 15723,
  "goals": 7,
  "a1": 14,
  "a2": 3,
  "assists": 17,
  "points": 24,
  "shots": 36,
  "ixg": 4.47,
  "xgf_pct_5v5": 54.1,
  "cf_pct_5v5": 52.3,
  "rapm_off_pct": null,
  "rapm_def_pct": null,
  "war_pct": null,
  "goals_pct": 77,
  "a1_pct": 98,
  "ixg_pct": 53,
  "pen_diff_pct": 75,
  "qoc_pct": 35,
  "qot_pct": 91,
  "limited": false
}
```

**Playoff data coverage:** 2022-23, 2023-24, 2025-26 are fully populated now. 2010-11 through 2021-22 and 2024-25 are being backfilled — expect all seasons live within ~24 hours. Design should handle sparse playoff history gracefully (some players will have 0–2 playoff seasons).

---

## Changes needed

### 1. Toggle control
Add a **Regular Season / Playoffs** pill toggle above (or inline with) the career table header. Default: Regular Season.

Match the existing toggle style used elsewhere on the site (game type toggles on the stats page). This should feel native, not bolted on.

### 2. Swap table data on toggle
- Regular Season: use `playerData.regular` (existing behavior)
- Playoffs: use `playerData.playoffs`

If `playoffs` is empty or has zero rows, show an empty state: *"No playoff data available."* — don't hide the toggle.

### 3. Column adjustments for playoffs
Keep the same columns as the regular season view:
`Season | Team | GP | TOI | GF% | xGF% | (other existing columns)`

Note: `toi_5v5_sec` is **5v5 TOI only**, not total TOI. The column header tooltip should say "5v5 TOI" to be accurate.

### 4. Limited-sample flag
If a row has `limited: true` (fewer than 30 GP), append `*` to the GP value and show a footnote below the table: `* fewer than 30 games played — stats may be less stable`.

This matters more for playoffs than regular season (short runs are common).

### 5. GAx column (optional but high-value)
Compute client-side: `gax = round(goals - ixg, 2)`. Add as a column after IxG if there's room. Label: `GAx`. Positive = green, negative = red (same threshold coloring as GF%).

---

## What NOT to change

- Do not touch the canvas download cards (Rating Card, History Card, etc.) — those are separate
- Do not change regular season table behavior — the toggle must be purely additive
- Do not add a season range selector here — that belongs on the `/stats/skaters` leaderboard (separate prompt)
- `rapm_off_pct`, `rapm_def_pct`, `war_pct` are null for playoff rows — don't show those columns in the playoff view (or gracefully hide/dash them)

---

## Acceptance criteria

- [ ] Toggle renders above the career table, default Regular Season
- [ ] Switching to Playoffs shows playoff rows sorted by season descending
- [ ] Empty state renders cleanly when player has no playoff history
- [ ] `limited: true` rows show `*` on GP with footnote
- [ ] 5v5 TOI column header has tooltip clarifying it's 5v5 only
- [ ] Light + dark mode both render correctly
- [ ] Mobile layout works (same column-hiding rules as regular season view)

## Reporting back

One checkpoint: post a screenshot of Marner's player page with Playoffs toggled on showing his 3+ seasons of playoff data. That's the validation.
