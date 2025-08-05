const { REST, Routes } = require('discord.js');
const { readdirSync } = require('fs');
const { join } = require('path');
const config = require('./config/config');

/**
 * Deploy Discord Slash Commands
 * Registers all slash commands with Discord API
 * Can deploy globally or to specific guild for testing
 */

const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('📝 Loading commands for deployment...');

// Load all command data
for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
    console.log(`   ✅ Loaded: /${command.data.name} - ${command.data.description}`);
  } else {
    console.warn(`   ⚠️  Skipped ${file}: missing 'data' or 'execute' property`);
  }
}

// Create REST instance
const rest = new REST().setToken(config.discord.token);

/**
 * Deploy commands to Discord
 */
async function deployCommands() {
  try {
    console.log(`\n🚀 Starting deployment of ${commands.length} application (/) commands...`);

    let data;
    
    if (config.discord.guildId) {
      // Deploy to specific guild (faster for development)
      console.log(`🎯 Deploying to guild: ${config.discord.guildId}`);
      data = await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );
      console.log(`✅ Successfully deployed ${data.length} guild commands!`);
    } else {
      // Deploy globally (takes up to 1 hour to propagate)
      console.log('🌍 Deploying globally (may take up to 1 hour to propagate)...');
      data = await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      console.log(`✅ Successfully deployed ${data.length} global commands!`);
    }

    // Display deployed commands
    console.log('\n📋 Deployed Commands:');
    data.forEach(cmd => {
      console.log(`   • /${cmd.name} - ${cmd.description}`);
    });

    console.log('\n🎉 Command deployment completed successfully!');
    
    // Instructions
    console.log('\n📖 Next Steps:');
    console.log('   1. Start your bot: npm start');
    console.log('   2. Invite bot to server with application.commands scope');
    console.log('   3. Test commands in your Discord server');
    
    if (!config.discord.guildId) {
      console.log('   4. Global commands may take up to 1 hour to appear');
    }

  } catch (error) {
    console.error('\n❌ Error deploying commands:', error);
    
    if (error.code === 50001) {
      console.error('💡 Missing Access: Bot needs application.commands scope');
    } else if (error.code === 50013) {
      console.error('💡 Missing Permissions: Check bot permissions in server');
    } else if (error.status === 401) {
      console.error('💡 Invalid Token: Check DISCORD_TOKEN in .env file');
    }
    
    process.exit(1);
  }
}

/**
 * Clear all commands (for cleanup)
 */
async function clearCommands() {
  try {
    console.log('🗑️  Clearing all application commands...');
    
    if (config.discord.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: [] }
      );
      console.log('✅ Successfully cleared guild commands');
    } else {
      await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: [] }
      );
      console.log('✅ Successfully cleared global commands');
    }
  } catch (error) {
    console.error('❌ Error clearing commands:', error);
  }
}

// Command line argument handling
const args = process.argv.slice(2);

if (args.includes('--clear') || args.includes('-c')) {
  clearCommands();
} else if (args.includes('--help') || args.includes('-h')) {
  console.log('📖 Discord Command Deployment Script');
  console.log('');
  console.log('Usage:');
  console.log('  node deploy-commands.js          Deploy all commands');
  console.log('  node deploy-commands.js --clear  Clear all commands');
  console.log('  node deploy-commands.js --help   Show this help');
  console.log('');
  console.log('Environment:');
  console.log(`  DISCORD_TOKEN: ${config.discord.token ? '✅ Set' : '❌ Missing'}`);
  console.log(`  DISCORD_CLIENT_ID: ${config.discord.clientId ? '✅ Set' : '❌ Missing'}`);
  console.log(`  DISCORD_GUILD_ID: ${config.discord.guildId ? `✅ ${config.discord.guildId}` : '⚠️  Not set (will deploy globally)'}`);
  console.log('');
  console.log('Commands to deploy:');
  commands.forEach(cmd => {
    console.log(`  • /${cmd.name} - ${cmd.description}`);
  });
} else {
  deployCommands();
}

module.exports = { deployCommands, clearCommands };