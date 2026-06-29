require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    REST,
    Routes,
    Events,
} = require('discord.js');

function normalizeEnv(value) {
    return (value || '').trim().replace(/^["']|["']$/g, '');
}

const TOKEN = normalizeEnv(process.env.TOKEN).replace(/^Bot\s+/i, '');
const CLIENT_ID = normalizeEnv(process.env.CLIENT_ID);
const AUTO_SETUP_GUILD_ID = normalizeEnv(process.env.AUTO_SETUP_GUILD_ID);
const SALES_SERVER_INVITE = normalizeEnv(process.env.SALES_SERVER_INVITE) || 'https://discord.gg/reddma';
const SNEAKER_SERVER_INVITE = normalizeEnv(process.env.SNEAKER_SERVER_INVITE) || '';
const SALES_STATUS_CHANNEL_NAME =
    normalizeEnv(process.env.SALES_STATUS_CHANNEL_NAME) || 'firmware-status';
const HUB_GUILD_ID = normalizeEnv(process.env.HUB_GUILD_ID) || '1518315622663065650';
const SNEAKER_GUILD_ID = normalizeEnv(process.env.SNEAKER_GUILD_ID) || '1518341033899856052';
const CONFIG_PATH = path.join(__dirname, 'guild-config.json');
const TICKETS_PATH = path.join(__dirname, 'luxury-tickets.json');
const MEMBER_COUNT_COOLDOWN_MS = 10 * 60 * 1000;

const VERIFIED_ROLE_NAME = 'Verified';
const LUXURY_STAFF_ROLE_NAME = 'Luxury Sales Staff';
const UNVERIFIED_ROLE_NAME = 'Unverified';
const VERIFIED_ROLE_ALIASES = [VERIFIED_ROLE_NAME, '已验证'];
const UNVERIFIED_ROLE_ALIASES = [UNVERIFIED_ROLE_NAME, '未验证'];

const EMBED_TITLES = {
    RULES: '📜 Server Rules',
    VERIFY: '✅ Account Verification',
    WELCOME: '👋 Welcome!',
    WEBSITE: '🌐 Website & Products',
    ANNOUNCEMENTS: '📢 Announcements',
    SERVER_INFO: '🏠 About This Server',
    FAQ: '❓ Frequently Asked Questions',
    SALES_HUB: '🛒 RED DMA Sales Server',
    SNEAKER_HUB: '👟⌚ RED Sneaker & Watch Server',
    PURCHASE_GUIDE: '📦 How to Purchase',
    SUGGESTIONS: '💡 Suggestions',
    MEDIA: '📸 Media & Screenshots',
    MEMBER_STATS: '📊 Live Member Stats',
    LUXURY_SNEAKERS: '👟 Premium Sneaker Catalog',
    LUXURY_WATCHES: '⌚ Luxury Watch Catalog',
    LUXURY_ORDER: '🧾 Order Center',
    LUXURY_PROCUREMENT: '✨ Free Procurement — 自由采购',
    LUXURY_PAYMENT: '💳 Payment & Shipping',
    LUXURY_STORE_RULES: '📋 Rules & How to Order',
};

const JOIN_PING_DELETE_MS = 3000;

const LUXURY_TICKET_CATEGORIES = {
    luxury_ticket_sneakers: 'Sneakers',
    luxury_ticket_watches: 'Watches',
    luxury_ticket_mixed: 'Mixed Order',
    luxury_ticket_procurement: 'Free Procurement',
};

const LUXURY_SNEAKER_LINES = [
    { id: 'jordan', label: 'Jordan Series', note: 'AJ1 / AJ3 / AJ4 / Travis Scott collabs' },
    { id: 'dunk', label: 'Dunk & SB', note: 'Low / High / Premium batches' },
    { id: 'yeezy', label: 'Yeezy', note: '350 / 500 / 700 / Foam Runner' },
    { id: 'nb', label: 'New Balance', note: '2002R / 550 / 990 series' },
    { id: 'other-shoe', label: 'Other Models', note: 'Balenciaga, LV trainers, custom requests' },
];

const LUXURY_WATCH_LINES = [
    { id: 'rolex', label: 'Rolex Style', note: 'Submariner / Daytona / Datejust / GMT' },
    { id: 'ap', label: 'Audemars Piguet Style', note: 'Royal Oak / Offshore' },
    { id: 'patek', label: 'Patek Philippe Style', note: 'Nautilus / Aquanaut / Calatrava' },
    { id: 'cartier', label: 'Cartier Style', note: 'Santos / Tank / Ballon Bleu' },
    { id: 'other-watch', label: 'Other Models', note: 'Richard Mille, Hublot, bespoke builds' },
];

const LUXURY_PROCUREMENT_LINES = [
    { label: 'Bags & Leather', note: 'LV, Chanel, Gucci, Hermès style' },
    { label: 'Apparel', note: 'Streetwear, designer jackets, hoodies' },
    { label: 'Accessories', note: 'Belts, sunglasses, jewelry, scarves' },
    { label: 'Electronics', note: 'Earbuds, gadgets — sourced on request' },
    { label: 'Custom Requests', note: 'Send photos or links — we will try to source it' },
];

const memberCountCooldowns = new Map();

function catalogLinesToFields(lines) {
    return lines.map((item) => ({
        name: item.label,
        value: item.note,
        inline: true,
    }));
}

function getLuxuryInvoicePrompts(category) {
    const prompts = {
        Sneakers:
            '• Product model / reference photos\n' +
            '• Size (US / EU)\n' +
            '• Quantity\n' +
            '• Shipping country & city\n' +
            '• Preferred payment method',
        Watches:
            '• Model / reference photos\n' +
            '• Wrist size (mm) & band preference\n' +
            '• Movement preference (if any)\n' +
            '• Shipping country & city\n' +
            '• Preferred payment method',
        'Mixed Order':
            '• List all items (sneakers + watches)\n' +
            '• Sizes for each item\n' +
            '• Reference photos or links\n' +
            '• Shipping country & city\n' +
            '• Preferred payment method',
        'Free Procurement':
            '• **Item name & description** (what you want to buy)\n' +
            '• Reference photos, screenshots, or purchase links\n' +
            '• Specs — size, color, quantity\n' +
            '• Budget range (optional)\n' +
            '• Shipping country & city\n' +
            '• Preferred payment method',
    };

    return prompts[category] ?? prompts['Free Procurement'];
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
    ],
    partials: [Partials.GuildMember],
});

function loadAllConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function saveAllConfig(data) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

const SERVER_RULES = [
    {
        title: '1. Respect Others',
        content:
            'No harassment, discrimination, threats, or personal attacks. Keep conversations civil and welcoming.',
    },
    {
        title: '2. No Spam',
        content:
            'Do not flood channels, repeat the same message, mass-mention members, or abuse @everyone.',
    },
    {
        title: '3. No Unauthorized Promotion',
        content:
            'Do not advertise other servers, products, or referral links without staff approval.',
    },
    {
        title: '4. Protect Privacy',
        content:
            'Never share personal information (phone numbers, addresses, payment details, etc.).',
    },
    {
        title: '5. Follow the Law',
        content:
            'Illegal, explicit, violent, or fraudulent content is prohibited and may be reported.',
    },
    {
        title: '6. Use the Right Channels',
        content: 'Post in the appropriate channel. Keep support, sales, and casual chat separated.',
    },
    {
        title: '7. Official Purchases Only',
        content:
            'All purchases and support tickets must go through official RED DMA channels. Private deals are at your own risk.',
    },
    {
        title: '8. Staff Decisions Are Final',
        content:
            'Staff may warn, mute, or ban at their discretion. Disputes should be handled privately with an admin.',
    },
];

function getGuildConfig(guildId) {
    return loadAllConfig()[guildId] ?? null;
}

function saveGuildConfig(guildId, data) {
    const all = loadAllConfig();
    all[guildId] = { ...(all[guildId] ?? {}), ...data };
    saveAllConfig(all);
}

function loadTickets() {
    if (!fs.existsSync(TICKETS_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function saveTickets(data) {
    fs.writeFileSync(TICKETS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getOpenLuxuryTicket(guildId, userId) {
    const tickets = loadTickets();
    return (
        Object.values(tickets).find(
            (ticket) => ticket.guild_id === guildId && ticket.user_id === userId && ticket.status === 'open'
        ) ?? null
    );
}

function sanitizeChannelSlug(value) {
    return (value || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 20);
}

function formatMemberCountName(count) {
    return `Members: ${Number(count).toLocaleString('en-US')}`;
}

function scheduleMemberCountUpdate(guild) {
    const guildId = guild.id;
    if (memberCountCooldowns.has(guildId)) return;

    memberCountCooldowns.set(guildId, true);
    updateMemberCountChannel(guild)
        .catch((error) => console.error('Member count update failed:', error))
        .finally(() => {
            setTimeout(() => memberCountCooldowns.delete(guildId), MEMBER_COUNT_COOLDOWN_MS);
        });
}

async function updateMemberCountChannel(guild) {
    const config = getGuildConfig(guild.id);
    const channelId = config?.member_count_channel_id;
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || channel.type !== ChannelType.GuildVoice) return;

    await guild.members.fetch().catch(() => {});
    const total = guild.memberCount ?? guild.members.cache.size;
    const nextName = formatMemberCountName(total);

    if (channel.name !== nextName) {
        await channel.setName(nextName, 'Live member count update');
    }
}

async function refreshAllMemberCountChannels() {
    for (const guild of client.guilds.cache.values()) {
        if (getGuildConfig(guild.id)?.member_count_channel_id) {
            await updateMemberCountChannel(guild).catch(() => {});
        }
    }
}

function buildRulesEmbed() {
    const description = SERVER_RULES.map((rule) => `**${rule.title}**\n${rule.content}`).join('\n\n');

    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.RULES)
        .setDescription(
            'Welcome to the RED DMA community hub! Read the rules below, then complete verification to unlock all channels.\n\n' +
                description
        )
        .setColor(0xef4444)
        .setFooter({ text: 'Violations may result in warnings, mutes, or bans • RED DMA' })
        .setTimestamp();
}

function buildVerifyEmbed(rulesChannel) {
    const rulesMention = rulesChannel ? `${rulesChannel}` : '#rules';

    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.VERIFY)
        .setDescription(
            `Please read the server rules in ${rulesMention} first.\n\n` +
                'Once you agree to follow the rules, click the button below to verify your account.\n' +
                'After verification you will gain access to the rest of the community.'
        )
        .setColor(0x22c55e);
}

function buildVerifyButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('verify_member')
            .setLabel('I Agree — Verify Me')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
    );
}

