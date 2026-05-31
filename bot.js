// ================================
// 🤖 LKWAN STORE BOT
// ================================

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionsBitField,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require("discord.js");
const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ================================
// 📦 DATA STORE (JSON file)
// ================================
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        const defaultData = {
            products: [],
            promos: [],
            welcome: {
                enabled: true,
                message: "Bienvenue sur LKWAN STORE ! 🎮",
                channelId: process.env.WELCOME_CHANNEL_ID || ""
            }
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ================================
// 🤖 DISCORD CLIENT
// ================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: ["CHANNEL"]
});

// ================================
// 📋 SLASH COMMANDS
// ================================
const commands = [
    new SlashCommandBuilder()
        .setName("stock")
        .setDescription("Affiche le stock disponible"),

    new SlashCommandBuilder()
        .setName("prix")
        .setDescription("Affiche la liste des prix"),

    new SlashCommandBuilder()
        .setName("promo")
        .setDescription("Affiche les promotions en cours"),

    new SlashCommandBuilder()
        .setName("welcome")
        .setDescription("Envoie le message de bienvenue manuellement")
        .addUserOption(opt => opt.setName("membre").setDescription("Le membre à accueillir").setRequired(false)),

    new SlashCommandBuilder()
        .setName("say")
        .setDescription("Faire parler le bot dans un salon")
        .addChannelOption(opt => opt.setName("salon").setDescription("Salon cible").setRequired(true))
        .addStringOption(opt => opt.setName("message").setDescription("Message à envoyer").setRequired(true))
        .addAttachmentOption(opt => opt.setName("image").setDescription("Image à joindre").setRequired(false)),

    new SlashCommandBuilder()
        .setName("sayhere")
        .setDescription("Faire parler le bot dans ce salon")
        .addStringOption(opt => opt.setName("message").setDescription("Message à envoyer").setRequired(true))
        .addAttachmentOption(opt => opt.setName("image").setDescription("Image à joindre").setRequired(false)),
].map(cmd => cmd.toJSON());

// ================================
// 🔁 REGISTER SLASH COMMANDS
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
        console.error("❌ Erreur enregistrement:", err);
    }
}

// ================================
// 🎨 EMBED HELPERS
// ================================
const BLUE = 0x0066FF;

function makeEmbed(title, description, fields = []) {
    const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: "LKWAN STORE 🎮" });
    if (fields.length > 0) embed.addFields(fields);
    return embed;
}

function base64ToAttachment(base64str, filename = "image.png") {
    const matches = base64str.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches) return null;
    const buffer = Buffer.from(matches[2], "base64");
    return new AttachmentBuilder(buffer, { name: filename });
}

// ================================
// 🟢 BOT READY
// ================================
client.once("ready", async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: "LKWAN STORE 🎮", type: 3 }],
        status: "online"
    });
    await registerCommands();
});

// ================================
// 👋 AUTO WELCOME
// ================================
client.on("guildMemberAdd", async (member) => {
    if (member.guild.id !== process.env.GUILD_ID) return;
    if (member.user.bot) return;

    const data = loadData();
    if (!data.welcome.enabled) return;

    const channel = member.guild.channels.cache.get(data.welcome.channelId || process.env.WELCOME_CHANNEL_ID);
    if (!channel) return;

    const w = data.welcome;
    const userMention = `<@${member.id}>`;

    try {
        if (w.type === 'embed') {
            const colorInt = parseInt((w.embedColor || '#0066ff').replace('#', ''), 16);
            const embed = new EmbedBuilder().setColor(colorInt || 0x0066FF);
            if (w.embedTitle) embed.setTitle(w.embedTitle);
            if (w.embedDesc) embed.setDescription(w.embedDesc.replace('{user}', userMention));
            if (w.embedFooter) embed.setFooter({ text: w.embedFooter });

            const payload = { content: null, embeds: [embed] };

            if (w.embedImageUrl) {
                if (w.embedImageUrl.startsWith('data:')) {
                    const att = base64ToAttachment(w.embedImageUrl, 'welcome.png');
                    if (att) { payload.files = [att]; embed.setImage('attachment://welcome.png'); }
                } else {
                    embed.setImage(w.embedImageUrl);
                }
            }

            await channel.send(payload);
        } else {
            const msg = (w.message || 'Bienvenue {user} !').replace('{user}', userMention);
            const payload = { content: msg };

            if (w.imageUrl) {
                if (w.imageUrl.startsWith('data:')) {
                    const att = base64ToAttachment(w.imageUrl, 'welcome.png');
                    if (att) payload.files = [att];
                } else {
                    payload.files = [w.imageUrl];
                }
            }

            await channel.send(payload);
        }
    } catch (err) {
        console.error("Welcome error:", err);
    }
});

