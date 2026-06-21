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

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CONFIG_PATH = path.join(__dirname, 'guild-config.json');

const VERIFIED_ROLE_NAME = '已验证';
const UNVERIFIED_ROLE_NAME = '未验证';

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
        title: '1. 尊重他人',
        content: '禁止人身攻击、歧视、骚扰、威胁。请用文明用语交流，营造友好社区氛围。',
    },
    {
        title: '2. 禁止垃圾信息',
        content: '禁止无意义刷屏、重复发送相同内容、恶意 @全体成员 或大量 @他人。',
    },
    {
        title: '3. 禁止未经许可的广告',
        content: '未经管理员批准，不得推广其他 Discord 服务器、产品、链接或拉人行为。',
    },
    {
        title: '4. 保护隐私',
        content: '禁止泄露自己或他人的个人信息（电话、地址、支付信息等）。',
    },
    {
        title: '5. 遵守法律法规',
        content: '禁止发布违法、色情、暴力、诈骗等违规内容。违者将立即封禁并可能上报。',
    },
    {
        title: '6. 正确使用频道',
        content: '请在对应频道发言，不要在不相关频道发广告、求助或闲聊。',
    },
    {
        title: '7. 交易与售后',
        content: '购买、付款、售后请走官方工单渠道。私下交易风险自负，官方不承担责任。',
    },
    {
        title: '8. 服从管理',
        content: '管理员对违规行为有最终处理权。对处罚有异议请私信管理员理性沟通，勿在公开频道争吵。',
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
    const description = SERVER_RULES.map(
        (rule) => `**${rule.title}**\n${rule.content}`
    ).join('\n\n');

    return new EmbedBuilder()
        .setTitle('📜 服务器规则')
        .setDescription(
            '欢迎加入本服务器！请仔细阅读以下规则，完成验证后即可访问全部频道。\n\n' + description
        )
        .setColor(0xef4444)
        .setFooter({ text: '违反规则可能导致警告、禁言或封禁 • RED DMA' })
        .setTimestamp();
}

function buildVerifyEmbed(rulesChannel) {
    const rulesMention = rulesChannel ? `${rulesChannel}` : '#规则';

    return new EmbedBuilder()
        .setTitle('✅ 账户验证')
        .setDescription(
            `请先阅读 ${rulesMention} 中的服务器规则。\n\n` +
                '确认已阅读并同意遵守规则后，点击下方按钮完成验证。\n' +
                '验证成功后，你将可以查看和参与社区其他频道。'
        )
        .setColor(0x22c55e);
}

function buildVerifyButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('verify_member')
            .setLabel('我已阅读规则，立即验证')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
    );
}

function buildWelcomeEmbed(member, rulesChannel, verifyChannel) {
    const rulesMention = rulesChannel ? `${rulesChannel}` : '规则频道';
    const verifyMention = verifyChannel ? `${verifyChannel}` : '验证频道';

    return new EmbedBuilder()
        .setTitle('👋 欢迎加入！')
        .setDescription(
            `${member} 欢迎加入 **${member.guild.name}**！\n\n` +
                `📌 第一步：请前往 ${rulesMention} 阅读服务器规则\n` +
                `🔐 第二步：前往 ${verifyMention} 点击按钮完成验证\n\n` +
                '完成验证后即可浏览全部频道，祝你在这里玩得开心！'
        )
        .setColor(0xef4444)
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setTimestamp();
}

function memberCanManage(interaction) {
    return interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

async function publishRulesToChannel(channel) {
    const embed = buildRulesEmbed();
    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
        (m) => m.author.id === client.user.id && m.embeds[0]?.title === '📜 服务器规则'
    );

    if (existing) {
        await existing.edit({ embeds: [embed] });
        return existing;
    }

    return channel.send({ embeds: [embed] });
}

