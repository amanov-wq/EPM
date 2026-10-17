# EPM Minecraft Bridge

Плагин отправляет события блокировки и разблокировки в историю на сайте EPM. Сам плагин ставится в папку `plugins` каждого Paper/Spigot-сервера.

## Режимы и плагины наказаний

| Режим сайта | Плагин наказаний | Конфигурация моста |
|---|---|---|
| BloodShedWorld | Essentials | `config-blood.yml` |
| Estamon Creative | Essentials | `config-creative.yml` |
| Estamon Grief | AdvancedBan | `config.yml` |
| Estamon Survial | Essentials | `config-survival.yml` |

## Установка

1. Скачай собранный `epm-punishment-bridge-1.0.0.jar` из GitHub Actions artifact **epm-punishment-bridge** (workflow Build EPM Punishment Bridge).
2. На каждом Minecraft-сервере положи JAR в `plugins/EPMPunishmentBridge.jar`.
3. Скопируй соответствующий шаблон конфигурации в `plugins/EPMPunishmentBridge/config.yml`.
4. В Render → Environment задай `EPM_GRIEF_API_KEY`, `EPM_CREATIVE_API_KEY`, `EPM_SURVIVAL_API_KEY`, `EPM_BLOOD_API_KEY`. Для каждого сервера вставь его соответствующий секрет в `api-key`. Не публикуй ключи в чате или репозитории.
5. Перезапусти Minecraft-сервер.

Мост отслеживает команды `ban`, `tempban`, `unban`, `pardon`, `unbanip` и `pardonip`. При разблокировке он отправляет событие `UNBAN`; сайт показывает статусы **«Забанен(а)»** и **«Разблокирован(а)»** в соответствующих вкладках.

> Важно: мост фиксирует команды, выполненные через чат/консоль. Если администраторы меняют наказания напрямую в базе плагина или через команды, которые не входят в список, событие не будет замечено. Проверяй, что конкретная версия Essentials/AdvancedBan использует указанные команды.

Для статуса сервера мост может отправлять `POST /api/integrations/server-status` с `online`, `players`, `maxPlayers`, `version` и `tps`.
