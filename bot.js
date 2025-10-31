require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } = require('discord.js');
const { MongoClient } = require('mongodb');
const axios = require('axios');

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// MongoDB Connection
let db = null;
async function connectDB() {
  try {
    const mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db("vmnc");
    console.log('✅ Bot connected to MongoDB');
  } catch (error) {
    console.error('❌ Bot MongoDB connection error:', error);
    process.exit(1);
  }
}

// Command collection
client.commands = new Collection();

// Bot ready event
client.once('ready', async () => {
  console.log(`🎮 VMNC Bot logged in as ${client.user.tag}`);
  console.log(`🏠 Connected to ${client.guilds.cache.size} servers`);
  
  await connectDB();
  
  // Set bot status
  client.user.setActivity('VMNC Esports | /verify', { type: 'WATCHING' });
  
  // Log to channel if configured
  if (process.env.LOG_CHANNEL_ID) {
    const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🤖 Bot Started')
        .setDescription(`VMNC Verification Bot is now online!`)
        .addFields(
          { name: 'Server', value: client.guilds.cache.first()?.name || 'Unknown', inline: true },
          { name: 'Members', value: client.guilds.cache.first()?.memberCount.toString() || '0', inline: true },
          { name: 'Uptime', value: '<t:' + Math.floor(Date.now() / 1000) + ':R>', inline: true }
        )
        .setTimestamp();
      
      await logChannel.send({ embeds: [embed] });
    }
  }
});

