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
const SALES_STATUS_CHANNEL_NAME =
    normalizeEnv(process.env.SALES_STATUS_CHANNEL_NAME) || 'firmware-status';
const CONFIG_PATH = path.join(__dirname, 'guild-config.json');

const VERIFIED_ROLE_NAME = 'Verified';
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
    SALES_HUB: '🛒 Sales & Orders',
    PURCHASE_GUIDE: '📦 How to Purchase',
    SUGGESTIONS: '💡 Suggestions',
    MEDIA: '📸 Media & Screenshots',
};

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

function buildWelcomeEmbed(member, rulesChannel, verifyChannel, salesChannel) {
    const rulesMention = rulesChannel ? `${rulesChannel}` : '#rules';
    const verifyMention = verifyChannel ? `${verifyChannel}` : '#verification';
    const salesMention = salesChannel ? `${salesChannel}` : '#sales-server';

    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.WELCOME)
        .setDescription(
            `${member}, welcome to **${member.guild.name}** — the official RED DMA community hub!\n\n` +
                `📌 **Step 1:** Read the rules in ${rulesMention}\n` +
                `🔐 **Step 2:** Verify in ${verifyMention}\n` +
                `🛒 **Step 3:** For purchases & firmware status, visit ${salesMention}\n\n` +
                'After verification you can explore announcements, chat, support, and more. Enjoy your stay!'
        )
        .setColor(0xef4444)
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setTimestamp();
}

function buildServerInfoEmbed(salesChannel) {
    const salesMention = salesChannel ? `${salesChannel}` : '#sales-server';

    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.SERVER_INFO)
        .setDescription(
            '**RED DMA Main Hub** is your home for community, announcements, and support.\n\n' +
                '**What you can do here**\n' +
                '• Read official announcements\n' +
                '• Chat with the community\n' +
                '• Get help and browse product info\n' +
                '• Share feedback and suggestions\n\n' +
                `**Purchases & firmware status**\n` +
                `Orders, tickets, and live firmware updates are handled in our Sales Server.\n` +
                `Head to ${salesMention} for the invite and channel guide.\n\n` +
                '**Website:** https://reddma.xyz'
        )
        .setColor(0xef4444)
        .setFooter({ text: 'RED DMA • Premium DMA Firmware' })
        .setTimestamp();
}

function buildSalesHubEmbed() {
    return new EmbedBuilder()
        .setTitle(EMBED_TITLES.SALES_HUB)
        .setDescription(
            '**This is the main community server.** For everything related to buying, tickets, and live firmware status, join our **Sales Server**.\n\n' +
                '**In the Sales Server you will find:**\n' +
                `• **#${SALES_STATUS_CHANNEL_NAME}** — daily firmware status & discounts\n` +
                '• Product catalog with ticket buttons\n' +
                '• Purchase support and order handling\n' +
                '• `/buy` command to open purchase tickets\n\n' +
                'Click **Join Sales Server** below, then check the firmware status channel after you arrive.'
        )
        .setColor(0xf59e0b)
        .setFooter({ text: 'Official invite • RED DMA Sales' });
}

function buildSalesHubButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Join Sales Server')
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
    const salesMention = salesChannel ? `${salesChannel}` : '#sales-server';

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
                '**Where do I buy?**\nJoin the Sales Server via #sales-server — purchases are not handled in this hub.\n\n' +
                '**Where is firmware status posted?**\nDaily updates are in the Sales Server #' +
                SALES_STATUS_CHANNEL_NAME +
                ' channel.\n\n' +
                '**I need help with my order**\nOpen a ticket in the Sales Server or ask in #help-support here for general questions.\n\n' +
                '**Website**\nhttps://reddma.xyz'
        )
        .setColor(0x3b82f6);
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
        aliases: ['general-chat', '综合聊天', '常规'],
        name: 'general-chat',
        parent: communityCategory,
        topic: 'General community chat',
        permissionOverwrites: buildPublicChannelPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

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
        aliases: ['🛒 Store & Orders', '🔗 Store & Orders'],
        name: '🛒 Store & Orders',
        permissionOverwrites: buildVerifiedOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    const salesChannel = await findOrCreateTextChannel(guild, {
        aliases: ['sales-server', 'sales', 'store'],
        name: 'sales-server',
        parent: storeCategory,
        topic: 'Link to the RED DMA Sales Server for orders and firmware status',
        permissionOverwrites: buildReadOnlyPermissions(guild, verifiedRole.id),
        reason: setupReason,
    });

    await publishRulesToChannel(rulesChannel);
    await publishVerifyToChannel(verifyChannel, rulesChannel);

    await publishEmbedToChannel(serverInfoChannel, buildServerInfoEmbed(salesChannel), {
        title: EMBED_TITLES.SERVER_INFO,
    });

    const websiteEmbed = new EmbedBuilder()
        .setTitle(EMBED_TITLES.WEBSITE)
        .setDescription(
            '**Official Website:** https://reddma.xyz\n\n' +
                'Browse products, compatibility info, and onboarding guides on the website.\n' +
                'To purchase, join the Sales Server via #sales-server and open a ticket with `/buy`.'
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

async function maybeAutoSetup() {
    const guildId = AUTO_SETUP_GUILD_ID || process.argv[process.argv.indexOf('--setup') + 1];
    if (!guildId) return;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        console.error(`Could not find guild ${guildId} for auto setup`);
        return;
    }

    console.log(`Running setup for guild: ${guild.name} (${guild.id})`);
    const result = await runOneClickSetup(guild);
    console.log('Setup complete:', Object.keys(result).join(', '));

    if (process.argv.includes('--setup')) {
        setTimeout(() => process.exit(0), 1000);
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`RED DMA Main Bot online: ${client.user.tag}`);
    await registerCommands();
    await maybeAutoSetup();
});

client.on(Events.GuildMemberAdd, async (member) => {
    try {
        const config = getGuildConfig(member.guild.id);
        if (!config?.setup_complete) return;

        const welcomeChannel = member.guild.channels.cache.get(config.welcome_channel_id);
        if (!welcomeChannel) return;

        const rulesChannel = member.guild.channels.cache.get(config.rules_channel_id);
        const verifyChannel = member.guild.channels.cache.get(config.verify_channel_id);
        const salesChannel = config.sales_channel_id
            ? member.guild.channels.cache.get(config.sales_channel_id)
            : null;

        if (config.unverified_role_id) {
            const unverifiedRole = member.guild.roles.cache.get(config.unverified_role_id);
            if (unverifiedRole && !member.roles.cache.has(unverifiedRole.id)) {
                await member.roles.add(unverifiedRole, 'New member joined');
            }
        }

        const embed = buildWelcomeEmbed(member, rulesChannel, verifyChannel, salesChannel);
        await welcomeChannel.send({
            content: `${member} Welcome! Please read the rules and complete verification.`,
            embeds: [embed],
            allowedMentions: { users: [member.id] },
        });
    } catch (error) {
        console.error('Failed to send welcome message:', error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
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
            const salesMention = salesChannel ? ` Check out ${salesChannel} for purchases.` : '';

            await interaction.reply({
                content: `🎉 Verification complete! You now have access to the community.${salesMention}`,
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
                        `**Sales Server Link:** ${result.salesChannel}\n\n` +
                        '**Tip:** Keep the bot role above **Verified**. New members are welcomed automatically.'
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