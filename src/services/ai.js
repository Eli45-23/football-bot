const { OpenAI } = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');
const config = require('../config');

class AIService {
  constructor() {
    this.provider = config.ai.provider;
    
    if (this.provider === 'openai') {
      this.openai = new OpenAI({
        apiKey: config.ai.openai.apiKey
      });
    } else if (this.provider === 'anthropic') {
      this.anthropic = new Anthropic({
        apiKey: config.ai.anthropic.apiKey
      });
    }
  }

  async summarizeTimeline(teamName, timelineData) {
    const prompt = `You are an NFL news summarizer. Given the following timeline data for ${teamName}, create a concise, plain-English summary of any important injury updates, performance notes, or roster changes. Focus on player-specific information that fantasy football players and NFL fans would care about.

Timeline data:
${JSON.stringify(timelineData, null, 2)}

Instructions:
- Only include relevant injury, performance, or roster information
- Use player names and be specific about injuries or status changes
- Keep each update to 1-2 sentences maximum
- If there's no relevant information, return "No significant updates"
- Format as bullet points starting with player name and position if available

Example format:
- **QB Aaron Rodgers**: Left practice early with calf strain. Status TBD.
- **WR Jalin Hyatt**: Will play Week 1 after recovering from minor hamstring.`;

    try {
      if (this.provider === 'openai') {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.3
        });
        
        return response.choices[0]?.message?.content?.trim() || 'No updates available';
      } else if (this.provider === 'anthropic') {
        const response = await this.anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 300,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }]
        });
        
        return response.content[0]?.text?.trim() || 'No updates available';
      }
    } catch (error) {
      console.error(`Error generating AI summary for ${teamName}:`, error.message);
      return `Unable to generate summary for ${teamName} - API error`;
    }
  }

  async summarizePlayerProfile(playerData) {
    const prompt = `Create a concise, engaging summary of this NFL player's profile. Focus on key career highlights, current status, and interesting facts that fans would want to know.

Player data:
${JSON.stringify(playerData, null, 2)}

Keep the summary to 2-3 sentences and make it informative but conversational.`;

    try {
      if (this.provider === 'openai') {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.4
        });
        
        return response.choices[0]?.message?.content?.trim() || 'Profile summary unavailable';
      } else if (this.provider === 'anthropic') {
        const response = await this.anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 150,
          temperature: 0.4,
          messages: [{ role: 'user', content: prompt }]
        });
        
        return response.content[0]?.text?.trim() || 'Profile summary unavailable';
      }
    } catch (error) {
      console.error('Error generating player profile summary:', error.message);
      return 'Profile summary unavailable - API error';
    }
  }

  async generateTeamRosterSummary(players, teamName) {
    const prompt = `Create a brief overview of the ${teamName} roster based on this player data. Highlight key players, notable positions, and any interesting roster facts.

Player data (first 10 players):
${JSON.stringify(players.slice(0, 10), null, 2)}

Keep it to 2-3 sentences focusing on star players and team strengths.`;

    try {
      if (this.provider === 'openai') {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.4
        });
        
        return response.choices[0]?.message?.content?.trim() || `${teamName} roster information`;
      } else if (this.provider === 'anthropic') {
        const response = await this.anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 150,
          temperature: 0.4,
          messages: [{ role: 'user', content: prompt }]
        });
        
        return response.content[0]?.text?.trim() || `${teamName} roster information`;
      }
    } catch (error) {
      console.error('Error generating roster summary:', error.message);
      return `${teamName} active roster`;
    }
  }
}

module.exports = new AIService();