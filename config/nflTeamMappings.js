/**
 * NFL Team ID Mappings for TheSportsDB
 * Hardcoded to avoid unnecessary API calls for team searches
 * Last updated: August 2025
 */

const nflTeamMappings = {
  // AFC East
  'Buffalo Bills': '134918',
  'Miami Dolphins': '134919',
  'New England Patriots': '134920',
  'New York Jets': '134921',
  
  // AFC North
  'Baltimore Ravens': '134922',
  'Cincinnati Bengals': '134923',
  'Cleveland Browns': '134924',
  'Pittsburgh Steelers': '134925',
  
  // AFC South
  'Houston Texans': '134926',
  'Indianapolis Colts': '134927',
  'Jacksonville Jaguars': '134928',
  'Tennessee Titans': '134929',
  
  // AFC West
  'Denver Broncos': '134930',
  'Kansas City Chiefs': '135907',
  'Las Vegas Raiders': '134932',
  'Los Angeles Chargers': '135908',
  
  // NFC East
  'Dallas Cowboys': '134934',
  'New York Giants': '134935',
  'Philadelphia Eagles': '134936',
  'Washington Commanders': '134937', // Previously Washington Redskins/Football Team
  
  // NFC North
  'Chicago Bears': '134938',
  'Detroit Lions': '134939',
  'Green Bay Packers': '134940',
  'Minnesota Vikings': '134941',
  
  // NFC South
  'Atlanta Falcons': '134942',
  'Carolina Panthers': '134943',
  'New Orleans Saints': '134944',
  'Tampa Bay Buccaneers': '134945',
  
  // NFC West
  'Arizona Cardinals': '134946',
  'Los Angeles Rams': '135909',
  'San Francisco 49ers': '134948',
  'Seattle Seahawks': '134949'
};

// Reverse mapping for quick ID to name lookup
const teamIdToName = {};
for (const [name, id] of Object.entries(nflTeamMappings)) {
  teamIdToName[id] = name;
}

// Alternative team name mappings
const alternativeNames = {
  'Las Vegas Raiders': ['Oakland Raiders', 'Raiders'],
  'Los Angeles Chargers': ['San Diego Chargers', 'Chargers'],
  'Los Angeles Rams': ['St. Louis Rams', 'Rams'],
  'Washington Commanders': ['Washington Redskins', 'Washington Football Team', 'Commanders'],
  'Tampa Bay Buccaneers': ['Tampa Bay Bucs', 'Buccaneers', 'Bucs'],
  'San Francisco 49ers': ['49ers', 'Niners']
};

/**
 * Get team ID by name (handles alternative names)
 * @param {string} teamName - Team name to look up
 * @returns {string|null} Team ID or null if not found
 */
function getTeamId(teamName) {
  // Direct match
  if (nflTeamMappings[teamName]) {
    return nflTeamMappings[teamName];
  }
  
  // Check alternative names
  for (const [official, alternatives] of Object.entries(alternativeNames)) {
    if (alternatives.includes(teamName)) {
      return nflTeamMappings[official];
    }
  }
  
  // Case-insensitive search
  for (const [name, id] of Object.entries(nflTeamMappings)) {
    if (name.toLowerCase() === teamName.toLowerCase()) {
      return id;
    }
  }
  
  return null;
}

/**
 * Get team name by ID
 * @param {string} teamId - Team ID to look up
 * @returns {string|null} Team name or null if not found
 */
function getTeamName(teamId) {
  return teamIdToName[teamId] || null;
}

/**
 * Check if a team exists in our mappings
 * @param {string} teamName - Team name to check
 * @returns {boolean} True if team exists
 */
function teamExists(teamName) {
  return getTeamId(teamName) !== null;
}

/**
 * Get all team IDs
 * @returns {Array<string>} Array of all team IDs
 */
function getAllTeamIds() {
  return Object.values(nflTeamMappings);
}

/**
 * Get all team names
 * @returns {Array<string>} Array of all team names
 */
function getAllTeamNames() {
  return Object.keys(nflTeamMappings);
}

module.exports = {
  nflTeamMappings,
  teamIdToName,
  alternativeNames,
  getTeamId,
  getTeamName,
  teamExists,
  getAllTeamIds,
  getAllTeamNames
};