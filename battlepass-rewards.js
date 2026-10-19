const crypto = require('crypto');

const MODES = ['Estamon Grief', 'Estamon Creative', 'Estamon Survial', 'BloodShedWorld'];
const levelForXp = (xp) => Math.min(30, 1 + Math.floor(Math.max(0, xp) / 1000));

// These are actual server rewards, not labels from the browser. Item names are Bukkit material IDs.
// Privilege groups and command templates are configured separately on each Minecraft server.
const FREE = {
  1:  { type: 'currency', amount: 10000 },
  2:  { type: 'item', items: [{ item: 'oak_planks', amount: 32 }, { item: 'stone', amount: 32 }, { item: 'torch', amount: 16 }] },
  3:  { type: 'item', items: [{ item: 'bread', amount: 16 }, { item: 'carrot', amount: 16 }] },
  4:  { type: 'item', items: [{ item: 'iron_pickaxe', amount: 1 }] },
  5:  { type: 'currency', amount: 15000 },
  6:  { type: 'item', items: [{ item: 'shield', amount: 1 }] },
  7:  { type: 'item', items: [{ item: 'diamond', amount: 2 }] },
  8:  { type: 'item', items: [{ item: 'golden_apple', amount: 2 }] },
  9:  { type: 'currency', amount: 20000 },
  10: { type: 'item', items: [{ item: 'firework_rocket', amount: 16 }] },
  11: { type: 'item', items: [{ item: 'honey_bottle', amount: 4 }] },
  12: { type: 'item', items: [{ item: 'bricks', amount: 32 }] },
  13: { type: 'currency', amount: 25000 },
  14: { type: 'item', items: [{ item: 'bow', amount: 1 }, { item: 'arrow', amount: 32 }] },
  15: { type: 'item', items: [{ item: 'experience_bottle', amount: 16 }] },
  16: { type: 'item', items: [{ item: 'bone', amount: 32 }] },
  17: { type: 'currency', amount: 35000 },
  18: { type: 'item', items: [{ item: 'compass', amount: 1 }] },
  19: { type: 'item', items: [{ item: 'amethyst_shard', amount: 16 }] },
  20: { type: 'privilege', group: 'lite' },
  21: { type: 'currency', amount: 50000 },
  22: { type: 'item', items: [{ item: 'saddle', amount: 1 }] },
  23: { type: 'item', items: [{ item: 'chest', amount: 4 }, { item: 'iron_ingot', amount: 16 }] },
  24: { type: 'item', items: [{ item: 'diamond', amount: 8 }] },
  25: { type: 'currency', amount: 75000 },
  26: { type: 'item', items: [{ item: 'elytra', amount: 1 }] },
  27: { type: 'item', items: [{ item: 'ender_eye', amount: 8 }] },
  28: { type: 'currency', amount: 100000 },
  29: { type: 'privilege', group: 'legend' },
  30: { type: 'currency', amount: 150000 }
};
const PREMIUM = {
  3:  { type: 'item', items: [{ item: 'nether_star', amount: 1 }] },
  6:  { type: 'currency', amount: 10000 },
  9:  { type: 'item', items: [{ item: 'enchanted_golden_apple', amount: 2 }] },
  12: { type: 'privilege', group: 'premium' },
  15: { type: 'item', items: [{ item: 'diamond', amount: 16 }] },
  18: { type: 'item', items: [{ item: 'blaze_powder', amount: 32 }] },
  21: { type: 'item', items: [{ item: 'totem_of_undying', amount: 1 }] },
  24: { type: 'item', items: [{ item: 'shulker_box', amount: 1 }] },
  27: { type: 'privilege', group: 'dragon' },
  30: { type: 'privilege', group: 'premium_legend' }
};