function buildHubRulesDmEmbed(member, rulesChannel, verifyChannel) {
    const rulesText = SERVER_RULES.map((rule) => `**${rule.title}**\n${rule.content}`).join('\n\n');
    const rulesMention = rulesChannel ? `${rulesChannel}` : '#rules';
    const verifyMention = verifyChannel ? `${verifyChannel}` : '#verification';

    return new EmbedBuilder()
        .setTitle('👋 Welcome!')
        .setDescription(
            `Hi **${member.user.username}**, welcome to **${member.guild.name}**!\n\n` +
                `**Server rules**\n${rulesText}\n\n` +
                `📜 **Rules channel:** ${rulesMention}\n` +
                `✅ **Verify here:** ${verifyMention}\n\n` +
                'Complete verification to unlock all channels. This message is only visible to you.'
        )
        .setColor(0xef4444)
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: 'RED Community Hub • Private message' })
        .setTimestamp();
}

function buildStoreRulesDmEmbed(member, { orderChannel, rulesChannel, procurementChannel } = {}) {
    const rulesMention = rulesChannel ? `${rulesChannel}` : '#store-rules';
    const orderMention = orderChannel ? `${orderChannel}` : '#order-here';
    const procurementMention = procurementChannel ? `${procurementChannel}` : '#custom-procurement';

    return new EmbedBuilder()
        .setTitle('👋 Welcome!')
        .setDescription(
            `Hi **${member.user.username}**, welcome to **${member.guild.name}**!\n\n` +
                `📋 **Start here:** ${rulesMention}\n` +
                'Full guide on **how to purchase and place orders** — please read before buying.\n\n' +
                '**Quick steps:**\n' +
                `1. Go to ${orderMention} or ${procurementMention}\n` +
                '2. Open a ticket (Sneakers / Watches / Mixed / Free Procurement)\n' +
                '3. Reply in your private ticket with item details & shipping info\n' +
                '4. Staff sends quote, QC & payment → tracking after dispatch\n\n' +
                '💬 **Chat:** #general-chat\n\n' +
                '_This message is only visible to you._'
        )
        .setColor(0x8b5cf6)
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: 'RED Sneaker & Watch • Private message' })
        .setTimestamp();
}

async function getLuxuryStoreRulesChannel(guild, config) {
    if (config?.luxury_store_rules_channel_id) {
        const cached = guild.channels.cache.get(config.luxury_store_rules_channel_id);
        if (cached) return cached;
    }
    return findChannelByNames(guild, ['store-rules', 'luxury-rules', 'rules']);
}

async function sendJoinRulesPing(member, config) {
    if (!config?.luxury_store_complete) return;

    const generalChat = config.general_chat_channel_id
        ? member.guild.channels.cache.get(config.general_chat_channel_id)
        : null;
    const rulesChannel = await getLuxuryStoreRulesChannel(member.guild, config);
    const targetChannel = generalChat ?? rulesChannel;
    if (!targetChannel) return;

    const rulesMention = rulesChannel ? `${rulesChannel}` : '#store-rules';

    try {
        const pingMessage = await targetChannel.send({
            content:
                `${member} 👋 Welcome! Please read ${rulesMention} — it explains **how to purchase and place orders**.\n` +
                '欢迎加入！请先查看规则频道了解采购与下单流程。',
            allowedMentions: { users: [member.id] },
        });
        setTimeout(() => pingMessage.delete().catch(() => {}), JOIN_PING_DELETE_MS);
        console.log(
            `Join ping sent to ${member.user.tag} in #${targetChannel.name} (auto-delete in ${JOIN_PING_DELETE_MS}ms)`
        );
    } catch (error) {
        console.warn(`Could not send join ping for ${member.user.tag}:`, error.message);
    }
}

async function sendJoinDirectMessage(member, config) {
    let embed;
    if (config.setup_complete) {
        const rulesChannel = member.guild.channels.cache.get(config.rules_channel_id);
        const verifyChannel = member.guild.channels.cache.get(config.verify_channel_id);
        embed = buildHubRulesDmEmbed(member, rulesChannel, verifyChannel);
    } else if (config.luxury_store_complete) {
        const orderChannel = config.luxury_order_channel_id
            ? member.guild.channels.cache.get(config.luxury_order_channel_id)
            : null;
        const rulesChannel = config.luxury_store_rules_channel_id
            ? member.guild.channels.cache.get(config.luxury_store_rules_channel_id)
            : null;
        const procurementChannel = config.luxury_procurement_channel_id
            ? member.guild.channels.cache.get(config.luxury_procurement_channel_id)
            : null;
        embed = buildStoreRulesDmEmbed(member, { orderChannel, rulesChannel, procurementChannel });
    } else {
        return false;
    }

    try {
        const dmTarget = member.partial ? await member.fetch() : member;
        await dmTarget.send({ embeds: [embed] });
        console.log(`DM sent to ${dmTarget.user.tag} in ${member.guild.name} (${member.guild.id})`);
        return true;
    } catch (error) {
        if (error.code === 50007) {
            console.warn(
                `Could not DM ${member.user.tag} in ${member.guild.name} — user has DMs disabled or blocked the bot`
            );
            return false;
        }
        console.error(`Failed to send rules DM to ${member.user.tag}:`, error);
        return false;
    }
}

async function sendJoinWelcomeFallback(member, config) {
    if (config.setup_complete && config.welcome_channel_id) {
        const welcomeChannel = member.guild.channels.cache.get(config.welcome_channel_id);
        if (!welcomeChannel) return;

        const rulesChannel = member.guild.channels.cache.get(config.rules_channel_id);
        const verifyChannel = member.guild.channels.cache.get(config.verify_channel_id);
        const embed = buildHubRulesDmEmbed(member, rulesChannel, verifyChannel);
        await welcomeChannel.send({
            content: `${member} Welcome! We could not DM you — please read the rules and complete verification here.`,
            embeds: [embed],
            allowedMentions: { users: [member.id] },
        });
        console.log(`Welcome fallback posted for ${member.user.tag} in #${welcomeChannel.name}`);
        return;
    }

    if (config.luxury_store_complete) {
        const rulesChannel = await getLuxuryStoreRulesChannel(member.guild, config);
        const rulesMention = rulesChannel ? `${rulesChannel}` : '#store-rules';
        const generalChat = config.general_chat_channel_id
            ? member.guild.channels.cache.get(config.general_chat_channel_id)
            : null;
        const targetChannel = generalChat ?? rulesChannel;
        if (!targetChannel) return;

        const embed = buildStoreRulesDmEmbed(member, {
            orderChannel: config.luxury_order_channel_id
                ? member.guild.channels.cache.get(config.luxury_order_channel_id)
                : null,
            rulesChannel,
            procurementChannel: config.luxury_procurement_channel_id
                ? member.guild.channels.cache.get(config.luxury_procurement_channel_id)
                : null,
        });

        await targetChannel.send({
            content:
                `${member} Welcome! We could not DM you — please read ${rulesMention} for how to purchase and order.`,
            embeds: [embed],
            allowedMentions: { users: [member.id] },
        });
        console.log(`Welcome fallback posted for ${member.user.tag} in #${targetChannel.name}`);
    }
}

async function publishWelcomeChannelIntro(channel) {
    const embed = new EmbedBuilder()
        .setTitle('👋 Welcome')
        .setDescription(
            'New members receive a **private message** from the bot with a welcome note and server rules.\n\n' +
                'Only you can see that message — the same way verification replies work.'
        )
        .setColor(0xef4444);

    await publishEmbedToChannel(channel, embed, { title: '👋 Welcome' });
}

function buildServerInfoEmbed(salesChannel, sneakerChannel) {
    const salesMention = salesChannel ? `${salesChannel}` : '#red-dma';
    const sneakerMention = sneakerChannel ? `${sneakerChannel}` : '#sneaker-watch';

    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.SERVER_INFO)
        .setDescription(
            '**RED Main Hub** is your home for community, announcements, and support.\n\n' +
                '**What you can do here**\n' +
                '• Read official announcements\n' +
                '• Chat with the community\n' +
                '• Get help and browse general info\n' +
                '• Share feedback and suggestions\n\n' +
                '**Specialized servers**\n' +
                `• ${salesMention} — RED DMA firmware, tickets & live status\n` +
                `• ${sneakerMention} — Sneakers, watches & free procurement store\n\n` +
                '**Website:** https://reddma.xyz'
        )
        .setColor(0xef4444)
        .setFooter({ text: 'RED Community Hub' })
        .setTimestamp();
}

function buildSalesHubEmbed() {
    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.SALES_HUB)
        .setDescription(
            '**RED DMA** — firmware, tickets, and live anti-cheat status.\n\n' +
                '**In the RED DMA Sales Server:**\n' +
                `• **#${SALES_STATUS_CHANNEL_NAME}** — daily firmware status & discounts\n` +
                '• Product catalog with ticket buttons\n' +
                '• Purchase support and order handling\n' +
                '• `/buy` command to open purchase tickets\n\n' +
                'Click **Join RED DMA Server** below to continue.'
        )
        .setColor(0xf59e0b)
        .setFooter({ text: 'Official invite • RED DMA' });
}

function buildSneakerHubEmbed() {
    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.SNEAKER_HUB)
        .setDescription('**RED Sneaker & Watch** — premium replica sneakers, luxury watches, and free procurement.')
        .addFields(
            {
                name: '👟 Sneakers',
                value: 'Jordan, Dunk, Yeezy, NB & more — QC before shipping',
                inline: true,
            },
            {
                name: '⌚ Watches',
                value: 'Rolex, AP, Patek, Cartier style — movement options',
                inline: true,
            },
            {
                name: '✨ Free Procurement',
                value: 'Bags, apparel, accessories — submit anything you want to buy',
                inline: true,
            },
            {
                name: '🧾 How to order',
                value:
                    'Join the store server → open a ticket in **#order-here** or **#custom-procurement** → share item details → receive invoice & QC',
                inline: false,
            }
        )
        .setColor(0x8b5cf6)
        .setFooter({ text: 'Official invite • RED Sneaker & Watch' });
}

function buildSneakerHubButtons(inviteUrl) {
    const row = new ActionRowBuilder();
    if (inviteUrl) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel('Join Sneaker & Watch Server')
                .setStyle(ButtonStyle.Link)
                .setURL(inviteUrl)
                .setEmoji('👟')
        );
    }
    return row.components.length ? row : null;
}

function buildSalesHubButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Join RED DMA Server')
            .setStyle(ButtonStyle.Link)
            .setURL(SALES_SERVER_INVITE)
            .setEmoji('🛒'),
        new ButtonBuilder()
            .setLabel('Visit Website')
            .setStyle(ButtonStyle.Link)
            .setURL('https://reddma.xyz')
            .setEmoji('🌐')
    );
}

