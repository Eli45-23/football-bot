/**
 * Player-to-Team Mapping Service
 * Fallback when ESPN injury table doesn't include team information
 * Uses 2024-2025 NFL roster data for accurate team assignments
 */

class PlayerTeamMappingService {
  constructor() {
    // 2024-2025 NFL player-to-team mapping (key players and recent roster changes)
    this.playerTeamMap = {
      // Cardinals
      'kyler murray': 'ARI', 'james conner': 'ARI', 'marvin harrison jr': 'ARI',
      'budda baker': 'ARI', 'zaven collins': 'ARI', 'paris johnson jr': 'ARI',
      'hayden conner': 'ARI',
      
      // Falcons  
      'kirk cousins': 'ATL', 'bijan robinson': 'ATL', 'drake london': 'ATL',
      'kyle pitts': 'ATL', 'grady jarrett': 'ATL', 'jessie bates iii': 'ATL',
      
      // Ravens
      'lamar jackson': 'BAL', 'derrick henry': 'BAL', 'mark andrews': 'BAL',
      'roquan smith': 'BAL', 'justin tucker': 'BAL', 'ronnie stanley': 'BAL',
      'jonathan mingo': 'CAR', // Fix the incorrect BAL mapping from screenshot
      
      // Bills
      'josh allen': 'BUF', 'stefon diggs': 'BUF', 'von miller': 'BUF',
      'matt milano': 'BUF', 'taron johnson': 'BUF', 'dawson knox': 'BUF',
      
      // Panthers  
      'bryce young': 'CAR', 'christian mccaffrey': 'CAR', 'brian burns': 'CAR',
      'derrick brown': 'CAR', 'dj moore': 'CAR', 'adam thielen': 'CAR',
      
      // Bears
      'caleb williams': 'CHI', 'dj moore': 'CHI', 'rome odunze': 'CHI',
      'montez sweat': 'CHI', 'tj edwards': 'CHI', 'keenan allen': 'CHI',
      'roschon johnson': 'CHI', 'doug kramer jr': 'CHI', 'case keenum': 'CHI',
      'te\'cory couch': 'CHI', 'tyrone wheatley jr': 'CHI',
      
      // Bengals
      'joe burrow': 'CIN', 'ja\'marr chase': 'CIN', 'tee higgins': 'CIN',
      'joe mixon': 'CIN', 'trey hendrickson': 'CIN', 'logan wilson': 'CIN',
      
      // Browns
      'deshaun watson': 'CLE', 'nick chubb': 'CLE', 'amari cooper': 'CLE',
      'myles garrett': 'CLE', 'denzel ward': 'CLE', 'joel bitonio': 'CLE',
      
      // Cowboys
      'dak prescott': 'DAL', 'ceedee lamb': 'DAL', 'ezekiel elliott': 'DAL',
      'trevon diggs': 'DAL', 'micah parsons': 'DAL', 'daron bland': 'DAL',
      
      // Broncos
      'bo nix': 'DEN', 'courtland sutton': 'DEN', 'jerry jeudy': 'DEN',
      'patrick surtain ii': 'DEN', 'bradley chubb': 'DEN', 'russell wilson': 'DEN',
      'garret wallow': 'DEN',
      
      // Lions
      'jared goff': 'DET', 'amon-ra st brown': 'DET', 'jameson williams': 'DET',
      'aidan hutchinson': 'DET', 'alex anzalone': 'DET', 'penei sewell': 'DET',
      
      // Packers
      'jordan love': 'GB', 'aaron jones': 'GB', 'davante adams': 'GB',
      'jaire alexander': 'GB', 'rashan gary': 'GB', 'kenny clark': 'GB',
      
      // Texans
      'cj stroud': 'HOU', 'stefon diggs': 'HOU', 'nico collins': 'HOU',
      'will anderson jr': 'HOU', 'derek stingley jr': 'HOU', 'laremy tunsil': 'HOU',
      
      // Colts
      'anthony richardson': 'IND', 'jonathan taylor': 'IND', 'michael pittman jr': 'IND',
      'deforest buckner': 'IND', 'darius leonard': 'IND', 'quenton nelson': 'IND',
      
      // Jaguars
      'trevor lawrence': 'JAX', 'calvin ridley': 'JAX', 'christian kirk': 'JAX',
      'josh allen': 'JAX', 'travon walker': 'JAX', 'myles jack': 'JAX',
      
      // Chiefs
      'patrick mahomes': 'KC', 'travis kelce': 'KC', 'tyreek hill': 'KC',
      'chris jones': 'KC', 'nick bolton': 'KC', 'l\'jarius sneed': 'KC',
      
      // Raiders
      'derek carr': 'LV', 'davante adams': 'LV', 'josh jacobs': 'LV',
      'maxx crosby': 'LV', 'robert spillane': 'LV', 'kolton miller': 'LV',
      
      // Chargers
      'justin herbert': 'LAC', 'keenan allen': 'LAC', 'austin ekeler': 'LAC',
      'khalil mack': 'LAC', 'derwin james': 'LAC', 'rashawn slater': 'LAC',
      
      // Rams
      'matthew stafford': 'LAR', 'cooper kupp': 'LAR', 'puka nacua': 'LAR',
      'aaron donald': 'LAR', 'jalen ramsey': 'LAR', 'van jefferson': 'LAR',
      
      // Dolphins
      'tua tagovailoa': 'MIA', 'tyreek hill': 'MIA', 'jaylen waddle': 'MIA',
      'bradley chubb': 'MIA', 'jaelan phillips': 'MIA', 'terron armstead': 'MIA',
      
      // Vikings
      'kirk cousins': 'MIN', 'dalvin cook': 'MIN', 'justin jefferson': 'MIN',
      'danielle hunter': 'MIN', 'harrison smith': 'MIN', 'brian o\'neill': 'MIN',
      
      // Patriots
      'mac jones': 'NE', 'hunter henry': 'NE', 'jakobi meyers': 'NE',
      'matthew judon': 'NE', 'devin mccourty': 'NE', 'mike onwenu': 'NE',
      
      // Saints
      'derek carr': 'NO', 'alvin kamara': 'NO', 'michael thomas': 'NO',
      'cameron jordan': 'NO', 'demario davis': 'NO', 'ryan ramczyk': 'NO',
      'foster moreau': 'NO', 'pete werner': 'NO', 'cam hart': 'NO',
      'lonnie johnson jr': 'NO', 'deneric prince': 'NO',
      
      // Giants
      'daniel jones': 'NYG', 'saquon barkley': 'NYG', 'sterling shepard': 'NYG',
      'dexter lawrence': 'NYG', 'leonard williams': 'NYG', 'andrew thomas': 'NYG',
      'mike edwards': 'NYG', 'c.j. gardner-johnson': 'NYG', 'andrew billings': 'NYG',
      
      // Jets
      'aaron rodgers': 'NYJ', 'breece hall': 'NYJ', 'garrett wilson': 'NYJ',
      'quinnen williams': 'NYJ', 'sauce gardner': 'NYJ', 'mekhi becton': 'NYJ',
      
      // Eagles
      'jalen hurts': 'PHI', 'aj brown': 'PHI', 'devonta smith': 'PHI',
      'fletcher cox': 'PHI', 'darius slay': 'PHI', 'jason kelce': 'PHI',
      
      // Steelers
      'kenny pickett': 'PIT', 'najee harris': 'PIT', 'diontae johnson': 'PIT',
      'tj watt': 'PIT', 'minkah fitzpatrick': 'PIT', 'cam heyward': 'PIT',
      
      // 49ers
      'brock purdy': 'SF', 'christian mccaffrey': 'SF', 'deebo samuel': 'SF',
      'nick bosa': 'SF', 'fred warner': 'SF', 'trent williams': 'SF',
      
      // Seahawks
      'geno smith': 'SEA', 'dk metcalf': 'SEA', 'tyler lockett': 'SEA',
      'bobby wagner': 'SEA', 'jamal adams': 'SEA', 'charles cross': 'SEA',
      
      // Buccaneers
      'tom brady': 'TB', 'mike evans': 'TB', 'chris godwin': 'TB',
      'vita vea': 'TB', 'devin white': 'TB', 'tristan wirfs': 'TB',
      
      // Titans
      'ryan tannehill': 'TEN', 'derrick henry': 'TEN', 'aj brown': 'TEN',
      'jeffery simmons': 'TEN', 'kevin byard': 'TEN', 'taylor lewan': 'TEN',
      
      // Commanders
      'sam howell': 'WAS', 'antonio gibson': 'WAS', 'terry mclaurin': 'WAS',
      'jonathan allen': 'WAS', 'kendall fuller': 'WAS', 'brandon scherff': 'WAS',
      'carlos washington jr': 'WAS',

      // Additional recent additions and rookies (2024)
      'tory horton': 'DEN', // WR - Denver Broncos
      'jacob slade': 'HOU', // DT - Houston Texans  
      'byron cowart': 'HOU', // DT - Houston Texans
      'anthony johnson jr': 'GB', // S - Green Bay Packers
    };
    
    console.log('📋 Player-to-Team mapping service initialized');
  }

