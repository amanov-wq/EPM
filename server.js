const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const files = {
  users: path.join(DATA_DIR, 'users.json'),
  topics: path.join(DATA_DIR, 'topics.json'),
  replies: path.join(DATA_DIR, 'replies.json'),
  battlepass: path.join(DATA_DIR, 'battlepass.json')
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]', 'utf8');
}

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(files[name], 'utf8'));
  } catch {
    return [];
  }
}

function write(name, data) {
  fs.writeFileSync(files[name], JSON.stringify(data, null, 2), 'utf8');
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
}

function hash(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const AUTH_SECRET = process.env.EPM_AUTH_SECRET || 'epm-local-secret-change-me';
const TOKEN_TTL = 1000 * 60 * 60 * 24 * 30;

function makeToken(userId) {
  const exp = Date.now() + TOKEN_TTL;
  const payload = `${userId}.${exp}`;
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [id, exp, signature] = String(token || '').split('.');
    if (!id || !exp || !signature || Number(exp) < Date.now()) return null;

    const expected = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(`${id}.${exp}`)
      .digest('hex');

    if (signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

    return Number(id);
  } catch {
    return null;
  }
}

const ROLES = [
  'Пользователь',
  'Стример',
  'Стажер',
  'Мл.Хелпер',
  'Хелпер',
  'Ст.Хелпер',
  'Мл.Модератор',
  'Модератор',
  'Ст.Модератор',
  'Куратор по рекламе',
  'Куратор по команде проекта',
  'Зам Куратор',
  'Куратор режима',
  'Создатель'
];

const ROLE_LEVEL = Object.fromEntries(ROLES.map((role, index) => [role, index]));
const roleLevel = (user) => ROLE_LEVEL[user?.role] ?? 0;
const canCreateTopic = (user) => roleLevel(user) >= ROLE_LEVEL['Хелпер'];
const isStaff = (user) => roleLevel(user) >= ROLE_LEVEL['Модератор'];
const isCreator = (user) => user?.role === 'Создатель';

async function getUser(id) {
  if (pool) {
    const result = await pool.query(
      `SELECT id, nickname, password, role, description, avatar, posts, topics,
              level, battle_pass AS "battlePass", created_at AS "createdAt"
       FROM users WHERE id = $1`,
      [id]
    );
    if (result.rows[0]) return result.rows[0];
  }

  return read('users').find((user) => Number(user.id) === Number(id)) || null;
}

async function saveUser(user) {
  if (pool) {
    await pool.query(
      `INSERT INTO users
       (id, nickname, password, role, description, avatar, posts, topics, level, battle_pass, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         nickname = EXCLUDED.nickname,
         password = EXCLUDED.password,
         role = EXCLUDED.role,
         description = EXCLUDED.description,
         avatar = EXCLUDED.avatar,
         posts = EXCLUDED.posts,
         topics = EXCLUDED.topics,
         level = EXCLUDED.level,
         battle_pass = EXCLUDED.battle_pass`,
      [
        user.id,
        user.nickname,
        user.password,
        user.role || 'Пользователь',
        user.description || '',
        user.avatar || '',
        user.posts || 0,
        user.topics || 0,
        user.level || 1,
        user.battlePass || 0,
        user.createdAt || new Date()
      ]
    );
    return;
  }

  const users = read('users');
  const index = users.findIndex((item) => Number(item.id) === Number(user.id));
  if (index >= 0) users[index] = user;
  else users.push(user);
  write('users', users);
}

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const id = verifyToken(token);

  if (!id) return res.status(401).json({ error: 'Войдите в аккаунт' });

  const user = await getUser(id);
  if (!user) return res.status(401).json({ error: 'Сессия недействительна' });

  req.user = user;
  next();
}

function safeUser(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.password;
  return copy;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, project: 'EPM', database: Boolean(pool) });
});

