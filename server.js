const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const files = {
  users: path.join(DATA_DIR, 'users.json'),
  topics: path.join(DATA_DIR, 'topics.json'),
  replies: path.join(DATA_DIR, 'replies.json')
};

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]', 'utf8');
}

function read(name) {
  try { return JSON.parse(fs.readFileSync(files[name], 'utf8')); } catch { return []; }
}
function write(name, data) { fs.writeFileSync(files[name], JSON.stringify(data, null, 2), 'utf8'); }
function nextId(rows) { return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1; }
function hash(password) { return crypto.createHash('sha256').update(password).digest('hex'); }

const AUTH_SECRET = process.env.EPM_AUTH_SECRET || crypto.randomBytes(32).toString('hex');
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
    if (!/^\d+$/.test(id) || !/^\d+$/.test(exp) || !/^[a-f0-9]{64}$/i.test(signature)) return null;
    if (Number(exp) < Date.now()) return null;
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(`${id}.${exp}`).digest('hex');
    if (signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const userId = Number(id);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
  } catch { return null; }
}

const ROLES = [
  'Пользователь','Стример','Стажер','Мл.Хелпер','Хелпер','Ст.Хелпер',
  'Мл.Модератор','Модератор','Ст.Модератор','Куратор по рекламе',
  'Куратор по команде проекта','Зам Куратор','Куратор режима','Создатель'
];
const ROLE_LEVEL = Object.fromEntries(ROLES.map((role, index) => [role, index]));
const roleLevel = (user) => ROLE_LEVEL[user?.role] ?? 0;
const canCreateTopic = (user) => roleLevel(user) >= ROLE_LEVEL['Хелпер'];
const isStaff = (user) => roleLevel(user) >= ROLE_LEVEL['Модератор'];
const isCreator = (user) => user?.role === 'Создатель';

async function getUser(id) {
  if (pool) {
    const result = await pool.query(`SELECT id,nickname,password,role,description,avatar,posts,topics,level,blocked,created_at AS "createdAt" FROM users WHERE id=$1`, [id]);
    if (result.rows[0]) return result.rows[0];
  }
  return read('users').find((user) => Number(user.id) === Number(id)) || null;
}
async function saveUser(user) {
  if (pool) {
    await pool.query(`INSERT INTO users (id,nickname,password,role,description,avatar,posts,topics,level,blocked,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET nickname=EXCLUDED.nickname,password=EXCLUDED.password,role=EXCLUDED.role,description=EXCLUDED.description,avatar=EXCLUDED.avatar,posts=EXCLUDED.posts,topics=EXCLUDED.topics,level=EXCLUDED.level,blocked=EXCLUDED.blocked,created_at=EXCLUDED.created_at`, [user.id,user.nickname,user.password,user.role||'Пользователь',user.description||'',user.avatar||'',user.posts||0,user.topics||0,user.level||1,Boolean(user.blocked),user.createdAt||new Date()]);
    return;
  }
  const users = read('users');
  const index = users.findIndex((item) => Number(item.id) === Number(user.id));
  if (index >= 0) users[index] = user; else users.push(user);
  write('users', users);
}
async function auth(req,res,next) {
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7).trim():'';
  const id=verifyToken(token);
  if(!id)return res.status(401).json({error:'Войдите в аккаунт'});
  const user=await getUser(id);
  if(!user)return res.status(401).json({error:'Сессия недействительна'});
  if(Boolean(user.blocked))return res.status(403).json({error:'Аккаунт заблокирован'});
  req.user=user; next();
}
function safeUser(user){if(!user)return null;const copy={...user};delete copy.password;return copy;}
function publicAuthor(user){if(!user)return null;return{id:user.id,nickname:user.nickname,role:user.role||'Пользователь',avatar:user.avatar||''};}