// ================================
// ⚡ SLASH COMMANDS HANDLER
// ================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const data = loadData();

    // /stock
    if (commandName === "stock") {
        const products = data.products.filter(p => p.stock > 0);

        if (products.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x0066FF)
                    .setTitle("📦 Stock")
                    .setDescription("❌ Aucun produit en stock pour le moment.")
                    .setFooter({ text: "LKWAN STORE 🎮" })
                    .setTimestamp()
                ]
            });
        }

        const lines = products.map(p =>
            `${p.emoji || "🎮"} **${p.name}** — \`${p.stock} dispo\``
        ).join("\n");

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0x0066FF)
                .setTitle("📦 Stock disponible")
                .setDescription(lines)
                .setFooter({ text: "LKWAN STORE 🎮" })
                .setTimestamp()
            ]
        });
    }

    // /prix
    if (commandName === "prix") {
        const products = data.products;

        if (products.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x0066FF)
                    .setTitle("💰 Prix")
                    .setDescription("❌ Aucun produit configuré pour le moment.")
                    .setFooter({ text: "LKWAN STORE 🎮" })
                    .setTimestamp()
                ]
            });
        }

        const lines = products.map(p =>
            `${p.emoji || "🎮"} **${p.name}** — **${p.price}€**${p.description ? `\n> ${p.description}` : ""}`
        ).join("\n\n");

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0x0066FF)
                .setTitle("💰 Nos tarifs")
                .setDescription(lines)
                .setFooter({ text: "LKWAN STORE 🎮" })
                .setTimestamp()
            ]
        });
    }

    // /promo
    if (commandName === "promo") {
        const promos = data.promos.filter(p => p.active);

        if (promos.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(0x0066FF)
                    .setTitle("🎁 Promotions")
                    .setDescription("❌ Aucune promotion en cours pour le moment.")
                    .setFooter({ text: "LKWAN STORE 🎮" })
                    .setTimestamp()
                ]
            });
        }

        const lines = promos.map(p =>
            `🎁 **${p.title}**\n> ${p.description}`
        ).join("\n\n");

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xFF6600)
                .setTitle("🔥 Promotions en cours")
                .setDescription(lines)
                .setFooter({ text: "LKWAN STORE 🎮 • Offres limitées !" })
                .setTimestamp()
            ]
        });
    }

    // /welcome
    if (commandName === "welcome") {
        if (!isAdmin) return interaction.reply({ content: "❌ Tu n'as pas la permission.", ephemeral: true });

        const target = interaction.options.getUser("membre") || interaction.user;
        const channel = interaction.guild.channels.cache.get(data.welcome.channelId || process.env.WELCOME_CHANNEL_ID);

        if (!channel) return interaction.reply({ content: "❌ Salon welcome non configuré.", ephemeral: true });

        const embed = makeEmbed(
            `👋 Bienvenue sur LKWAN STORE !`,
            data.welcome.message.replace("{user}", `<@${target.id}>`),
            [
                { name: "🛒 Nos produits", value: "Tape `/stock` pour voir nos produits", inline: true },
                { name: "💰 Nos prix", value: "Tape `/prix` pour voir les tarifs", inline: true },
            ]
        );

        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: "✅ Message de bienvenue envoyé !", ephemeral: true });
    }

    // /say
    if (commandName === "say") {
        if (!isAdmin) return interaction.reply({ content: "❌ Tu n'as pas la permission.", ephemeral: true });

        const channel = interaction.options.getChannel("salon");
        const message = interaction.options.getString("message");
        const image = interaction.options.getAttachment("image");

        const payload = { content: message };
        if (image) payload.files = [image.url];

        await channel.send(payload);
        return interaction.reply({ content: `✅ Message envoyé dans <#${channel.id}>`, ephemeral: true });
    }

    // /sayhere
    if (commandName === "sayhere") {
        if (!isAdmin) return interaction.reply({ content: "❌ Tu n'as pas la permission.", ephemeral: true });

        const message = interaction.options.getString("message");
        const image = interaction.options.getAttachment("image");

        const payload = { content: message };
        if (image) payload.files = [image.url];

        await interaction.channel.send(payload);
        return interaction.reply({ content: "✅ Message envoyé !", ephemeral: true });
    }
});

// ================================
// 🌐 EXPRESS API (pour le dashboard)
// ================================
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(require("cors")({ origin: '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type','x-api-key'] }));
app.options('*', require("cors")());

const API_KEY = process.env.API_KEY || "lkwan-secret-key";

