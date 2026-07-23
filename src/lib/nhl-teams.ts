// Canonical NHL team directory (abbr + full name + optional custom X handle).
// Single source of truth for the /teams pages — imported by both
// src/pages/teams.astro and src/pages/teams/[abbr].astro. Do NOT re-hardcode
// this list anywhere; extend it here.
//
// Team colours live separately in src/lib/team-colors.ts (mirrored in
// public/js/hgb-charts.js + the bot's team_details.py — see that file's header).

export interface NhlTeam {
  abbr: string;
  name: string;
  /** Custom X/Twitter handle when it differs from `${abbr}GameBot` (only VGK today). */
  xHandle?: string;
}

export const NHL_TEAMS: NhlTeam[] = [
  { abbr: 'ANA', name: 'Anaheim Ducks' },
  { abbr: 'BOS', name: 'Boston Bruins' },
  { abbr: 'BUF', name: 'Buffalo Sabres' },
  { abbr: 'CGY', name: 'Calgary Flames' },
  { abbr: 'CAR', name: 'Carolina Hurricanes' },
  { abbr: 'CHI', name: 'Chicago Blackhawks' },
  { abbr: 'COL', name: 'Colorado Avalanche' },
  { abbr: 'CBJ', name: 'Columbus Blue Jackets' },
  { abbr: 'DAL', name: 'Dallas Stars' },
  { abbr: 'DET', name: 'Detroit Red Wings' },
  { abbr: 'EDM', name: 'Edmonton Oilers' },
  { abbr: 'FLA', name: 'Florida Panthers' },
  { abbr: 'LAK', name: 'Los Angeles Kings' },
  { abbr: 'MIN', name: 'Minnesota Wild' },
  { abbr: 'MTL', name: 'Montreal Canadiens' },
  { abbr: 'NSH', name: 'Nashville Predators' },
  { abbr: 'NJD', name: 'New Jersey Devils' },
  { abbr: 'NYI', name: 'New York Islanders' },
  { abbr: 'NYR', name: 'New York Rangers' },
  { abbr: 'OTT', name: 'Ottawa Senators' },
  { abbr: 'PHI', name: 'Philadelphia Flyers' },
  { abbr: 'PIT', name: 'Pittsburgh Penguins' },
  { abbr: 'SJS', name: 'San Jose Sharks' },
  { abbr: 'SEA', name: 'Seattle Kraken' },
  { abbr: 'STL', name: 'St. Louis Blues' },
  { abbr: 'TBL', name: 'Tampa Bay Lightning' },
  { abbr: 'TOR', name: 'Toronto Maple Leafs' },
  { abbr: 'UTA', name: 'Utah Hockey Club' },
  { abbr: 'VAN', name: 'Vancouver Canucks' },
  { abbr: 'VGK', name: 'Vegas Golden Knights', xHandle: 'VGKGameBot_' },
  { abbr: 'WSH', name: 'Washington Capitals' },
  { abbr: 'WPG', name: 'Winnipeg Jets' },
];

/** abbr → full name lookup (used for opponent dropdowns, filter labels, etc.). */
export const NHL_TEAM_NAMES: Record<string, string> =
  Object.fromEntries(NHL_TEAMS.map(t => [t.abbr, t.name]));
