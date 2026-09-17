const SERVER = 'EstamonHost.ru:25565';
const MAX_PLAYERS = 100;
const JAVA_API = `https://api.mcsrvstat.us/3/${encodeURIComponent(SERVER)}`;
const BEDROCK_API = `https://api.mcsrvstat.us/bedrock/3/${encodeURIComponent(SERVER)}`;

const $ = (id) => document.getElementById(id);

function setStatus(online) {
  const el = $('status');
  el.className = `server-status ${online ? 'online' : 'offline'}`;
  el.innerHTML = `<i class="status-dot"></i><span>${online ? 'Онлайн' : 'Оффлайн'}</span>`;
}

function setBadge(id, online, checked = true) {
  const el = $(id);
  if (!checked) {
    el.textContent = 'Нет данных';
    el.style.color = '#9aa2ad';
    return;
  }
  el.textContent = online ? 'Онлайн' : 'Оффлайн';
  el.style.color = online ? '#9dccaa' : '#d7a5a5';
}

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function applyPlayers(data) {
  const onlinePlayers = Math.max(0, Number(data?.players?.online || 0));
  $('players').textContent = `${onlinePlayers}/${MAX_PLAYERS}`;
  $('playersText').textContent = `${MAX_PLAYERS} мест`;
}

function applyVersion(data) {
  $('version').textContent = data?.version || data?.protocol?.name || 'Неизвестно';
}

async function loadServer() {
  $('refresh').disabled = true;
  $('error').style.display = 'none';
  $('error').textContent = '';

  try {
    const [javaResult, bedrockResult] = await Promise.allSettled([getJson(JAVA_API), getJson(BEDROCK_API)]);
    const javaOk = javaResult.status === 'fulfilled';
    const bedrockOk = bedrockResult.status === 'fulfilled';
    const java = javaOk ? javaResult.value : { online: false };
    const bedrock = bedrockOk ? bedrockResult.value : { online: false };
    const online = Boolean(java.online || bedrock.online);

    setStatus(online);
    setBadge('javaBadge', Boolean(java.online), javaOk);
    setBadge('bedrockBadge', Boolean(bedrock.online), bedrockOk);

    if (java.online) {
      applyPlayers(java);
      applyVersion(java);
      $('gamemode').textContent = java.gamemode || 'Survival';
      $('javaInfo').textContent = ['Java-сервер доступен.', java.version ? `Версия: ${java.version}.` : '', java.software ? `ПО: ${java.software}.` : ''].filter(Boolean).join(' ');
    } else {
      $('javaInfo').textContent = javaOk ? 'Java-сервер сейчас не отвечает на проверку.' : 'Не удалось получить данные Java-сервера.';
    }

    if (bedrock.online) {
      $('bedrockInfo').textContent = ['Bedrock-сервер доступен.', bedrock.version ? `Версия: ${bedrock.version}.` : '', bedrock.gamemode ? `Режим: ${bedrock.gamemode}.` : ''].filter(Boolean).join(' ');
      if (!java.online) {
        applyPlayers(bedrock);
        applyVersion(bedrock);
        $('gamemode').textContent = bedrock.gamemode || 'Survival';
      }
    } else {
      $('bedrockInfo').textContent = bedrockOk ? 'Bedrock-сервер сейчас не отвечает на проверку.' : 'Не удалось получить данные Bedrock-сервера.';
    }

    $('tps').textContent = '—';
    $('tpsText').textContent = 'TPS не передаётся status API';
    $('updated').textContent = `Последняя проверка: ${new Date().toLocaleTimeString('ru-RU')}`;

    if (!javaOk && !bedrockOk) throw new Error('Оба API недоступны');
  } catch (error) {
    setStatus(false);
    setBadge('javaBadge', false, false);
    setBadge('bedrockBadge', false, false);
    $('players').textContent = `0/${MAX_PLAYERS}`;
    $('playersText').textContent = `${MAX_PLAYERS} мест`;
    $('version').textContent = '—';
    $('gamemode').textContent = 'Survival';
    $('tps').textContent = '—';
    $('tpsText').textContent = 'нет данных';
    $('error').textContent = 'Не удалось получить данные о сервере. Попробуйте обновить страницу позже.';
    $('error').style.display = 'block';
  } finally {
    $('refresh').disabled = false;
  }
}

$('refresh').addEventListener('click', loadServer);
loadServer();
setInterval(loadServer, 60000);