function auth(req, res, next) {
    const key = req.headers["x-api-key"];
    if (key !== API_KEY) return res.status(401).json({ error: "Non autorisé" });
    next();
}

// GET data
app.get("/api/data", auth, (req, res) => {
    res.json(loadData());
});

// POST products
app.post("/api/products", auth, (req, res) => {
    const data = loadData();
    data.products = req.body;
    saveData(data);
    res.json({ success: true });
});

// POST promos
app.post("/api/promos", auth, (req, res) => {
    const data = loadData();
    data.promos = req.body;
    saveData(data);
    res.json({ success: true });
});

// POST welcome
app.post("/api/welcome", auth, (req, res) => {
    const data = loadData();
    data.welcome = { ...data.welcome, ...req.body };
    saveData(data);
    res.json({ success: true });
});

// POST say
app.post("/api/say", auth, async (req, res) => {
    const { channelId, message, imageUrl, type, embed, mentionStr, ticketButton, ticketButtonLabel } = req.body;
    try {
        const channel = await client.channels.fetch(channelId);
        const mention = mentionStr ? mentionStr + '\n' : '';

        // Build ticket button if requested
        let components = [];
        if (ticketButton) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(ticketButtonLabel || "🎫 Open a Ticket")
                    .setStyle(ButtonStyle.Primary)
            );
            components = [row];
        }

        if (type === 'embed' && embed) {
            const colorInt = parseInt((embed.color || '#0066ff').replace('#', ''), 16);
            const discordEmbed = new EmbedBuilder().setColor(colorInt || 0x0066FF);
            if (embed.title) discordEmbed.setTitle(embed.title);
            if (embed.description) discordEmbed.setDescription(embed.description);
            if (embed.footer) discordEmbed.setFooter({ text: embed.footer });

            const payload = { content: mention || null, embeds: [discordEmbed], components };

            if (embed.imageUrl) {
                if (embed.imageUrl.startsWith('data:')) {
                    const attachment = base64ToAttachment(embed.imageUrl, "embed-image.png");
                    if (attachment) {
                        payload.files = [attachment];
                        discordEmbed.setImage('attachment://embed-image.png');
                    }
                } else {
                    discordEmbed.setImage(embed.imageUrl);
                }
            }

            await channel.send(payload);
        } else {
            const payload = { content: mention + (message || ''), components };

            if (imageUrl) {
                if (imageUrl.startsWith('data:')) {
                    const attachment = base64ToAttachment(imageUrl, "image.png");
                    if (attachment) payload.files = [attachment];
                } else {
                    payload.files = [imageUrl];
                }
            }

            await channel.send(payload);
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Say error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET roles list
app.get("/api/roles", auth, async (req, res) => {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        await guild.roles.fetch();
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(r => ({ id: r.id, name: r.name, color: r.hexColor !== '#000000' ? r.hexColor : null }));
        res.json(roles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET channels list
app.get("/api/channels", auth, async (req, res) => {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        await guild.channels.fetch();
        const channels = guild.channels.cache
            .filter(c => c.type === 0)
            .map(c => ({ id: c.id, name: c.name }));
        res.json(channels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 API running on port ${PORT}`));

// ================================
// 🎫 TICKET COUNTER
// ================================
const TICKET_FILE = path.join(__dirname, "tickets.json");

function getTicketCount() {
    if (!fs.existsSync(TICKET_FILE)) fs.writeFileSync(TICKET_FILE, JSON.stringify({ count: 0 }));
    return JSON.parse(fs.readFileSync(TICKET_FILE, "utf8")).count;
}

function incrementTicketCount() {
    const count = getTicketCount() + 1;
    fs.writeFileSync(TICKET_FILE, JSON.stringify({ count }));
    return count;
}

// ================================
// 🎫 TICKET BUTTON HANDLER
// ================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "create_ticket") return;

    const guild = interaction.guild;
    const user = interaction.user;

    await interaction.deferReply({ ephemeral: true });

    try {
        const ticketNum = String(incrementTicketCount()).padStart(4, '0');

        // Send a new message in the channel, then create thread from it
        const ticketMsg = await interaction.channel.send({
            content: `🎫 **Ticket #${ticketNum}** — <@${user.id}>`
        });

        const thread = await ticketMsg.startThread({
            name: `ticket-${ticketNum} • ${user.username}`,
            autoArchiveDuration: 10080,
            type: ChannelType.PrivateThread,
            reason: `Ticket created by ${user.username}`
        });

        // Delete the base message to keep channel clean
        await ticketMsg.delete().catch(() => {});

        // Add user and staff to thread
        await thread.members.add(user.id).catch(() => {});
        const staffMembers = guild.members.cache.filter(m =>
            m.roles.cache.has(process.env.STAFF_ROLE_ID) && !m.user.bot
        );
        for (const [, member] of staffMembers) {
            await thread.members.add(member.id).catch(() => {});
        }

        // Add LKWAN SUPPORT bot to thread
        if (process.env.SUPPORT_BOT_ID) {
            await thread.members.add(process.env.SUPPORT_BOT_ID).catch(() => {});
        }

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("close_ticket_store")
                .setLabel("Close Ticket")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔒")
        );

        const embed = new EmbedBuilder()
            .setColor(0x0066FF)
            .setTitle(`🎫 Ticket #${ticketNum} — LKWAN STORE`)
            .setDescription(`Hello <@${user.id}> ! 👋\n\nThank you for contacting **LKWAN STORE**.\nA staff member will assist you shortly.\n\nPlease describe your request.`)
            .setFooter({ text: "LKWAN STORE 🎮" })
            .setTimestamp();

        await thread.send({
            content: `<@${user.id}> | <@&${process.env.STAFF_ROLE_ID}>`,
            embeds: [embed],
            components: [closeRow]
        });

        // Language selection message
        const langRow1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("lang_fr")
                .setLabel("Français")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🇫🇷"),
            new ButtonBuilder()
                .setCustomId("lang_en")
                .setLabel("English")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🇺🇸"),
            new ButtonBuilder()
                .setCustomId("lang_de")
                .setLabel("Deutsch")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🇩🇪"),
            new ButtonBuilder()
                .setCustomId("lang_ar")
                .setLabel("العربية")
                .setStyle(ButtonStyle.Success)
                .setEmoji("🇸🇦"),
            new ButtonBuilder()
                .setCustomId("lang_ber")
                .setLabel("ⵜⴰⵎⴰⵣⵉⵖⵜ")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🇲🇦")
        );

        await thread.send({
            content: `<@${user.id}> — **Please select your language / Veuillez choisir votre langue** 🌍`,
            components: [langRow1]
        });

        await interaction.editReply({
            content: `✅ Your ticket has been created: <#${thread.id}>`
        });

    } catch (err) {
        console.error("Ticket error:", err);
        await interaction.editReply({
            content: "❌ Error creating ticket. Please try again."
        });
    }
});

// ================================
// 🌍 LANGUAGE SELECTION HANDLER
// ================================
const langMessages = {
    lang_fr: "🇫🇷 **Français sélectionné !** Notre assistant va vous répondre en français.",
    lang_en: "🇺🇸 **English selected!** Our assistant will reply in English.",
    lang_de: "🇩🇪 **Deutsch ausgewählt!** Unser Assistent antwortet auf Deutsch.",
    lang_ar: "🇸🇦 **تم اختيار العربية!** سيرد مساعدنا باللغة العربية.",
    lang_ber: "🇲🇦 **Tamazight tettwaferned!** Anelmad-nneɣ ara k-yemleɣ s Tmazight."
};

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("lang_")) return;

    const lang = interaction.customId;
    const msg = langMessages[lang] || "Language selected!";

    await interaction.update({ 
        content: `<@${interaction.user.id}> — ${msg}`, 
        components: [] 
    });
});

