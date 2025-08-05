const axios = require('axios');
const config = require('../config');

class SportsDBService {
  constructor() {
    this.baseUrl = config.sportsDb.baseUrl;
    this.apiKey = config.sportsDb.apiKey;
  }

  async searchTeam(teamName) {
    try {
      const response = await axios.get(`${this.baseUrl}/searchteams.php`, {
        params: { t: teamName }
      });
      
      if (response.data && response.data.teams && response.data.teams.length > 0) {
        return response.data.teams.find(team => 
          team.strSport === 'American Football' && team.strLeague === 'NFL'
        );
      }
      return null;
    } catch (error) {
      console.error(`Error searching for team ${teamName}:`, error.message);
      return null;
    }
  }

  async getTeamNextEvents(teamId) {
    try {
      const response = await axios.get(`${this.baseUrl}/eventsnext.php`, {
        params: { id: teamId }
      });
      return response.data?.events || [];
    } catch (error) {
      console.error(`Error getting next events for team ${teamId}:`, error.message);
      return [];
    }
  }

  async getTeamLastEvents(teamId) {
    try {
      const response = await axios.get(`${this.baseUrl}/eventslast.php`, {
        params: { id: teamId }
      });
      return response.data?.results || [];
    } catch (error) {
      console.error(`Error getting last events for team ${teamId}:`, error.message);
      return [];
    }
  }

  async getEventTimeline(eventId) {
    try {
      const response = await axios.get(`${this.baseUrl}/lookuptimeline.php`, {
        params: { id: eventId }
      });
      return response.data?.timeline || [];
    } catch (error) {
      console.error(`Error getting timeline for event ${eventId}:`, error.message);
      return [];
    }
  }

  async getTeamPlayers(teamId) {
    try {
      const response = await axios.get(`${this.baseUrl}/lookup_all_players.php`, {
        params: { id: teamId }
      });
      return response.data?.player || [];
    } catch (error) {
      console.error(`Error getting players for team ${teamId}:`, error.message);
      return [];
    }
  }

  async getPlayerDetails(playerId) {
    try {
      const response = await axios.get(`${this.baseUrl}/lookupplayer.php`, {
        params: { id: playerId }
      });
      return response.data?.players?.[0] || null;
    } catch (error) {
      console.error(`Error getting player details for ${playerId}:`, error.message);
      return null;
    }
  }

  async searchPlayer(playerName) {
    try {
      const response = await axios.get(`${this.baseUrl}/searchplayers.php`, {
        params: { p: playerName }
      });
      
      if (response.data?.player) {
        return response.data.player.filter(player => 
          player.strSport === 'American Football' && player.strTeam
        );
      }
      return [];
    } catch (error) {
      console.error(`Error searching for player ${playerName}:`, error.message);
      return [];
    }
  }

  async getPlayerContracts(playerId) {
    try {
      const response = await axios.get(`${this.baseUrl}/lookupcontracts.php`, {
        params: { id: playerId }
      });
      return response.data?.contracts || [];
    } catch (error) {
      console.error(`Error getting contracts for player ${playerId}:`, error.message);
      return [];
    }
  }

  async getPlayerMilestones(playerId) {
    try {
      const response = await axios.get(`${this.baseUrl}/lookupmilestones.php`, {
        params: { id: playerId }
      });
      return response.data?.milestones || [];
    } catch (error) {
      console.error(`Error getting milestones for player ${playerId}:`, error.message);
      return [];
    }
  }

  async getPlayerFormerTeams(playerId) {
    try {
      const response = await axios.get(`${this.baseUrl}/lookupformerteams.php`, {
        params: { id: playerId }
      });
      return response.data?.formerteams || [];
    } catch (error) {
      console.error(`Error getting former teams for player ${playerId}:`, error.message);
      return [];
    }
  }

  async getPlayerResults(playerId) {
    try {
      const response = await axios.get(`${this.baseUrl}/playerresults.php`, {
        params: { id: playerId }
      });
      return response.data?.results || [];
    } catch (error) {
      console.error(`Error getting results for player ${playerId}:`, error.message);
      return [];
    }
  }

  formatPlayerInfo(player) {
    return {
      id: player.idPlayer,
      name: player.strPlayer,
      position: player.strPosition,
      team: player.strTeam,
      nationality: player.strNationality,
      birthDate: player.dateBorn,
      height: player.strHeight,
      weight: player.strWeight,
      description: player.strDescriptionEN,
      image: player.strThumb || player.strCutout,
      fanart: player.strFanart1
    };
  }

  formatTeamInfo(team) {
    return {
      id: team.idTeam,
      name: team.strTeam,
      league: team.strLeague,
      founded: team.intFormedYear,
      stadium: team.strStadium,
      location: team.strStadiumLocation,
      description: team.strDescriptionEN,
      logo: team.strTeamLogo,
      badge: team.strTeamBadge,
      jersey: team.strTeamJersey,
      fanart: team.strTeamFanart1
    };
  }
}

module.exports = new SportsDBService();