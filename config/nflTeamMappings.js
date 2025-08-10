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