app.get('/api/server-status', async (req, res) => {
  const host = 'EstamonHost.ru';
  const port = 25565;
  try {
    const address = encodeURIComponent(`${host}:${port}`);
    const response = await fetch(`https://api.mcstatus.io/v2/status/java/${address}?query=false&timeout=5`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7000)
    });
    const raw = await response.text();
    let data = {};
    try { data = JSON.parse(raw); } catch {}
    if (!response.ok) throw new Error(data.error || raw || `status API HTTP ${response.status}`);

    res.json({
      host,
      port,
      online: Boolean(data.online),
      version: data.version?.name_clean || data.version?.name_raw || null,
      protocol: data.version?.protocol || null,
      players: Number(data.players?.online ?? 0),
      maxPlayers: Number(data.players?.max ?? 0),
      motd: data.motd?.clean || '',
      gamemode: data.gamemode || 'Survival',
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Server status error:', error);
    res.status(502).json({
      host,
      port,
      online: false,
      unavailable: true,
      error: 'Не удалось проверить сервер',
      checkedAt: new Date().toISOString()
    });
  }
});

app.get('/api/health',(req,res)=>res.json({ok:true,project:'EPM',database:Boolean(pool)}));
app.get('/api/roles',(req,res)=>res.json({roles:ROLES,topicCreationFrom:'Хелпер'}));

app.post('/api/auth/register',async(req,res)=>{try{
  const nickname=String(req.body.nickname||'').trim(),password=String(req.body.password||'');
  if(!/^[A-Za-zА-Яа-яЁё0-9_]{3,24}$/.test(nickname))return res.status(400).json({error:'Ник: 3–24 символа, только буквы, цифры и _'});
  if(password.length<6)return res.status(400).json({error:'Пароль должен быть не короче 6 символов'});
  let existing=null;
  if(pool){const result=await pool.query('SELECT id FROM users WHERE LOWER(nickname)=LOWER($1)',[nickname]);existing=result.rows[0]||null;}else existing=read('users').find(u=>String(u.nickname).toLowerCase()===nickname.toLowerCase());
  if(existing)return res.status(409).json({error:'Такой ник уже зарегистрирован'});
  let id;if(pool){const result=await pool.query('SELECT COALESCE(MAX(id),0)+1 AS id FROM users');id=Number(result.rows[0].id);}else id=nextId(read('users'));
  const user={id,nickname,password:hash(password),role:'Пользователь',description:'Новый участник EPM',avatar:'',posts:0,topics:0,level:1,blocked:false,createdAt:new Date().toISOString()};
  await saveUser(user);res.status(201).json({token:makeToken(id),user:safeUser(user)});
}catch(error){console.error('Register error:',error);res.status(500).json({error:'Ошибка регистрации'});}});

app.post('/api/auth/login',async(req,res)=>{try{
  const nickname=String(req.body.nickname||'').trim(),password=hash(String(req.body.password||''));let user=null;
  if(pool){const result=await pool.query(`SELECT id,nickname,password,role,description,avatar,posts,topics,level,blocked,created_at AS "createdAt" FROM users WHERE LOWER(nickname)=LOWER($1)`,[nickname]);user=result.rows[0]||null;}else user=read('users').find(u=>String(u.nickname).toLowerCase()===nickname.toLowerCase());
  if(!user||user.password!==password)return res.status(401).json({error:'Неверный ник или пароль'});
  if(Boolean(user.blocked))return res.status(403).json({error:'Аккаунт заблокирован'});
  res.json({token:makeToken(user.id),user:safeUser(user)});
}catch(error){console.error('Login error:',error);res.status(500).json({error:'Ошибка входа'});}});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:safeUser(req.user)}));
app.post('/api/auth/logout',(req,res)=>res.json({ok:true}));

