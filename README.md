# RED DMA Main Server Bot

Discord community hub bot: welcome messages, rules, verification, and one-click server setup.

## Environment Variables

Configure in Railway or a local `.env` file:

```
TOKEN=your_discord_bot_token
CLIENT_ID=your_application_client_id

# Optional — auto-run /setup on startup
AUTO_SETUP_GUILD_ID=your_guild_id

# Optional — sales server link (defaults to https://discord.gg/reddma)
SALES_SERVER_INVITE=https://discord.gg/reddma
SALES_STATUS_CHANNEL_NAME=firmware-status
```

## Local Run

```bash
npm install
npm start
```

### One-time setup from CLI

```bash
node index.js --setup YOUR_GUILD_ID
```

## Railway Deploy

1. Push this repo to GitHub
2. Create a Railway project → Deploy from GitHub repo
3. Add `TOKEN` and `CLIENT_ID` in Variables
4. After deploy, run `/setup` in Discord (or set `AUTO_SETUP_GUILD_ID`)

## Slash Commands

- `/setup` — Create roles, channels, permissions, and publish panels
- `/publish-rules` — Publish or update server rules
- `/publish-verify` — Publish or update the verification panel

## Channel Layout

| Category | Channels |
|----------|----------|
| 📋 Getting Started | rules, verification, welcome, server-info |
| 💬 Community | announcements, general-chat, media-share, suggestions |
| 🛠️ Support & Resources | help-support, website-products, faq, purchase-guide |
| 🛒 Store & Orders | sales-server (links to Sales Server + #firmware-status) |