require('dotenv').config();
const { REST, Routes } = require('discord.js');

const commands = [
  {
    name: 'verify',
    description: 'Verify your VMNC player account',
    options: [
      {
        name: 'username',
        type: 3, // STRING
        description: 'Your in-game username exactly as registered on VMNC website',
        required: true,
      },
    ],
  },
  {
    name: 'stats',
    description: 'View VMNC platform statistics',
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('🔄 Registering slash commands...');

    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands },
    );

    console.log('✅ Slash commands registered successfully!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