app.get('/api/roles', (req, res) => {
  res.json({ roles: ROLES, topicCreationFrom: 'Хелпер' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const nickname = String(req.body.nickname || '').trim();
    const password = String(req.body.password || '');

    if (!/^[A-Za-zА-Яа-яЁё0-9_]{3,24}$/.test(nickname)) {
      return res.status(400).json({ error: 'Ник: 3–24 символа, только буквы, цифры и _' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
    }

    let existing = null;
    if (pool) {
      const result = await pool.query(
        'SELECT id FROM users WHERE LOWER(nickname) = LOWER($1)',
        [nickname]
      );
      existing = result.rows[0] || null;
    } else {
      existing = read('users').find(
        (user) => String(user.nickname).toLowerCase() === nickname.toLowerCase()
      );
    }

    if (existing) {
      return res.status(409).json({ error: 'Такой ник уже зарегистрирован' });
    }

    let id;
    if (pool) {
      const result = await pool.query(
        'SELECT COALESCE(MAX(id), 0) + 1 AS id FROM users'
      );
      id = Number(result.rows[0].id);
    } else {
      id = nextId(read('users'));
    }

    const user = {
      id,
      nickname,
      password: hash(password),
      role: 'Пользователь',
      description: 'Новый участник EPM',
      avatar: '',
      posts: 0,
      topics: 0,
      level: 1,
      battlePass: 0,
      createdAt: new Date().toISOString()
    };

    await saveUser(user);

    res.status(201).json({
      token: makeToken(id),
      user: safeUser(user)
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const nickname = String(req.body.nickname || '').trim();
    const password = hash(String(req.body.password || ''));

    let user = null;

    if (pool) {
      const result = await pool.query(
        `SELECT id, nickname, password, role, description, avatar, posts, topics,
                level, battle_pass AS "battlePass", created_at AS "createdAt"
         FROM users WHERE LOWER(nickname) = LOWER($1)`,
        [nickname]
      );
      user = result.rows[0] || null;
    } else {
      user = read('users').find(
        (item) => String(item.nickname).toLowerCase() === nickname.toLowerCase()
      );
    }

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Неверный ник или пароль' });
    }

    res.json({ token: makeToken(user.id), user: safeUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: safeUser(req.user) });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/profile/:id', async (req, res) => {
  try {
    const user = await getUser(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ user: safeUser(user) });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Ошибка загрузки профиля' });
  }
});

app.patch('/api/profile', auth, async (req, res) => {
  try {
    const description = String(req.body.description ?? req.user.description ?? '').slice(0, 500);
    const avatar = String(req.body.avatar ?? req.user.avatar ?? '').slice(0, 2_000_000);

    req.user.description = description;
    req.user.avatar = avatar;
    await saveUser(req.user);

    res.json({ user: safeUser(req.user) });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Не удалось сохранить профиль' });
  }
});

app.get('/api/admin/users', auth, async (req, res) => {
  if (!isCreator(req.user)) {
    return res.status(403).json({ error: 'Доступ только для Создателя' });
  }

  try {
    const users = pool
      ? (await pool.query(
          `SELECT id, nickname, role, description, posts, topics, avatar
           FROM users ORDER BY id`
        )).rows
      : read('users').map((user) => ({
          id: user.id,
          nickname: user.nickname,
          role: user.role || 'Пользователь',
          description: user.description || '',
          posts: user.posts || 0,
          topics: user.topics || 0,
          avatar: user.avatar || ''
        }));

    res.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Ошибка загрузки пользователей' });
  }
});

app.patch('/api/admin/users/:id/role', auth, async (req, res) => {
  if (!isCreator(req.user)) {
    return res.status(403).json({ error: 'Доступ только для Создателя' });
  }

  const role = String(req.body.role || '');
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Неизвестная роль' });
  }

  try {
    const user = await getUser(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    if (user.id === req.user.id && role !== 'Создатель') {
      return res.status(400).json({ error: 'Нельзя снять роль Создателя с самого себя' });
    }

    user.role = role;
    await saveUser(user);
    res.json({ user: safeUser(user) });
  } catch (error) {
    console.error('Admin role error:', error);
    res.status(500).json({ error: 'Не удалось изменить роль' });
  }
});

async function getBP(userId) {
  if (pool) {
    const result = await pool.query(
      `SELECT user_id AS "userId", xp, claimed,
              premium_claimed AS "premiumClaimed", premium
       FROM battlepass WHERE user_id = $1`,
      [userId]
    );

    if (result.rows[0]) return result.rows[0];

    const created = await pool.query(
      `INSERT INTO battlepass (user_id)
       VALUES ($1)
       RETURNING user_id AS "userId", xp, claimed,
                 premium_claimed AS "premiumClaimed", premium`,
      [userId]
    );

    return created.rows[0];
  }

  const rows = read('battlepass');
  let state = rows.find((item) => Number(item.userId) === Number(userId));

  if (!state) {
    state = {
      userId,
      xp: 0,
      claimed: [],
      premiumClaimed: [],
      premium: false
    };
    rows.push(state);
    write('battlepass', rows);
  }

  return state;
}

async function saveBP(state) {
  if (pool) {
    await pool.query(
      `INSERT INTO battlepass
       (user_id, xp, claimed, premium_claimed, premium)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET
         xp = EXCLUDED.xp,
         claimed = EXCLUDED.claimed,
         premium_claimed = EXCLUDED.premium_claimed,
         premium = EXCLUDED.premium`,
      [
        state.userId,
        Number(state.xp) || 0,
        Array.isArray(state.claimed) ? state.claimed : [],
        Array.isArray(state.premiumClaimed) ? state.premiumClaimed : [],
        Boolean(state.premium)
      ]
    );
    return;
  }

  const rows = read('battlepass');
  const index = rows.findIndex((item) => Number(item.userId) === Number(state.userId));
  if (index >= 0) rows[index] = state;
  else rows.push(state);
  write('battlepass', rows);
}

app.get('/api/battlepass', auth, async (req, res) => {
  try {
    const state = await getBP(req.user.id);
    const xp = Math.max(0, Math.min(2000, Number(state.xp) || 0));
    const level = Math.min(20, Math.floor(xp / 100) + 1);

    res.json({
      xp,
      level,
      claimed: Array.isArray(state.claimed) ? state.claimed : [],
      premiumClaimed: Array.isArray(state.premiumClaimed) ? state.premiumClaimed : [],
      premium: Boolean(state.premium)
    });
  } catch (error) {
    console.error('Battle Pass load error:', error);
    res.status(500).json({ error: 'Ошибка загрузки Battle Pass' });
  }
});

app.post('/api/battlepass/xp', auth, async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
    return res.status(400).json({ error: 'Недопустимое количество XP' });
  }

  try {
    const state = await getBP(req.user.id);
    state.xp = Math.min(2000, (Number(state.xp) || 0) + amount);
    await saveBP(state);

    res.json({
      xp: state.xp,
      level: Math.min(20, Math.floor(state.xp / 100) + 1)
    });
  } catch (error) {
    console.error('Battle Pass XP error:', error);
    res.status(500).json({ error: 'Не удалось сохранить XP' });
  }
});

app.post('/api/battlepass/claim', auth, async (req, res) => {
  const level = Number(req.body.level);
  const premium = Boolean(req.body.premium);

  if (!Number.isInteger(level) || level < 1 || level > 20) {
    return res.status(400).json({ error: 'Недопустимый уровень' });
  }

  try {
    const state = await getBP(req.user.id);
    const currentLevel = Math.min(20, Math.floor((Number(state.xp) || 0) / 100) + 1);

    if (level > currentLevel) {
      return res.status(403).json({ error: 'Награда ещё заблокирована' });
    }

    if (premium && !state.premium) {
      return res.status(403).json({ error: 'Premium не активирован' });
    }

    const key = premium ? 'premiumClaimed' : 'claimed';
    state[key] = Array.isArray(state[key]) ? state[key] : [];

    if (state[key].includes(level)) {
      return res.status(409).json({ error: 'Награда уже получена' });
    }

    state[key].push(level);
    await saveBP(state);

    res.json({ ok: true, level, premium });
  } catch (error) {
    console.error('Battle Pass claim error:', error);
    res.status(500).json({ error: 'Не удалось получить награду' });
  }
});

app.get('/api/topics', async (req, res) => {
  try {
    const topics = pool
      ? (await pool.query(
          `SELECT id, title, content, author, author_id AS "authorId", category,
                  pinned, closed, views, replies_count AS "repliesCount",
                  created_at AS "createdAt", updated_at AS "updatedAt"
           FROM topics ORDER BY pinned DESC, updated_at DESC`
        )).rows
      : read('topics').sort(
          (a, b) =>
            Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
            new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
        );

    res.json(topics);
  } catch (error) {
    console.error('Topics load error:', error);
    res.status(500).json({ error: 'Ошибка загрузки форума' });
  }
});

app.get('/api/topics/:id', async (req, res) => {
  try {
    let topic;

    if (pool) {
      topic = (
        await pool.query(
          `SELECT id, title, content, author, author_id AS "authorId", category,
                  pinned, closed, views, replies_count AS "repliesCount",
                  created_at AS "createdAt", updated_at AS "updatedAt"
           FROM topics WHERE id = $1`,
          [req.params.id]
        )
      ).rows[0];
    } else {
      topic = read('topics').find(
        (item) => String(item.id) === String(req.params.id)
      );
    }

    if (!topic) return res.status(404).json({ error: 'Тема не найдена' });

    let replies;
    if (pool) {
      replies = (
        await pool.query(
          `SELECT id, topic_id AS "topicId", content, author,
                  author_id AS "authorId", created_at AS "createdAt"
           FROM replies WHERE topic_id = $1 ORDER BY id`,
          [topic.id]
        )
      ).rows;
    } else {
      replies = read('replies').filter(
        (item) => String(item.topicId) === String(topic.id)
      );
    }

    if (pool) {
      await pool.query('UPDATE topics SET views = views + 1 WHERE id = $1', [topic.id]);
      topic.views = Number(topic.views || 0) + 1;
    }

    res.json({ ...topic, replies });
  } catch (error) {
    console.error('Topic load error:', error);
    res.status(500).json({ error: 'Ошибка загрузки темы' });
  }
});

app.post('/api/topics', auth, async (req, res) => {
  if (!canCreateTopic(req.user)) {
    return res.status(403).json({ error: 'Создавать темы могут только Хелпер и выше' });
  }

  const title = String(req.body.title || '').trim();
  const content = String(req.body.content || '').trim();
  const category = String(req.body.category || 'Общение').trim() || 'Общение';

  if (!title || !content) {
    return res.status(400).json({ error: 'Заполни заголовок и текст темы' });
  }

  try {
    const now = new Date().toISOString();

    if (pool) {
      const result = await pool.query(
        `INSERT INTO topics
         (title, content, author, author_id, category, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         RETURNING id, title, content, author, author_id AS "authorId", category,
                   pinned, closed, views, replies_count AS "repliesCount",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [title, content, req.user.nickname, req.user.id, category, now]
      );

      await pool.query('UPDATE users SET topics = topics + 1 WHERE id = $1', [req.user.id]);
      return res.status(201).json(result.rows[0]);
    }

    const topics = read('topics');
    const topic = {
      id: nextId(topics),
      title,
      content,
      author: req.user.nickname,
      authorId: req.user.id,
      category,
      pinned: false,
      closed: false,
      views: 0,
      repliesCount: 0,
      createdAt: now,
      updatedAt: now
    };

    topics.push(topic);
    write('topics', topics);

    const users = read('users');
    const user = users.find((item) => Number(item.id) === Number(req.user.id));
    if (user) {
      user.topics = (user.topics || 0) + 1;
      write('users', users);
    }

    res.status(201).json(topic);
  } catch (error) {
    console.error('Topic create error:', error);
    res.status(500).json({ error: 'Не удалось создать тему' });
  }
});

app.post('/api/topics/:id/replies', auth, async (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Напиши текст ответа' });

  try {
    if (pool) {
      const topicResult = await pool.query('SELECT * FROM topics WHERE id = $1', [req.params.id]);
      const topic = topicResult.rows[0];

      if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
      if (topic.closed) return res.status(403).json({ error: 'Тема закрыта' });

      const now = new Date().toISOString();
      const replyResult = await pool.query(
        `INSERT INTO replies (topic_id, content, author, author_id, created_at)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, topic_id AS "topicId", content, author,
                   author_id AS "authorId", created_at AS "createdAt"`,
        [topic.id, content, req.user.nickname, req.user.id, now]
      );

      await pool.query(
        `UPDATE topics
         SET replies_count = replies_count + 1, updated_at = $2
         WHERE id = $1`,
        [topic.id, now]
      );

      await pool.query('UPDATE users SET posts = posts + 1 WHERE id = $1', [req.user.id]);

      const state = await getBP(req.user.id);
      state.xp = Math.min(2000, (Number(state.xp) || 0) + 20);
      await saveBP(state);

      return res.status(201).json({
        ...replyResult.rows[0],
        battlePass: {
          xp: state.xp,
          level: Math.min(20, Math.floor(state.xp / 100) + 1)
        }
      });
    }

    const topics = read('topics');
    const topic = topics.find((item) => String(item.id) === String(req.params.id));
    if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
    if (topic.closed) return res.status(403).json({ error: 'Тема закрыта' });

    const replies = read('replies');
    const now = new Date().toISOString();
    const reply = {
      id: nextId(replies),
      topicId: Number(topic.id),
      content,
      author: req.user.nickname,
      authorId: req.user.id,
      createdAt: now
    };

    replies.push(reply);
    topic.repliesCount = (topic.repliesCount || 0) + 1;
    topic.updatedAt = now;
    write('replies', replies);
    write('topics', topics);

    const state = await getBP(req.user.id);
    state.xp = Math.min(2000, (Number(state.xp) || 0) + 20);
    await saveBP(state);

    const users = read('users');
    const user = users.find((item) => Number(item.id) === Number(req.user.id));
    if (user) {
      user.posts = (user.posts || 0) + 1;
      write('users', users);
    }

    res.status(201).json({
      ...reply,
      battlePass: {
        xp: state.xp,
        level: Math.min(20, Math.floor(state.xp / 100) + 1)
      }
    });
  } catch (error) {
    console.error('Reply create error:', error);
    res.status(500).json({ error: 'Не удалось отправить ответ' });
  }
});

app.get('/api/profile/:id/messages', async (req, res) => {
  try {
    const profileUserId = Number(req.params.id);
    if (!Number.isInteger(profileUserId)) {
      return res.status(400).json({ error: 'Некорректный пользователь' });
    }

    if (pool) {
      const result = await pool.query(
        `SELECT id, profile_user_id AS "profileUserId", author_id AS "authorId",
                author, content, created_at AS "createdAt"
         FROM profile_messages
         WHERE profile_user_id = $1
         ORDER BY id DESC`,
        [profileUserId]
      );
      return res.json({ messages: result.rows });
    }

    const localMessagesFile = path.join(DATA_DIR, 'profile_messages.json');
    if (!fs.existsSync(localMessagesFile)) fs.writeFileSync(localMessagesFile, '[]', 'utf8');
    const messages = JSON.parse(fs.readFileSync(localMessagesFile, 'utf8'))
      .filter((item) => Number(item.profileUserId) === profileUserId)
      .sort((a, b) => Number(b.id) - Number(a.id));

    res.json({ messages });
  } catch (error) {
    console.error('Profile messages load error:', error);
    res.status(500).json({ error: 'Ошибка загрузки сообщений' });
  }
});

app.post('/api/profile/:id/messages', auth, async (req, res) => {
  const profileUserId = Number(req.params.id);
  const content = String(req.body.content || '').trim();

  if (!Number.isInteger(profileUserId)) {
    return res.status(400).json({ error: 'Некорректный пользователь' });
  }
  if (!content || content.length > 1000) {
    return res.status(400).json({ error: 'Сообщение должно содержать от 1 до 1000 символов' });
  }

  try {
    const profile = await getUser(profileUserId);
    if (!profile) return res.status(404).json({ error: 'Пользователь не найден' });

    const now = new Date().toISOString();

    if (pool) {
      const result = await pool.query(
        `INSERT INTO profile_messages
         (profile_user_id, author_id, author, content, created_at)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, profile_user_id AS "profileUserId", author_id AS "authorId",
                   author, content, created_at AS "createdAt"`,
        [profileUserId, req.user.id, req.user.nickname, content, now]
      );
      return res.status(201).json({ message: result.rows[0] });
    }

    const messageFile = path.join(DATA_DIR, 'profile_messages.json');
    if (!fs.existsSync(messageFile)) fs.writeFileSync(messageFile, '[]', 'utf8');
    const messages = JSON.parse(fs.readFileSync(messageFile, 'utf8'));
    const message = {
      id: nextId(messages),
      profileUserId,
      authorId: req.user.id,
      author: req.user.nickname,
      content,
      createdAt: now
    };
    messages.push(message);
    fs.writeFileSync(messageFile, JSON.stringify(messages, null, 2), 'utf8');

    res.status(201).json({ message });
  } catch (error) {
    console.error('Profile message create error:', error);
    res.status(500).json({ error: 'Не удалось отправить сообщение' });
  }
});

app.get('/api/news', (req, res) => {
  const newsFile = path.join(DATA_DIR, 'news.json');
  if (!fs.existsSync(newsFile)) fs.writeFileSync(newsFile, '[]', 'utf8');
  res.json(readJsonFile(newsFile));
});

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

app.use(express.static(__dirname));

app.use((err, req, res, next) => {
  console.error('EPM API error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`EPM server started on port ${PORT}`);
});
