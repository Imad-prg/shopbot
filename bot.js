// ================================
// 🤖 LKWAN SUPPORT BOT
// ================================

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require("discord.js");
const OpenAI = require("openai");
require("dotenv").config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function isOwner(interaction) {
    return interaction.member.roles.cache.has(process.env.OWNER_ROLE_ID);
}

// Historique des conversations par ticket
const ticketHistory = new Map();

// ================================
// 📋 SLASH COMMANDS
// ================================
const commands = [
    new SlashCommandBuilder()
        .setName("support")
        .setDescription("Ouvre le menu de support LKWAN STORE"),

    new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Prendre la main sur un ticket (désactive l'IA)")
        .setDefaultMemberPermissions(0),

    new SlashCommandBuilder()
        .setName("unclaim")
        .setDescription("Rendre la main à l'IA")
        .setDefaultMemberPermissions(0),

    new SlashCommandBuilder()
        .setName("close")
        .setDescription("Fermer un ticket")
        .setDefaultMemberPermissions(0),
].map(cmd => cmd.toJSON());

// ================================
// 🔁 REGISTER COMMANDS
// ================================
async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    try {
        console.log("📋 Enregistrement des slash commands...");
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log("✅ Slash commands enregistrées !");
    } catch (err) {
        console.error("❌ Erreur:", err);
    }
}

// ================================
// 🟢 BOT READY
// ================================
client.once("ready", async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: "LKWAN Support 🎮", type: 3 }],
        status: "online"
    });
    await registerCommands();
});

// ================================
// 🤖 AI RESPONSE
// ================================
async function getAIResponse(ticketId, userMessage, username) {
    if (!ticketHistory.has(ticketId)) {
        ticketHistory.set(ticketId, []);
    }

    const history = ticketHistory.get(ticketId);

    history.push({ role: "user", content: `${username}: ${userMessage}` });

    // Keep only last 10 messages
    if (history.length > 10) history.splice(0, history.length - 10);

    const messages = [
        {
            role: "system",
            content: `You are a professional support agent for LKWAN STORE, a digital products shop selling PSN cards, VP (Valorant Points), Netflix, Xbox, Steam, and more.

Your job is to assist customers politely and professionally while waiting for a human staff member to take over.

Rules:
- Detect the language of the customer and ALWAYS respond in the same language
- Be friendly, professional and helpful
- Answer questions about products, prices, and orders
- If you don't know the exact price or stock, say staff will confirm soon
- Tell the customer a staff member will assist them shortly
- Never promise specific delivery times
- Keep responses short and clear (max 3-4 lines)
- Sign off as "LKWAN Support 🎮"

Shop products: PSN cards, Valorant Points (VP), Netflix, Xbox Game Pass, Steam Wallet, and more digital products.`
        },
        ...history
    ];

    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
        max_tokens: 300,
        temperature: 0.7
    });

    const reply = response.choices[0].message.content;
    history.push({ role: "assistant", content: reply });

    return reply;
}

