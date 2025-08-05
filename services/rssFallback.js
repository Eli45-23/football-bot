const RSSParser = require('rss-parser');
const { setCache, getCache, CacheKeys } = require('../lib/cache');

/**
 * RSS Fallback Service
 * Fetches and filters NFL news from RSS feeds when primary API fails
 */

const parser = new RSSParser({
  timeout: 10000, // 10 second timeout
  headers: {
    'User-Agent': 'NFL-Discord-Bot/1.0.0'
  }
});

/**
 * Normalize team names to include common aliases
 * @param {string} name - Team name to normalize
 * @returns {Array<string>} Array of possible team name variations
 */
function normalizeTeamAliases(name) {
  const n = name.toLowerCase().trim();
  
  // NFL team aliases mapping
  const aliases = {
    'jets': ['jets', 'new york jets', 'ny jets', 'nyj'],
    'giants': ['giants', 'new york giants', 'ny giants', 'nyg'],
    'eagles': ['eagles', 'philadelphia eagles', 'philly eagles', 'phi'],
    'cowboys': ['cowboys', 'dallas cowboys', 'dal'],
    'patriots': ['patriots', 'new england patriots', 'pats', 'ne'],
    'steelers': ['steelers', 'pittsburgh steelers', 'pit'],
    'packers': ['packers', 'green bay packers', 'gb'],
    'bears': ['bears', 'chicago bears', 'chi'],
    'lions': ['lions', 'detroit lions', 'det'],
    'vikings': ['vikings', 'minnesota vikings', 'min'],
    'saints': ['saints', 'new orleans saints', 'no'],
    'falcons': ['falcons', 'atlanta falcons', 'atl'],
    'panthers': ['panthers', 'carolina panthers', 'car'],
    'buccaneers': ['buccaneers', 'bucs', 'tampa bay buccaneers', 'tb'],
    'rams': ['rams', 'los angeles rams', 'la rams', 'lar'],
    'seahawks': ['seahawks', 'seattle seahawks', 'sea'],
    'cardinals': ['cardinals', 'arizona cardinals', 'az', 'ari'],
    '49ers': ['49ers', 'niners', 'san francisco 49ers', 'sf'],
    'chiefs': ['chiefs', 'kansas city chiefs', 'kc'],
    'raiders': ['raiders', 'las vegas raiders', 'lv'],
    'chargers': ['chargers', 'los angeles chargers', 'lac'],
    'broncos': ['broncos', 'denver broncos', 'den'],
    'bills': ['bills', 'buffalo bills', 'buf'],
    'dolphins': ['dolphins', 'miami dolphins', 'mia'],
    'titans': ['titans', 'tennessee titans', 'ten'],
    'colts': ['colts', 'indianapolis colts', 'ind'],
    'jaguars': ['jaguars', 'jags', 'jacksonville jaguars', 'jax'],
    'texans': ['texans', 'houston texans', 'hou'],
    'ravens': ['ravens', 'baltimore ravens', 'bal'],
    'bengals': ['bengals', 'cincinnati bengals', 'cin'],
    'browns': ['browns', 'cleveland browns', 'cle'],
    'commanders': ['commanders', 'washington commanders', 'was']
  };

  // Find matching aliases
  for (const [key, teamAliases] of Object.entries(aliases)) {
    if (teamAliases.some(alias => n.includes(alias))) {
      return teamAliases;
    }
  }

  // Return original name if no aliases found
  return [n];
}

/**
 * Fetch and parse RSS feeds from configured sources
 * @returns {Promise<Array>} Array of news items
 */
