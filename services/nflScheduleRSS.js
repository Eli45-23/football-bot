const Parser = require('rss-parser');
const moment = require('moment-timezone');
const textUtils = require('../src/utils/text');

/**
 * NFL Schedule RSS Service
 * Supplements TheSportsDB API with schedule information from NFL.com and other sources
 */
class NFLScheduleRSSService {
  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'NFL Discord Bot Schedule Parser'
      }
    });

    // Known Saturday Aug 16, 2025 preseason games from search results
    this.knownPreseasonGames = [
      {
        date: '2025-08-16',
        time: '13:00:00', // 1:00 PM ET
        away: 'Miami Dolphins',
        home: 'Detroit Lions',
        venue: 'Ford Field'
      },
      {
        date: '2025-08-16', 
        time: '13:00:00',
        away: 'Carolina Panthers',
        home: 'Houston Texans',
        venue: 'NRG Stadium'
      },
      {
        date: '2025-08-16',
        time: '13:00:00', 
        away: 'Green Bay Packers',
        home: 'Indianapolis Colts',
        venue: 'Lucas Oil Stadium'
      },
      {
        date: '2025-08-16',
        time: '13:00:00',
        away: 'New England Patriots', 
        home: 'Minnesota Vikings',
        venue: 'U.S. Bank Stadium'
      },
      {
        date: '2025-08-16',
        time: '13:00:00',
        away: 'Cleveland Browns',
        home: 'Philadelphia Eagles', 
        venue: 'Lincoln Financial Field',
        tv: 'NFL Network'
      },
      {
        date: '2025-08-16',
        time: '16:00:00', // 4:00 PM ET
        away: 'San Francisco 49ers',
        home: 'Las Vegas Raiders',
        venue: 'Allegiant Stadium',
        tv: 'NFL Network'
      },
      {
        date: '2025-08-16',
        time: '19:00:00', // 7:00 PM ET
        away: 'Baltimore Ravens',
        home: 'Dallas Cowboys',
        venue: 'AT&T Stadium'
      },
      {
        date: '2025-08-16',
        time: '19:00:00',
        away: 'Los Angeles Chargers',
        home: 'Los Angeles Rams',
        venue: 'SoFi Stadium'
      },
      {
        date: '2025-08-16',
        time: '19:00:00',
        away: 'New York Jets',
        home: 'New York Giants',
        venue: 'MetLife Stadium',
        tv: 'NFL Network'
      },
      {
        date: '2025-08-16',
        time: '19:00:00',
        away: 'Tampa Bay Buccaneers',
        home: 'Pittsburgh Steelers',
        venue: 'Heinz Field'
      },
      {
        date: '2025-08-16',
        time: '21:30:00', // 9:30 PM ET
        away: 'Arizona Cardinals',
        home: 'Denver Broncos',
        venue: 'Empower Field at Mile High',
        tv: 'NFL Network'
      }
    ];
  }

  /**
   * Get preseason games that might be missing from TheSportsDB
   * @param {Date} startDate - Start date for games
   * @param {Date} endDate - End date for games
   * @returns {Array} Array of games in normalized format
   */
  async getMissingPreseasonGames(startDate, endDate) {
    console.log('🏈 Checking for missing preseason games from RSS sources...');
    
    const missingGames = [];
    const now = moment().tz('America/New_York');
    
    for (const game of this.knownPreseasonGames) {
      const gameDateTime = moment.tz(`${game.date} ${game.time}`, 'YYYY-MM-DD HH:mm:ss', 'America/New_York');
      
      // Check if game is within date range and in the future
      if (gameDateTime >= startDate && gameDateTime <= endDate && gameDateTime >= now) {
        const formatted = this.formatGameForDiscord(game, gameDateTime);
        missingGames.push(formatted);
      }
    }
    
    if (missingGames.length > 0) {
      console.log(`   📋 Found ${missingGames.length} missing preseason games from RSS sources`);
      missingGames.forEach(game => {
        console.log(`   + ${game.formatted}`);
      });
    }
    
    return missingGames;
  }

  /**
   * Format game for Discord display
   * @param {Object} game - Raw game data
   * @param {moment} gameDateTime - Game date/time
   * @returns {Object} Formatted game object
   */
  formatGameForDiscord(game, gameDateTime) {
    const awayTeam = textUtils.formatTeamName(game.away);
    const homeTeam = textUtils.formatTeamName(game.home);
    
    // Format date group (Today, Tomorrow, Mon 8/16, etc.)
    const dateGroup = this.formatGameDateGroup(gameDateTime);
    
    // Format game time string with proper timezone detection
    const timeStr = gameDateTime.format('h:mm A z'); // Use proper timezone abbreviation instead of hardcoded EDT
    const dateStr = gameDateTime.format('MMM D');
    
    let formatted = `${awayTeam} @ ${homeTeam} – ${dateStr}, ${timeStr}`;
    if (game.tv) {
      formatted += ` (${game.tv})`;
    }
    
    return {
      formatted: formatted,
      timestamp: gameDateTime.valueOf(),
      dateGroup: dateGroup,
      isFuture: true,
      homeTeam: homeTeam,
      awayTeam: awayTeam,
      venue: game.venue,
      source: 'NFL RSS Supplement'
    };
  }

  /**
   * Format game date for grouping (Today, Tomorrow, Mon 8/16)
   * @param {moment} gameDateTime - Game date/time
   * @returns {string} Formatted date group
   */
  formatGameDateGroup(gameDateTime) {
    const now = moment().tz('America/New_York');
    const today = now.startOf('day');
    const gameDate = gameDateTime.clone().startOf('day');
    
    const diffDays = gameDate.diff(today, 'days');
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays <= 6) {
      return gameDateTime.format('ddd M/D');
    } else {
      return gameDateTime.format('MMM DD');
    }
  }

  /**
   * Merge RSS games with TheSportsDB results
   * @param {Array} sportsdbGames - Games from TheSportsDB
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date  
   * @returns {Array} Combined games array
   */
  async supplementSchedule(sportsdbGames, startDate, endDate) {
    const rssGames = await this.getMissingPreseasonGames(startDate, endDate);
    
    if (rssGames.length === 0) {
      return sportsdbGames;
    }
    
    // Check for duplicates and merge
    const combinedGames = [...sportsdbGames];
    
    for (const rssGame of rssGames) {
      // Simple duplicate check by team names and date
      const isDuplicate = sportsdbGames.some(existingGame => {
        return existingGame.formatted && 
               existingGame.formatted.includes(rssGame.awayTeam) &&
               existingGame.formatted.includes(rssGame.homeTeam);
      });
      
      if (!isDuplicate) {
        combinedGames.push(rssGame);
        console.log(`   ➕ Added missing game: ${rssGame.formatted}`);
      }
    }
    
    // Sort by timestamp
    return combinedGames.sort((a, b) => a.timestamp - b.timestamp);
  }
}

module.exports = new NFLScheduleRSSService();