function buildPurchaseGuideEmbed(salesChannel) {
    const salesMention = salesChannel ? `${salesChannel}` : '#red-dma';

    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.PURCHASE_GUIDE)
        .setDescription(
            '**How to purchase RED DMA firmware**\n\n' +
                `1. Go to ${salesMention} and join the Sales Server\n` +
                `2. Check **#${SALES_STATUS_CHANNEL_NAME}** for current status and promos\n` +
                '3. Browse products in the sales channels\n' +
                '4. Click **Open Ticket** or run `/buy` to start your order\n' +
                '5. Staff will guide you through payment and delivery\n\n' +
                '**Important:** Only purchase through official RED DMA channels. Never trust third-party resellers unless verified by staff.'
        )
        .setColor(0x22c55e);
}

function buildFaqEmbed() {
    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.FAQ)
        .setDescription(
            '**Quick answers**\n\n' +
                '**Where do I buy RED DMA firmware?**\nGo to #red-dma for the invite to the RED DMA Sales Server.\n\n' +
                '**Where do I buy sneakers or watches?**\nGo to #sneaker-watch for the invite to the dedicated store server.\n\n' +
                '**Where is firmware status posted?**\nDaily updates are in the RED DMA server #' +
                SALES_STATUS_CHANNEL_NAME +
                ' channel.\n\n' +
                '**I need help**\nAsk in #help-support here, or open a ticket in the relevant specialized server.\n\n' +
                '**Website**\nhttps://reddma.xyz'
        )
        .setColor(0x3b82f6);
}

function getSneakerInviteUrl(config) {
    return config?.sneaker_server_invite || SNEAKER_SERVER_INVITE;
}

async function cleanupLuxuryStoreFromGuild(guild) {
    const categoryNames = ['👟 SNEAKERS', '⌚ WATCHES', '🛒 ORDERS', '🎫 Active Tickets'];
    const channels = await guild.channels.fetch();

    for (const channel of channels.values()) {
        if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
            const parent = channel.parent;
            if (parent && categoryNames.includes(parent.name)) {
                await channel.delete('Removing luxury store from hub server').catch(() => {});
            }
        }
    }

    for (const name of categoryNames) {
        const category = channels.find((ch) => ch.type === ChannelType.GuildCategory && ch.name === name);
        if (category) {
            await category.delete('Removing luxury store category from hub server').catch(() => {});
        }
    }

    const staffRole = guild.roles.cache.find((role) => role.name === LUXURY_STAFF_ROLE_NAME);
    if (staffRole) {
        await staffRole.delete('Luxury staff role belongs on sneaker server').catch(() => {});
    }

    const config = getGuildConfig(guild.id) ?? {};
    saveGuildConfig(guild.id, {
        ...config,
        luxury_store_complete: 0,
        luxury_staff_role_id: null,
        luxury_ticket_category_id: null,
        luxury_order_channel_id: null,
        luxury_sneaker_catalog_id: null,
        luxury_watch_catalog_id: null,
        luxury_procurement_channel_id: null,
        luxury_store_rules_channel_id: null,
    });
}

function memberCanManage(interaction) {
    return interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

async function findChannelByNames(guild, names) {
    const channels = await guild.channels.fetch();
    return channels.find((channel) => names.includes(channel.name)) ?? null;
}

async function cleanupDuplicateAliasChannels(guild, canonicalChannel, aliases, reason) {
    const channels = await guild.channels.fetch();
    const duplicates = channels.filter(
        (channel) =>
            channel.id !== canonicalChannel.id &&
            aliases.includes(channel.name) &&
            channel.type === ChannelType.GuildText
    );

    for (const duplicate of duplicates.values()) {
        await duplicate.delete(reason).catch(() => {});
    }
}

async function findCategoryByNames(guild, names) {
    const channels = await guild.channels.fetch();
    return (
        channels.find((channel) => channel.type === ChannelType.GuildCategory && names.includes(channel.name)) ??
        null
    );
}

async function findOrCreateCategory(guild, { aliases, name, permissionOverwrites, reason }) {
    let category = await findCategoryByNames(guild, [...aliases, name]);
    if (category) {
        if (category.name !== name) await category.setName(name, reason);
        if (permissionOverwrites) await category.permissionOverwrites.set(permissionOverwrites);
        return category;
    }

    return guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        permissionOverwrites,
        reason,
    });
}

async function findOrCreateTextChannel(guild, { aliases, name, parent, topic, permissionOverwrites, reason }) {
    let channel = await findChannelByNames(guild, [...aliases, name]);
    if (channel) {
        if (channel.name !== name) await channel.setName(name, reason);
        if (topic) await channel.setTopic(topic, reason);
        if (parent) await channel.setParent(parent.id, { lockPermissions: false });
        if (permissionOverwrites) await channel.permissionOverwrites.set(permissionOverwrites);
        return channel;
    }

    return guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: parent?.id,
        topic,
        permissionOverwrites,
        reason,
    });
}

async function findOrCreateRole(guild, { aliases, name, color, reason }) {
    let role = guild.roles.cache.find((entry) => aliases.includes(entry.name));
    if (role) {
        if (role.name !== name) await role.setName(name, reason);
        return role;
    }

    return guild.roles.create({ name, color, reason });
}

async function publishEmbedToChannel(channel, embed, options = {}) {
    const { title, components } = options;
    const messages = await channel.messages.fetch({ limit: 15 });
    const existing = messages.find((message) => message.author.id === client.user.id && message.embeds[0]?.title === title);

    if (existing) {
        await existing.edit({ embeds: [embed], components: components ?? [] });
        return existing;
    }

    return channel.send({ embeds: [embed], components: components ?? [] });
}

async function publishRulesToChannel(channel) {
    return publishEmbedToChannel(channel, buildRulesEmbed(), { title: EMBED_TITLES.RULES });
}

async function publishVerifyToChannel(channel, rulesChannel) {
    const embed = buildVerifyEmbed(rulesChannel);
    const row = buildVerifyButtonRow();
    const messages = await channel.messages.fetch({ limit: 15 });
    const existing = messages.find(
        (message) => message.author.id === client.user.id && message.embeds[0]?.title === EMBED_TITLES.VERIFY
    );

    if (existing) {
        await existing.edit({ embeds: [embed], components: [row] });
        return existing;
    }

    return channel.send({ embeds: [embed], components: [row] });
}

function buildVerifiedOnlyPermissions(guild, verifiedRoleId) {
    return [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: verifiedRoleId, allow: [PermissionFlagsBits.ViewChannel] },
        {
            id: client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageRoles,
            ],
        },
    ];
}

function buildPublicChannelPermissions(guild, verifiedRoleId) {
    return [
        {
            id: guild.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        },
        {
            id: verifiedRoleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        },
        {
            id: client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
            ],
        },
    ];
}

function buildReadOnlyPermissions(guild, verifiedRoleId) {
    return [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: verifiedRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages],
        },
        {
            id: client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
            ],
        },
    ];
}

function buildOnboardingReadOnlyPermissions(guild) {
    return [
        {
            id: guild.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages],
        },
        {
            id: client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
            ],
        },
    ];
}

function buildStatsVoicePermissions(guild) {
    return [
        {
            id: guild.id,
            allow: [PermissionFlagsBits.ViewChannel],
            deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
        },
        {
            id: client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.ManageChannels,
            ],
        },
    ];
}

function buildLuxuryTicketPermissions(guild, userId, staffRoleId) {
    const overwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: userId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks,
            ],
        },
        {
            id: client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
            ],
        },
    ];

    if (staffRoleId) {
        overwrites.push({
            id: staffRoleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles,
            ],
        });
    }

    return overwrites;
}

function buildLuxurySneakerEmbed() {
    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.LUXURY_SNEAKERS)
        .setDescription('Premium replica sneakers — curated batches, QC before shipping, tracked delivery.')
        .addFields(catalogLinesToFields(LUXURY_SNEAKER_LINES))
        .setColor(0xf97316)
        .setFooter({ text: 'Click Order Sneakers below • QC provided • Worldwide shipping' });
}

function buildLuxuryWatchEmbed() {
    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.LUXURY_WATCHES)
        .setDescription('High-end replica watches — detailed finishing, movement options on request.')
        .addFields(catalogLinesToFields(LUXURY_WATCH_LINES))
        .setColor(0xeab308)
        .setFooter({ text: 'Click Order Watches below • QC video • Insured shipping' });
}

function buildLuxuryProcurementEmbed() {
    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.LUXURY_PROCUREMENT)
        .setDescription(
            '**Not limited to sneakers or watches.** Tell us what you want — we source it for you.\n\n' +
                'Bags, clothes, accessories, electronics, or anything else. Submit photos, links, or a description in your private ticket.'
        )
        .addFields(catalogLinesToFields(LUXURY_PROCUREMENT_LINES))
        .addFields({
            name: '📝 What to include in your ticket',
            value:
                'Item name • Reference photos / links • Size / color / quantity • Budget (optional) • Shipping country',
            inline: false,
        })
        .setColor(0xa855f7)
        .setFooter({ text: 'Click Open Procurement Ticket below • Staff will confirm availability & pricing' });
}

function buildLuxuryOrderPanelEmbed(orderChannel, procurementChannel) {
    const orderMention = orderChannel ? `${orderChannel}` : '#order-here';
    const procurementMention = procurementChannel ? `${procurementChannel}` : '#custom-procurement';

    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.LUXURY_ORDER)
        .setDescription('Choose a ticket type below. A **private invoice channel** opens for you and sales staff.')
        .addFields(
            {
                name: '👟 Sneakers',
                value: 'Jordan, Dunk, Yeezy, NB & more',
                inline: true,
            },
            {
                name: '⌚ Watches',
                value: 'Rolex, AP, Patek, Cartier style',
                inline: true,
            },
            {
                name: '🧾 Mixed Order',
                value: 'Sneakers + watches in one invoice',
                inline: true,
            },
            {
                name: '✨ Free Procurement 自由采购',
                value: `Anything else — use ${procurementMention} or the button below`,
                inline: true,
            },
            {
                name: '📋 How it works',
                value:
                    '**1.** Pick a ticket type\n' +
                    '**2.** Private channel opens with invoice #\n' +
                    '**3.** Reply with item details & shipping info\n' +
                    '**4.** Receive quote, QC photos & payment link\n' +
                    '**5.** Tracking after dispatch',
                inline: false,
            }
        )
        .setColor(0x22c55e)
        .setFooter({ text: `Read #payment-shipping & #store-rules first • Sneakers/watches also in their catalogs` });
}

