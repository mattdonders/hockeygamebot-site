// Synced with utils/team_details.py (Python bot) and public/js/hgb-charts.js.
// Canonical source is the Python bot — update all three when adding/changing a team.
const TEAM_COLORS: Record<string, [string, string]> = {
  ANA: ['#F47A38', '#B09862'], BOS: ['#FFB81C', '#000000'], BUF: ['#002654', '#FDBB30'],
  CAR: ['#CC0000', '#000000'], CBJ: ['#002654', '#CE1126'], CGY: ['#C8102E', '#F1BE48'],
  CHI: ['#CF0A2C', '#000000'], COL: ['#6F263D', '#236192'], DAL: ['#006847', '#8F8F8C'],
  DET: ['#CE1126', '#FFFFFF'], EDM: ['#FF4C00', '#041E42'], FLA: ['#041E42', '#C8102E'],
  LAK: ['#111111', '#A2AAAD'], MIN: ['#154734', '#A6192E'], MTL: ['#AF1E2D', '#00205B'],
  NSH: ['#FFB81C', '#041E42'], NJD: ['#CE1126', '#000000'], NYI: ['#00539B', '#F47D30'],
  NYR: ['#0038A8', '#CE1126'], OTT: ['#DA1A32', '#000000'], PHI: ['#FA4616', '#000000'],
  PIT: ['#000000', '#FCB514'], SEA: ['#001628', '#99D9D9'], SJS: ['#006D75', '#EA7200'],
  STL: ['#002F87', '#FDB827'], TBL: ['#00205B', '#FFFFFF'], TOR: ['#00205B', '#FFFFFF'],
  UTA: ['#71AFE5', '#090909'], VAN: ['#00205B', '#00843D'], VGK: ['#B4975A', '#333F48'],
  WSH: ['#041E42', '#C8102E'], WPG: ['#041E42', '#004C97'],
};

// Teams with near-black primaries (L < 15%) are better represented by their secondary color.
// Matches pickTeamColor() in public/js/hgb-charts.js.
export function pickTeamColor(abbrev: string): string {
  const colors = TEAM_COLORS[abbrev] ?? ['#E8002D', '#555555'];
  const primary = colors[0];
  const r = parseInt(primary.slice(1, 3), 16) / 255;
  const g = parseInt(primary.slice(3, 5), 16) / 255;
  const b = parseInt(primary.slice(5, 7), 16) / 255;
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  return l < 0.15 ? colors[1] : primary;
}
