/**
 * Manual Team Overrides for Edge Cases
 * Used when automated team extraction fails or is incorrect
 * Especially useful for recent trades, rookies, or ambiguous cases
 */

const manualTeamOverrides = {
  // Recent trades or signings that might be outdated in other systems
  'jonathan mingo': 'CAR', // WR - Carolina Panthers (NOT Baltimore Ravens as incorrectly shown)
  'calvin ridley': 'TEN', // WR - Tennessee Titans (traded from Jacksonville)
  'davante adams': 'LV',  // WR - Las Vegas Raiders (traded from Green Bay)
  'russell wilson': 'PIT', // QB - Pittsburgh Steelers (signed after Denver release)
  'kirk cousins': 'ATL',  // QB - Atlanta Falcons (signed from Minnesota)
  'saquon barkley': 'PHI', // RB - Philadelphia Eagles (signed from Giants)
  'calvin ridley': 'TEN',  // WR - Tennessee Titans
  
  // Rookies and recent signings that might not be in standard mappings
  'caleb williams': 'CHI', // QB - Chicago Bears (2024 #1 draft pick)
  'jayden daniels': 'WAS', // QB - Washington Commanders (2024 #2 draft pick)
  'drake maye': 'NE',     // QB - New England Patriots (2024 #3 draft pick)
  'marvin harrison jr': 'ARI', // WR - Arizona Cardinals (2024 #4 draft pick)
  'joe alt': 'LAC',       // OT - Los Angeles Chargers (2024 #5 draft pick)
  'malik nabers': 'NYG',  // WR - New York Giants (2024 #6 draft pick)
  'rome odunze': 'CHI',   // WR - Chicago Bears (2024 #9 draft pick)
  'bo nix': 'DEN',        // QB - Denver Broncos (2024 draft pick)
  
  // Players with common name conflicts or ambiguity
  'josh allen': 'BUF',    // QB - Buffalo Bills (not Jaguars LB)
  'mike evans': 'TB',     // WR - Tampa Bay Buccaneers
  'dk metcalf': 'SEA',    // WR - Seattle Seahawks
  'cooper kupp': 'LAR',   // WR - Los Angeles Rams
  
  // International/practice squad players that might be missed
  'louis rees-zammit': 'KC', // RB/WR - Kansas City Chiefs (rugby convert)
  
  // Players returning from injury who might have outdated info
  'aaron rodgers': 'NYJ', // QB - New York Jets
  'nick chubb': 'CLE',    // RB - Cleveland Browns
  'joe burrow': 'CIN',    // QB - Cincinnati Bengals
  
  // Common ESPN formatting edge cases (names with special characters)
  'tua tagovailoa': 'MIA',
  'mekhi wingo': 'LSU', // College player sometimes shown
  'dj moore': 'CHI',    // WR - Chicago Bears (traded from Carolina)
  
  // Players with Jr./Sr./III that might cause matching issues
  'ken walker iii': 'SEA',
  'derwin james jr': 'LAC',
  'frank clark': 'SEA',
  
  // Recently cut/signed players (update as needed)
  'leonard fournette': 'FA', // Free agent
  'odell beckham jr': 'MIA', // Current team
};

/**
 * Get manual team override for a player
 * @param {string} playerName - Player's name
 * @returns {string|null} Team abbreviation or null if no override
 */
function getManualTeamOverride(playerName) {
  if (!playerName) return null;
  
  const normalizedName = playerName.toLowerCase().trim();
  
  // Direct lookup
  if (manualTeamOverrides[normalizedName]) {
    console.log(`   🔧 MANUAL OVERRIDE: "${playerName}" → ${manualTeamOverrides[normalizedName]}`);
    return manualTeamOverrides[normalizedName];
  }
  
  // Partial matching for names with suffixes
  for (const [overrideName, team] of Object.entries(manualTeamOverrides)) {
    if (normalizedName.includes(overrideName) || overrideName.includes(normalizedName.split(' ')[0])) {
      console.log(`   🔧 MANUAL OVERRIDE (partial): "${playerName}" → ${team}`);
      return team;
    }
  }
  
  return null;
}

/**
 * Add a manual override (useful for dynamic updates)
 * @param {string} playerName - Player's name
 * @param {string} teamAbbr - Team abbreviation
 */
function addManualOverride(playerName, teamAbbr) {
  if (!playerName || !teamAbbr) return;
  
  const normalizedName = playerName.toLowerCase().trim();
  manualTeamOverrides[normalizedName] = teamAbbr.toUpperCase();
  console.log(`   ✅ MANUAL OVERRIDE ADDED: "${playerName}" → ${teamAbbr}`);
}

module.exports = {
  getManualTeamOverride,
  addManualOverride,
  getAllOverrides: () => manualTeamOverrides
};