app.get('/api/profile/:id',async(req,res)=>{try{const profileId=Number(req.params.id);if(!Number.isSafeInteger(profileId)||profileId<1)return res.status(400).json({error:'Некорректный пользователь'});const user=await getUser(profileId);if(!user)return res.status(404).json({error:'Пользователь не найден'});res.json({user:safeUser(user)});}catch(error){console.error('Profile error:',error);res.status(500).json({error:'Ошибка загрузки профиля'});}});
app.patch('/api/profile',auth,async(req,res)=>{try{req.user.description=String(req.body.description??req.user.description??'').slice(0,500);req.user.avatar=String(req.body.avatar??req.user.avatar??'').slice(0,2000000);await saveUser(req.user);res.json({user:safeUser(req.user)});}catch(error){console.error('Profile update error:',error);res.status(500).json({error:'Не удалось сохранить профиль'});}});
app.patch('/api/profile/password',auth,async(req,res)=>{try{const currentPassword=String(req.body.currentPassword||''),newPassword=String(req.body.newPassword||''),confirmPassword=String(req.body.confirmPassword||'');if(!currentPassword)return res.status(400).json({error:'Введите текущий пароль'});if(newPassword.length<6)return res.status(400).json({error:'Новый пароль должен быть не короче 6 символов'});if(newPassword!==confirmPassword)return res.status(400).json({error:'Новые пароли не совпадают'});if(hash(currentPassword)!==req.user.password)return res.status(400).json({error:'Текущий пароль указан неверно'});if(hash(newPassword)===req.user.password)return res.status(400).json({error:'Новый пароль должен отличаться от текущего'});req.user.password=hash(newPassword);await saveUser(req.user);res.json({ok:true});}catch(error){console.error('Password update error:',error);res.status(500).json({error:'Не удалось изменить пароль'});}});

app.get('/api/admin/users',auth,async(req,res)=>{
  if(!isCreator(req.user))return res.status(403).json({error:'Доступ только для Создателя'});
  try{const users=pool?(await pool.query(`SELECT id,nickname,role,description,posts,topics,avatar,blocked,created_at AS "createdAt" FROM users ORDER BY id`)).rows:read('users').map(u=>({id:u.id,nickname:u.nickname,role:u.role||'Пользователь',description:u.description||'',posts:u.posts||0,topics:u.topics||0,avatar:u.avatar||'',blocked:Boolean(u.blocked),createdAt:u.createdAt||null}));res.json({users});}
  catch(error){console.error('Admin users error:',error);res.status(500).json({error:'Ошибка загрузки пользователей'});}
});

app.patch('/api/admin/users/:id/role',auth,async(req,res)=>{
  if(!isCreator(req.user))return res.status(403).json({error:'Доступ только для Создателя'});
  const userId=Number(req.params.id);
  if(!Number.isSafeInteger(userId)||userId<1)return res.status(400).json({error:'Некорректный пользователь'});
  const role=String(req.body?.role||'').trim();
  if(!ROLES.includes(role))return res.status(400).json({error:'Неизвестная роль'});
  if(userId===Number(req.user.id)&&role!=='Создатель')return res.status(403).json({error:'Нельзя снять роль Создателя с собственного аккаунта'});
  try{
    const user=await getUser(userId);
    if(!user)return res.status(404).json({error:'Пользователь не найден'});
    if(user.role==='Создатель'&&role!=='Создатель')return res.status(403).json({error:'Нельзя снять роль с Создателя'});
    user.role=role;await saveUser(user);res.json({user:safeUser(user)});
  }catch(error){console.error('Admin role error:',error);res.status(500).json({error:'Не удалось изменить роль'});}
});

