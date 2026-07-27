// NHL arena coordinates for photo-geolocation (match a photo's GPS → arena → game).
//
// `abbrev` is the NHL team code the games API returns, so a photo matched to an
// arena can be paired with that team's home game on the date. Includes the 32
// current buildings plus historically-relevant venues for relocated teams (an
// attended-game photo may sit at an old arena) with an `era` note.
//
// COORDS: best-effort, being verified against Wikipedia infoboxes by the
// arena-coords pass — swap in the verified set before merge. Matching tolerates
// small error (5km window), but a badly-wrong coord silently fails to match.

export type NhlArena = {
  abbrev: string;
  team: string;
  arena: string;
  lat: number;
  lon: number;
  era?: string; // historical/relocated venues only
};

export const NHL_ARENAS: NhlArena[] = [
  // ── Current 32 ────────────────────────────────────────────────────────────────
  { abbrev: 'ANA', team: 'Anaheim Ducks', arena: 'Honda Center', lat: 33.8078, lon: -117.8766 },
  { abbrev: 'BOS', team: 'Boston Bruins', arena: 'TD Garden', lat: 42.3662, lon: -71.0621 },
  { abbrev: 'BUF', team: 'Buffalo Sabres', arena: 'KeyBank Center', lat: 42.8750, lon: -78.8765 },
  { abbrev: 'CGY', team: 'Calgary Flames', arena: 'Scotiabank Saddledome', lat: 51.0374, lon: -114.0519 },
  { abbrev: 'CAR', team: 'Carolina Hurricanes', arena: 'Lenovo Center', lat: 35.8033, lon: -78.7219 },
  { abbrev: 'CHI', team: 'Chicago Blackhawks', arena: 'United Center', lat: 41.8807, lon: -87.6742 },
  { abbrev: 'COL', team: 'Colorado Avalanche', arena: 'Ball Arena', lat: 39.7487, lon: -105.0077 },
  { abbrev: 'CBJ', team: 'Columbus Blue Jackets', arena: 'Nationwide Arena', lat: 39.9694, lon: -83.0060 },
  { abbrev: 'DAL', team: 'Dallas Stars', arena: 'American Airlines Center', lat: 32.7905, lon: -96.8103 },
  { abbrev: 'DET', team: 'Detroit Red Wings', arena: 'Little Caesars Arena', lat: 42.3411, lon: -83.0553 },
  { abbrev: 'EDM', team: 'Edmonton Oilers', arena: 'Rogers Place', lat: 53.5469, lon: -113.4979 },
  { abbrev: 'FLA', team: 'Florida Panthers', arena: 'Amerant Bank Arena', lat: 26.1585, lon: -80.3255 },
  { abbrev: 'LAK', team: 'Los Angeles Kings', arena: 'Crypto.com Arena', lat: 34.0430, lon: -118.2673 },
  { abbrev: 'MIN', team: 'Minnesota Wild', arena: 'Xcel Energy Center', lat: 44.9447, lon: -93.1010 },
  { abbrev: 'MTL', team: 'Montréal Canadiens', arena: 'Bell Centre', lat: 45.4961, lon: -73.5693 },
  { abbrev: 'NSH', team: 'Nashville Predators', arena: 'Bridgestone Arena', lat: 36.1593, lon: -86.7785 },
  { abbrev: 'NJD', team: 'New Jersey Devils', arena: 'Prudential Center', lat: 40.7336, lon: -74.1711 },
  { abbrev: 'NYI', team: 'New York Islanders', arena: 'UBS Arena', lat: 40.7106, lon: -73.7226 },
  { abbrev: 'NYR', team: 'New York Rangers', arena: 'Madison Square Garden', lat: 40.7505, lon: -73.9934 },
  { abbrev: 'OTT', team: 'Ottawa Senators', arena: 'Canadian Tire Centre', lat: 45.2969, lon: -75.9273 },
  { abbrev: 'PHI', team: 'Philadelphia Flyers', arena: 'Wells Fargo Center', lat: 39.9012, lon: -75.1720 },
  { abbrev: 'PIT', team: 'Pittsburgh Penguins', arena: 'PPG Paints Arena', lat: 40.4395, lon: -79.9895 },
  { abbrev: 'SJS', team: 'San Jose Sharks', arena: 'SAP Center', lat: 37.3328, lon: -121.9012 },
  { abbrev: 'SEA', team: 'Seattle Kraken', arena: 'Climate Pledge Arena', lat: 47.6221, lon: -122.3540 },
  { abbrev: 'STL', team: 'St. Louis Blues', arena: 'Enterprise Center', lat: 38.6266, lon: -90.2026 },
  { abbrev: 'TBL', team: 'Tampa Bay Lightning', arena: 'Amalie Arena', lat: 27.9427, lon: -82.4519 },
  { abbrev: 'TOR', team: 'Toronto Maple Leafs', arena: 'Scotiabank Arena', lat: 43.6435, lon: -79.3791 },
  { abbrev: 'UTA', team: 'Utah Hockey Club', arena: 'Delta Center', lat: 40.7683, lon: -111.9011 },
  { abbrev: 'VAN', team: 'Vancouver Canucks', arena: 'Rogers Arena', lat: 49.2778, lon: -123.1089 },
  { abbrev: 'VGK', team: 'Vegas Golden Knights', arena: 'T-Mobile Arena', lat: 36.1029, lon: -115.1782 },
  { abbrev: 'WSH', team: 'Washington Capitals', arena: 'Capital One Arena', lat: 38.8981, lon: -77.0209 },
  { abbrev: 'WPG', team: 'Winnipeg Jets', arena: 'Canada Life Centre', lat: 49.8927, lon: -97.1436 },

  // ── Historical / relocated (attended-game photos may be here) ──────────────────
  { abbrev: 'ARI', team: 'Arizona Coyotes', arena: 'Gila River Arena', lat: 33.5319, lon: -112.2611, era: '2003–2022, Glendale' },
  { abbrev: 'ARI', team: 'Arizona Coyotes', arena: 'Mullett Arena', lat: 33.4255, lon: -111.9328, era: '2022–2024, Tempe' },
  { abbrev: 'ATL', team: 'Atlanta Thrashers', arena: 'Philips Arena', lat: 33.7573, lon: -84.3963, era: '1999–2011' },
];
