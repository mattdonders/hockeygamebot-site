# hockeygamebot-site TODO

## Known Issues

- [ ] WSH/NYR random WP dip — single bad data point, user chose not to fix unless cause is obvious
- [ ] Rangers blowout: late-game goals showing +0.0% WP delta when model is already near 100% ceiling

## Proposals

- [ ] Review hockeygamebot.com site for improvements
- [ ] Review ig.hockeygamebot.com subdomain

## Completed

- [x] WP chart dot alignment — dots now sit on the WP line via `interpWp(pts, dotT)` interpolation
- [x] Fix "no win probability available" on early-game opens (threshold `>= 2`, tMax stretched to period end)
- [x] Sparse WP data — added SHOT_ON_GOAL to WP storage condition (~10 → ~50-70 pts/game)
- [x] Backfill 14 days of historical WP data (34,706 events updated via `scripts/apply_wp_backfill.py`)
- [x] WP% badge team colors with luminance-based text color (white on dark, black on bright)
- [x] Period separator dividers in modal goals list
- [x] WP chart — drop goal dashed lines, bigger labels, bolder period lines
- [x] Period labels at boundary lines instead of zone midpoints
- [x] Single-column chronological goals in modal, two-column for share card