// Welcome new members
client.on('guildMemberAdd', async (member) => {
  try {
    console.log(`👋 New member joined: ${member.user.tag}`);
    
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🎮 Welcome to VMNC Esports, ${member.user.username}!`)
      .setDescription('We\'re excited to have you in our Valorant Mobile community!')
      .addFields(
        { 
          name: '📋 Get Verified', 
          value: 'Use `/verify` command to link your player profile and access all features!' 
        },
        { 
          name: '🎯 What you get:', 
          value: '• Tournament access\n• Player statistics\n• Team management\n• Exclusive channels' 
        }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: 'VMNC Esports - Valorant Mobile Nepal Championship' })
      .setTimestamp();

    // Try to send welcome message
    try {
      await member.send({ embeds: [welcomeEmbed] });
    } catch (dmError) {
      console.log(`Could not send DM to ${member.user.tag}`);
    }

    // Send to general channel as well
    const generalChannel = member.guild.channels.cache.find(channel => 
      channel.name.includes('general') || channel.name.includes('welcome')
    );

    if (generalChannel) {
      const publicWelcome = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👋 New Member Joined!')
        .setDescription(`Please welcome ${member.user} to VMNC Esports!`)
        .addFields(
          { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Member Count', value: member.guild.memberCount.toString(), inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      await generalChannel.send({ embeds: [publicWelcome] });
    }
  } catch (error) {
    console.error('Welcome message error:', error);
  }
});

// Slash command handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // VERIFY COMMAND
  if (interaction.commandName === 'verify') {
    const inGameUsername = interaction.options.getString('username');
    
    await interaction.deferReply({ ephemeral: true });

    try {
      // Check if user already has verified role
      const verifiedRole = interaction.guild.roles.cache.get(process.env.VERIFIED_ROLE_ID);
      if (interaction.member.roles.cache.has(verifiedRole.id)) {
        return await interaction.editReply({
          content: '❌ You are already verified!'
        });
      }

      // Check if username exists in database
      const players = await db.collection('players').find({}).toArray();
      const player = players.find(p => 
        p.username?.toLowerCase() === inGameUsername.toLowerCase() ||
        p.discord?.toLowerCase() === interaction.user.username.toLowerCase()
      );

      if (!player) {
        return await interaction.editReply({
          content: `❌ Player **"${inGameUsername}"** not found in our database.\n\nPlease make sure:\n• Your username is spelled correctly\n• You are registered on the VMNC website\n• Contact admins if you need help`
        });
      }

      // Create verification request
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🔄 Verification Request')
        .setDescription(`**User:** ${interaction.user.tag}\n**Discord ID:** ${interaction.user.id}`)
        .addFields(
          { name: 'In-Game Username', value: inGameUsername, inline: true },
          { name: 'Player Rank', value: player.rank || 'Not set', inline: true },
          { name: 'Team', value: player.team || 'No team', inline: true },
          { name: 'Joined Server', value: `<t:${Math.floor(interaction.member.joinedTimestamp / 1000)}:R>`, inline: true },
          { name: 'Player Points', value: (player.points || 0).toString(), inline: true }
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: 'VMNC Verification System' })
        .setTimestamp();

      // Create action buttons
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`verify_approve_${interaction.user.id}_${inGameUsername}`)
            .setLabel('✅ Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`verify_deny_${interaction.user.id}`)
            .setLabel('❌ Deny')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`verify_view_${interaction.user.id}`)
            .setLabel('👁️ View Profile')
            .setStyle(ButtonStyle.Secondary)
        );

      // Find admin channel
      const adminChannel = interaction.guild.channels.cache.find(channel => 
        channel.name.includes('verify') || channel.name.includes('admin') || channel.name.includes('moderation')
      ) || interaction.channel;

      // Send verification request
      await adminChannel.send({ 
        content: `<@&${process.env.ADMIN_ROLE_ID}> New verification request!`,
        embeds: [embed], 
        components: [row] 
      });

      await interaction.editReply({
        content: `✅ Verification request sent for **"${inGameUsername}"**!\n\nAdmins will review your request shortly. You'll receive a DM when approved.`
      });

      // Log the request
      console.log(`📋 Verification request from ${interaction.user.tag} for ${inGameUsername}`);

    } catch (error) {
      console.error('Verify command error:', error);
      await interaction.editReply({
        content: '❌ An error occurred while processing your verification request. Please try again later.'
      });
    }
  }

  // STATS COMMAND
  if (interaction.commandName === 'stats') {
    await interaction.deferReply();

    try {
      const players = await db.collection('players').find({}).toArray();
      const verifiedPlayers = players.filter(p => p.verified);
      const teams = await db.collection('teams').find({}).toArray();
      const liveMatches = await db.collection('liveMatches').find({}).toArray();

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 VMNC Statistics')
        .setDescription('Current platform statistics')
        .addFields(
          { name: '👥 Total Players', value: players.length.toString(), inline: true },
          { name: '✅ Verified Players', value: verifiedPlayers.length.toString(), inline: true },
          { name: '🏆 Teams', value: teams.length.toString(), inline: true },
          { name: '🎮 Live Matches', value: liveMatches.length.toString(), inline: true },
          { name: '📈 Verification Rate', value: `${Math.round((verifiedPlayers.length / players.length) * 100)}%`, inline: true }
        )
        .setFooter({ text: 'VMNC Esports - Valorant Mobile Nepal Championship' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Stats command error:', error);
      await interaction.editReply({
        content: '❌ Unable to fetch statistics at this time.'
      });
    }
  }
});

// Button interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, type, userId, ...usernameParts] = interaction.customId.split('_');
  const username = usernameParts.join('_');

  if (action === 'verify') {
    // Check if user has admin role
    if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
      return await interaction.reply({ 
        content: '❌ You need admin role to use this button.', 
        ephemeral: true 
      });
    }

    if (type === 'approve') {
      await handleVerificationApprove(interaction, userId, username);
    } else if (type === 'deny') {
      await handleVerificationDeny(interaction, userId);
    } else if (type === 'view') {
      await handleViewProfile(interaction, userId);
    }
  }
});

