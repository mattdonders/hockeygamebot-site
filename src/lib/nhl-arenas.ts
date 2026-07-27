// NHL arena coordinates for photo-geolocation (match a photo's GPS → arena → game).
//
// `abbrev` is the NHL team code the games API returns, so a photo matched to an
// arena can be paired with that team's home game on the date. `altAbbrevs` covers a
// building whose team code CHANGED over its life (Glendale was PHX then ARI), so a
// photo there matches the game regardless of era. Includes the 32 current buildings
// plus historically-relevant venues for relocated teams.
//
// All coordinates web-verified against Wikipedia infobox coords (39/39, 0 estimated).
// Building centroid, 4dp. Renamed arenas keep the current name; old name in a comment.

export type NhlArena = {
  abbrev: string;
  team: string;
  arena: string;
  lat: number;
  lon: number;
  altAbbrevs?: string[]; // other team codes that played this same building (era changes)
  era?: string; // historical/relocated venues only
};

export const NHL_ARENAS: NhlArena[] = [
  // ── 32 current arenas ────────────────────────────────────────────────────────
  { abbrev: 'ANA', team: 'Anaheim Ducks', arena: 'Honda Center', lat: 33.8078, lon: -117.8767 },
  { abbrev: 'BOS', team: 'Boston Bruins', arena: 'TD Garden', lat: 42.3663, lon: -71.0622 },
  { abbrev: 'BUF', team: 'Buffalo Sabres', arena: 'KeyBank Center', lat: 42.8750, lon: -78.8764 },
  { abbrev: 'CGY', team: 'Calgary Flames', arena: 'Scotiabank Saddledome', lat: 51.0375, lon: -114.0519 },
  { abbrev: 'CAR', team: 'Carolina Hurricanes', arena: 'Lenovo Center', lat: 35.8033, lon: -78.7219 }, // was PNC Arena
  { abbrev: 'CHI', team: 'Chicago Blackhawks', arena: 'United Center', lat: 41.8806, lon: -87.6742 },
  { abbrev: 'COL', team: 'Colorado Avalanche', arena: 'Ball Arena', lat: 39.7486, lon: -105.0075 },
  { abbrev: 'CBJ', team: 'Columbus Blue Jackets', arena: 'Nationwide Arena', lat: 39.9693, lon: -83.0061 },
  { abbrev: 'DAL', team: 'Dallas Stars', arena: 'American Airlines Center', lat: 32.7906, lon: -96.8103 },
  { abbrev: 'DET', team: 'Detroit Red Wings', arena: 'Little Caesars Arena', lat: 42.3411, lon: -83.0550 },
  { abbrev: 'EDM', team: 'Edmonton Oilers', arena: 'Rogers Place', lat: 53.5469, lon: -113.4978 },
  { abbrev: 'FLA', team: 'Florida Panthers', arena: 'Amerant Bank Arena', lat: 26.1583, lon: -80.3256 },
  { abbrev: 'LAK', team: 'Los Angeles Kings', arena: 'Crypto.com Arena', lat: 34.0431, lon: -118.2672 }, // was Staples Center
  { abbrev: 'MIN', team: 'Minnesota Wild', arena: 'Grand Casino Arena', lat: 44.9447, lon: -93.1011 }, // was Xcel Energy Center
  { abbrev: 'MTL', team: 'Montréal Canadiens', arena: 'Bell Centre', lat: 45.4961, lon: -73.5694 },
  { abbrev: 'NSH', team: 'Nashville Predators', arena: 'Bridgestone Arena', lat: 36.1592, lon: -86.7786 },
  { abbrev: 'NJD', team: 'New Jersey Devils', arena: 'Prudential Center', lat: 40.7336, lon: -74.1711 },
  { abbrev: 'NYI', team: 'New York Islanders', arena: 'UBS Arena', lat: 40.7118, lon: -73.7260 },
  { abbrev: 'NYR', team: 'New York Rangers', arena: 'Madison Square Garden', lat: 40.7505, lon: -73.9934 },
  { abbrev: 'OTT', team: 'Ottawa Senators', arena: 'Canadian Tire Centre', lat: 45.2969, lon: -75.9272 },
  { abbrev: 'PHI', team: 'Philadelphia Flyers', arena: 'Wells Fargo Center', lat: 39.9012, lon: -75.1720 },
  { abbrev: 'PIT', team: 'Pittsburgh Penguins', arena: 'PPG Paints Arena', lat: 40.4394, lon: -79.9892 },
  { abbrev: 'SJS', team: 'San Jose Sharks', arena: 'SAP Center', lat: 37.3327, lon: -121.9012 },
  { abbrev: 'SEA', team: 'Seattle Kraken', arena: 'Climate Pledge Arena', lat: 47.6219, lon: -122.3539 },
  { abbrev: 'STL', team: 'St. Louis Blues', arena: 'Enterprise Center', lat: 38.6267, lon: -90.2025 },
  { abbrev: 'TBL', team: 'Tampa Bay Lightning', arena: 'Amalie Arena', lat: 27.9428, lon: -82.4519 },
  { abbrev: 'TOR', team: 'Toronto Maple Leafs', arena: 'Scotiabank Arena', lat: 43.6433, lon: -79.3792 },
  { abbrev: 'UTA', team: 'Utah Mammoth', arena: 'Delta Center', lat: 40.7683, lon: -111.9011 },
  { abbrev: 'VAN', team: 'Vancouver Canucks', arena: 'Rogers Arena', lat: 49.2778, lon: -123.1089 },
  { abbrev: 'VGK', team: 'Vegas Golden Knights', arena: 'T-Mobile Arena', lat: 36.1030, lon: -115.1785 },
  { abbrev: 'WSH', team: 'Washington Capitals', arena: 'Capital One Arena', lat: 38.8981, lon: -77.0208 },
  { abbrev: 'WPG', team: 'Winnipeg Jets', arena: 'Canada Life Centre', lat: 49.8928, lon: -97.1436 },

  // ── historical / relocated venues (attended-game photos may be here) ───────────
  // Glendale hosted the Coyotes as PHX (2003–2014) then ARI (2014–2022) — match both.
  { abbrev: 'ARI', team: 'Arizona Coyotes', arena: 'Gila River / Desert Diamond Arena', lat: 33.5319, lon: -112.2611, altAbbrevs: ['PHX'], era: '2003–2022, Glendale' },
  { abbrev: 'ARI', team: 'Arizona Coyotes', arena: 'Mullett Arena', lat: 33.4267, lon: -111.9286, era: '2022–2024, Tempe' },
  { abbrev: 'PHX', team: 'Phoenix Coyotes', arena: 'America West Arena', lat: 33.4458, lon: -112.0714, era: '1996–2003, downtown Phoenix' },
  { abbrev: 'ATL', team: 'Atlanta Thrashers', arena: 'Philips Arena', lat: 33.7572, lon: -84.3964, era: '1999–2011' },
  { abbrev: 'NYI', team: 'New York Islanders', arena: 'Nassau Veterans Memorial Coliseum', lat: 40.7228, lon: -73.5906, era: 'pre-2015 & 2018–2021' },
  { abbrev: 'DET', team: 'Detroit Red Wings', arena: 'Joe Louis Arena', lat: 42.3253, lon: -83.0514, era: 'pre-2017' },
  { abbrev: 'EDM', team: 'Edmonton Oilers', arena: 'Northlands Coliseum', lat: 53.5714, lon: -113.4561, era: 'pre-2016' },
];
