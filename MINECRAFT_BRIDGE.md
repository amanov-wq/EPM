# EPM Minecraft Bridge

The same plugin now syncs punishment history and processes Battle Pass reward jobs. Install it on each Paper/Spigot server; each server has its own mode and API key.

## Modes and API keys

| EPM mode | Render environment variable | Plugin `mode` |
|---|---|---|
| Estamon Grief | `EPM_GRIEF_API_KEY` | `Estamon Grief` |
| Estamon Creative | `EPM_CREATIVE_API_KEY` | `Estamon Creative` |
| Estamon Survial | `EPM_SURVIVAL_API_KEY` | `Estamon Survial` |
| BloodShedWorld | `EPM_BLOOD_API_KEY` | `BloodShedWorld` |

## Build and install

1. Pushes to the plugin folder trigger GitHub Actions workflow **Build EPM Punishment Bridge**.
2. Download the successful workflow's **epm-punishment-bridge** artifact.
3. Put the JAR in each server's `plugins` folder and start the server once to generate `plugins/EPMPunishmentBridge/config.yml`.
4. Edit that server's config: set its exact `mode` and matching `api-key`. Do not share keys between servers or publish them.
5. Restart the server. The plugin polls EPM's reward queue every 5 seconds.

## Battle Pass reward commands

The free track has server-side reward definitions for items, currency and privilege groups. Claims are saved in PostgreSQL and queued per mode; the plugin reports delivery results back to EPM. A claim is not shown as successfully delivered merely because a browser button was clicked.

Item rewards use the vanilla console command template by default:

```yaml
reward-commands:
  item: "give {player} {item} {amount}"
  currency: ""
  privilege: ""
```

Currency and privilege commands are intentionally blank until the actual plugins on that server are confirmed. Configure only commands supported by the installed plugins. For example, **only if the server supports Essentials economy and LuckPerms**, you can use:

```yaml
reward-commands:
  item: "give {player} {item} {amount}"
  currency: "eco give {player} {amount}"
  privilege: "lp user {player} parent add {group}"
privilege-groups:
  lite: "vip"
  premium: "premium"
  legend: "legend"
  dragon: "dragon"
  premium_legend: "premiumlegend"
```

The group names above are examples, not assumptions about your servers. Replace them with real groups that exist on each server. Keep currency/privilege values blank if the matching plugin or group is not installed; the plugin will fail that reward safely and log the reason rather than pretending it was delivered. After changing config, restart the Minecraft server.

## Battle Pass progress

The server calculates Battle Pass XP from server-owned EPM forum counters (25 XP per reply and 100 XP per topic, up to level 30). The browser cannot submit an arbitrary level. The premium track stays locked until premium activation is implemented through a verified payment flow.

## Punishment sync

The bridge watches `ban`, `tempban`, `unban`, `pardon`, `unbanip` and `pardonip`, then sends events to `POST /api/integrations/punishments`. For server status it supports `POST /api/integrations/server-status`.

The bridge only observes configured commands. Direct database edits or other commands may not be detected. Check the console after installation for HTTP 401 (wrong mode/key) or Battle Pass command errors.