async function publishVerifyToChannel(channel, rulesChannel) {
    const embed = buildVerifyEmbed(rulesChannel);
    const row = buildVerifyButtonRow();
    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
        (m) => m.author.id === client.user.id && m.embeds[0]?.title === '✅ 账户验证'
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
        { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
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

async function runOneClickSetup(guild) {
    const botMember = guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        throw new Error('机器人需要「管理频道」权限才能执行一键设置。');
    }
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw new Error('机器人需要「管理角色」权限才能执行一键设置。');
    }

    let verifiedRole = guild.roles.cache.find((r) => r.name === VERIFIED_ROLE_NAME);
    if (!verifiedRole) {
        verifiedRole = await guild.roles.create({
            name: VERIFIED_ROLE_NAME,
            color: 0x22c55e,
            reason: '总群机器人一键设置',
        });
    }

    let unverifiedRole = guild.roles.cache.find((r) => r.name === UNVERIFIED_ROLE_NAME);
    if (!unverifiedRole) {
        unverifiedRole = await guild.roles.create({
            name: UNVERIFIED_ROLE_NAME,
            color: 0x94a3b8,
            reason: '总群机器人一键设置',
        });
    }

    if (verifiedRole.position >= botMember.roles.highest.position) {
        throw new Error('请将机器人的角色拖到「已验证」角色之上，然后重新运行 /一键设置。');
    }

    const onboardingCategory = await guild.channels.create({
        name: '📋 入门指南',
        type: ChannelType.GuildCategory,
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
        reason: '总群机器人一键设置',
    });

    const rulesChannel = await guild.channels.create({
        name: '规则',
        type: ChannelType.GuildText,
        parent: onboardingCategory.id,
        topic: '服务器规则 — 新成员必读',
        permissionOverwrites: [
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
        ],
        reason: '总群机器人一键设置',
    });

    const verifyChannel = await guild.channels.create({
        name: '验证',
        type: ChannelType.GuildText,
        parent: onboardingCategory.id,
        topic: '完成验证以解锁全部频道',
        permissionOverwrites: [
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
        ],
        reason: '总群机器人一键设置',
    });

    const welcomeChannel = await guild.channels.create({
        name: '欢迎',
        type: ChannelType.GuildText,
        parent: onboardingCategory.id,
        topic: '新成员加入欢迎',
        permissionOverwrites: [
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
        ],
        reason: '总群机器人一键设置',
    });

    const communityCategory = await guild.channels.create({
        name: '💬 社区交流',
        type: ChannelType.GuildCategory,
        permissionOverwrites: buildVerifiedOnlyPermissions(guild, verifiedRole.id),
        reason: '总群机器人一键设置',
    });

    const announceChannel = await guild.channels.create({
        name: '公告',
        type: ChannelType.GuildText,
        parent: communityCategory.id,
        topic: '官方公告',
        permissionOverwrites: buildReadOnlyPermissions(guild, verifiedRole.id),
        reason: '总群机器人一键设置',
    });

    const chatChannel = await guild.channels.create({
        name: '综合聊天',
        type: ChannelType.GuildText,
        parent: communityCategory.id,
        topic: '自由聊天',
        permissionOverwrites: buildPublicChannelPermissions(guild, verifiedRole.id),
        reason: '总群机器人一键设置',
    });

    const supportCategory = await guild.channels.create({
        name: '🛠️ 服务支持',
        type: ChannelType.GuildCategory,
        permissionOverwrites: buildVerifiedOnlyPermissions(guild, verifiedRole.id),
        reason: '总群机器人一键设置',
    });

    const helpChannel = await guild.channels.create({
        name: '帮助与支持',
        type: ChannelType.GuildText,
        parent: supportCategory.id,
        topic: '有问题在这里提问',
        permissionOverwrites: buildPublicChannelPermissions(guild, verifiedRole.id),
        reason: '总群机器人一键设置',
    });

    const websiteChannel = await guild.channels.create({
        name: '官网与产品',
        type: ChannelType.GuildText,
        parent: supportCategory.id,
        topic: '官网与产品信息',
        permissionOverwrites: buildReadOnlyPermissions(guild, verifiedRole.id),
        reason: '总群机器人一键设置',
    });

    await publishRulesToChannel(rulesChannel);
    await publishVerifyToChannel(verifyChannel, rulesChannel);

    const websiteEmbed = new EmbedBuilder()
        .setTitle('🌐 官网与产品')
        .setDescription(
            '**官方网站：** https://reddma.xyz\n\n' +
                '浏览产品、了解详情请访问官网，或在销售频道使用 `/buy` 创建购买工单。'
        )
        .setColor(0xef4444);

    await websiteChannel.send({ embeds: [websiteEmbed] });

    const announceEmbed = new EmbedBuilder()
        .setTitle('📢 公告频道')
        .setDescription('管理员将在此发布重要通知，请保持关注。')
        .setColor(0xef4444);

    await announceChannel.send({ embeds: [announceEmbed] });

    saveGuildConfig(guild.id, {
        welcome_channel_id: welcomeChannel.id,
        rules_channel_id: rulesChannel.id,
        verify_channel_id: verifyChannel.id,
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
        announceChannel,
        chatChannel,
        helpChannel,
        websiteChannel,
    };
}

async function registerCommands() {
    const commands = [
        {
            name: '一键设置',
            description: '自动创建验证系统、规则频道和基础文字频道（管理员专用）',
        },
        {
            name: '发布频道规则',
            description: '在规则频道发布或更新服务器规则（管理员专用）',
        },
        {
            name: '发布验证面板',
            description: '在验证频道发布或更新验证按钮（管理员专用）',
        },
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('正在注册斜杠命令...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ 斜杠命令注册成功');
    } catch (error) {
        console.error('注册命令失败:', error);
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`✅ 总群机器人已上线: ${client.user.tag}`);
    await registerCommands();
});