function buildLuxuryPaymentEmbed() {
    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.LUXURY_PAYMENT)
        .setDescription('Payment and shipping details are confirmed in your private ticket.')
        .addFields(
            {
                name: '💰 Payment Methods',
                value:
                    '• Crypto — USDT / BTC / ETH\n' +
                    '• PayPal — Friends & Family (where available)\n' +
                    '• Bank transfer — select regions',
                inline: true,
            },
            {
                name: '📦 Shipping',
                value:
                    '• Standard — 7–14 business days\n' +
                    '• Express — 4–7 days (extra fee)\n' +
                    '• Double-boxed, discreet packaging\n' +
                    '• Tracking after dispatch',
                inline: true,
            },
            {
                name: '🧾 Your Invoice Includes',
                value: 'Item list • Unit price • Shipping • Total due • Payment deadline',
                inline: false,
            }
        )
        .setColor(0x3b82f6);
}

function buildLuxuryStoreRulesEmbed(channels = {}) {
    const orderMention = channels.orderChannel ? `${channels.orderChannel}` : '#order-here';
    const procurementMention = channels.procurementChannel
        ? `${channels.procurementChannel}`
        : '#custom-procurement';
    const paymentMention = channels.paymentChannel ? `${channels.paymentChannel}` : '#payment-shipping';
    const sneakerMention = channels.sneakerCatalog ? `${channels.sneakerCatalog}` : '#sneaker-catalog';
    const watchMention = channels.watchCatalog ? `${channels.watchCatalog}` : '#watch-catalog';

    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.LUXURY_STORE_RULES)
        .setDescription(
            '**Welcome to RED Sneaker & Watch!** Read this before you buy.\n' +
                '欢迎来到本店！**采购与下单前请先阅读本规则。**'
        )
        .addFields(
            {
                name: '🛒 How to Purchase & Place an Order',
                value:
                    `**1.** Go to ${orderMention} or ${procurementMention}\n` +
                    '**2.** Click a ticket button:\n' +
                    '　• 👟 **Sneakers** — replica sneakers\n' +
                    '　• ⌚ **Watches** — luxury watches\n' +
                    '　• 🧾 **Mixed Order** — sneakers + watches together\n' +
                    '　• ✨ **Free Procurement** — anything else (bags, clothes, accessories…)\n' +
                    '**3.** A **private ticket** opens — reply with:\n' +
                    '　• Item model / photos / links\n' +
                    '　• Size, color, quantity\n' +
                    '　• Shipping country & city\n' +
                    '**4.** Staff sends quote → QC photos → payment instructions\n' +
                    '**5.** Approve QC → pay → tracking after dispatch\n\n' +
                    `💳 Payment & shipping info: ${paymentMention}`,
                inline: false,
            },
            {
                name: '👟 Sneakers',
                value: `Catalog: ${sneakerMention}\nClick **Order Sneakers** to open a ticket`,
                inline: true,
            },
            {
                name: '⌚ Watches',
                value: `Catalog: ${watchMention}\nClick **Order Watches** to open a ticket`,
                inline: true,
            },
            {
                name: '✨ Free Procurement 自由采购',
                value: `Channel: ${procurementMention}\nSubmit anything you want — not limited to shoes or watches`,
                inline: true,
            },
            {
                name: '📌 Store Policies',
                value:
                    '• All sales through official tickets — **no DM deals**\n' +
                    '• QC approval required before shipping\n' +
                    '• No refunds after dispatch unless defect confirmed\n' +
                    '• Chargebacks = permanent ban\n' +
                    '• Respect staff — abusive behavior closes your ticket',
                inline: false,
            },
            {
                name: '⚠️ Disclaimer',
                value: 'Replica products are for collection/display. You are responsible for compliance with local laws.',
                inline: false,
            }
        )
        .setColor(0xef4444)
        .setFooter({ text: 'New members: read this channel first before ordering • RED Sneaker & Watch' });
}

function buildLuxuryTicketButtonRows() {
    const categoryRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('luxury_ticket_sneakers')
            .setLabel('Sneakers')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👟'),
        new ButtonBuilder()
            .setCustomId('luxury_ticket_watches')
            .setLabel('Watches')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⌚'),
        new ButtonBuilder()
            .setCustomId('luxury_ticket_mixed')
            .setLabel('Mixed Order')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🧾'),
        new ButtonBuilder()
            .setCustomId('luxury_ticket_procurement')
            .setLabel('Free Procurement')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✨')
    );

    return [categoryRow];
}

function buildLuxuryProcurementButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('luxury_ticket_procurement')
            .setLabel('Open Procurement Ticket')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✨')
    );
}

function buildLuxuryCatalogButtons(type) {
    const customId =
        type === 'sneakers'
            ? 'luxury_ticket_sneakers'
            : type === 'watches'
              ? 'luxury_ticket_watches'
              : 'luxury_ticket_mixed';

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(type === 'sneakers' ? 'Order Sneakers' : 'Order Watches')
            .setStyle(ButtonStyle.Danger)
            .setEmoji(type === 'sneakers' ? '👟' : '⌚')
    );
}

function buildLuxuryInvoiceEmbed({ ticketNumber, user, category, channel }) {
    const categoryEmoji =
        category === 'Sneakers'
            ? '👟'
            : category === 'Watches'
              ? '⌚'
              : category === 'Mixed Order'
                ? '🧾'
                : '✨';

    return new EmbedBuilder()
        .setTitle(`${categoryEmoji} Invoice #${ticketNumber}`)
        .setDescription(`**${category}** ticket — awaiting your order details.`)
        .addFields(
            { name: 'Customer', value: `${user}`, inline: true },
            { name: 'Status', value: 'Open — awaiting details', inline: true },
            { name: 'Ticket', value: `${channel}`, inline: true },
            {
                name: 'Please reply with',
                value: getLuxuryInvoicePrompts(category),
                inline: false,
            }
        )
        .setColor(category === 'Free Procurement' ? 0xa855f7 : 0x10b981)
        .setTimestamp()
        .setFooter({ text: 'RED Sneaker & Watch • Official Order Ticket' });
}

async function findOrCreateVoiceChannel(guild, { aliases, name, parent, permissionOverwrites, reason }) {
    let channel = await findChannelByNames(guild, [...aliases, name]);
    if (channel && channel.type !== ChannelType.GuildVoice) {
        channel = null;
    }

    if (channel) {
        if (channel.name !== name) await channel.setName(name, reason);
        if (parent) await channel.setParent(parent.id, { lockPermissions: false });
        if (permissionOverwrites) await channel.permissionOverwrites.set(permissionOverwrites);
        return channel;
    }

    return guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: parent?.id,
        permissionOverwrites,
        reason,
    });
}

async function runMemberCountSetup(guild) {
    const botMember = guild.members.me;
    const setupReason = 'Live member count channel setup';

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        throw new Error('The bot needs **Manage Channels** permission.');
    }

    const statsCategory = await findOrCreateCategory(guild, {
        aliases: ['📊 Live Stats', '📊 LIVE STATS'],
        name: '📊 Live Stats',
        permissionOverwrites: [
            { id: guild.id, allow: [PermissionFlagsBits.ViewChannel] },
            {
                id: client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.Connect,
                ],
            },
        ],
        reason: setupReason,
    });

    await guild.members.fetch().catch(() => {});
    const total = guild.memberCount ?? guild.members.cache.size;
    const memberChannel = await findOrCreateVoiceChannel(guild, {
        aliases: ['member-count', 'members-count', 'live-members'],
        name: formatMemberCountName(total),
        parent: statsCategory,
        permissionOverwrites: buildStatsVoicePermissions(guild),
        reason: setupReason,
    });

    const statsInfoChannel = await findOrCreateTextChannel(guild, {
        aliases: ['member-stats-info', 'live-stats-info'],
        name: 'stats-info',
        parent: statsCategory,
        topic: 'How live member stats work',
        permissionOverwrites: buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const statsEmbed = new EmbedBuilder()
        .setTitle(EMBED_TITLES.MEMBER_STATS)
        .setDescription(
            `The voice channel ${memberChannel} displays the **live member count** and updates automatically when members join or leave.\n\n` +
                '**Note:** Discord limits how often channel names can change, so the number may take a few minutes to refresh.\n\n' +
                'Admins can run `/setup-member-count` again to recreate or repair the stats channel.'
        )
        .setColor(0x6366f1);

    await publishEmbedToChannel(statsInfoChannel, statsEmbed, { title: EMBED_TITLES.MEMBER_STATS });

    saveGuildConfig(guild.id, {
        member_count_channel_id: memberChannel.id,
        member_stats_category_id: statsCategory.id,
        member_stats_info_channel_id: statsInfoChannel.id,
        member_count_enabled: 1,
    });

    return { statsCategory, memberChannel, statsInfoChannel };
}

async function createLuxuryTicket(guild, user, category, config) {
    const existing = getOpenLuxuryTicket(guild.id, user.id);
    if (existing) {
        const existingChannel = guild.channels.cache.get(existing.channel_id);
        if (existingChannel) {
            return { channel: existingChannel, created: false, ticketNumber: existing.ticket_number };
        }
    }

    const tickets = loadTickets();
    const ticketNumber = `${Date.now().toString().slice(-8)}`;
    const slug = sanitizeChannelSlug(user.username);
    const categorySlug = sanitizeChannelSlug(category);
    const channelName = `order-${slug}-${categorySlug}`.slice(0, 100);

    const ticketCategoryId = config?.luxury_ticket_category_id ?? null;
    const staffRoleId = config?.luxury_staff_role_id ?? null;

    const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: ticketCategoryId ?? undefined,
        topic: `Luxury order ticket #${ticketNumber} • ${user.tag} • ${category}`,
        permissionOverwrites: buildLuxuryTicketPermissions(guild, user.id, staffRoleId),
        reason: 'Luxury store order ticket',
    });

    const ticketId = `${guild.id}-${ticketChannel.id}`;
    tickets[ticketId] = {
        ticket_id: ticketId,
        ticket_number: ticketNumber,
        guild_id: guild.id,
        channel_id: ticketChannel.id,
        user_id: user.id,
        category,
        status: 'open',
        created_at: new Date().toISOString(),
    };
    saveTickets(tickets);

    const invoiceEmbed = buildLuxuryInvoiceEmbed({
        ticketNumber,
        user,
        category,
        channel: ticketChannel,
    });

    const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('luxury_close_ticket')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔒')
    );

    const staffMention = staffRoleId ? `<@&${staffRoleId}>` : '';
    await ticketChannel.send({
        content: `${user} ${staffMention}`.trim(),
        embeds: [invoiceEmbed],
        components: [closeRow],
        allowedMentions: { users: [user.id], roles: staffRoleId ? [staffRoleId] : [] },
    });

    return { channel: ticketChannel, created: true, ticketNumber };
}

