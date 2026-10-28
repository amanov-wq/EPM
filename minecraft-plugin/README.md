# EPM Unified Minecraft Plugin

One JAR for every EPM mode. The same plugin synchronizes punishments with the website and delivers Battle Pass rewards. Do not build separate JARs for each mode; install the same file on every server.

Supported servers:
- Estamon Grief — Paper 1.19.4 + AdvancedBan
- Estamon Creative — Paper 1.21.4 + Essentials
- Estamon Survial — Paper 1.16.5 + Essentials
- Blood Shed World — optional separate config and API key

## Download the single JAR

Open the repository Actions tab and choose the latest successful Build EPM Unified Bridge run. Download the epm-unified-bridge artifact and extract it. The JAR inside is epm-punishment-bridge-1.2.0.jar.

To build locally, open minecraft-plugin/EPMPunishmentBridge and run: mvn clean package. The JAR is created in target/epm-punishment-bridge-1.2.0.jar.

## Install on all modes

Copy the same JAR into the plugins folder on each server and start each server once to generate its config. Edit plugins/EPMPunishmentBridge/config.yml locally on each server and set its mode:

- Grief: mode: "Estamon Grief"
- Creative: mode: "Estamon Creative"
- Survial: mode: "Estamon Survial"

Each server needs a matching punishment key in `api-key` and a matching Battle Pass key in `battlepass-api-key`. Set `battlepass-api-key` from that server's `EPM_*_BP_API_KEY` Render variable. Never publish keys or reuse a key between modes. For punishment sync, use the existing EPM_GRIEF_API_KEY, EPM_CREATIVE_API_KEY, EPM_SURVIVAL_API_KEY and EPM_BLOOD_API_KEY variables. Battle Pass uses separate keys: EPM_GRIEF_BP_API_KEY, EPM_CREATIVE_BP_API_KEY, EPM_SURVIAL_BP_API_KEY and EPM_BLOOD_BP_API_KEY.

## Battle Pass XP

EPM calculates Battle Pass XP on the website from forum activity: 25 XP per forum reply and 100 XP per created topic, capped at level 30. Players cannot submit their own XP or level. A player claims an unlocked reward on the website and chooses a mode. The plugin on that mode polls the protected reward queue and reports delivery success or failure.

Item rewards use the vanilla Minecraft give command by default. Currency and privilege commands are intentionally blank until verified for the plugins installed on that server.

Example only, if Essentials economy and LuckPerms are installed and the group names are correct:
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

These group names are examples only. Replace them with real groups that exist on each server. If a command is unsupported, keep it blank until the correct command is confirmed.

## Troubleshooting

Check the server console after restart. HTTP 401 means the API key and configured mode do not match. Currency or privilege failures usually mean the relevant command or group is not configured. The Render website and PostgreSQL database must be available for Battle Pass progress and queued rewards.