app.patch('/api/admin/users/:id/status',auth,async(req,res)=>{
  if(!isCreator(req.user))return res.status(403).json({error:'Доступ только для Создателя'});
  const userId=Number(req.params.id);
  if(!Number.isSafeInteger(userId)||userId<1)return res.status(400).json({error:'Некорректный пользователь'});
  if(userId===Number(req.user.id))return res.status(400).json({error:'Нельзя заблокировать собственный аккаунт'});
  if(typeof req.body.blocked!=='boolean')return res.status(400).json({error:'Статус блокировки должен быть true или false'});
  try{const user=await getUser(userId);if(!user)return res.status(404).json({error:'Пользователь не найден'});if(user.role==='Создатель')return res.status(403).json({error:'Аккаунт Создателя нельзя заблокировать'});user.blocked=req.body.blocked;await saveUser(user);res.json({user:safeUser(user)});}catch(error){console.error('Admin status error:',error);res.status(500).json({error:'Не удалось изменить статус пользователя'});}
});
app.get('/api/topics',async(req,res)=>{try{const topics=pool?(await pool.query(`SELECT id,title,content,author,author_id AS "authorId",category,pinned,closed,views,replies_count AS "repliesCount",created_at AS "createdAt",updated_at AS "updatedAt" FROM topics ORDER BY pinned DESC,updated_at DESC`)).rows:read('topics').sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));res.json(topics);}catch(error){console.error('Topics load error:',error);res.status(500).json({error:'Ошибка загрузки форума'});}});
app.get('/api/topics/:id',async(req,res)=>{try{let topic;if(pool)topic=(await pool.query(`SELECT id,title,content,author,author_id AS "authorId",category,pinned,closed,views,replies_count AS "repliesCount",created_at AS "createdAt",updated_at AS "updatedAt" FROM topics WHERE id=$1`,[req.params.id])).rows[0];else topic=read('topics').find(i=>String(i.id)===String(req.params.id));if(!topic)return res.status(404).json({error:'Тема не найдена'});let replies;if(pool)replies=(await pool.query(`SELECT id,topic_id AS "topicId",content,author,author_id AS "authorId",created_at AS "createdAt" FROM replies WHERE topic_id=$1 ORDER BY id`,[topic.id])).rows;else replies=read('replies').filter(i=>String(i.topicId)===String(topic.id));topic.authorProfile=publicAuthor(await getUser(Number(topic.authorId)));replies=await Promise.all(replies.map(async r=>({...r,authorProfile:publicAuthor(await getUser(Number(r.authorId)))})));if(pool){await pool.query('UPDATE topics SET views=views+1 WHERE id=$1',[topic.id]);topic.views=Number(topic.views||0)+1;}res.json({...topic,replies});}catch(error){console.error('Topic load error:',error);res.status(500).json({error:'Ошибка загрузки темы'});}});

app.post('/api/topics',auth,async(req,res)=>{if(!canCreateTopic(req.user))return res.status(403).json({error:'Создавать темы могут только Хелпер и выше'});const title=String(req.body.title||'').trim(),content=String(req.body.content||'').trim(),category=String(req.body.category||'Общение').trim()||'Общение';if(!title||!content)return res.status(400).json({error:'Заполни заголовок и текст темы'});try{const now=new Date().toISOString();if(pool){const result=await pool.query(`INSERT INTO topics(title,content,author,author_id,category,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id,title,content,author,author_id AS "authorId",category,pinned,closed,views,replies_count AS "repliesCount",created_at AS "createdAt",updated_at AS "updatedAt"`,[title,content,req.user.nickname,req.user.id,category,now]);await pool.query('UPDATE users SET topics=topics+1 WHERE id=$1',[req.user.id]);return res.status(201).json(result.rows[0]);}const topics=read('topics'),topic={id:nextId(topics),title,content,author:req.user.nickname,authorId:req.user.id,category,pinned:false,closed:false,views:0,repliesCount:0,createdAt:now,updatedAt:now};topics.push(topic);write('topics',topics);const users=read('users'),user=users.find(i=>Number(i.id)===Number(req.user.id));if(user){user.topics=(user.topics||0)+1;write('users',users);}res.status(201).json(topic);}catch(error){console.error('Topic create error:',error);res.status(500).json({error:'Не удалось создать тему'});}});

app.post('/api/topics/:id/replies',auth,async(req,res)=>{const content=String(req.body.content||'').trim();if(!content)return res.status(400).json({error:'Напиши текст ответа'});try{if(pool){const topic=(await pool.query('SELECT * FROM topics WHERE id=$1',[req.params.id])).rows[0];if(!topic)return res.status(404).json({error:'Тема не найдена'});if(topic.closed)return res.status(403).json({error:'Тема закрыта'});const now=new Date().toISOString();const reply=(await pool.query(`INSERT INTO replies(topic_id,content,author,author_id,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id,topic_id AS "topicId",content,author,author_id AS "authorId",created_at AS "createdAt"`,[topic.id,content,req.user.nickname,req.user.id,now])).rows[0];await pool.query(`UPDATE topics SET replies_count=replies_count+1,updated_at=$2 WHERE id=$1`,[topic.id,now]);await pool.query('UPDATE users SET posts=posts+1 WHERE id=$1',[req.user.id]);return res.status(201).json({...reply,authorProfile:publicAuthor(req.user)});}const topics=read('topics'),topic=topics.find(i=>String(i.id)===String(req.params.id));if(!topic)return res.status(404).json({error:'Тема не найдена'});if(topic.closed)return res.status(403).json({error:'Тема закрыта'});const replies=read('replies'),now=new Date().toISOString(),reply={id:nextId(replies),topicId:Number(topic.id),content,author:req.user.nickname,authorId:req.user.id,createdAt:now};replies.push(reply);topic.repliesCount=(topic.repliesCount||0)+1;topic.updatedAt=now;write('replies',replies);write('topics',topics);const users=read('users'),user=users.find(i=>Number(i.id)===Number(req.user.id));if(user){user.posts=(user.posts||0)+1;write('users',users);}res.status(201).json({...reply,authorProfile:publicAuthor(req.user)});}catch(error){console.error('Reply create error:',error);res.status(500).json({error:'Не удалось отправить ответ'});}});