// ================================
// ⚡ INTERACTIONS
// ================================
client.on("interactionCreate", async (interaction) => {

    // /support — affiche le menu
    if (interaction.isChatInputCommand() && interaction.commandName === "support") {
        const embed = new EmbedBuilder()
            .setColor(0x0066FF)
            .setTitle("🎮 LKWAN STORE — Support")
            .setDescription("Select an option below to view rates, special deals, or create a purchase ticket.")
            .setImage(process.env.BANNER_URL || null)
            .setFooter({ text: "LKWAN STORE 🎮" });

        const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("support_menu")
                .setPlaceholder("Select an option")
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel("View Rates")
                        .setDescription("Check our current product rates")
                        .setValue("rates")
                        .setEmoji("💰"),
                    new StringSelectMenuOptionBuilder()
                        .setLabel("Special Deals")
                        .setDescription("View our special deals")
                        .setValue("deals")
                        .setEmoji("🎁"),
                    new StringSelectMenuOptionBuilder()
                        .setLabel("Purchase")
                        .setDescription("Buy a product now")
                        .setValue("purchase")
                        .setEmoji("🛒"),
                    new StringSelectMenuOptionBuilder()
                        .setLabel("Other")
                        .setDescription("Any other question")
                        .setValue("other")
                        .setEmoji("💬")
                )
        );

        await interaction.reply({ embeds: [embed], components: [menu] });
    }

    // Claim ticket select menu
    if (interaction.isStringSelectMenu() && interaction.customId === "claim_ticket_select") {
        const ticketId = interaction.values[0];
        claimedTickets.add(ticketId);
        const ch = interaction.guild.channels.cache.get(ticketId);
        await interaction.reply({
            content: `✅ You claimed **${ch ? ch.name : ticketId}**. AI disabled.`,
            ephemeral: true
        });
        if (ch) {
            await ch.send({
                embeds: [new EmbedBuilder()
                    .setColor(0x00c864)
                    .setDescription(`👋 **${interaction.user.username}** has taken over this ticket.\n🤖 AI assistant has been disabled.`)
                ]
            });
        }
    }

    // Unclaim ticket select menu
    if (interaction.isStringSelectMenu() && interaction.customId === "unclaim_ticket_select") {
        const ticketId = interaction.values[0];
        claimedTickets.delete(ticketId);
        const ch = interaction.guild.channels.cache.get(ticketId);
        await interaction.reply({
            content: `✅ AI re-enabled for **${ch ? ch.name : ticketId}**.`,
            ephemeral: true
        });
        if (ch) {
            await ch.send({
                embeds: [new EmbedBuilder()
                    .setColor(0x0066FF)
                    .setDescription("🤖 AI assistant has been re-enabled for this ticket.")
                ]
            });
        }
    }
        const value = interaction.values[0];
        const labels = {
            rates: "View Rates",
            deals: "Special Deals",
            purchase: "Purchase",
            other: "Other"
        };

        const guild = interaction.guild;
        const user = interaction.user;

        // Check if ticket already exists
        const existing = guild.channels.cache.find(c =>
            c.name === `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}` &&
            c.parentId === process.env.TICKET_CATEGORY_ID
        );

        if (existing) {
            return interaction.reply({
                content: `❌ You already have an open ticket: <#${existing.id}>`,
                ephemeral: true
            });
        }

        // Create ticket channel
        const ticketChannel = await guild.channels.create({
            name: `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            type: ChannelType.GuildText,
            parent: process.env.TICKET_CATEGORY_ID,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                },
                {
                    id: process.env.STAFF_ROLE_ID,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.ManageChannels
                    ]
                }
            ]
        });

        const closeBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("Close Ticket")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔒"),
            new ButtonBuilder()
                .setCustomId("claim_ticket")
                .setLabel("Claim (Staff)")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("👋")
        );

        const ticketEmbed = new EmbedBuilder()
            .setColor(0x0066FF)
            .setTitle(`🎫 Ticket — ${labels[value]}`)
            .setDescription(`Hello <@${user.id}> ! 👋\n\nThank you for contacting **LKWAN STORE** support.\nA staff member will assist you shortly.\n\nIn the meantime, our AI assistant is here to help you!`)
            .addFields({ name: "Category", value: labels[value], inline: true })
            .setFooter({ text: "LKWAN STORE 🎮" })
            .setTimestamp();

        await ticketChannel.send({
            content: `<@${user.id}> | <@&${process.env.STAFF_ROLE_ID}>`,
            embeds: [ticketEmbed],
            components: [closeBtn]
        });

        await interaction.reply({
            content: `✅ Your ticket has been created: <#${ticketChannel.id}>`,
            ephemeral: true
        });
    }

    // Close ticket button
    if (interaction.isButton() && interaction.customId === "close_ticket") {
        const isStaff = interaction.member.roles.cache.has(process.env.STAFF_ROLE_ID);
        const isOwner = interaction.channel.permissionOverwrites.cache.some(
            p => p.id === interaction.user.id && p.allow.has(PermissionsBitField.Flags.ViewChannel)
        );

        if (!isStaff && !isOwner) {
            return interaction.reply({ content: "❌ You don't have permission.", ephemeral: true });
        }

        await interaction.reply({ content: "🔒 Closing ticket in 5 seconds..." });
        ticketHistory.delete(interaction.channel.id);
        claimedTickets.delete(interaction.channel.id);
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    // Claim ticket button
    if (interaction.isButton() && interaction.customId === "claim_ticket") {
        const isStaff = interaction.member.roles.cache.has(process.env.STAFF_ROLE_ID);
        if (!isStaff) return interaction.reply({ content: "❌ Staff only.", ephemeral: true });

        claimedTickets.add(interaction.channel.id);
        await interaction.reply({
            content: `👋 **${interaction.user.username}** has claimed this ticket. AI disabled.`
        });
    }

    // /claim command — ask which ticket
    if (interaction.isChatInputCommand() && interaction.commandName === "claim") {
        if (!isOwner(interaction)) return interaction.reply({ content: "❌ Owner only.", ephemeral: true });

        // Get all open ticket threads
        await interaction.guild.channels.fetch();
        const tickets = interaction.guild.channels.cache.filter(c =>
            c.isThread() && c.name.startsWith("ticket-") && !c.archived
        );

        if (tickets.size === 0) {
            return interaction.reply({ content: "❌ No open tickets found.", ephemeral: true });
        }

        const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } = require("discord.js");

        const options = tickets.map(t =>
            new StringSelectMenuOptionBuilder()
                .setLabel(t.name)
                .setValue(t.id)
        ).slice(0, 25);

        const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("claim_ticket_select")
                .setPlaceholder("Select a ticket to claim...")
                .addOptions(options)
        );

        await interaction.reply({
            content: "👋 Which ticket do you want to claim? (AI will be disabled)",
            components: [menu],
            ephemeral: true
        });
    }

    // /unclaim command — ask which ticket
    if (interaction.isChatInputCommand() && interaction.commandName === "unclaim") {
        if (!isOwner(interaction)) return interaction.reply({ content: "❌ Owner only.", ephemeral: true });

        const claimedList = [...claimedTickets];
        if (claimedList.length === 0) {
            return interaction.reply({ content: "❌ No claimed tickets found.", ephemeral: true });
        }

        await interaction.guild.channels.fetch();
        const options = claimedList.map(id => {
            const ch = interaction.guild.channels.cache.get(id);
            return new StringSelectMenuOptionBuilder()
                .setLabel(ch ? ch.name : id)
                .setValue(id);
        }).slice(0, 25);

        const { StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");
        const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("unclaim_ticket_select")
                .setPlaceholder("Select a ticket to unclaim...")
                .addOptions(options)
        );

        await interaction.reply({
            content: "🤖 Which ticket do you want to give back to AI?",
            components: [menu],
            ephemeral: true
        });
    }

    // /close command
    if (interaction.isChatInputCommand() && interaction.commandName === "close") {
        if (!isOwner(interaction)) return interaction.reply({ content: "❌ Owner only.", ephemeral: true });

        await interaction.reply({ content: "🔒 Closing ticket in 5 seconds..." });
        ticketHistory.delete(interaction.channel.id);
        claimedTickets.delete(interaction.channel.id);
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
});

