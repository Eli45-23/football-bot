const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { readdirSync } = require('fs');
const { join } = require('path');
const cron = require('node-cron');
const config = require('./config');
const ButtonHandler = require('./utils/buttonHandler');
const NFLUpdatesService = require('./services/nflUpdates');

class NFLBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ]
    });

    this.client.commands = new Collection();
    this.setupEventHandlers();
    this.loadCommands();
  }

  setupEventHandlers() {
    this.client.once('ready', () => {
      console.log(`✅ Bot ready! Logged in as ${this.client.user.tag}`);
      console.log(`🏈 Monitoring ${config.nfl.teams.length} NFL teams`);
      console.log(`📅 Daily updates scheduled for: ${config.nfl.cronSchedule}`);
      
      this.setupCronJob();
      this.client.user.setActivity('NFL Updates | /team /player', { type: 'WATCHING' });
    });

    this.client.on('interactionCreate', async interaction => {
      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      }
    });

    this.client.on('error', error => {
      console.error('❌ Discord client error:', error);
    });

    process.on('unhandledRejection', error => {
      console.error('❌ Unhandled promise rejection:', error);
    });
  }

  loadCommands() {
    const commandsPath = join(__dirname, 'commands');
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const command = require(filePath);
      
      if ('data' in command && 'execute' in command) {
        this.client.commands.set(command.data.name, command);
        console.log(`📝 Loaded command: ${command.data.name}`);
      } else {
        console.warn(`⚠️ Command at ${filePath} is missing required "data" or "execute" property`);
      }
    }
  }

  async handleSlashCommand(interaction) {
    const command = this.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`❌ Command ${interaction.commandName} not found`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error executing command ${interaction.commandName}:`, error);
      
      const errorMessage = '❌ An error occurred while executing this command.';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  async handleButtonInteraction(interaction) {
    try {
      const handled = await ButtonHandler.handleTeamButtons(interaction) ||
                     await ButtonHandler.handlePlayerButtons(interaction);
      
      if (!handled) {
        await interaction.reply({ 
          content: '❌ Unknown button interaction.', 
          ephemeral: true 
        });
      }
    } catch (error) {
      console.error('❌ Error handling button interaction:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: '❌ An error occurred processing your request.', 
          ephemeral: true 
        });
      }
    }
  }

  setupCronJob() {
    const updatesService = new NFLUpdatesService(this.client);

    cron.schedule(config.nfl.cronSchedule, async () => {
      console.log('⏰ Running scheduled NFL daily update...');
      await updatesService.postDailyUpdate();
    }, {
      timezone: 'America/New_York'
    });

    console.log(`⏰ Cron job scheduled: ${config.nfl.cronSchedule} (EST)`);

    if (process.env.NODE_ENV === 'development') {
      console.log('🧪 Development mode: Use "npm run test-update" to test updates manually');
    }
  }

  async start() {
    try {
      await this.client.login(config.discord.token);
    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    console.log('🔄 Shutting down bot...');
    await this.client.destroy();
    process.exit(0);
  }
}

const bot = new NFLBot();

process.on('SIGINT', () => bot.shutdown());
process.on('SIGTERM', () => bot.shutdown());

if (process.argv[2] === 'test-update') {
  const NFLUpdatesService = require('./services/nflUpdates');
  const updatesService = new NFLUpdatesService(null);
  updatesService.testUpdate().then(() => process.exit(0));
} else {
  bot.start();
}