# EPM Minecraft Bridge

Запускается рядом с Minecraft. Render не читает серверные файлы напрямую.

EssentialsX: EPM_MODE=Estamon Creative или Estamon Survial, EPM_API_KEY, EPM_SERVER_ROOT. По умолчанию читается banned-players.json.

AdvancedBan: EPM_MODE=Estamon Grief + EPM_SOURCE_FILE с JSON-экспортом. Если наказания в БД — EPM_SOURCE_COMMAND должен вывести JSON-массив с id/name/reason/source/expires.

В Render создайте EPM_GRIEF_API_KEY, EPM_CREATIVE_API_KEY, EPM_SURVIVAL_API_KEY и передайте соответствующий ключ мосту. Ключи не публиковать.

Мост отправляет BAN при появлении записи и UNBAN после её исчезновения. Для TPS сервер может POST'ить /api/integrations/server-status с online,players,maxPlayers,version,tps. Без этого сайт использует mcstatus.io для online/players/version.