// ================================
// 💬 MESSAGE HANDLER — AI RESPONSES
// ================================
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const channel = message.channel;
    const guild = message.guild;
    if (!guild) return;

    // Only respond in threads
    if (!channel.isThread()) return;

    // Only respond in threads inside the ticket category
    const parentChannel = channel.parent;
    if (!parentChannel) return;

    // Check thread name starts with ticket-
    if (!channel.name.startsWith("ticket-")) return;

    // Check if staff already claimed
    if (claimedTickets.has(channel.id)) return;

    // Don't respond to staff
    const isStaff = message.member?.roles.cache.has(process.env.STAFF_ROLE_ID);
    if (isStaff) return;

    // Typing indicator
    await channel.sendTyping();

    try {
        const reply = await getAIResponse(channel.id, message.content, message.author.username);

        const embed = new EmbedBuilder()
            .setColor(0x0066FF)
            .setDescription(reply)
            .setFooter({ text: "LKWAN Support 🤖 • Staff will assist you soon" });

        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error("AI Error:", err);
        await channel.send({
            embeds: [new EmbedBuilder()
                .setColor(0x0066FF)
                .setDescription("Thank you for your message! A staff member will assist you shortly. 🎮")
                .setFooter({ text: "LKWAN Support 🎮" })
            ]
        });
    }
});

// ================================
// 🚀 LOGIN
// ================================
client.login(process.env.TOKEN);
