const SERVER = 'EstamonHost.ru:25565';
const JAVA_API = `https://api.mcsrvstat.us/3/${encodeURIComponent(SERVER)}`;
const BEDROCK_API = `https://api.mcsrvstat.us/bedrock/3/${encodeURIComponent(SERVER)}`;

const $ = (id) => document.getElementById(id);

function setStatus(online) {
  const el = $('status');
  el.className = `server-status ${online ? 'online' : 'offline'}`;
  el.innerHTML = `<i class="status-dot"></i><span>${online ? 'Онлайн' : 'Оффлайн'}</span>`;
}

function setBadge(id, online) {
  const el = $(id);
  el.textContent = online ? 'Онлайн' : 'Оффлайн';
  el.style.color = online ? '#9dccaa' : '#d7a5a5';
}

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadServer() {
  $('refresh').disabled = true;
  $('error').style.display = 'none';
  $('error').textContent = '';

  try {
    const [javaResult, bedrockResult] = await Promise.allSettled([
      getJson(JAVA_API),
      getJson(BEDROCK_API)
    ]);

    const java = javaResult.status === 'fulfilled' ? javaResult.value : { online: false };
    const bedrock = bedrockResult.status === 'fulfilled' ? bedrockResult.value : { online: false };

    const online = Boolean(java.online || bedrock.online);
    setStatus(online);
    setBadge('javaBadge', Boolean(java.online));
    setBadge('bedrockBadge', Boolean(bedrock.online));

    if (java.online) {
      const onlinePlayers = Number(java.players?.online || 0);
      const maxPlayers = Number(java.players?.max || 0);
      $('players').textContent = `${onlinePlayers}/${maxPlayers || '—'}`;
      $('playersText').textContent = maxPlayers ? `${maxPlayers} мест` : 'игроки онлайн';
      $('version').textContent = java.version || java.protocol?.name || 'Неизвестно';
      $('gamemode').textContent = java.gamemode || 'Survival';
      $('javaInfo').textContent = `Java-сервер доступен. ${java.version ? `Версия: ${java.version}.` : ''} ${java.software ? `ПО: ${java.software}.` : ''}`.trim();
    } else {
      $('javaInfo').textContent = 'Java-сервер сейчас не отвечает на проверку.';
    }

    if (bedrock.online) {
      $('bedrockInfo').textContent = `Bedrock-сервер доступен. ${bedrock.version ? `Версия: ${bedrock.version}.` : ''} ${bedrock.gamemode ? `Режим: ${bedrock.gamemode}.` : ''}`.trim();
      if (!java.online) {
        const onlinePlayers = Number(bedrock.players?.online || 0);
        const maxPlayers = Number(bedrock.players?.max || 0);
        $('players').textContent = `${onlinePlayers}/${maxPlayers || '—'}`;
        $('playersText').textContent = maxPlayers ? `${maxPlayers} мест` : 'игроки онлайн';
        $('version').textContent = bedrock.version || 'Неизвестно';
        $('gamemode').textContent = bedrock.gamemode || 'Survival';
      }
    } else {
      $('bedrockInfo').textContent = 'Bedrock-сервер сейчас не отвечает на проверку.';
    }

    $('tps').textContent = '—';
    $('tpsText').textContent = 'нет данных от status API';
    $('updated').textContent = `Последняя проверка: ${new Date().toLocaleTimeString('ru-RU')}`;
  } catch (error) {
    setStatus(false);
    $('javaBadge').textContent = 'Ошибка';
    $('bedrockBadge').textContent = 'Ошибка';
    $('error').textContent = 'Не удалось получить данные о сервере. Попробуйте обновить страницу позже.';
    $('error').style.display = 'block';
  } finally {
    $('refresh').disabled = false;
  }
}

$('refresh').addEventListener('click', loadServer);
loadServer();
setInterval(loadServer, 60000);
