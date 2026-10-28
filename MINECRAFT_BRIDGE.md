# EPM Unified Minecraft Plugin

The repository builds one shared JAR for every EPM mode. Install the same epm-punishment-bridge-1.2.0.jar on each Paper server; only local config and API key differ.

## Modes and API keys

| EPM mode | Render environment variable | Plugin mode |
|---|---|---|
| Estamon Grief | EPM_GRIEF_BP_API_KEY | Estamon Grief |
| Estamon Creative | EPM_CREATIVE_BP_API_KEY | Estamon Creative |
| Estamon Survial | EPM_SURVIAL_BP_API_KEY | Estamon Survial |
| Blood Shed World | EPM_BLOOD_BP_API_KEY | BloodShedWorld |

## Build and install

1. Open GitHub repository Actions and select Build EPM Unified Bridge.
2. Download the epm-unified-bridge artifact from the latest successful run.
3. Extract the JAR and copy the same file into plugins/ on every server.
4. Start each server once and edit plugins/EPMPunishmentBridge/config.yml locally.
5. Set the exact mode and its matching unique API key on each server. Never publish keys or reuse a key across modes.
6. Restart each server. The plugin polls the Battle Pass queue every 5 seconds.

## Battle Pass XP source

EPM calculates XP server-side from forum activity: 25 XP per forum reply and 100 XP per created topic, capped at level 30. The browser cannot set arbitrary XP or levels. Rewards are stored in PostgreSQL and queued for the selected mode. The plugin acknowledges success or failure; clicking a website button alone does not count as delivery.

## Reward commands

Item rewards use the Minecraft console give command by default. Currency and privilege commands remain blank until configured for the plugins installed on each mode. If Essentials economy and LuckPerms are installed, example commands are eco give {player} {amount} and lp user {player} parent add {group}. Confirm actual permission group names first; example names are not guaranteed to exist.

## Punishment sync

The same plugin watches configured ban, tempban, unban, pardon, unbanip and pardonip commands and sends punishment events to EPM. Direct database edits or unobserved commands may not be detected.

The Render website and PostgreSQL database must be reachable for Battle Pass progress and queued rewards.
