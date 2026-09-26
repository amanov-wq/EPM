# EPM Minecraft Punishment Bridge

Один плагин для трёх серверов:

- **Estamon Grief** — Paper 1.19.4 + AdvancedBan
- **Estamon Creative** — Paper 1.21.4 + Essentials
- **Estamon Survial** — 1.16.5 + Essentials
- **Blood Shed World** — отдельный конфиг `config-blood.yml`

Плагин отслеживает команды `/ban` и `/tempban`, разбирает ник, причину, модератора и срок и отправляет запись в EPM:
`POST /api/integrations/punishments`.

## Сборка
В папке `minecraft-plugin/EPMPunishmentBridge`:
```bash
mvn clean package
```
JAR будет в `target/epm-punishment-bridge-1.0.0.jar`.

## Установка
1. Соберите JAR.
2. Положите JAR в `plugins/` каждого из трёх серверов.
3. Запустите сервер один раз.
4. В `plugins/EPMPunishmentBridge/config.yml` задайте:
   - Grief: `mode: "Estamon Grief"`
   - Creative: `mode: "Estamon Creative"`
   - ES+: `mode: "Estamon Survial"`
5. API-ключ для каждого сервера задаётся отдельно и **не должен попадать в GitHub**.
6. Перезапустите сервер.

## Render
Нужно создать три Environment Variables:
- `EPM_GRIEF_API_KEY`
- `EPM_CREATIVE_API_KEY`
- `EPM_SURVIVAL_API_KEY`
- `EPM_BLOOD_API_KEY`

Значения должны совпадать с ключами в конфиге соответствующего сервера.
