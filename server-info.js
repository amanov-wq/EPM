const $ = (id) => document.getElementById(id);

function setStatus(online) {
  const el = $('status');
  el.className = `server-status ${online ? 'online' : 'offline'}`;
  el.innerHTML = `<i class="status-dot"></i><span>${online ? 'ОНЛАЙН' : 'ОФФЛАЙН'}</span>`;
}

function setBadge(id, online, available = true) {
  const el = $(id);
  if (!el) return;
  el.textContent = available ? (online ? 'ОНЛАЙН' : 'ОФФЛАЙН') : 'НЕТ ДАННЫХ';
  el.style.color = available ? (online ? '#9dccaa' : '#d7a5a5') : '#9aa2ad';
}

async function loadServer() {
  const button = $('refresh');
  button.disabled = true;
  $('error').style.display = 'none';
  try {
    const response = await fetch('/api/server-status', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'status error');

    setStatus(Boolean(data.online));
    setBadge('javaBadge', Boolean(data.online), true);

    $('players').textContent = data.online ? `${data.players}/${data.maxPlayers || '—'}` : '—';
    $('playersText').textContent = data.online ? 'игроков онлайн' : 'сервер недоступен';
    $('version').textContent = data.version || '—';
    $('gamemode').textContent = data.gamemode || 'Survival';

    $('javaInfo').textContent = data.online
      ? `Java-сервер доступен. Порт: ${data.port}. ${data.version ? `Версия: ${data.version}.` : ''}`
      : 'Java-сервер сейчас оффлайн.';
    $('bedrockInfo').textContent = 'Отдельный Bedrock-порт не настроен в мониторинге.';
    setBadge('bedrockBadge', false, false);

    $('updated').textContent = `Последняя проверка: ${new Date(data.checkedAt || Date.now()).toLocaleTimeString('ru-RU')}`;
  } catch (error) {
    setStatus(false);
    setBadge('javaBadge', false, false);
    setBadge('bedrockBadge', false, false);
    $('players').textContent = '—';
    $('playersText').textContent = 'нет данных';
    $('version').textContent = '—';
    $('gamemode').textContent = 'Survival';
    $('javaInfo').textContent = 'Не удалось получить данные о Java-сервере.';
    $('bedrockInfo').textContent = 'Не удалось получить данные о сервере.';
    $('updated').textContent = 'Последняя проверка: ошибка';
    $('error').textContent = 'Не удалось проверить сервер. Попробуйте обновить страницу.';
    $('error').style.display = 'block';
  } finally {
    button.disabled = false;
  }
}

$('refresh').addEventListener('click', loadServer);
loadServer();
setInterval(loadServer, 60000);
