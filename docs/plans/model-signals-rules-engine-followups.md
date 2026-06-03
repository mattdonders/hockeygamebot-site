# Model Signals — Implementation Notes & Followups
*Written after v1 build, June 2, 2026*

## What was built

`hgb-analytics/scripts/generate_signals.py` — fully functional nightly pipeline.

**Dry-run test output** (--teams NJD SJS --players 8481559):
```
17 signals generated:
  [100] player_goal_milestone: Jack Hughes sits 3 goals shy of 30.
  [77]  line_strong_together (×16): NJD/SJS dominant pairs
```

## Rules implemented (18 of 26)

| Category | Rules | Status |
|---|---|---|
| A: Record vs Process | good_process_bad_results, bad_process_good_results, goalie_masking | ✅ |
| B: Role Changes | toi_surge, toi_drop, pp_promotion, pp_demotion | ✅ |
| C: Line Chemistry | line_strong_together, line_weak_together | ✅ |
| D: Shot Profile | player_shot_quality_up, player_inner_slot_trend, team_allowing_slot | ✅ |
| E: Finishing | player_overperforming/underperforming, team_sh_pct_hot, goalie_over/under | ✅ |
| F: Schedule | back_to_back, 3in4, rest_advantage | ✅ |
| G: Milestone | goal/assist/point milestone, point_streak, win/loss_streak | ✅ |
| H: Movement | team_l10_xgf_cross (partial) | ⚠️ |

## Rules skipped (8 of 26) — infrastructure gaps

| Rule | Reason | Fix needed |
|---|---|---|
| team_clinch_watch | No `team_playoff_odds` table | Ingest from Monte Carlo B2 JSON |
| team_elimination_watch | Same | Same |
| playoff_odds_move | Same | Same |
| impact_rank_move | Needs player_rates_v1.json → impact rankings | Load from R2 players.json |
| rookie_top5_impact | No reliable rookie flag in player_game_features | Add birth_year check + entry draft year |
| player_usage_toughened | No oz_start_count in player_game_features | Add to build_player_game_features.py |
| sched_soft_stretch | No upcoming schedule / opponent pts table | Ingest from NHL schedule API |
| sched_four_point_game | No division / wildcard table | Ingest from NHL standings API |

## Column name corrections found during build

| Spec assumed | Actual column in DB |
|---|---|
| `toi_pp_sec_total` | `toi_pp_sec` |
| `home_shots` (in games table) | Does not exist — use rapm_shifts CF proxy |
| `a1_ev` | Does not exist — `a1` is total primary assists |

## Line chemistry — known issue

The pairwise analysis uses full-season rapm_shifts, not a proper L10 window
(the spec says L10 but the query doesn't filter to last 10 games per team).
This means "last 10" in the copy is inaccurate — it's actually full season
for the pair. Fix: filter rapm_shifts to game_ids from the last 10 games
per team before computing pair stats.

## Priority observation

The line_strong_together signals all fire at priority 77, making it hard to
differentiate genuinely interesting pairs from routine ones. The magnitude_boost
is not wired for line signals yet. Should add: magnitude_boost based on
(xgf_pct - 56) / 5 to spread the 56-70% range.

## Schedule rules — opp_rest_days

The `sched_rest_advantage` rule fires based on `opp_rest_days = 0`
but we hardcode opp_rest_days = 0 (no schedule lookup implemented).
This means the rule never actually fires for rest advantage.
Fix: query next game opponent from daily_schedule and look up their
last game date.

## Next steps

1. **Add to nightly pipeline**: wire `generate_signals.py --teams ALL` into
   `nightly_pipeline.py` step list (after anomaly detector, before R2 upload)

2. **R2 endpoint**: add `/v1/stats/signals` to hgb-api Worker and upload_stats_r2.py

3. **Fix L10 pairwise window**: filter rapm_shifts to last 10 game IDs per team

4. **Wire opp_rest_days**: query daily_schedule for next game + opponent's last game

5. **Add lineup-change signals** (category B improvements):
   - oz_start_count to player_game_features
   - PP unit detection from on_ice_xgf_pp by player pair

6. **Category H baseline**: signal_snapshot table needs population before
   movement rules (l10_xgf_cross, impact_season_high) can fire

7. **R2 / playoffs integration** for clinch/elim/odds rules (blocked on Monte Carlo JSON ingestion)
