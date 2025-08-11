/**
 * NFL Team abbreviation mappings
 * Maps team abbreviations to full names and vice versa
 */

const teamMappings = {
  // AFC East
  'BUF': 'Buffalo Bills',
  'MIA': 'Miami Dolphins',
  'NE': 'New England Patriots',
  'NYJ': 'New York Jets',
  
  // AFC North
  'BAL': 'Baltimore Ravens',
  'CIN': 'Cincinnati Bengals',
  'CLE': 'Cleveland Browns',
  'PIT': 'Pittsburgh Steelers',
  
  // AFC South
  'HOU': 'Houston Texans',
  'IND': 'Indianapolis Colts',
  'JAX': 'Jacksonville Jaguars',
  'TEN': 'Tennessee Titans',
  
  // AFC West
  'DEN': 'Denver Broncos',
  'KC': 'Kansas City Chiefs',
  'LV': 'Las Vegas Raiders',
  'LAC': 'Los Angeles Chargers',
  
  // NFC East
  'DAL': 'Dallas Cowboys',
  'NYG': 'New York Giants',
  'PHI': 'Philadelphia Eagles',
  'WAS': 'Washington Commanders',
  
  // NFC North
  'CHI': 'Chicago Bears',
  'DET': 'Detroit Lions',
  'GB': 'Green Bay Packers',
  'MIN': 'Minnesota Vikings',
  
  // NFC South
  'ATL': 'Atlanta Falcons',
  'CAR': 'Carolina Panthers',
  'NO': 'New Orleans Saints',
  'TB': 'Tampa Bay Buccaneers',
  
  // NFC West
  'ARI': 'Arizona Cardinals',
  'LAR': 'Los Angeles Rams',
  'SF': 'San Francisco 49ers',
  'SEA': 'Seattle Seahawks'
};

// Create reverse mapping
const reverseMapping = {};
Object.entries(teamMappings).forEach(([abbr, full]) => {
  reverseMapping[full.toLowerCase()] = abbr;
  // Also map individual team names
  const teamName = full.split(' ').pop();
  reverseMapping[teamName.toLowerCase()] = abbr;
});

// Team RSS feeds for official announcements
const teamRSSFeeds = {
  'NE': 'https://www.patriots.com/rss/article',
  'SF': 'https://www.49ers.com/news/rss',
  'DAL': 'https://www.dallascowboys.com/news/rss',
  'GB': 'https://www.packers.com/news/rss',
  'KC': 'https://www.chiefs.com/news/rss',
  'BAL': 'https://www.baltimoreravens.com/news/rss'
  // Add more as needed
};

// TheSportsDB team ID mappings for NFL teams
const sportsDbTeamIds = {
  'Arizona Cardinals': '134934',
  'Atlanta Falcons': '134942',
  'Baltimore Ravens': '134936',
  'Buffalo Bills': '134935',
  'Carolina Panthers': '134937',
  'Chicago Bears': '134938',
  'Cincinnati Bengals': '134940',
  'Cleveland Browns': '134941',
  'Dallas Cowboys': '134945',
  'Denver Broncos': '134946',
  'Detroit Lions': '134939',
  'Green Bay Packers': '134943',
  'Houston Texans': '134948',
  'Indianapolis Colts': '134947',
  'Jacksonville Jaguars': '134949',
  'Kansas City Chiefs': '134951',
  'Las Vegas Raiders': '134950',
  'Los Angeles Chargers': '135908',
  'Los Angeles Rams': '134951',
  'Miami Dolphins': '134919',
  'Minnesota Vikings': '134952',
  'New England Patriots': '134953',
  'New Orleans Saints': '134954',
  'New York Giants': '134955',
  'New York Jets': '134956',
  'Philadelphia Eagles': '134958',
  'Pittsburgh Steelers': '134957',
  'San Francisco 49ers': '134959',
  'Seattle Seahawks': '134960',
  'Tampa Bay Buccaneers': '134961',
  'Tennessee Titans': '134929',
  'Washington Commanders': '134962'
};

// Allowed domains for official team news
const officialTeamDomains = [
  'patriots.com',
  '49ers.com',
  'dallascowboys.com',
  'packers.com',
  'chiefs.com',
  'baltimoreravens.com',
  'steelers.com',
  'bengals.com',
  'browns.com',
  'texans.com',
  'colts.com',
  'jaguars.com',
  'titans.com',
  'broncos.com',
  'raiders.com',
  'chargers.com',
  'giants.com',
  'philadelphiaeagles.com',
  'commanders.com',
  'chicagobears.com',
  'detroitlions.com',
  'vikings.com',
  'atlantafalcons.com',
  'panthers.com',
  'neworleanssaints.com',
  'buccaneers.com',
  'azcardinals.com',
  'therams.com',
  'seahawks.com'
];

module.exports = {
  teamMappings,
  reverseMapping,
  teamRSSFeeds,
  officialTeamDomains,
  sportsDbTeamIds,
  
  /**
   * Get team abbreviation from full name or partial match
   * @param {string} teamName - Team name to look up
   * @returns {string|null} Team abbreviation or null
   */
  getTeamAbbr(teamName) {
    if (!teamName) return null;
    
    const normalized = teamName.toLowerCase().trim();
    
    // Direct abbreviation match
    if (teamMappings[teamName.toUpperCase()]) {
      return teamName.toUpperCase();
    }
    
    // Reverse lookup
    if (reverseMapping[normalized]) {
      return reverseMapping[normalized];
    }
    
    // Partial match
    for (const [full, abbr] of Object.entries(reverseMapping)) {
      if (normalized.includes(full) || full.includes(normalized)) {
        return abbr;
      }
    }
    
    return null;
  },
  
  /**
   * Get full team name from abbreviation
   * @param {string} abbr - Team abbreviation
   * @returns {string|null} Full team name or null
   */
  getTeamFullName(abbr) {
    return teamMappings[abbr?.toUpperCase()] || null;
  },
  
  /**
   * Get TheSportsDB team ID from team name
   * @param {string} teamName - Full team name
   * @returns {string|null} TheSportsDB team ID or null
   */
  getTeamId(teamName) {
    if (!teamName) return null;
    
    // Direct lookup
    if (sportsDbTeamIds[teamName]) {
      return sportsDbTeamIds[teamName];
    }
    
    // Try case-insensitive lookup
    const normalizedName = teamName.trim();
    const matchingKey = Object.keys(sportsDbTeamIds).find(
      key => key.toLowerCase() === normalizedName.toLowerCase()
    );
    
    return matchingKey ? sportsDbTeamIds[matchingKey] : null;
  },
  
  /**
   * Check if a domain is an official team domain
   * @param {string} url - URL to check
   * @returns {boolean} True if official team domain
   */
  isOfficialTeamDomain(url) {
    if (!url) return false;
    
    const domain = url.toLowerCase();
    return officialTeamDomains.some(official => domain.includes(official));
  }
};