async function fetchAllFeeds() {
  const defaultFeeds = [
    'https://www.espn.com/espn/rss/nfl/news',
    'https://profootballtalk.nbcsports.com/feed/',
    'https://www.cbssports.com/rss/headlines/nfl/',
    'https://www.nfl.com/feeds/rss/news',
    'https://bleacherreport.com/nfl.rss',
    'https://www.si.com/rss/si_topstories.rss'
  ];
  
  const feedUrls = (process.env.FALLBACK_FEEDS || defaultFeeds.join(','))
    .split(',')
    .map(url => url.trim())
    .filter(Boolean);

  console.log(`📡 Fetching ${feedUrls.length} RSS feeds for fallback data...`);

  const allItems = [];
  
  for (const feedUrl of feedUrls) {
    try {
      // Check cache first
      const cacheKey = CacheKeys.rssFeeds(feedUrl);
      const cached = await getCache(cacheKey);
      
      if (cached) {
        console.log(`💾 Using cached RSS data for: ${feedUrl}`);
        allItems.push(...cached);
        continue;
      }

      // Fetch fresh RSS data
      console.log(`🌐 Fetching RSS: ${feedUrl}`);
      const feed = await parser.parseURL(feedUrl);
      
      if (feed?.items?.length) {
        const items = feed.items.map(item => ({
          title: item.title || '',
          link: item.link || '',
          contentSnippet: item.contentSnippet || item.content || item.description || '',
          isoDate: item.isoDate || item.pubDate,
          source: feedUrl,
          guid: item.guid || item.link
        })).slice(0, 20); // Limit per feed

        // Cache the results for 10 minutes
        await setCache(cacheKey, items, 10);
        allItems.push(...items);
        
        console.log(`✅ Fetched ${items.length} items from RSS: ${feedUrl}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to fetch RSS feed ${feedUrl}:`, error.message);
      // Continue with other feeds
    }
  }

  return allItems;
}

/**
 * Fetch fallback news for a specific team or player
 * @param {string} teamOrPlayer - Team or player name to search for
 * @returns {Promise<Array>} Filtered and deduplicated news items
 */
async function fetchFallbackNews(teamOrPlayer) {
  try {
    console.log(`🔍 Searching RSS fallback news for: "${teamOrPlayer}"`);
    
    // Check cache first
    const cacheKey = CacheKeys.teamNews(teamOrPlayer);
    const cached = await getCache(cacheKey);
    
    if (cached) {
      console.log(`💾 Using cached fallback news for: ${teamOrPlayer}`);
      return cached;
    }

    // Fetch all RSS items
    const allItems = await fetchAllFeeds();
    
    if (allItems.length === 0) {
      console.warn('⚠️ No RSS items fetched from any feed');
      return [];
    }

    // Generate search aliases
    const aliases = normalizeTeamAliases(teamOrPlayer);
    console.log(`🔍 Searching with aliases: ${aliases.join(', ')}`);

    // Filter items by relevance
    const filtered = allItems.filter(item => {
      const searchText = `${item.title} ${item.contentSnippet}`.toLowerCase();
      
      // Check for team/player mentions
      const hasTeamMatch = aliases.some(alias => searchText.includes(alias));
      const hasPlayerMatch = searchText.includes(teamOrPlayer.toLowerCase());
      
      return hasTeamMatch || hasPlayerMatch;
    });

    // Remove duplicates by title
    const seen = new Set();
    const deduped = filtered.filter(item => {
      if (!item.title || seen.has(item.title)) {
        return false;
      }
      seen.add(item.title);
      return true;
    });

    // Sort by date (most recent first)
    const sorted = deduped.sort((a, b) => {
      const dateA = a.isoDate ? new Date(a.isoDate) : new Date(0);
      const dateB = b.isoDate ? new Date(b.isoDate) : new Date(0);
      return dateB - dateA;
    });

    // Limit results
    const limited = sorted.slice(0, 12);
    
    console.log(`✅ Found ${limited.length} relevant RSS items for: ${teamOrPlayer}`);

    // Cache results for 15 minutes
    await setCache(cacheKey, limited, 15);
    
    return limited;

  } catch (error) {
    console.error(`❌ Error fetching fallback news for ${teamOrPlayer}:`, error.message);
    return [];
  }
}

/**
 * Get a preview of available RSS feeds and their status
 * @returns {Promise<Array>} Feed status information
 */
async function getFeedStatus() {
  const feedUrls = (process.env.FALLBACK_FEEDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const status = [];

  for (const feedUrl of feedUrls) {
    try {
      const feed = await parser.parseURL(feedUrl);
      status.push({
        url: feedUrl,
        title: feed.title || 'Unknown',
        itemCount: feed.items?.length || 0,
        lastUpdated: feed.lastBuildDate || feed.pubDate,
        status: 'active'
      });
    } catch (error) {
      status.push({
        url: feedUrl,
        title: 'Failed to fetch',
        itemCount: 0,
        lastUpdated: null,
        status: 'error',
        error: error.message
      });
    }
  }

  return status;
}

module.exports = {
  fetchFallbackNews,
  fetchAllFeeds,
  getFeedStatus,
  normalizeTeamAliases
};