function safeMode(input) {
  const value = String(input || '').trim();
  return value === 'Blood Shed World' ? 'BloodShedWorld' : value;
}
function safeNickname(value) {
  return /^[A-Za-zА-Яа-яЁё0-9_]{3,24}$/.test(String(value || ''));
}
function apiKeyMatches(expected, supplied) {
  if (!expected || !supplied) return false;
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(supplied));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function registerBattlePassRoutes({ app, pool, auth, apiKeys }) {
  app.get('/api/battlepass/state', auth, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Battle Pass требует PostgreSQL' });
    try {
      // XP is calculated from server-owned forum counters; the browser cannot set its own level.
      const xp = Math.min(29999, Math.max(0, Number(req.user.posts || 0) * 25 + Number(req.user.topics || 0) * 100));
      await pool.query(
        'INSERT INTO battlepass_profiles(user_id,season,xp) VALUES($1,1,$2) ON CONFLICT(user_id) DO UPDATE SET xp=GREATEST(battlepass_profiles.xp,EXCLUDED.xp),updated_at=NOW()',
        [req.user.id, xp]
      );
      const profile = (await pool.query('SELECT season,xp,premium FROM battlepass_profiles WHERE user_id=$1', [req.user.id])).rows[0];
      const claims = (await pool.query('SELECT track,level,mode,status FROM battlepass_claims WHERE user_id=$1 AND season=$2 ORDER BY level', [req.user.id, profile.season])).rows;
      res.json({ season: profile.season, xp: Number(profile.xp), level: levelForXp(profile.xp), premium: profile.premium, claims });
    } catch (error) {
      console.error('Battle Pass state error:', error);
      res.status(500).json({ error: 'Не удалось загрузить Battle Pass' });
    }
  });

  app.post('/api/battlepass/claim', auth, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Выдача наград требует PostgreSQL' });
    const mode = safeMode(req.body.mode);
    const track = String(req.body.track || 'free');
    const level = Number(req.body.level);
    if (!MODES.includes(mode)) return res.status(400).json({ error: 'Выбери игровой режим' });
    if (!Number.isInteger(level) || level < 1 || level > 30) return res.status(400).json({ error: 'Некорректный уровень награды' });
    if (!['free', 'premium'].includes(track)) return res.status(400).json({ error: 'Некорректная дорожка наград' });
    const reward = (track === 'free' ? FREE : PREMIUM)[level];
    if (!reward) return res.status(400).json({ error: 'На этом уровне нет награды этой дорожки' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO battlepass_profiles(user_id,season,xp) VALUES($1,1,0) ON CONFLICT(user_id) DO NOTHING', [req.user.id]);
      const profile = (await client.query('SELECT season,xp,premium FROM battlepass_profiles WHERE user_id=$1 FOR UPDATE', [req.user.id])).rows[0];
      const currentXp = Math.min(29999, Math.max(Number(profile.xp || 0), Number(req.user.posts || 0) * 25 + Number(req.user.topics || 0) * 100));
      const currentLevel = levelForXp(currentXp);
      if (level > currentLevel) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Сначала открой этот уровень Battle Pass' }); }
      if (track === 'premium' && !profile.premium) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Премиум Battle Pass ещё не активирован после оплаты' }); }
      const claim = await client.query(
        'INSERT INTO battlepass_claims(user_id,season,track,level,mode,reward_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,season,track,level,mode) DO NOTHING RETURNING id',
        [req.user.id, profile.season, track, level, mode, track + '-' + String(level).padStart(2, '0')]
      );
      if (!claim.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Эта награда уже запрошена в выбранном режиме' }); }
      const rewardKey = track + '-' + String(level).padStart(2, '0');
      const queue = await client.query(
        'INSERT INTO battlepass_reward_queue(claim_id,user_id,nickname,mode,reward_key,reward_type,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id,status',
        [claim.rows[0].id, req.user.id, req.user.nickname, mode, rewardKey, reward.type, JSON.stringify(reward)]
      );
      await client.query('COMMIT');
      return res.status(202).json({ ok: true, queued: true, queueId: queue.rows[0].id, status: queue.rows[0].status, message: 'Награда поставлена в очередь. Зайди на выбранный сервер, чтобы получить её.' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Battle Pass claim error:', error);
      return res.status(500).json({ error: 'Не удалось поставить награду в очередь' });
    } finally {
      client.release();
    }
  });

  app.get('/api/integrations/battlepass/rewards', async (req, res) => {
    const requestedMode = safeMode(req.query.mode);
    const key = String(req.get('X-EPM-API-Key') || '').trim();
    if (!MODES.includes(requestedMode) || !apiKeyMatches(apiKeys[requestedMode], key)) {
      return res.status(401).json({ error: 'Недействительный API-ключ интеграции' });
    }
    if (!pool) return res.status(503).json({ error: 'Очередь наград требует PostgreSQL' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const jobs = await client.query(
        `SELECT id,nickname,mode,reward_key,reward_type,payload,attempts
         FROM battlepass_reward_queue
         WHERE mode=$1 AND (status='pending' OR (status='processing' AND updated_at < NOW() - INTERVAL '2 minutes'))
         ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 20`,
        [requestedMode]
      );
      const ids = jobs.rows.map(row => row.id);
      if (ids.length) await client.query(
        "UPDATE battlepass_reward_queue SET status='processing',attempts=attempts+1,updated_at=NOW() WHERE id=ANY($1::bigint[])",
        [ids]
      );
      await client.query('COMMIT');
      res.json({ jobs: jobs.rows });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Battle Pass queue poll error:', error);
      res.status(500).json({ error: 'Не удалось прочитать очередь наград' });
    } finally {
      client.release();
    }
  });

  app.post('/api/integrations/battlepass/rewards/:id/complete', async (req, res) => {
    const mode = safeMode(req.body.mode);
    const key = String(req.get('X-EPM-API-Key') || '').trim();
    const id = Number(req.params.id);
    const status = String(req.body.status || '');
    const message = String(req.body.message || '').slice(0, 500);
    if (!MODES.includes(mode) || !apiKeyMatches(apiKeys[mode], key)) return res.status(401).json({ error: 'Недействительный API-ключ интеграции' });
    if (!Number.isSafeInteger(id) || id < 1 || !['delivered', 'failed'].includes(status)) return res.status(400).json({ error: 'Некорректный результат выдачи' });
    if (!pool) return res.status(503).json({ error: 'Очередь наград требует PostgreSQL' });
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const job = (await client.query('SELECT id,claim_id FROM battlepass_reward_queue WHERE id=$1 AND mode=$2 FOR UPDATE', [id, mode])).rows[0];
        if (!job) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Задание не найдено' }); }
        await client.query(
          'UPDATE battlepass_reward_queue SET status=$2,last_error=$3,updated_at=NOW(),delivered_at=CASE WHEN $2=\'delivered\' THEN NOW() ELSE NULL END WHERE id=$1',
          [id, status, status === 'failed' ? (message || 'Minecraft-плагин не смог выполнить награду') : '']
        );
        await client.query(
          'UPDATE battlepass_claims SET status=$2,delivered_at=CASE WHEN $2=\'delivered\' THEN NOW() ELSE NULL END WHERE id=$1',
          [job.claim_id, status]
        );
        await client.query('COMMIT');
        res.json({ ok: true });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Battle Pass result error:', error);
      res.status(500).json({ error: 'Не удалось сохранить результат выдачи' });
    }
  });
}
module.exports = { registerBattlePassRoutes };