async function runLuxuryStoreSetup(guild) {
    const botMember = guild.members.me;
    const setupReason = 'Luxury sneakers & watches store setup';
    const config = getGuildConfig(guild.id) ?? {};

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        throw new Error('The bot needs **Manage Channels** permission.');
    }
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new Error('The bot needs **Manage Roles** permission.');
    }

    const verifiedRoleId = config.verified_role_id;
    const verifiedOnly = verifiedRoleId
        ? (g, roleId) => buildVerifiedOnlyPermissions(g, roleId)
        : (g) => [
              { id: g.id, allow: [PermissionFlagsBits.ViewChannel] },
              {
                  id: client.user.id,
                  allow: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.ManageChannels,
                  ],
              },
          ];

    const staffRole = await findOrCreateRole(guild, {
        aliases: [LUXURY_STAFF_ROLE_NAME, 'Sales Staff'],
        name: LUXURY_STAFF_ROLE_NAME,
        color: 0x8b5cf6,
        reason: setupReason,
    });

    const communityCategory = await findOrCreateCategory(guild, {
        aliases: ['💬 Community', '💬 Lounge'],
        name: '💬 Community',
        permissionOverwrites: verifiedRoleId
            ? buildVerifiedOnlyPermissions(guild, verifiedRoleId)
            : [{ id: guild.id, allow: [PermissionFlagsBits.ViewChannel] }],
        reason: setupReason,
    });

    const generalChat = await findOrCreateTextChannel(guild, {
        aliases: ['general-chat', 'lounge', 'chat', '闲聊'],
        name: 'general-chat',
        parent: communityCategory,
        topic: 'Casual chat — hang out and talk',
        permissionOverwrites: verifiedRoleId
            ? buildPublicChannelPermissions(guild, verifiedRoleId)
            : [
                  {
                      id: guild.id,
                      allow: [
                          PermissionFlagsBits.ViewChannel,
                          PermissionFlagsBits.SendMessages,
                          PermissionFlagsBits.ReadMessageHistory,
                      ],
                  },
                  {
                      id: client.user.id,
                      allow: [
                          PermissionFlagsBits.ViewChannel,
                          PermissionFlagsBits.SendMessages,
                          PermissionFlagsBits.ManageChannels,
                      ],
                  },
              ],
        reason: setupReason,
    });

    const chatIntroEmbed = new EmbedBuilder()
        .setTitle('💬 General Chat')
        .setDescription(
            'Casual conversation — introduce yourself and chat with the community.\n\n' +
                '📋 **New here?** Read **#store-rules** first — it explains how to purchase and place orders.'
        )
        .setColor(0x3b82f6);

    await publishEmbedToChannel(generalChat, chatIntroEmbed, { title: '💬 General Chat' });

    const sneakersCategory = await findOrCreateCategory(guild, {
        aliases: ['👟 SNEAKERS', '👟 Sneakers'],
        name: '👟 SNEAKERS',
        permissionOverwrites: verifiedRoleId
            ? buildVerifiedOnlyPermissions(guild, verifiedRoleId)
            : [{ id: guild.id, allow: [PermissionFlagsBits.ViewChannel] }],
        reason: setupReason,
    });

    const sneakerCatalog = await findOrCreateTextChannel(guild, {
        aliases: ['sneaker-catalog', 'catalog-sneakers'],
        name: 'sneaker-catalog',
        parent: sneakersCategory,
        topic: 'Premium replica sneaker catalog & ordering',
        permissionOverwrites: verifiedRoleId
            ? buildReadOnlyPermissions(guild, verifiedRoleId)
            : buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const sneakerQc = await findOrCreateTextChannel(guild, {
        aliases: ['sneaker-qc', 'sneaker-qc-gallery'],
        name: 'sneaker-qc',
        parent: sneakersCategory,
        topic: 'QC photos and videos for sneaker orders',
        permissionOverwrites: verifiedRoleId
            ? buildPublicChannelPermissions(guild, verifiedRoleId)
            : buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const sneakerChat = await findOrCreateTextChannel(guild, {
        aliases: ['sneaker-chat', 'sneaker-discussion'],
        name: 'sneaker-chat',
        parent: sneakersCategory,
        topic: 'Discuss sneaker models and batches',
        permissionOverwrites: verifiedRoleId
            ? buildPublicChannelPermissions(guild, verifiedRoleId)
            : buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const watchesCategory = await findOrCreateCategory(guild, {
        aliases: ['⌚ WATCHES', '⌚ Watches'],
        name: '⌚ WATCHES',
        permissionOverwrites: verifiedRoleId
            ? buildVerifiedOnlyPermissions(guild, verifiedRoleId)
            : [{ id: guild.id, allow: [PermissionFlagsBits.ViewChannel] }],
        reason: setupReason,
    });

    const watchCatalog = await findOrCreateTextChannel(guild, {
        aliases: ['watch-catalog', 'catalog-watches'],
        name: 'watch-catalog',
        parent: watchesCategory,
        topic: 'Luxury replica watch catalog & ordering',
        permissionOverwrites: verifiedRoleId
            ? buildReadOnlyPermissions(guild, verifiedRoleId)
            : buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const watchQc = await findOrCreateTextChannel(guild, {
        aliases: ['watch-qc', 'watch-qc-gallery'],
        name: 'watch-qc',
        parent: watchesCategory,
        topic: 'QC photos and videos for watch orders',
        permissionOverwrites: verifiedRoleId
            ? buildPublicChannelPermissions(guild, verifiedRoleId)
            : buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const watchChat = await findOrCreateTextChannel(guild, {
        aliases: ['watch-chat', 'watch-discussion'],
        name: 'watch-chat',
        parent: watchesCategory,
        topic: 'Discuss watch models and movements',
        permissionOverwrites: verifiedRoleId
            ? buildPublicChannelPermissions(guild, verifiedRoleId)
            : buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const ordersCategory = await findOrCreateCategory(guild, {
        aliases: ['🛒 ORDERS', '🛒 Orders & Tickets'],
        name: '🛒 ORDERS',
        permissionOverwrites: verifiedOnly(guild, verifiedRoleId),
        reason: setupReason,
    });

    const ticketCategory = await findOrCreateCategory(guild, {
        aliases: ['🎫 Active Tickets', '🎫 Tickets'],
        name: '🎫 Active Tickets',
        permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
                id: client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.SendMessages,
                ],
            },
            {
                id: staffRole.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                ],
            },
        ],
        reason: setupReason,
    });

    const orderHere = await findOrCreateTextChannel(guild, {
        aliases: ['order-here', 'open-ticket', 'place-order'],
        name: 'order-here',
        parent: ordersCategory,
        topic: 'Open a private order ticket with invoice',
        permissionOverwrites: verifiedRoleId
            ? buildReadOnlyPermissions(guild, verifiedRoleId)
            : buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const procurementChannel = await findOrCreateTextChannel(guild, {
        aliases: ['custom-procurement', 'free-procurement', 'procurement', '自由采购'],
        name: 'custom-procurement',
        parent: ordersCategory,
        topic: 'Free procurement — order anything beyond sneakers & watches',
        permissionOverwrites: verifiedRoleId
            ? buildReadOnlyPermissions(guild, verifiedRoleId)
            : buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const paymentShipping = await findOrCreateTextChannel(guild, {
        aliases: ['payment-shipping', 'payment-methods'],
        name: 'payment-shipping',
        parent: ordersCategory,
        topic: 'Payment methods and shipping information',
        permissionOverwrites: verifiedRoleId
            ? buildReadOnlyPermissions(guild, verifiedRoleId)
            : buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const storeRules = await findOrCreateTextChannel(guild, {
        aliases: ['store-rules', 'luxury-rules'],
        name: 'store-rules',
        parent: ordersCategory,
        topic: 'Store policies and disclaimers',
        permissionOverwrites: verifiedRoleId
            ? buildReadOnlyPermissions(guild, verifiedRoleId)
            : buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    await publishLuxuryStorePanels(guild, {
        sneakerCatalog,
        watchCatalog,
        orderHere,
        procurementChannel,
        paymentShipping,
        storeRules,
        sneakerQc,
        watchQc,
    });

    saveGuildConfig(guild.id, {
        luxury_store_complete: 1,
        luxury_staff_role_id: staffRole.id,
        luxury_ticket_category_id: ticketCategory.id,
        luxury_order_channel_id: orderHere.id,
        luxury_procurement_channel_id: procurementChannel.id,
        luxury_store_rules_channel_id: storeRules.id,
        luxury_sneaker_catalog_id: sneakerCatalog.id,
        luxury_watch_catalog_id: watchCatalog.id,
        general_chat_channel_id: generalChat.id,
    });

    return {
        staffRole,
        communityCategory,
        generalChat,
        sneakersCategory,
        sneakerCatalog,
        sneakerQc,
        sneakerChat,
        watchesCategory,
        watchCatalog,
        watchQc,
        watchChat,
        ordersCategory,
        ticketCategory,
        orderHere,
        procurementChannel,
        paymentShipping,
        storeRules,
    };
}

async function publishLuxuryStorePanels(guild, channels) {
    const {
        sneakerCatalog,
        watchCatalog,
        orderHere,
        procurementChannel,
        paymentShipping,
        storeRules,
        sneakerQc,
        watchQc,
    } = channels;

    await publishEmbedToChannel(sneakerCatalog, buildLuxurySneakerEmbed(), {
        title: EMBED_TITLES.LUXURY_SNEAKERS,
        components: [buildLuxuryCatalogButtons('sneakers')],
    });

    await publishEmbedToChannel(watchCatalog, buildLuxuryWatchEmbed(), {
        title: EMBED_TITLES.LUXURY_WATCHES,
        components: [buildLuxuryCatalogButtons('watches')],
    });

    await publishEmbedToChannel(orderHere, buildLuxuryOrderPanelEmbed(orderHere, procurementChannel), {
        title: EMBED_TITLES.LUXURY_ORDER,
        components: buildLuxuryTicketButtonRows(),
    });

    await publishEmbedToChannel(procurementChannel, buildLuxuryProcurementEmbed(), {
        title: EMBED_TITLES.LUXURY_PROCUREMENT,
        components: [buildLuxuryProcurementButtonRow()],
    });

    await publishEmbedToChannel(paymentShipping, buildLuxuryPaymentEmbed(), {
        title: EMBED_TITLES.LUXURY_PAYMENT,
    });

    await publishEmbedToChannel(
        storeRules,
        buildLuxuryStoreRulesEmbed({
            orderChannel: orderHere,
            procurementChannel,
            paymentChannel: paymentShipping,
            sneakerCatalog,
            watchCatalog,
        }),
        { title: EMBED_TITLES.LUXURY_STORE_RULES }
    );

    const qcSneakerEmbed = new EmbedBuilder()
        .setTitle('👟 Sneaker QC Gallery')
        .setDescription(
            'Staff posts pre-shipment QC photos and videos here.\n\nCustomers: request extra angles in your private ticket.'
        )
        .setColor(0xf97316);

    await publishEmbedToChannel(sneakerQc, qcSneakerEmbed, { title: '👟 Sneaker QC Gallery' });

    const qcWatchEmbed = new EmbedBuilder()
        .setTitle('⌚ Watch QC Gallery')
        .setDescription(
            'Staff posts macro shots, movement checks, and wrist fit references here.\n\nCustomers: approve QC in your ticket before we ship.'
        )
        .setColor(0xeab308);

    await publishEmbedToChannel(watchQc, qcWatchEmbed, { title: '⌚ Watch QC Gallery' });
}

async function refreshLuxuryStorePanels(guild) {
    const config = getGuildConfig(guild.id);
    if (!config?.luxury_store_complete) {
        throw new Error('Luxury store is not configured. Run `/setup-luxury-store` first.');
    }

    const verifiedRoleId = config.verified_role_id;

    let ordersCategory = null;
    if (config.luxury_order_channel_id) {
        const orderChannel = guild.channels.cache.get(config.luxury_order_channel_id);
        ordersCategory = orderChannel?.parent ?? null;
    }
    if (!ordersCategory) {
        ordersCategory = await findCategoryByNames(guild, ['🛒 ORDERS', '🛒 Orders & Tickets']);
    }

    const readOnly = verifiedRoleId
        ? (g) => buildReadOnlyPermissions(g, verifiedRoleId)
        : (g) => buildOnboardingReadOnlyPermissions(g);

    let procurementChannel = config.luxury_procurement_channel_id
        ? guild.channels.cache.get(config.luxury_procurement_channel_id)
        : null;

    if (!procurementChannel && ordersCategory) {
        procurementChannel = await findOrCreateTextChannel(guild, {
            aliases: ['custom-procurement', 'free-procurement', 'procurement', '自由采购'],
            name: 'custom-procurement',
            parent: ordersCategory,
            topic: 'Free procurement — order anything beyond sneakers & watches',
            permissionOverwrites: readOnly(guild),
            reason: 'Free procurement channel',
        });
        saveGuildConfig(guild.id, { luxury_procurement_channel_id: procurementChannel.id });
    }

    const sneakerCatalog =
        guild.channels.cache.get(config.luxury_sneaker_catalog_id) ??
        (await findChannelByNames(guild, ['sneaker-catalog', 'catalog-sneakers']));
    const watchCatalog =
        guild.channels.cache.get(config.luxury_watch_catalog_id) ??
        (await findChannelByNames(guild, ['watch-catalog', 'catalog-watches']));
    const orderHere =
        guild.channels.cache.get(config.luxury_order_channel_id) ??
        (await findChannelByNames(guild, ['order-here', 'open-ticket', 'place-order']));
    const paymentShipping = await findChannelByNames(guild, ['payment-shipping', 'payment-methods']);
    const storeRules = await findChannelByNames(guild, ['store-rules', 'luxury-rules']);
    const sneakerQc = await findChannelByNames(guild, ['sneaker-qc', 'sneaker-qc-gallery']);
    const watchQc = await findChannelByNames(guild, ['watch-qc', 'watch-qc-gallery']);

    const missing = [];
    if (!sneakerCatalog) missing.push('sneaker-catalog');
    if (!watchCatalog) missing.push('watch-catalog');
    if (!orderHere) missing.push('order-here');
    if (!procurementChannel) missing.push('custom-procurement');
    if (!paymentShipping) missing.push('payment-shipping');
    if (!storeRules) missing.push('store-rules');
    if (!sneakerQc) missing.push('sneaker-qc');
    if (!watchQc) missing.push('watch-qc');
    if (missing.length) {
        throw new Error(`Missing channels: ${missing.join(', ')}. Run \`/setup-luxury-store\` to repair.`);
    }

    saveGuildConfig(guild.id, {
        luxury_store_rules_channel_id: storeRules.id,
        luxury_procurement_channel_id: procurementChannel.id,
    });

    await publishLuxuryStorePanels(guild, {
        sneakerCatalog,
        watchCatalog,
        orderHere,
        procurementChannel,
        paymentShipping,
        storeRules,
        sneakerQc,
        watchQc,
    });

    return { orderHere, procurementChannel, storeRules, sneakerCatalog, watchCatalog };
}

async function runOneClickSetup(guild) {
    const botMember = guild.members.me;
    const setupReason = 'RED DMA main bot setup';

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        throw new Error('The bot needs **Manage Channels** permission to run setup.');
    }
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new Error('The bot needs **Manage Roles** permission to run setup.');
    }

    const verifiedRole = await findOrCreateRole(guild, {
        aliases: VERIFIED_ROLE_ALIASES,
        name: VERIFIED_ROLE_NAME,
        color: 0x22c55e,
        reason: setupReason,
    });

    const unverifiedRole = await findOrCreateRole(guild, {
        aliases: UNVERIFIED_ROLE_ALIASES,
        name: UNVERIFIED_ROLE_NAME,
        color: 0x94a3b8,
        reason: setupReason,
    });

    if (verifiedRole.position >= botMember.roles.highest.position) {
        throw new Error('Move the bot role above **Verified**, then run `/setup` again.');
    }

    const onboardingCategory = await findOrCreateCategory(guild, {
        aliases: ['📋 Getting Started', '📋 入门指南'],
        name: '📋 Getting Started',
        permissionOverwrites: [
            { id: guild.id, allow: [PermissionFlagsBits.ViewChannel] },
            {
                id: client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ManageChannels,
                ],
            },
        ],
        reason: setupReason,
    });

    const rulesChannel = await findOrCreateTextChannel(guild, {
        aliases: ['rules', '规则'],
        name: 'rules',
        parent: onboardingCategory,
        topic: 'Server rules — required reading for all members',
        permissionOverwrites: buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const verifyChannel = await findOrCreateTextChannel(guild, {
        aliases: ['verification', '验证'],
        name: 'verification',
        parent: onboardingCategory,
        topic: 'Complete verification to unlock the server',
        permissionOverwrites: buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const welcomeChannel = await findOrCreateTextChannel(guild, {
        aliases: ['welcome', '欢迎'],
        name: 'welcome',
        parent: onboardingCategory,
        topic: 'New member welcome messages',
        permissionOverwrites: buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const serverInfoChannel = await findOrCreateTextChannel(guild, {
        aliases: ['server-info', 'about', 'about-server'],
        name: 'server-info',
        parent: onboardingCategory,
        topic: 'About the RED DMA main hub',
        permissionOverwrites: buildOnboardingReadOnlyPermissions(guild),
        reason: setupReason,
    });

    const communityCategory = await findOrCreateCategory(guild, {
        aliases: ['💬 Community', '💬 社区交流'],
        name: '💬 Community',
        permissionOverwrites: buildVerifiedOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const announceChannel = await findOrCreateTextChannel(guild, {
        aliases: ['announcements', '公告'],
        name: 'announcements',
        parent: communityCategory,
        topic: 'Official announcements',
        permissionOverwrites: buildReadOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const chatChannel = await findOrCreateTextChannel(guild, {
        aliases: ['general-chat', '综合聊天', '常规', 'lounge', 'chat', '闲聊'],
        name: 'general-chat',
        parent: communityCategory,
        topic: 'Casual chat — hang out and talk',
        permissionOverwrites: buildPublicChannelPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const chatIntroEmbed = new EmbedBuilder()
        .setTitle('💬 General Chat')
        .setDescription('Casual conversation — introduce yourself and chat with the community.')
        .setColor(0x3b82f6);

    await publishEmbedToChannel(chatChannel, chatIntroEmbed, { title: '💬 General Chat' });

    await cleanupDuplicateAliasChannels(
        guild,
        chatChannel,
        ['综合聊天', '常规'],
        'Removed duplicate chat channel after English setup'
    );

    const mediaChannel = await findOrCreateTextChannel(guild, {
        aliases: ['media-share', 'media', 'screenshots'],
        name: 'media-share',
        parent: communityCategory,
        topic: 'Share screenshots, clips, and media',
        permissionOverwrites: buildPublicChannelPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const suggestionsChannel = await findOrCreateTextChannel(guild, {
        aliases: ['suggestions', 'feedback'],
        name: 'suggestions',
        parent: communityCategory,
        topic: 'Community suggestions and feedback',
        permissionOverwrites: buildPublicChannelPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const supportCategory = await findOrCreateCategory(guild, {
        aliases: ['🛠️ Support & Resources', '🛠️ 服务支持'],
        name: '🛠️ Support & Resources',
        permissionOverwrites: buildVerifiedOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const helpChannel = await findOrCreateTextChannel(guild, {
        aliases: ['help-support', '帮助与支持', 'support'],
        name: 'help-support',
        parent: supportCategory,
        topic: 'Ask questions and get community help',
        permissionOverwrites: buildPublicChannelPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const websiteChannel = await findOrCreateTextChannel(guild, {
        aliases: ['website-products', '官网与产品', 'products'],
        name: 'website-products',
        parent: supportCategory,
        topic: 'Official website and product overview',
        permissionOverwrites: buildReadOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const faqChannel = await findOrCreateTextChannel(guild, {
        aliases: ['faq', 'questions'],
        name: 'faq',
        parent: supportCategory,
        topic: 'Frequently asked questions',
        permissionOverwrites: buildReadOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const purchaseGuideChannel = await findOrCreateTextChannel(guild, {
        aliases: ['purchase-guide', 'how-to-buy'],
        name: 'purchase-guide',
        parent: supportCategory,
        topic: 'Step-by-step purchase instructions',
        permissionOverwrites: buildReadOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const storeCategory = await findOrCreateCategory(guild, {
        aliases: ['🔗 Our Servers', '🛒 Store & Orders', '🔗 Store & Orders'],
        name: '🔗 Our Servers',
        permissionOverwrites: buildVerifiedOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const salesChannel = await findOrCreateTextChannel(guild, {
        aliases: ['red-dma', 'sales-server', 'sales', 'red-dma-server'],
        name: 'red-dma',
        parent: storeCategory,
        topic: 'Link to the RED DMA Sales Server for firmware and tickets',
        permissionOverwrites: buildReadOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const sneakerInvite = getSneakerInviteUrl(getGuildConfig(guild.id));
    const sneakerChannel = await findOrCreateTextChannel(guild, {
        aliases: ['sneaker-watch', 'sneaker-watch-server', 'sneakers-watches'],
        name: 'sneaker-watch',
        parent: storeCategory,
        topic: 'Link to the RED Sneaker & Watch store server',
        permissionOverwrites: buildReadOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    await publishRulesToChannel(rulesChannel);
    await publishVerifyToChannel(verifyChannel, rulesChannel);
    await publishWelcomeChannelIntro(welcomeChannel);

    await publishEmbedToChannel(serverInfoChannel, buildServerInfoEmbed(salesChannel, sneakerChannel), {
        title: EMBED_TITLES.SERVER_INFO,
    });

    const websiteEmbed = new EmbedBuilder()
        .setTitle(EMBED_TITLES.WEBSITE)
        .setDescription(
            '**Official Website:** https://reddma.xyz\n\n' +
                'Browse products, compatibility info, and onboarding guides on the website.\n' +
                'For firmware, go to #red-dma. For sneakers & watches, go to #sneaker-watch.'
        )
        .setColor(0xef4444);

    await publishEmbedToChannel(websiteChannel, websiteEmbed, { title: EMBED_TITLES.WEBSITE });

    const announceEmbed = new EmbedBuilder()
        .setTitle(EMBED_TITLES.ANNOUNCEMENTS)
        .setDescription('Official RED DMA announcements will be posted here. Stay tuned for updates.')
        .setColor(0xef4444);

    await publishEmbedToChannel(announceChannel, announceEmbed, { title: EMBED_TITLES.ANNOUNCEMENTS });

    await publishEmbedToChannel(salesChannel, buildSalesHubEmbed(), {
        title: EMBED_TITLES.SALES_HUB,
        components: [buildSalesHubButtons()],
    });

    const sneakerButtons = buildSneakerHubButtons(sneakerInvite);
    await publishEmbedToChannel(sneakerChannel, buildSneakerHubEmbed(), {
        title: EMBED_TITLES.SNEAKER_HUB,
        components: sneakerButtons ? [sneakerButtons] : [],
    });

    await publishEmbedToChannel(purchaseGuideChannel, buildPurchaseGuideEmbed(salesChannel), {
        title: EMBED_TITLES.PURCHASE_GUIDE,
    });

    await publishEmbedToChannel(faqChannel, buildFaqEmbed(), { title: EMBED_TITLES.FAQ });

    const suggestionsEmbed = new EmbedBuilder()
        .setTitle(EMBED_TITLES.SUGGESTIONS)
        .setDescription(
            'Have ideas to improve the community or our products? Share them here.\n\n' +
                'Please keep suggestions constructive. Staff may follow up in announcements.'
        )
        .setColor(0xa855f7);

    await publishEmbedToChannel(suggestionsChannel, suggestionsEmbed, { title: EMBED_TITLES.SUGGESTIONS });

    const mediaEmbed = new EmbedBuilder()
        .setTitle(EMBED_TITLES.MEDIA)
        .setDescription(
            'Share gameplay clips, setup photos, and media related to RED DMA.\n\n' +
                'Keep content appropriate and respect others\' privacy.'
        )
        .setColor(0x06b6d4);

    await publishEmbedToChannel(mediaChannel, mediaEmbed, { title: EMBED_TITLES.MEDIA });

    saveGuildConfig(guild.id, {
        welcome_channel_id: welcomeChannel.id,
        rules_channel_id: rulesChannel.id,
        verify_channel_id: verifyChannel.id,
        sales_channel_id: salesChannel.id,
        sneaker_channel_id: sneakerChannel.id,
        sneaker_server_invite: sneakerInvite || null,
        verified_role_id: verifiedRole.id,
        unverified_role_id: unverifiedRole.id,
        setup_complete: 1,
    });

    return {
        verifiedRole,
        unverifiedRole,
        rulesChannel,
        verifyChannel,
        welcomeChannel,
        serverInfoChannel,
        announceChannel,
        chatChannel,
        mediaChannel,
        suggestionsChannel,
        helpChannel,
        websiteChannel,
        faqChannel,
        purchaseGuideChannel,
        salesChannel,
        sneakerChannel,
    };
}

async function registerCommands() {
    const commands = [
        {
            name: 'setup',
            description: 'Create roles, channels, permissions, and publish panels (admin only)',
        },
        {
            name: 'publish-rules',
            description: 'Publish or update server rules in the rules channel (admin only)',
        },
        {
            name: 'publish-verify',
            description: 'Publish or update the verification panel (admin only)',
        },
        {
            name: 'setup-member-count',
            description: 'Create a live member count stats channel (admin only)',
        },
        {
            name: 'setup-luxury-store',
            description: 'Deploy sneakers & watches store with invoice tickets (admin only)',
        },
        {
            name: 'publish-luxury-panels',
            description: 'Refresh store panels, buttons & free procurement layout (admin only)',
        },
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('Registering slash commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Slash commands registered');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
}

function getCliGuildId() {
    const flags = [
        '--setup',
        '--setup-member-count',
        '--setup-luxury-store',
        '--publish-luxury-panels',
        '--cleanup-luxury',
    ];
    for (let i = 0; i < process.argv.length; i++) {
        const next = process.argv[i + 1];
        if (flags.includes(process.argv[i]) && next && !next.startsWith('--')) {
            return next;
        }
    }
    return null;
}

async function runCliSetupTask(guild, tasks) {
    for (const task of tasks) {
        if (task === 'main') {
            const result = await runOneClickSetup(guild);
            console.log('Main setup complete:', Object.keys(result).join(', '));
        }
        if (task === 'member-count') {
            const result = await runMemberCountSetup(guild);
            console.log('Member count setup complete:', Object.keys(result).join(', '));
        }
        if (task === 'luxury-store') {
            const result = await runLuxuryStoreSetup(guild);
            console.log('Luxury store setup complete:', Object.keys(result).join(', '));
        }
        if (task === 'cleanup-luxury') {
            await cleanupLuxuryStoreFromGuild(guild);
            console.log('Luxury store removed from hub server');
        }
        if (task === 'publish-luxury-panels') {
            const result = await refreshLuxuryStorePanels(guild);
            console.log('Luxury panels refreshed:', Object.keys(result).join(', '));
        }
    }
}

async function maybeAutoSetup() {
    const cliFlags = [
        { flag: '--setup', task: 'main' },
        { flag: '--setup-member-count', task: 'member-count' },
        { flag: '--setup-luxury-store', task: 'luxury-store' },
        { flag: '--publish-luxury-panels', task: 'publish-luxury-panels' },
        { flag: '--cleanup-luxury', task: 'cleanup-luxury' },
    ];

    const tasks = cliFlags.filter((entry) => process.argv.includes(entry.flag)).map((entry) => entry.task);
    const guildId = AUTO_SETUP_GUILD_ID || getCliGuildId();

    if (!tasks.length && !AUTO_SETUP_GUILD_ID) return;
    if (!guildId) return;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        console.error(`Could not find guild ${guildId} for auto setup`);
        return;
    }

    console.log(`Running setup for guild: ${guild.name} (${guild.id})`);
    await runCliSetupTask(guild, tasks.length ? tasks : ['main']);

    if (tasks.length) {
        setTimeout(() => process.exit(0), 1000);
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`RED DMA Main Bot online: ${client.user.tag}`);
    await registerCommands();
    await maybeAutoSetup();
    await refreshAllMemberCountChannels();
    setInterval(() => {
        refreshAllMemberCountChannels().catch(() => {});
    }, MEMBER_COUNT_COOLDOWN_MS);
});

client.on(Events.GuildMemberAdd, async (member) => {
    try {
        const config = getGuildConfig(member.guild.id);
        if (!config?.setup_complete && !config?.luxury_store_complete) {
            console.log(
                `Member joined ${member.guild.name} (${member.guild.id}) but server is not configured — skipping welcome`
            );
            return;
        }

        console.log(`New member: ${member.user.tag} joined ${member.guild.name} (${member.guild.id})`);

        if (config.setup_complete) {
            if (config.unverified_role_id) {
                const unverifiedRole = member.guild.roles.cache.get(config.unverified_role_id);
                if (unverifiedRole && !member.roles.cache.has(unverifiedRole.id)) {
                    await member.roles.add(unverifiedRole, 'New member joined');
                }
            }
        }

        const dmSent = await sendJoinDirectMessage(member, config);
        if (!dmSent) {
            await sendJoinWelcomeFallback(member, config);
        }
        if (config.luxury_store_complete) {
            await sendJoinRulesPing(member, config);
        }
        scheduleMemberCountUpdate(member.guild);
    } catch (error) {
        console.error('Failed to handle new member:', error);
    }
});

client.on(Events.GuildMemberRemove, (member) => {
    scheduleMemberCountUpdate(member.guild);
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isButton() && interaction.customId.startsWith('luxury_ticket_')) {
            const config = getGuildConfig(interaction.guild.id);
            if (!config?.luxury_store_complete) {
                await interaction.reply({
                    content: '❌ Luxury store is not configured. Ask an admin to run `/setup-luxury-store`.',
                    ephemeral: true,
                });
                return;
            }

            const category = LUXURY_TICKET_CATEGORIES[interaction.customId] ?? 'General';

            await interaction.deferReply({ ephemeral: true });
            const result = await createLuxuryTicket(
                interaction.guild,
                interaction.user,
                category,
                config
            );

            if (!result.created) {
                await interaction.editReply({
                    content: `You already have an open ticket: ${result.channel}`,
                });
                return;
            }

            await interaction.editReply({
                content: `✅ Invoice ticket **#${result.ticketNumber}** created: ${result.channel}`,
            });
            return;
        }

        if (interaction.isButton() && interaction.customId === 'luxury_close_ticket') {
            const tickets = loadTickets();
            const ticket = Object.values(tickets).find(
                (entry) => entry.channel_id === interaction.channel.id && entry.status === 'open'
            );

            const isOwner = ticket?.user_id === interaction.user.id;
            const isStaff =
                interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                (getGuildConfig(interaction.guild.id)?.luxury_staff_role_id &&
                    interaction.member.roles.cache.has(
                        getGuildConfig(interaction.guild.id).luxury_staff_role_id
                    ));

            if (!ticket) {
                await interaction.reply({ content: '❌ Ticket record not found.', ephemeral: true });
                return;
            }

            if (!isOwner && !isStaff) {
                await interaction.reply({
                    content: '❌ Only the ticket owner or sales staff can close this ticket.',
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            ticket.status = 'closed';
            ticket.closed_at = new Date().toISOString();
            ticket.closed_by = interaction.user.id;
            tickets[ticket.ticket_id] = ticket;
            saveTickets(tickets);

            await interaction.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🔒 Ticket Closed')
                        .setDescription(
                            `Closed by ${interaction.user}. This channel will be deleted in 10 seconds.\n` +
                                'Thank you for shopping with us.'
                        )
                        .setColor(0x64748b),
                ],
            });

            await interaction.editReply({ content: '✅ Ticket closed.' });
            setTimeout(() => interaction.channel.delete('Luxury ticket closed').catch(() => {}), 10000);
            return;
        }

        if (interaction.isButton() && interaction.customId === 'verify_member') {
            const config = getGuildConfig(interaction.guild.id);
            if (!config?.verified_role_id) {
                await interaction.reply({
                    content: '❌ Verification is not configured yet. Ask an admin to run `/setup`.',
                    ephemeral: true,
                });
                return;
            }

            const verifiedRole = interaction.guild.roles.cache.get(config.verified_role_id);
            if (!verifiedRole) {
                await interaction.reply({
                    content: '❌ The Verified role is missing. Ask an admin to run `/setup` again.',
                    ephemeral: true,
                });
                return;
            }

            if (interaction.member.roles.cache.has(verifiedRole.id)) {
                await interaction.reply({ content: '✅ You are already verified!', ephemeral: true });
                return;
            }

            await interaction.member.roles.add(verifiedRole, 'Account verification completed');

            if (config.unverified_role_id) {
                const unverifiedRole = interaction.guild.roles.cache.get(config.unverified_role_id);
                if (unverifiedRole && interaction.member.roles.cache.has(unverifiedRole.id)) {
                    await interaction.member.roles.remove(unverifiedRole, 'Account verification completed');
                }
            }

            const salesChannel = config.sales_channel_id
                ? interaction.guild.channels.cache.get(config.sales_channel_id)
                : null;
            const sneakerChannel = config.sneaker_channel_id
                ? interaction.guild.channels.cache.get(config.sneaker_channel_id)
                : null;
            const links = [salesChannel && `${salesChannel}`, sneakerChannel && `${sneakerChannel}`]
                .filter(Boolean)
                .join(' and ');

            await interaction.reply({
                content: `🎉 Verification complete! You now have access to the community.${links ? ` Visit ${links} for specialized servers.` : ''}`,
                ephemeral: true,
            });
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'setup') {
            if (!memberCanManage(interaction)) {
                await interaction.reply({ content: '❌ Admin only.', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            const result = await runOneClickSetup(interaction.guild);

            const summary = new EmbedBuilder()
                .setTitle('✅ Setup Complete')
                .setDescription(
                    'Roles, channels, permissions, and panels are ready.\n\n' +
                        `**Roles:** ${result.verifiedRole}, ${result.unverifiedRole}\n` +
                        `**Rules:** ${result.rulesChannel}\n` +
                        `**Verification:** ${result.verifyChannel}\n` +
                        `**Welcome:** ${result.welcomeChannel}\n` +
                        `**Server Info:** ${result.serverInfoChannel}\n` +
                        `**Announcements:** ${result.announceChannel}\n` +
                        `**General Chat:** ${result.chatChannel}\n` +
                        `**Media:** ${result.mediaChannel}\n` +
                        `**Suggestions:** ${result.suggestionsChannel}\n` +
                        `**Help:** ${result.helpChannel}\n` +
                        `**Website:** ${result.websiteChannel}\n` +
                        `**FAQ:** ${result.faqChannel}\n` +
                        `**Purchase Guide:** ${result.purchaseGuideChannel}\n` +
                        `**RED DMA:** ${result.salesChannel}\n` +
                        `**Sneaker & Watch:** ${result.sneakerChannel}\n\n` +
                        '**Tip:** Keep the bot role above **Verified**. New members receive a private welcome DM automatically.'
                )
                .setColor(0x22c55e);

            await interaction.editReply({ embeds: [summary] });
            return;
        }

        if (interaction.commandName === 'publish-rules') {
            if (!memberCanManage(interaction)) {
                await interaction.reply({ content: '❌ Admin only.', ephemeral: true });
                return;
            }

            const config = getGuildConfig(interaction.guild.id);
            const rulesChannelId = config?.rules_channel_id;
            const rulesChannel = rulesChannelId
                ? interaction.guild.channels.cache.get(rulesChannelId)
                : interaction.channel;

            if (!rulesChannel || rulesChannel.type !== ChannelType.GuildText) {
                await interaction.reply({
                    content: '❌ Rules channel not found. Run `/setup` first or use a text channel.',
                    ephemeral: true,
                });
                return;
            }

            await publishRulesToChannel(rulesChannel);

            if (config) {
                saveGuildConfig(interaction.guild.id, { rules_channel_id: rulesChannel.id });
            }

            await interaction.reply({
                content: `✅ Rules published in ${rulesChannel}`,
                ephemeral: true,
            });
            return;
        }

        if (interaction.commandName === 'publish-verify') {
            if (!memberCanManage(interaction)) {
                await interaction.reply({ content: '❌ Admin only.', ephemeral: true });
                return;
            }

            const config = getGuildConfig(interaction.guild.id);
            const verifyChannelId = config?.verify_channel_id;
            const verifyChannel = verifyChannelId
                ? interaction.guild.channels.cache.get(verifyChannelId)
                : interaction.channel;

            if (!verifyChannel || verifyChannel.type !== ChannelType.GuildText) {
                await interaction.reply({
                    content: '❌ Verification channel not found. Run `/setup` first or use a text channel.',
                    ephemeral: true,
                });
                return;
            }

            const rulesChannel = config?.rules_channel_id
                ? interaction.guild.channels.cache.get(config.rules_channel_id)
                : null;

            await publishVerifyToChannel(verifyChannel, rulesChannel);

            if (config) {
                saveGuildConfig(interaction.guild.id, { verify_channel_id: verifyChannel.id });
            }

            await interaction.reply({
                content: `✅ Verification panel published in ${verifyChannel}`,
                ephemeral: true,
            });
            return;
        }

        if (interaction.commandName === 'setup-member-count') {
            if (!memberCanManage(interaction)) {
                await interaction.reply({ content: '❌ Admin only.', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            const result = await runMemberCountSetup(interaction.guild);

            const summary = new EmbedBuilder()
                .setTitle('✅ Live Member Stats Ready')
                .setDescription(
                    'A voice channel now shows the live member count for everyone to see.\n\n' +
                        `**Category:** ${result.statsCategory}\n` +
                        `**Live counter:** ${result.memberChannel}\n` +
                        `**Info:** ${result.statsInfoChannel}\n\n` +
                        'The count updates when members join/leave (Discord may delay renames by a few minutes).'
                )
                .setColor(0x6366f1);

            await interaction.editReply({ embeds: [summary] });
            return;
        }

        if (interaction.commandName === 'setup-luxury-store') {
            if (!memberCanManage(interaction)) {
                await interaction.reply({ content: '❌ Admin only.', ephemeral: true });
                return;
            }

            if (interaction.guild.id === HUB_GUILD_ID) {
                await interaction.reply({
                    content:
                        '❌ The luxury store belongs on the **RED Sneaker and watch** server, not the main RED hub.\n' +
                        'Run `/setup-luxury-store` there instead. The hub only needs #red-dma and #sneaker-watch links.',
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            const result = await runLuxuryStoreSetup(interaction.guild);

            const summary = new EmbedBuilder()
                .setTitle('✅ Luxury Store Deployed')
                .setDescription(
                    'Storefront with invoice tickets and free procurement is live.\n\n' +
                        `**Staff role:** ${result.staffRole}\n` +
                        `**Order center:** ${result.orderHere}\n` +
                        `**Free procurement:** ${result.procurementChannel}\n` +
                        `**Sneaker catalog:** ${result.sneakerCatalog}\n` +
                        `**Watch catalog:** ${result.watchCatalog}\n` +
                        `**Payment info:** ${result.paymentShipping}\n` +
                        `**Store rules:** ${result.storeRules}\n` +
                        `**Ticket category:** ${result.ticketCategory}\n` +
                        `**QC galleries:** ${result.sneakerQc}, ${result.watchQc}\n` +
                        `**General chat:** ${result.generalChat}\n` +
                        `**Discussion:** ${result.sneakerChat}, ${result.watchChat}\n\n` +
                        'Ticket types: **Sneakers** • **Watches** • **Mixed** • **Free Procurement**. Assign **Luxury Sales Staff** to your team.'
                )
                .setColor(0xf59e0b);

            await interaction.editReply({ embeds: [summary] });
            return;
        }

        if (interaction.commandName === 'publish-luxury-panels') {
            if (!memberCanManage(interaction)) {
                await interaction.reply({ content: '❌ Admin only.', ephemeral: true });
                return;
            }

            if (interaction.guild.id === HUB_GUILD_ID) {
                await interaction.reply({
                    content: '❌ Run this on the **RED Sneaker and watch** server, not the main hub.',
                    ephemeral: true,
                });
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            const result = await refreshLuxuryStorePanels(interaction.guild);

            const summary = new EmbedBuilder()
                .setTitle('✅ Store Panels Updated')
                .setDescription(
                    'All storefront embeds and ticket buttons have been refreshed.\n\n' +
                        `**Order center:** ${result.orderHere}\n` +
                        `**Free procurement:** ${result.procurementChannel}\n` +
                        `**Sneaker catalog:** ${result.sneakerCatalog}\n` +
                        `**Watch catalog:** ${result.watchCatalog}\n\n` +
                        'Customers can now open **Free Procurement** tickets for any item.'
                )
                .setColor(0xa855f7);

            await interaction.editReply({ embeds: [summary] });
        }
    } catch (error) {
        console.error('Interaction error:', error);
        const payload = {
            content: `❌ Action failed: ${error.message || 'Unknown error'}`,
            ephemeral: true,
        };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
});

if (!TOKEN || !CLIENT_ID) {
    console.error('Missing TOKEN or CLIENT_ID. Set them in Railway Variables or a local .env file.');
    process.exit(1);
}

if (!/^[A-Za-z0-9._-]{50,}$/.test(TOKEN)) {
    console.error('Invalid TOKEN format. Copy the full Bot Token from Discord Developer Portal → Bot.');
    process.exit(1);
}

if (!/^\d{17,20}$/.test(CLIENT_ID)) {
    console.error('Invalid CLIENT_ID format. Use the Application ID from General Information.');
    process.exit(1);
}

const http = require('http');
const PORT = process.env.PORT || 3000;
http
    .createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('RED DMA Main Bot is running');
    })
    .listen(PORT, () => {
        console.log(`Health check port: ${PORT}`);
    });

client.login(TOKEN).catch((err) => {
    console.error('Login failed:', err);
    if (err.code === 'TokenInvalid') {
        console.error(
            'Discord rejected the TOKEN. Reset it at https://discord.com/developers/applications, ' +
                'update Railway Variables (no quotes, no "Bot " prefix), then redeploy.'
        );
    }
    process.exit(1);
});