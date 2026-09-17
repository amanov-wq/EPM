const https = require('https');

const HOST = 'EstamonHost.ru';
const PORT = 25565;
const JAVA_URL = `https://api.mcsrvstat.us/3/${HOST}:${PORT}`;
const BEDROCK_URL = `https://api.mcsrvstat.us/bedrock/3/${HOST}:${PORT}`;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'EPM-Forum/1.0' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(`HTTP ${response.statusCode}`));
        }
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    });
    request.setTimeout(8000, () => request.destroy(new Error('Request timeout')));
    request.on('error', reject);
  });
}

async function loadStatus() {
  const [javaResult, bedrockResult] = await Promise.allSettled([
    getJson(JAVA_URL),
    getJson(BEDROCK_URL)
  ]);

  const java = javaResult.status === 'fulfilled' ? javaResult.value : { online: false };
  const bedrock = bedrockResult.status === 'fulfilled' ? bedrockResult.value : { online: false };
  const online = Boolean(java.online || bedrock.online);
  const source = java.online ? java : bedrock;
  const players = source.players || {};

  return {
    host: HOST,
    port: PORT,
    address: `${HOST}:${PORT}`,
    online,
    players: {
      online: Number(players.online || 0),
      max: Number(players.max || 100)
    },
    version: source.version || source.protocol?.name || 'Неизвестно',
    gamemode: source.gamemode || 'Survival',
    java: {
      online: Boolean(java.online),
      version: java.version || java.protocol?.name || null,
      software: java.software || null
    },
    bedrock: {
      online: Boolean(bedrock.online),
      version: bedrock.version || null,
      gamemode: bedrock.gamemode || null
    },
    tps: null,
    tpsAvailable: false,
    checkedAt: new Date().toISOString()
  };
}

module.exports = { loadStatus };