  /**
   * Get team abbreviation for a player name
   * @param {string} playerName - Player's full name
   * @returns {string|null} Team abbreviation or null if not found
   */
  getTeamForPlayer(playerName) {
    if (!playerName) return null;
    
    // Normalize the player name (lowercase, trim)
    const normalizedName = playerName.toLowerCase().trim();
    
    // Direct lookup
    if (this.playerTeamMap[normalizedName]) {
      console.log(`   🎯 PLAYER MAPPING: "${playerName}" → ${this.playerTeamMap[normalizedName]}`);
      return this.playerTeamMap[normalizedName];
    }
    
    // Try partial matching for names with suffixes (Jr., III, etc.)
    for (const [mappedName, team] of Object.entries(this.playerTeamMap)) {
      // Check if the player name contains the mapped name (handles "Jr.", "III", etc.)
      if (normalizedName.includes(mappedName) || mappedName.includes(normalizedName.split(' ')[0])) {
        console.log(`   🎯 PLAYER MAPPING (partial): "${playerName}" matched "${mappedName}" → ${team}`);
        return team;
      }
    }
    
    console.log(`   ❌ PLAYER MAPPING: No team found for "${playerName}"`);
    return null;
  }

  /**
   * Add or update a player's team mapping
   * @param {string} playerName - Player's full name
   * @param {string} teamAbbr - Team abbreviation
   */
  addPlayerMapping(playerName, teamAbbr) {
    if (!playerName || !teamAbbr) return;
    
    const normalizedName = playerName.toLowerCase().trim();
    this.playerTeamMap[normalizedName] = teamAbbr.toUpperCase();
    console.log(`   ✅ MAPPING ADDED: "${playerName}" → ${teamAbbr}`);
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      totalMappings: Object.keys(this.playerTeamMap).length,
      lastUpdated: new Date().toISOString()
    };
  }
}

module.exports = new PlayerTeamMappingService();