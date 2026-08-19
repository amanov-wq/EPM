const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = connectionString ? new Pool({ connectionString, ssl: { rejectUnauthorized: false } }) : null;

async function initDatabase() {
  if (!pool) return false;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, nickname TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Пользователь', description TEXT DEFAULT '', posts INTEGER NOT NULL DEFAULT 0,
      topics INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, battle_pass INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS topics (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, author TEXT NOT NULL, author_id INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'Общение', pinned BOOLEAN NOT NULL DEFAULT FALSE, closed BOOLEAN NOT NULL DEFAULT FALSE,
      views INTEGER NOT NULL DEFAULT 0, replies_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS replies (
      id SERIAL PRIMARY KEY, topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      content TEXT NOT NULL, author TEXT NOT NULL, author_id INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS battlepass (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, xp INTEGER NOT NULL DEFAULT 0,
      claimed INTEGER[] NOT NULL DEFAULT '{}', premium_claimed INTEGER[] NOT NULL DEFAULT '{}', premium BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS profile_messages (
      id SERIAL PRIMARY KEY, profile_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, author TEXT NOT NULL, content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  return true;
}

async function closeDatabase() { if (pool) await pool.end(); }

async function replaceFromJson(name, rows) {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = rows.map(x => Number(name === 'battlepass' ? x.userId : x.id)).filter(Number.isFinite);
    if (name === 'users') {
      if (ids.length) await client.query(`DELETE FROM users WHERE id <> ALL($1::int[])`, [ids]); else await client.query('DELETE FROM users');
      for (const u of rows) await client.query(`INSERT INTO users (id,nickname,password,role,description,posts,topics,level,battle_pass,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE SET nickname=EXCLUDED.nickname,password=EXCLUDED.password,role=EXCLUDED.role,description=EXCLUDED.description,posts=EXCLUDED.posts,topics=EXCLUDED.topics,level=EXCLUDED.level,battle_pass=EXCLUDED.battle_pass`, [u.id,u.nickname,u.password,u.role||'Пользователь',u.description||'',u.posts||0,u.topics||0,u.level||1,u.battlePass||0,u.createdAt||new Date()]);
      await client.query(`SELECT setval(pg_get_serial_sequence('users','id'), COALESCE((SELECT MAX(id) FROM users),1), true)`);
    } else if (name === 'topics') {
      if (ids.length) await client.query(`DELETE FROM topics WHERE id <> ALL($1::int[])`, [ids]); else await client.query('DELETE FROM topics');
      for (const t of rows) await client.query(`INSERT INTO topics (id,title,content,author,author_id,category,pinned,closed,views,replies_count,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,author=EXCLUDED.author,author_id=EXCLUDED.author_id,category=EXCLUDED.category,pinned=EXCLUDED.pinned,closed=EXCLUDED.closed,views=EXCLUDED.views,replies_count=EXCLUDED.replies_count,updated_at=EXCLUDED.updated_at`, [t.id,t.title,t.content,t.author,t.authorId,t.category||'Общение',!!t.pinned,!!t.closed,t.views||0,t.repliesCount||0,t.createdAt||new Date(),t.updatedAt||t.createdAt||new Date()]);
      await client.query(`SELECT setval(pg_get_serial_sequence('topics','id'), COALESCE((SELECT MAX(id) FROM topics),1), true)`);
    } else if (name === 'replies') {
      if (ids.length) await client.query(`DELETE FROM replies WHERE id <> ALL($1::int[])`, [ids]); else await client.query('DELETE FROM replies');
      for (const r of rows) await client.query(`INSERT INTO replies (id,topic_id,content,author,author_id,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET content=EXCLUDED.content`, [r.id,r.topicId,r.content,r.author,r.authorId,r.createdAt||new Date()]);
      await client.query(`SELECT setval(pg_get_serial_sequence('replies','id'), COALESCE((SELECT MAX(id) FROM replies),1), true)`);
    } else if (name === 'battlepass') {
      if (ids.length) await client.query(`DELETE FROM battlepass WHERE user_id <> ALL($1::int[])`, [ids]); else await client.query('DELETE FROM battlepass');
      for (const b of rows) await client.query(`INSERT INTO battlepass (user_id,xp,claimed,premium_claimed,premium) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET xp=EXCLUDED.xp,claimed=EXCLUDED.claimed,premium_claimed=EXCLUDED.premium_claimed,premium=EXCLUDED.premium`, [b.userId,b.xp||0,b.claimed||[],b.premiumClaimed||[],!!b.premium]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function loadToJson(name) {
  if (!pool) return null;
  if (name === 'users') { const {rows}=await pool.query('SELECT id,nickname,password,role,description,posts,topics,level,battle_pass AS "battlePass",created_at AS "createdAt" FROM users ORDER BY id'); return rows; }
  if (name === 'topics') { const {rows}=await pool.query('SELECT id,title,content,author,author_id AS "authorId",category,pinned,closed,views,replies_count AS "repliesCount",created_at AS "createdAt",updated_at AS "updatedAt" FROM topics ORDER BY id'); return rows; }
  if (name === 'replies') { const {rows}=await pool.query('SELECT id,topic_id AS "topicId",content,author,author_id AS "authorId",created_at AS "createdAt" FROM replies ORDER BY id'); return rows; }
  if (name === 'battlepass') { const {rows}=await pool.query('SELECT user_id AS "userId",xp,claimed,premium_claimed AS "premiumClaimed",premium FROM battlepass ORDER BY user_id'); return rows; }
  return null;
}

module.exports = { pool, initDatabase, closeDatabase, replaceFromJson, loadToJson };