// Handle verification approval
async function handleVerificationApprove(interaction, userId, username) {
  try {
    const member = await interaction.guild.members.fetch(userId);
    const verifiedRole = interaction.guild.roles.cache.get(process.env.VERIFIED_ROLE_ID);
    
    if (!verifiedRole) {
      return await interaction.reply({ 
        content: '❌ Verified role not found.', 
        ephemeral: true 
      });
    }

    // Add verified role
    await member.roles.add(verifiedRole);

    // Update database
    await db.collection('players').updateOne(
      { 
        $or: [
          { username: username },
          { discord: member.user.username }
        ]
      },
      { 
        $set: { 
          discord_id: userId,
          discord: member.user.username,
          verified: true,
          verified_at: new Date().toISOString(),
          verified_by: interaction.user.tag
        } 
      }
    );

    // Send DM to user
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Verification Approved!')
        .setDescription(`Your VMNC account has been successfully verified!`)
        .addFields(
          { name: 'In-Game Name', value: username, inline: true },
          { name: 'Discord', value: member.user.username, inline: true },
          { name: 'Verified By', value: interaction.user.tag, inline: true },
          { name: 'Verified At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: 'You now have access to all VMNC features!' })
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] });
    } catch (dmError) {
      console.log(`Could not send DM to ${member.user.tag}`);
    }

    // Update interaction message
    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(0x00FF00)
      .setTitle('✅ Verification Approved')
      .addFields(
        { name: 'Approved By', value: interaction.user.tag, inline: true },
        { name: 'Approved At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
      );

    await interaction.message.edit({ 
      embeds: [updatedEmbed], 
      components: [] 
    });

    await interaction.reply({ 
      content: `✅ Successfully verified ${member.user.tag}!`, 
      ephemeral: true 
    });

    console.log(`✅ Approved verification for ${member.user.tag}`);

  } catch (error) {
    console.error('Approval error:', error);
    await interaction.reply({ 
      content: '❌ Error approving user. They might have left the server.', 
      ephemeral: true 
    });
  }
}

// Handle verification denial
async function handleVerificationDeny(interaction, userId) {
  try {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    
    // Send DM to user if possible
    if (member) {
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Verification Denied')
          .setDescription(`Your verification request was denied by an admin.`)
          .addFields(
            { name: 'Reason', value: 'Please contact admins for more information', inline: true },
            { name: 'Next Steps', value: 'Make sure your in-game username matches exactly', inline: true }
          )
          .setFooter({ text: 'Contact admins if you believe this was a mistake' })
          .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        console.log(`Could not send DM to ${userId}`);
      }
    }

    // Update interaction message
    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(0xFF0000)
      .setTitle('❌ Verification Denied')
      .addFields(
        { name: 'Denied By', value: interaction.user.tag, inline: true },
        { name: 'Denied At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
      );

    await interaction.message.edit({ 
      embeds: [updatedEmbed], 
      components: [] 
    });

    await interaction.reply({ 
      content: `❌ Denied verification for ${userId}`, 
      ephemeral: true 
    });

    console.log(`❌ Denied verification for ${userId}`);

  } catch (error) {
    console.error('Denial error:', error);
    await interaction.reply({ 
      content: '❌ Error processing denial', 
      ephemeral: true 
    });
  }
}

// Handle view profile
async function handleViewProfile(interaction, userId) {
  try {
    const member = await interaction.guild.members.fetch(userId);
    const player = await db.collection('players').findOne({
      discord_id: userId
    });

    if (!player) {
      return await interaction.reply({ 
        content: '❌ No player profile found for this user.', 
        ephemeral: true 
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`👤 Player Profile: ${player.username}`)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'Rank', value: player.rank || 'Not set', inline: true },
        { name: 'Team', value: player.team || 'No team', inline: true },
        { name: 'Points', value: (player.points || 0).toString(), inline: true },
        { name: 'Wins', value: (player.wins || 0).toString(), inline: true },
        { name: 'Matches', value: (player.matches || 0).toString(), inline: true },
        { name: 'Win Rate', value: player.win_rate ? `${player.win_rate}%` : '0%', inline: true }
      )
      .setFooter({ text: `Discord: ${member.user.tag}` })
      .setTimestamp();

    await interaction.reply({ 
      embeds: [embed], 
      ephemeral: true 
    });

  } catch (error) {
    console.error('View profile error:', error);
    await interaction.reply({ 
      content: '❌ Error fetching player profile.', 
      ephemeral: true 
    });
  }
}

// Error handling
client.on('error', (error) => {
  console.error('🤖 Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('🤖 Unhandled promise rejection:', error);
});

// Start the bot
client.login(process.env.DISCORD_BOT_TOKEN);
