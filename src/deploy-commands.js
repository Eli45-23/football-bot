const { REST, Routes } = require('discord.js');
const { readdirSync } = require('fs');
const { join } = require('path');
const config = require('./config');

const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
    console.log(`📝 Loaded command: ${command.data.name}`);
  } else {
    console.warn(`⚠️ Command at ${filePath} is missing required "data" or "execute" property`);
  }
}

const rest = new REST().setToken(config.discord.token);

(async () => {
  try {
    console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

    let data;
    
    if (config.discord.guildId) {
      data = await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );
      console.log(`✅ Successfully reloaded ${data.length} guild application (/) commands.`);
    } else {
      data = await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      console.log(`✅ Successfully reloaded ${data.length} global application (/) commands.`);
    }
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
})();