// Close ticket — ask confirmation
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "close_ticket_store") return;

    const isStaff = interaction.member.roles.cache.has(process.env.STAFF_ROLE_ID);
    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const channel = interaction.channel;

    if (!isStaff && !isAdmin && channel.ownerId !== interaction.user.id) {
        return interaction.reply({ content: "❌ You don't have permission.", ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("archive_ticket")
            .setLabel("📁 Archive")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("delete_ticket")
            .setLabel("🗑️ Delete")
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
        content: `**Close this ticket?**\n📁 **Archive** — keep messages\n🗑️ **Delete** — admin only`,
        components: [row],
        ephemeral: true
    });
});

// Archive ticket
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "archive_ticket") return;

    const channel = interaction.channel;
    await interaction.reply({ content: "📁 Ticket archived.", ephemeral: true });
    if (channel.isThread()) await channel.setArchived(true).catch(() => {});
});

// Delete ticket — admin only
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "delete_ticket") return;

    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!isAdmin) {
        return interaction.reply({ content: "❌ Only admins can delete tickets.", ephemeral: true });
    }

    await interaction.reply({ content: "🗑️ Deleting ticket in 3 seconds...", ephemeral: true });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
});

// ================================
// 🚀 LOGIN
// ================================
client.login(process.env.TOKEN);