app.post('/api/topics/:id/pin',auth,async(req,res)=>{if(!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав'});try{if(pool){const result=await pool.query('UPDATE topics SET pinned=NOT pinned,updated_at=$2 WHERE id=$1 RETURNING pinned',[req.params.id,new Date().toISOString()]);if(!result.rows[0])return res.status(404).json({error:'Тема не найдена'});return res.json({ok:true,pinned:result.rows[0].pinned});}const topics=read('topics'),topic=topics.find(i=>String(i.id)===String(req.params.id));if(!topic)return res.status(404).json({error:'Тема не найдена'});topic.pinned=!topic.pinned;topic.updatedAt=new Date().toISOString();write('topics',topics);res.json({ok:true,pinned:topic.pinned});}catch(error){console.error('Topic pin error:',error);res.status(500).json({error:'Не удалось изменить закрепление'});}});
app.post('/api/topics/:id/close',auth,async(req,res)=>{if(!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав'});try{const now=new Date().toISOString();if(pool){const result=await pool.query('UPDATE topics SET closed=true,updated_at=$2 WHERE id=$1 RETURNING closed',[req.params.id,now]);if(!result.rows[0])return res.status(404).json({error:'Тема не найдена'});return res.json({ok:true,closed:true});}const topics=read('topics'),topic=topics.find(i=>String(i.id)===String(req.params.id));if(!topic)return res.status(404).json({error:'Тема не найдена'});topic.closed=true;topic.updatedAt=now;write('topics',topics);res.json({ok:true,closed:true});}catch(error){console.error('Topic close error:',error);res.status(500).json({error:'Не удалось закрыть тему'});}});
app.post('/api/topics/:id/open',auth,async(req,res)=>{if(!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав'});try{const now=new Date().toISOString();if(pool){const result=await pool.query('UPDATE topics SET closed=false,updated_at=$2 WHERE id=$1 RETURNING closed',[req.params.id,now]);if(!result.rows[0])return res.status(404).json({error:'Тема не найдена'});return res.json({ok:true,closed:false});}const topics=read('topics'),topic=topics.find(i=>String(i.id)===String(req.params.id));if(!topic)return res.status(404).json({error:'Тема не найдена'});topic.closed=false;topic.updatedAt=now;write('topics',topics);res.json({ok:true,closed:false});}catch(error){console.error('Topic open error:',error);res.status(500).json({error:'Не удалось открыть тему'});}});
app.delete('/api/topics/:id',auth,async(req,res)=>{if(!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав для удаления темы'});try{const topicId=req.params.id;if(pool){const client=await pool.connect();try{await client.query('BEGIN');const topic=(await client.query('SELECT id,author_id AS "authorId" FROM topics WHERE id=$1 FOR UPDATE',[topicId])).rows[0];if(!topic){await client.query('ROLLBACK');return res.status(404).json({error:'Тема не найдена'});}const replyAuthors=await client.query('SELECT author_id AS "authorId" FROM replies WHERE topic_id=$1',[topic.id]);await client.query('DELETE FROM replies WHERE topic_id=$1',[topic.id]);await client.query('DELETE FROM topics WHERE id=$1',[topic.id]);if(topic.authorId)await client.query('UPDATE users SET topics=GREATEST(topics-1,0) WHERE id=$1',[topic.authorId]);for(const row of replyAuthors.rows){if(row.authorId)await client.query('UPDATE users SET posts=GREATEST(posts-1,0) WHERE id=$1',[row.authorId]);}await client.query('COMMIT');return res.json({ok:true,deletedTopicId:topic.id,deletedReplies:replyAuthors.rowCount});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}const topics=read('topics'),topic=topics.find(i=>String(i.id)===String(topicId));if(!topic)return res.status(404).json({error:'Тема не найдена'});const replies=read('replies'),removedReplies=replies.filter(i=>String(i.topicId)===String(topic.id));write('topics',topics.filter(i=>String(i.id)!==String(topic.id)));write('replies',replies.filter(i=>String(i.topicId)!==String(topic.id)));const users=read('users'),author=users.find(i=>Number(i.id)===Number(topic.authorId));if(author)author.topics=Math.max(0,(author.topics||0)-1);for(const reply of removedReplies){const u=users.find(i=>Number(i.id)===Number(reply.authorId));if(u)u.posts=Math.max(0,(u.posts||0)-1);}write('users',users);res.json({ok:true,deletedTopicId:topic.id,deletedReplies:removedReplies.length});}catch(error){console.error('Topic delete error:',error);res.status(500).json({error:'Не удалось удалить тему'});}});

app.get('/api/profile/:id/messages',async(req,res)=>{try{const profileUserId=Number(req.params.id);if(!Number.isInteger(profileUserId))return res.status(400).json({error:'Некорректный пользователь'});if(pool){const result=await pool.query(`SELECT id,profile_user_id AS "profileUserId",author_id AS "authorId",author,content,created_at AS "createdAt" FROM profile_messages WHERE profile_user_id=$1 ORDER BY id DESC`,[profileUserId]);return res.json({messages:result.rows});}const file=path.join(DATA_DIR,'profile_messages.json');if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');const messages=JSON.parse(fs.readFileSync(file,'utf8')).filter(i=>Number(i.profileUserId)===profileUserId).sort((a,b)=>Number(b.id)-Number(a.id));res.json({messages});}catch(error){console.error('Profile messages load error:',error);res.status(500).json({error:'Ошибка загрузки сообщений'});}});
app.post('/api/profile/:id/messages',auth,async(req,res)=>{const profileUserId=Number(req.params.id),content=String(req.body.content||'').trim();if(!Number.isInteger(profileUserId))return res.status(400).json({error:'Некорректный пользователь'});if(!content||content.length>1000)return res.status(400).json({error:'Сообщение должно содержать от 1 до 1000 символов'});try{const profile=await getUser(profileUserId);if(!profile)return res.status(404).json({error:'Пользователь не найден'});const now=new Date().toISOString();if(pool){const result=await pool.query(`INSERT INTO profile_messages(profile_user_id,author_id,author,content,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id,profile_user_id AS "profileUserId",author_id AS "authorId",author,content,created_at AS "createdAt"`,[profileUserId,req.user.id,req.user.nickname,content,now]);return res.status(201).json({message:result.rows[0]});}const file=path.join(DATA_DIR,'profile_messages.json');if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');const messages=JSON.parse(fs.readFileSync(file,'utf8')),message={id:nextId(messages),profileUserId,authorId:req.user.id,author:req.user.nickname,content,createdAt:now};messages.push(message);fs.writeFileSync(file,JSON.stringify(messages,null,2),'utf8');res.status(201).json({message});}catch(error){console.error('Profile message create error:',error);res.status(500).json({error:'Не удалось отправить сообщение'});}});

app.get('/api/news',(req,res)=>{const newsFile=path.join(DATA_DIR,'news.json');if(!fs.existsSync(newsFile))fs.writeFileSync(newsFile,'[]','utf8');res.json(readJsonFile(newsFile));});
function readJsonFile(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return [];}}

app.use(express.static(__dirname));
app.use((err,req,res,next)=>{console.error('EPM API error:',err);if(res.headersSent)return next(err);res.status(500).json({error:'Внутренняя ошибка сервера'});});

(async()=>{try{await initDatabase();app.listen(PORT,()=>console.log(`EPM server started on port ${PORT}`));}catch(error){console.error('Database initialization error:',error);process.exit(1);}})();