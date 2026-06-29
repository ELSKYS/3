# RED DMA Main Server Bot

Discord community hub bot: private welcome DMs, rules, verification, live member stats, and one-click server setup.

## Environment Variables

Configure in Railway or a local `.env` file:

```
TOKEN=your_discord_bot_token
CLIENT_ID=your_application_client_id

# Optional — auto-run /setup on startup
AUTO_SETUP_GUILD_ID=

# Optional — specialized server invites
SALES_SERVER_INVITE=https://discord.gg/reddma
SNEAKER_SERVER_INVITE=https://discord.gg/your-sneaker-server-invite
SALES_STATUS_CHANNEL_NAME=firmware-status

# Optional — guild IDs (hub vs sneaker store server)
HUB_GUILD_ID=
SNEAKER_GUILD_ID=
```

## Local Run

```bash
npm install
npm start
```

### One-time setup from CLI

```bash
# Main hub server
node index.js --setup YOUR_GUILD_ID

# Live member count channel
node index.js --setup-member-count YOUR_GUILD_ID

# Sneakers & watches store (run on store server, NOT the hub)
node index.js --setup-luxury-store YOUR_GUILD_ID

# Remove luxury store from hub if deployed by mistake
node index.js --cleanup-luxury YOUR_GUILD_ID
```

## Railway Deploy

1. Push this repo to GitHub (only the 7 project files — no `node_modules`)
2. Create a Railway project → Deploy from GitHub repo
3. Add `TOKEN` and `CLIENT_ID` in Variables
4. Redeploy after updating Variables

## Slash Commands

| Command | Description |
|---------|-------------|
| `/setup` | Hub: roles, channels, permissions, panels |
| `/publish-rules` | Publish or update server rules |
| `/publish-verify` | Publish or update verification panel |
| `/setup-member-count` | Create live member count voice channel |
| `/setup-luxury-store` | Deploy sneakers & watches store with invoice tickets |
| `/publish-luxury-panels` | Refresh store embeds, buttons & procurement layout |

> `/setup-luxury-store` and `/publish-luxury-panels` are blocked on the main hub server. Run them on the **RED Sneaker and watch** server only.

## RED Main Hub Layout (`/setup`)

| Category | Channels |
|----------|----------|
| 📋 Getting Started | rules, verification, welcome, server-info |
| 💬 Community | general-chat, announcements, media-share, suggestions |
| 🛠️ Support & Resources | help-support, website-products, faq, purchase-guide |
| 🔗 Our Servers | red-dma, sneaker-watch |
| 📊 Live Stats | voice `Members: N`, stats-info (after `/setup-member-count`) |

**New members:** receive a **private DM** with welcome + rules (not a public channel ping).

## Sneaker & Watch Server (`/setup-luxury-store`)

| Category | Channels |
|----------|----------|
| 💬 Community | general-chat |
| 👟 SNEAKERS | sneaker-catalog, sneaker-qc, sneaker-chat |
| ⌚ WATCHES | watch-catalog, watch-qc, watch-chat |
| 🛒 ORDERS | order-here, custom-procurement, payment-shipping, store-rules |
| 🎫 Active Tickets | Private invoice tickets — Sneakers / Watches / Mixed / Free Procurement |
| 📊 Live Stats | voice `Members: N`, stats-info (after `/setup-member-count`) |

## Do NOT Upload

- `node_modules/` (thousands of files — Railway installs via `npm install`)
- `.env` (contains your bot token)
- `guild-config.json` / `luxury-tickets.json` (runtime data)