// js/teams.js
//
// Central config for team pages.
// Keys are lowercase NHL abbreviations used in URLs: /teams/njd, /teams/pit, etc.
//
// IMPORTANT:
// Update HANDLE_SUFFIX + HANDLE_OVERRIDES to match your actual Bluesky handles.

export const DEFAULT_TEAM = "njd";

// If your bots are like: njd.hockeygamebot.com, pit.hockeygamebot.com, etc.
export const HANDLE_SUFFIX = "hockeygamebot.com";

export const PROJECT_ACCOUNT = {
    key: "hgb",
    name: "HockeyGameBot",
    handle: "hockeygamebot.com",
};

// If some handles don't match the standard pattern, override them here.
// Example:
//   export const HANDLE_OVERRIDES = { njd: "njdgamebot.bsky.social" };
export const HANDLE_OVERRIDES = {
    hgb: "hockeygamebot.com"
};

// Team metadata. Handles are computed unless overridden.
export const TEAMS = {
    ana: { name: "Anaheim Ducks" },
    bos: { name: "Boston Bruins" },
    buf: { name: "Buffalo Sabres" },
    cgy: { name: "Calgary Flames" },
    car: { name: "Carolina Hurricanes" },
    chi: { name: "Chicago Blackhawks" },
    col: { name: "Colorado Avalanche" },
    cbj: { name: "Columbus Blue Jackets" },
    dal: { name: "Dallas Stars" },
    det: { name: "Detroit Red Wings" },
    edm: { name: "Edmonton Oilers" },
    fla: { name: "Florida Panthers" },
    lak: { name: "Los Angeles Kings" },
    min: { name: "Minnesota Wild" },
    mtl: { name: "Montréal Canadiens" },
    nsh: { name: "Nashville Predators" },
    njd: { name: "New Jersey Devils" },
    nyi: { name: "New York Islanders" },
    nyr: { name: "New York Rangers" },
    ott: { name: "Ottawa Senators" },
    phi: { name: "Philadelphia Flyers" },
    pit: { name: "Pittsburgh Penguins" },
    sjs: { name: "San Jose Sharks" },
    sea: { name: "Seattle Kraken" },
    stl: { name: "St. Louis Blues" },
    tbl: { name: "Tampa Bay Lightning" },
    tor: { name: "Toronto Maple Leafs" },
    uta: { name: "Utah Mammoth" },
    van: { name: "Vancouver Canucks" },
    vgk: { name: "Vegas Golden Knights" },
    wsh: { name: "Washington Capitals" },
    wpg: { name: "Winnipeg Jets" },
};

// Attach computed handles
for (const [key, team] of Object.entries(TEAMS)) {
    team.handle =
        HANDLE_OVERRIDES[key] || `${key}.${HANDLE_SUFFIX}`;
}

// Convenience: list of keys in display order (optional)
export const TEAM_KEYS = Object.keys(TEAMS);