client.on(Events.GuildMemberAdd, async (member) => {
    try {
        const config = getGuildConfig(member.guild.id);
        if (!config?.setup_complete) return;

        const welcomeChannel = member.guild.channels.cache.get(config.welcome_channel_id);
        if (!welcomeChannel) return;

        const rulesChannel = member.guild.channels.cache.get(config.rules_channel_id);
        const verifyChannel = member.guild.channels.cache.get(config.verify_channel_id);

        if (config.unverified_role_id) {
            const unverifiedRole = member.guild.roles.cache.get(config.unverified_role_id);
            if (unverifiedRole && !member.roles.cache.has(unverifiedRole.id)) {
                await member.roles.add(unverifiedRole, '新成员加入');
            }
        }

        const embed = buildWelcomeEmbed(member, rulesChannel, verifyChannel);
        await welcomeChannel.send({
            content: `${member} 欢迎加入！请先阅读规则并完成验证 👇`,
            embeds: [embed],
            allowedMentions: { users: [member.id] },
        });
    } catch (error) {
        console.error('欢迎消息发送失败:', error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isButton() && interaction.customId === 'verify_member') {
            const config = getGuildConfig(interaction.guild.id);
            if (!config?.verified_role_id) {
                await interaction.reply({
                    content: '❌ 验证系统尚未配置，请联系管理员运行 `/一键设置`。',
                    ephemeral: true,
                });
                return;
            }

            const verifiedRole = interaction.guild.roles.cache.get(config.verified_role_id);
            if (!verifiedRole) {
                await interaction.reply({
                    content: '❌ 找不到「已验证」角色，请联系管理员重新运行 `/一键设置`。',
                    ephemeral: true,
                });
                return;
            }

            if (interaction.member.roles.cache.has(verifiedRole.id)) {
                await interaction.reply({ content: '✅ 你已经完成验证了！', ephemeral: true });
                return;
            }

            await interaction.member.roles.add(verifiedRole, '完成账户验证');

            if (config.unverified_role_id) {
                const unverifiedRole = interaction.guild.roles.cache.get(config.unverified_role_id);
                if (unverifiedRole && interaction.member.roles.cache.has(unverifiedRole.id)) {
                    await interaction.member.roles.remove(unverifiedRole, '完成账户验证');
                }
            }

            await interaction.reply({
                content: '🎉 验证成功！你现在可以浏览和参与社区的其他频道了。',
                ephemeral: true,
            });
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === '一键设置') {
            if (!memberCanManage(interaction)) {
                await interaction.reply({ content: '❌ 仅管理员可使用此命令。', ephemeral: true });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            const result = await runOneClickSetup(interaction.guild);

            const summary = new EmbedBuilder()
                .setTitle('✅ 一键设置完成')
                .setDescription(
                    '已自动创建角色、频道和权限，并发布规则与验证面板。\n\n' +
                        `**角色：** ${result.verifiedRole}、${result.unverifiedRole}\n` +
                        `**规则频道：** ${result.rulesChannel}\n` +
                        `**验证频道：** ${result.verifyChannel}\n` +
                        `**欢迎频道：** ${result.welcomeChannel}\n` +
                        `**公告频道：** ${result.announceChannel}\n` +
                        `**综合聊天：** ${result.chatChannel}\n` +
                        `**帮助与支持：** ${result.helpChannel}\n` +
                        `**官网与产品：** ${result.websiteChannel}\n\n` +
                        '**提示：** 请确保机器人角色位于「已验证」之上，新成员加入后会自动在欢迎频道收到提醒。'
                )
                .setColor(0x22c55e);

            await interaction.editReply({ embeds: [summary] });
            return;
        }

        if (interaction.commandName === '发布频道规则') {
            if (!memberCanManage(interaction)) {
                await interaction.reply({ content: '❌ 仅管理员可使用此命令。', ephemeral: true });
                return;
            }

            const config = getGuildConfig(interaction.guild.id);
            const rulesChannelId = config?.rules_channel_id;
            const rulesChannel = rulesChannelId
                ? interaction.guild.channels.cache.get(rulesChannelId)
                : interaction.channel;

            if (!rulesChannel || rulesChannel.type !== ChannelType.GuildText) {
                await interaction.reply({
                    content: '❌ 找不到规则频道。请先运行 `/一键设置`，或在本频道手动发布。',
                    ephemeral: true,
                });
                return;
            }

            await publishRulesToChannel(rulesChannel);

            if (config) {
                saveGuildConfig(interaction.guild.id, { rules_channel_id: rulesChannel.id });
            }

            await interaction.reply({
                content: `✅ 规则已发布到 ${rulesChannel}`,
                ephemeral: true,
            });
            return;
        }

        if (interaction.commandName === '发布验证面板') {
            if (!memberCanManage(interaction)) {
                await interaction.reply({ content: '❌ 仅管理员可使用此命令。', ephemeral: true });
                return;
            }

            const config = getGuildConfig(interaction.guild.id);
            const verifyChannelId = config?.verify_channel_id;
            const verifyChannel = verifyChannelId
                ? interaction.guild.channels.cache.get(verifyChannelId)
                : interaction.channel;

            if (!verifyChannel || verifyChannel.type !== ChannelType.GuildText) {
                await interaction.reply({
                    content: '❌ 找不到验证频道。请先运行 `/一键设置`，或在本频道手动发布。',
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
                content: `✅ 验证面板已发布到 ${verifyChannel}`,
                ephemeral: true,
            });
        }
    } catch (error) {
        console.error('交互处理错误:', error);
        const payload = {
            content: `❌ 操作失败：${error.message || '未知错误'}`,
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
    console.error('❌ 请在 .env 文件中设置 TOKEN 和 CLIENT_ID');
    process.exit(1);
}

const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('RED DMA Main Bot is running');
}).listen(PORT, () => {
    console.log(`健康检查端口: ${PORT}`);
});

client.login(TOKEN).catch((err) => console.error('登录失败:', err));