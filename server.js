const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool, initDatabase } = require('./database');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUNISHMENT_API_KEYS = Object.freeze({
  'Estamon Grief': process.env.EPM_GRIEF_API_KEY || '',
  'Estamon Creative': process.env.EPM_CREATIVE_API_KEY || '',
  'Estamon Survial': process.env.EPM_SURVIVAL_API_KEY || '',
  'Blood Shed World': process.env.EPM_BLOOD_API_KEY || ''
});
const PUNISHMENT_MODES = Object.freeze(['Estamon Grief','Estamon Creative','Estamon Survial','Blood Shed World']);
function punishmentApiKeyValid(mode, key) {
  const expected = PUNISHMENT_API_KEYS[mode];
  if (!expected || !key) return false;
  const a=Buffer.from(String(key)); const b=Buffer.from(String(expected));
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

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

const AUTH_SECRET = process.env.EPM_AUTH_SECRET || crypto.createHash('sha256').update(process.env.DATABASE_URL || 'EPM-PERSISTENT-AUTH-SECRET').digest('hex');
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
const ROLE_PERMISSIONS = Object.freeze({
  createTopicsFrom: 'Хелпер',
  moderateTopicsFrom: 'Модератор',
  adminFrom: 'Мл.Хелпер',
  creatorRole: 'Создатель'
});
const roleLevel = (user) => ROLE_LEVEL[user?.role] ?? 0;
const hasRoleLevel = (user, role) => roleLevel(user) >= ROLE_LEVEL[role];
const canCreateTopic = (user) => hasRoleLevel(user, ROLE_PERMISSIONS.createTopicsFrom);
const isStaff = (user) => hasRoleLevel(user, ROLE_PERMISSIONS.moderateTopicsFrom);
const canAccessAdmin = (user) => hasRoleLevel(user, ROLE_PERMISSIONS.adminFrom);
const isCreator = (user) => user?.role === ROLE_PERMISSIONS.creatorRole;

async function getUser(id) {
  if (pool) {
    const result = await pool.query(`SELECT id,nickname,password,role,description,avatar,posts,topics,level,experience,blocked,created_at AS "createdAt" FROM users WHERE id=$1`, [id]);
    if (result.rows[0]) return result.rows[0];
  }
  return read('users').find((user) => Number(user.id) === Number(id)) || null;
}
async function saveUser(user) {
  if (pool) {
    await pool.query(`INSERT INTO users (id,nickname,password,role,description,avatar,posts,topics,level,experience,blocked,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET nickname=EXCLUDED.nickname,password=EXCLUDED.password,role=EXCLUDED.role,description=EXCLUDED.description,avatar=EXCLUDED.avatar,posts=EXCLUDED.posts,topics=EXCLUDED.topics,level=EXCLUDED.level,experience=EXCLUDED.experience,blocked=EXCLUDED.blocked,created_at=EXCLUDED.created_at`, [user.id,user.nickname,user.password,user.role||'Пользователь',user.description||'',user.avatar||'',user.posts||0,user.topics||0,user.level||1,user.experience||0,Boolean(user.blocked),user.createdAt||new Date()]);
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

app.get('/api/users/search',async(req,res)=>{
  try{
    const q=String(req.query.q||'').trim().slice(0,24);
    if(q.length<2)return res.json({users:[]});
    if(pool){
      const result=await pool.query(`SELECT id,nickname,role,avatar FROM users WHERE blocked=FALSE AND nickname ILIKE $1 ORDER BY CASE WHEN LOWER(nickname)=LOWER($2) THEN 0 ELSE 1 END,nickname LIMIT 20`,[`%${q}%`,q]);
      return res.json({users:result.rows});
    }
    const users=read('users').filter(u=>!u.blocked&&String(u.nickname||'').toLowerCase().includes(q.toLowerCase())).slice(0,20).map(u=>({id:u.id,nickname:u.nickname,role:u.role||'Пользователь',avatar:u.avatar||''}));
    res.json({users});
  }catch(error){console.error('User search error:',error);res.status(500).json({error:'Ошибка поиска пользователей'});}
});

app.post('/api/presence/heartbeat',auth,async(req,res)=>{
  try{
    if(pool) await pool.query(`INSERT INTO online_sessions(user_id,last_seen) VALUES($1,NOW()) ON CONFLICT(user_id) DO UPDATE SET last_seen=EXCLUDED.last_seen`,[req.user.id]);
    else{
      global.__epmOnline=global.__epmOnline||new Map();
      global.__epmOnline.set(Number(req.user.id),Date.now());
    }
    res.json({ok:true});
  }catch(error){console.error('Presence heartbeat error:',error);res.status(500).json({error:'Не удалось обновить статус онлайн'});}
});



app.get('/api/server-status', async (req, res) => {
  const host = 'EstamonHost.ru';
  const port = 25565;
  try {
    const address = encodeURIComponent(`${host}:${port}`);
    const [javaResponse, bedrockResponse] = await Promise.all([
      fetch(`https://api.mcstatus.io/v2/status/java/${address}?query=false&timeout=5`, {headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)}),
      fetch(`https://api.mcstatus.io/v2/status/bedrock/${address}?query=false&timeout=5`, {headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)})
    ]);
    const javaRaw=await javaResponse.text(), bedrockRaw=await bedrockResponse.text();
    let java={},bedrock={}; try{java=JSON.parse(javaRaw)}catch{} try{bedrock=JSON.parse(bedrockRaw)}catch{}
    if(!javaResponse.ok && !bedrockResponse.ok) throw new Error('Сервер недоступен');
    res.json({
      host,port,
      online:Boolean(java.online||bedrock.online),
      java:{online:Boolean(java.online),version:java.version?.name_clean||java.version?.name_raw||null,protocol:java.version?.protocol||null,players:Number(java.players?.online??0),maxPlayers:Number(java.players?.max??0)},
      bedrock:{online:Boolean(bedrock.online),version:bedrock.version?.name_clean||bedrock.version?.name_raw||null,players:Number(bedrock.players?.online??0),maxPlayers:Number(bedrock.players?.max??0)},
      version:java.version?.name_clean||java.version?.name_raw||bedrock.version?.name_clean||bedrock.version?.name_raw||null,
      protocol:java.version?.protocol||bedrock.version?.protocol||null,
      players:Number(java.players?.online??bedrock.players?.online??0),
      maxPlayers:Number(java.players?.max??bedrock.players?.max??0),
      motd:java.motd?.clean||bedrock.motd?.clean||'',
      gamemode:java.gamemode||bedrock.gamemode||'Survival',
      checkedAt:new Date().toISOString()
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

async function createNotification({recipientId,actorId,type='system',title,body='',url=''}) {
  if(!recipientId || Number(recipientId)===Number(actorId)) return;
  try{
    if(pool){await pool.query(`INSERT INTO notifications(recipient_id,actor_id,type,title,body,url) VALUES($1,$2,$3,$4,$5,$6)`,[recipientId,actorId||null,type,String(title||'EPM').slice(0,160),String(body||'').slice(0,500),String(url||'').slice(0,300)]);return;}
    global.__epmNotifications=global.__epmNotifications||[];
    global.__epmNotifications.unshift({id:Date.now()+Math.random(),recipientId:Number(recipientId),actorId:actorId?Number(actorId):null,type,title,body,url,isRead:false,createdAt:new Date().toISOString()});
    global.__epmNotifications=global.__epmNotifications.slice(0,1000);
  }catch(error){console.error('Notification create error:',error);}
}
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
  const user={id,nickname,password:hash(password),role:'Пользователь',description:'Новый участник EPM',avatar:'',posts:0,topics:0,level:1,experience:0,blocked:false,createdAt:new Date().toISOString()};
  await saveUser(user);res.status(201).json({token:makeToken(id),user:safeUser(user)});
}catch(error){console.error('Register error:',error);res.status(500).json({error:'Ошибка регистрации'});}});

app.post('/api/auth/login',async(req,res)=>{try{
  const nickname=String(req.body.nickname||'').trim(),password=hash(String(req.body.password||''));let user=null;
  if(pool){const result=await pool.query(`SELECT id,nickname,password,role,description,avatar,posts,topics,level,experience,blocked,created_at AS "createdAt" FROM users WHERE LOWER(nickname)=LOWER($1)`,[nickname]);user=result.rows[0]||null;}else user=read('users').find(u=>String(u.nickname).toLowerCase()===nickname.toLowerCase());
  if(!user||user.password!==password)return res.status(401).json({error:'Неверный ник или пароль'});
  if(Boolean(user.blocked))return res.status(403).json({error:'Аккаунт заблокирован'});
  await saveUser(user);
  res.json({token:makeToken(user.id),user:safeUser(user)});
}catch(error){console.error('Login error:',error);res.status(500).json({error:'Ошибка входа'});}});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:safeUser(req.user)}));
app.post('/api/auth/logout',(req,res)=>res.json({ok:true}));

app.get('/api/notifications',auth,async(req,res)=>{
  try{
    if(pool){
      const result=await pool.query(`SELECT n.id,n.type,n.title,n.body,n.url,n.is_read AS "isRead",n.created_at AS "createdAt",u.id AS "actorId",u.nickname AS "actorNickname",u.avatar AS "actorAvatar" FROM notifications n LEFT JOIN users u ON u.id=n.actor_id WHERE n.recipient_id=$1 ORDER BY n.created_at DESC,n.id DESC LIMIT 50`,[req.user.id]);
      const unread=await pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE recipient_id=$1 AND is_read=FALSE',[req.user.id]);
      return res.json({notifications:result.rows,unread:Number(unread.rows[0]?.count||0)});
    }
    const rows=(global.__epmNotifications||[]).filter(n=>Number(n.recipientId)===Number(req.user.id)).slice(0,50);
    res.json({notifications:rows,unread:rows.filter(n=>!n.isRead).length});
  }catch(error){console.error('Notifications load error:',error);res.status(500).json({error:'Не удалось загрузить уведомления'});}
});
app.post('/api/notifications/read',auth,async(req,res)=>{
  try{if(pool)await pool.query('UPDATE notifications SET is_read=TRUE WHERE recipient_id=$1',[req.user.id]);else(global.__epmNotifications||[]).forEach(n=>{if(Number(n.recipientId)===Number(req.user.id))n.isRead=true});res.json({ok:true});
  }catch(error){res.status(500).json({error:'Не удалось отметить уведомления'});}
});
app.get('/api/profile/:id',async(req,res)=>{try{const profileId=Number(req.params.id);if(!Number.isSafeInteger(profileId)||profileId<1)return res.status(400).json({error:'Некорректный пользователь'});const user=await getUser(profileId);if(!user)return res.status(404).json({error:'Пользователь не найден'});res.json({user:safeUser(user)});}catch(error){console.error('Profile error:',error);res.status(500).json({error:'Ошибка загрузки профиля'});}});
app.patch('/api/profile',auth,async(req,res)=>{try{req.user.description=String(req.body.description??req.user.description??'').slice(0,500);req.user.avatar=String(req.body.avatar??req.user.avatar??'').slice(0,2000000);await saveUser(req.user);res.json({user:safeUser(req.user)});}catch(error){console.error('Profile update error:',error);res.status(500).json({error:'Не удалось сохранить профиль'});}});
app.patch('/api/profile/password',auth,async(req,res)=>{try{const currentPassword=String(req.body.currentPassword||''),newPassword=String(req.body.newPassword||''),confirmPassword=String(req.body.confirmPassword||'');if(!currentPassword)return res.status(400).json({error:'Введите текущий пароль'});if(newPassword.length<6)return res.status(400).json({error:'Новый пароль должен быть не короче 6 символов'});if(newPassword!==confirmPassword)return res.status(400).json({error:'Новые пароли не совпадают'});if(hash(currentPassword)!==req.user.password)return res.status(400).json({error:'Текущий пароль указан неверно'});if(hash(newPassword)===req.user.password)return res.status(400).json({error:'Новый пароль должен отличаться от текущего'});req.user.password=hash(newPassword);await saveUser(req.user);res.json({ok:true});}catch(error){console.error('Password update error:',error);res.status(500).json({error:'Не удалось изменить пароль'});}});

app.get('/api/admin/users',auth,async(req,res)=>{
  if(!canAccessAdmin(req.user))return res.status(403).json({error:'Доступ только для Мл.Хелпера и выше'});
  try{const users=pool?(await pool.query(`SELECT id,nickname,role,description,posts,topics,avatar,blocked,created_at AS "createdAt" FROM users ORDER BY id`)).rows:read('users').map(u=>({id:u.id,nickname:u.nickname,role:u.role||'Пользователь',description:u.description||'',posts:u.posts||0,topics:u.topics||0,avatar:u.avatar||'',blocked:Boolean(u.blocked),createdAt:u.createdAt||null}));res.json({users});}
  catch(error){console.error('Admin users error:',error);res.status(500).json({error:'Ошибка загрузки пользователей'});}
});

app.get('/api/admin/online',auth,async(req,res)=>{
  if(!canAccessAdmin(req.user))return res.status(403).json({error:'Доступ только для Мл.Хелпера и выше'});
  try{
    if(pool){
      const result=await pool.query(`SELECT u.id,u.nickname,u.role,u.avatar,s.last_seen AS "lastSeen"
        FROM online_sessions s JOIN users u ON u.id=s.user_id
        WHERE u.blocked=FALSE AND s.last_seen > NOW()-INTERVAL '90 seconds'
        ORDER BY s.last_seen DESC`);
      return res.json({users:result.rows,checkedAt:new Date().toISOString()});
    }
    const now=Date.now(), online=global.__epmOnline||new Map();
    const users=read('users').filter(u=>!u.blocked&&(now-(online.get(Number(u.id))||0))<90000).map(u=>({id:u.id,nickname:u.nickname,role:u.role||'Пользователь',avatar:u.avatar||'',lastSeen:new Date(online.get(Number(u.id))).toISOString()}));
    res.json({users,checkedAt:new Date().toISOString()});
  }catch(error){console.error('Admin online error:',error);res.status(500).json({error:'Ошибка загрузки списка онлайн'});}
});

app.patch('/api/admin/users/:id/status',auth,async(req,res)=>{
  if(!canAccessAdmin(req.user))return res.status(403).json({error:'Доступ только для Мл.Хелпера и выше'});
  const userId=Number(req.params.id);
  if(!Number.isSafeInteger(userId)||userId<1)return res.status(400).json({error:'Некорректный пользователь'});
  if(userId===Number(req.user.id))return res.status(400).json({error:'Нельзя заблокировать собственный аккаунт'});
  if(typeof req.body.blocked!=='boolean')return res.status(400).json({error:'Статус блокировки должен быть true или false'});
  try{const user=await getUser(userId);if(!user)return res.status(404).json({error:'Пользователь не найден'});if(user.role==='Создатель')return res.status(403).json({error:'Аккаунт Создателя нельзя заблокировать'});user.blocked=req.body.blocked;await saveUser(user);res.json({user:safeUser(user)});}catch(error){console.error('Admin status error:',error);res.status(500).json({error:'Не удалось изменить статус пользователя'});}
});
app.patch('/api/admin/users/:id/role',auth,async(req,res)=>{
  if(!isCreator(req.user))return res.status(403).json({error:'Изменять роли может только Создатель'});
  const userId=Number(req.params.id);
  const role=String(req.body.role||'').trim();
  if(!Number.isSafeInteger(userId)||userId<1)return res.status(400).json({error:'Некорректный пользователь'});
  if(!ROLES.includes(role))return res.status(400).json({error:'Недопустимая роль'});
  if(userId===Number(req.user.id))return res.status(400).json({error:'Нельзя изменить собственную роль'});
  try{
    const user=await getUser(userId);
    if(!user)return res.status(404).json({error:'Пользователь не найден'});
    user.role=role;
    await saveUser(user);
    res.json({user:safeUser(user)});
  }catch(error){console.error('Admin role error:',error);res.status(500).json({error:'Не удалось изменить роль пользователя'});}
});

app.get('/api/topics',async(req,res)=>{try{const topics=pool?(await pool.query(`SELECT id,title,content,author,author_id AS "authorId",category,pinned,closed,views,replies_count AS "repliesCount",created_at AS "createdAt",updated_at AS "updatedAt" FROM topics ORDER BY pinned DESC,updated_at DESC`)).rows:read('topics').sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));res.json(topics);}catch(error){console.error('Topics load error:',error);res.status(500).json({error:'Ошибка загрузки форума'});}});
app.get('/api/topics/:id',async(req,res)=>{try{let topic;if(pool)topic=(await pool.query(`SELECT id,title,content,author,author_id AS "authorId",category,pinned,closed,views,replies_count AS "repliesCount",created_at AS "createdAt",updated_at AS "updatedAt" FROM topics WHERE id=$1`,[req.params.id])).rows[0];else topic=read('topics').find(i=>String(i.id)===String(req.params.id));if(!topic)return res.status(404).json({error:'Тема не найдена'});let replies;if(pool)replies=(await pool.query(`SELECT id,topic_id AS "topicId",content,author,author_id AS "authorId",created_at AS "createdAt" FROM replies WHERE topic_id=$1 ORDER BY id`,[topic.id])).rows;else replies=read('replies').filter(i=>String(i.topicId)===String(topic.id));topic.authorProfile=publicAuthor(await getUser(Number(topic.authorId)));replies=await Promise.all(replies.map(async r=>({...r,authorProfile:publicAuthor(await getUser(Number(r.authorId)))})));if(pool){await pool.query('UPDATE topics SET views=views+1 WHERE id=$1',[topic.id]);topic.views=Number(topic.views||0)+1;}res.json({...topic,replies});}catch(error){console.error('Topic load error:',error);res.status(500).json({error:'Ошибка загрузки темы'});}});

app.post('/api/topics',auth,async(req,res)=>{if(!canCreateTopic(req.user))return res.status(403).json({error:'Создавать темы могут только Хелпер и выше'});const title=String(req.body.title||'').trim(),content=String(req.body.content||'').trim(),category=String(req.body.category||'Общение').trim()||'Общение';if(!title||!content)return res.status(400).json({error:'Заполни заголовок и текст темы'});try{const now=new Date().toISOString();if(pool){const result=await pool.query(`INSERT INTO topics(title,content,author,author_id,category,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id,title,content,author,author_id AS "authorId",category,pinned,closed,views,replies_count AS "repliesCount",created_at AS "createdAt",updated_at AS "updatedAt"`,[title,content,req.user.nickname,req.user.id,category,now]);await pool.query('UPDATE users SET topics=topics+1 WHERE id=$1',[req.user.id]);return res.status(201).json(result.rows[0]);}const topics=read('topics'),topic={id:nextId(topics),title,content,author:req.user.nickname,authorId:req.user.id,category,pinned:false,closed:false,views:0,repliesCount:0,createdAt:now,updatedAt:now};topics.push(topic);write('topics',topics);const users=read('users'),user=users.find(i=>Number(i.id)===Number(req.user.id));if(user){user.topics=(user.topics||0)+1;write('users',users);}res.status(201).json(topic);}catch(error){console.error('Topic create error:',error);res.status(500).json({error:'Не удалось создать тему'});}});

app.post('/api/topics/:id/replies',auth,async(req,res)=>{const content=String(req.body.content||'').trim();if(!content)return res.status(400).json({error:'Напиши текст ответа'});try{if(pool){const topic=(await pool.query('SELECT * FROM topics WHERE id=$1',[req.params.id])).rows[0];if(!topic)return res.status(404).json({error:'Тема не найдена'});if(topic.closed)return res.status(403).json({error:'Тема закрыта'});const now=new Date().toISOString();const reply=(await pool.query(`INSERT INTO replies(topic_id,content,author,author_id,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id,topic_id AS "topicId",content,author,author_id AS "authorId",created_at AS "createdAt"`,[topic.id,content,req.user.nickname,req.user.id,now])).rows[0];
      await createNotification({recipientId:topic.author_id,actorId:req.user.id,type:'topic_reply',title:'Новый ответ в вашей теме',body:req.user.nickname+' ответил(а) в теме «'+String(topic.title||'').slice(0,120)+'».',url:'topic.html?id='+topic.id});await pool.query(`UPDATE topics SET replies_count=replies_count+1,updated_at=$2 WHERE id=$1`,[topic.id,now]);await pool.query('UPDATE users SET posts=posts+1 WHERE id=$1',[req.user.id]);return res.status(201).json({...reply,authorProfile:publicAuthor(req.user)});}const topics=read('topics'),topic=topics.find(i=>String(i.id)===String(req.params.id));if(!topic)return res.status(404).json({error:'Тема не найдена'});if(topic.closed)return res.status(403).json({error:'Тема закрыта'});const replies=read('replies'),now=new Date().toISOString(),reply={id:nextId(replies),topicId:Number(topic.id),content,author:req.user.nickname,authorId:req.user.id,createdAt:now};replies.push(reply);topic.repliesCount=(topic.repliesCount||0)+1;topic.updatedAt=now;write('replies',replies);write('topics',topics);await createNotification({recipientId:topic.authorId,actorId:req.user.id,type:'topic_reply',title:'Новый ответ в вашей теме',body:req.user.nickname+' ответил(а) в теме «'+String(topic.title||'').slice(0,120)+'».',url:'topic.html?id='+topic.id});const users=read('users'),user=users.find(i=>Number(i.id)===Number(req.user.id));if(user){user.posts=(user.posts||0)+1;write('users',users);}res.status(201).json({...reply,authorProfile:publicAuthor(req.user)});}catch(error){console.error('Reply create error:',error);res.status(500).json({error:'Не удалось отправить ответ'});}});

app.patch('/api/topics/:topicId/replies/:replyId',auth,async(req,res)=>{
  const content=String(req.body.content||'').trim();if(!content||content.length>5000)return res.status(400).json({error:'Ответ должен содержать от 1 до 5000 символов'});
  try{
    if(pool){const row=(await pool.query('SELECT id,author_id AS "authorId" FROM replies WHERE id=$1 AND topic_id=$2',[req.params.replyId,req.params.topicId])).rows[0];if(!row)return res.status(404).json({error:'Ответ не найден'});if(Number(row.authorId)!==Number(req.user.id)&&!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав'});const result=await pool.query('UPDATE replies SET content=$1 WHERE id=$2 RETURNING id,topic_id AS "topicId",content,author,author_id AS "authorId",created_at AS "createdAt"',[content,row.id]);return res.json({reply:result.rows[0]});}
    const rows=read('replies'),row=rows.find(r=>Number(r.id)===Number(req.params.replyId)&&Number(r.topicId)===Number(req.params.topicId));if(!row)return res.status(404).json({error:'Ответ не найден'});if(Number(row.authorId)!==Number(req.user.id)&&!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав'});row.content=content;write('replies',rows);res.json({reply:row});
  }catch(error){console.error('Reply edit error:',error);res.status(500).json({error:'Не удалось изменить ответ'});}
});
app.delete('/api/topics/:topicId/replies/:replyId',auth,async(req,res)=>{
  try{
    if(pool){const row=(await pool.query('SELECT id,author_id AS "authorId" FROM replies WHERE id=$1 AND topic_id=$2',[req.params.replyId,req.params.topicId])).rows[0];if(!row)return res.status(404).json({error:'Ответ не найден'});if(Number(row.authorId)!==Number(req.user.id)&&!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав'});await pool.query('DELETE FROM replies WHERE id=$1',[row.id]);await pool.query('UPDATE topics SET replies_count=GREATEST(replies_count-1,0),updated_at=NOW() WHERE id=$1',[req.params.topicId]);await pool.query('UPDATE users SET posts=GREATEST(posts-1,0) WHERE id=$1',[row.authorId]);return res.json({ok:true});}
    const rows=read('replies'),row=rows.find(r=>Number(r.id)===Number(req.params.replyId)&&Number(r.topicId)===Number(req.params.topicId));if(!row)return res.status(404).json({error:'Ответ не найден'});if(Number(row.authorId)!==Number(req.user.id)&&!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав'});write('replies',rows.filter(r=>Number(r.id)!==Number(row.id)));const topics=read('topics'),topic=topics.find(x=>Number(x.id)===Number(req.params.topicId));if(topic){topic.repliesCount=Math.max(0,(topic.repliesCount||0)-1);topic.updatedAt=new Date().toISOString();write('topics',topics);}const users=read('users'),u=users.find(x=>Number(x.id)===Number(row.authorId));if(u){u.posts=Math.max(0,(u.posts||0)-1);write('users',users);}res.json({ok:true});
  }catch(error){console.error('Reply delete error:',error);res.status(500).json({error:'Не удалось удалить ответ'});}
});
app.post('/api/topics/:id/pin',auth,async(req,res)=>{if(!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав'});try{if(pool){const result=await pool.query('UPDATE topics SET pinned=NOT pinned,updated_at=$2 WHERE id=$1 RETURNING pinned',[req.params.id,new Date().toISOString()]);if(!result.rows[0])return res.status(404).json({error:'Тема не найдена'});return res.json({ok:true,pinned:result.rows[0].pinned});}const topics=read('topics'),topic=topics.find(i=>String(i.id)===String(req.params.id));if(!topic)return res.status(404).json({error:'Тема не найдена'});topic.pinned=!topic.pinned;topic.updatedAt=new Date().toISOString();write('topics',topics);res.json({ok:true,pinned:topic.pinned});}catch(error){console.error('Topic pin error:',error);res.status(500).json({error:'Не удалось изменить закрепление'});}});
app.post('/api/topics/:id/close',auth,async(req,res)=>{if(!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав'});try{const now=new Date().toISOString();if(pool){const result=await pool.query('UPDATE topics SET closed=true,updated_at=$2 WHERE id=$1 RETURNING closed',[req.params.id,now]);if(!result.rows[0])return res.status(404).json({error:'Тема не найдена'});return res.json({ok:true,closed:true});}const topics=read('topics'),topic=topics.find(i=>String(i.id)===String(req.params.id));if(!topic)return res.status(404).json({error:'Тема не найдена'});topic.closed=true;topic.updatedAt=now;write('topics',topics);res.json({ok:true,closed:true});}catch(error){console.error('Topic close error:',error);res.status(500).json({error:'Не удалось закрыть тему'});}});
app.post('/api/topics/:id/open',auth,async(req,res)=>{if(!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав'});try{const now=new Date().toISOString();if(pool){const result=await pool.query('UPDATE topics SET closed=false,updated_at=$2 WHERE id=$1 RETURNING closed',[req.params.id,now]);if(!result.rows[0])return res.status(404).json({error:'Тема не найдена'});return res.json({ok:true,closed:false});}const topics=read('topics'),topic=topics.find(i=>String(i.id)===String(req.params.id));if(!topic)return res.status(404).json({error:'Тема не найдена'});topic.closed=false;topic.updatedAt=now;write('topics',topics);res.json({ok:true,closed:false});}catch(error){console.error('Topic open error:',error);res.status(500).json({error:'Не удалось открыть тему'});}});
app.delete('/api/topics/:id',auth,async(req,res)=>{if(!isStaff(req.user))return res.status(403).json({error:'Недостаточно прав для удаления темы'});try{const topicId=req.params.id;if(pool){const client=await pool.connect();try{await client.query('BEGIN');const topic=(await client.query('SELECT id,author_id AS "authorId" FROM topics WHERE id=$1 FOR UPDATE',[topicId])).rows[0];if(!topic){await client.query('ROLLBACK');return res.status(404).json({error:'Тема не найдена'});}const replyAuthors=await client.query('SELECT author_id AS "authorId" FROM replies WHERE topic_id=$1',[topic.id]);await client.query('DELETE FROM replies WHERE topic_id=$1',[topic.id]);await client.query('DELETE FROM topics WHERE id=$1',[topic.id]);if(topic.authorId)await client.query('UPDATE users SET topics=GREATEST(topics-1,0) WHERE id=$1',[topic.authorId]);for(const row of replyAuthors.rows){if(row.authorId)await client.query('UPDATE users SET posts=GREATEST(posts-1,0) WHERE id=$1',[row.authorId]);}await client.query('COMMIT');return res.json({ok:true,deletedTopicId:topic.id,deletedReplies:replyAuthors.rowCount});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}const topics=read('topics'),topic=topics.find(i=>String(i.id)===String(topicId));if(!topic)return res.status(404).json({error:'Тема не найдена'});const replies=read('replies'),removedReplies=replies.filter(i=>String(i.topicId)===String(topic.id));write('topics',topics.filter(i=>String(i.id)!==String(topic.id)));write('replies',replies.filter(i=>String(i.topicId)!==String(topic.id)));const users=read('users'),author=users.find(i=>Number(i.id)===Number(topic.authorId));if(author)author.topics=Math.max(0,(author.topics||0)-1);for(const reply of removedReplies){const u=users.find(i=>Number(i.id)===Number(reply.authorId));if(u)u.posts=Math.max(0,(u.posts||0)-1);}write('users',users);res.json({ok:true,deletedTopicId:topic.id,deletedReplies:removedReplies.length});}catch(error){console.error('Topic delete error:',error);res.status(500).json({error:'Не удалось удалить тему'});}});

app.get('/api/profile/:id/messages',async(req,res)=>{try{const profileUserId=Number(req.params.id);if(!Number.isInteger(profileUserId)||profileUserId<1)return res.status(400).json({error:'Некорректный пользователь'});const profile=await getUser(profileUserId);if(!profile)return res.status(404).json({error:'Пользователь не найден'});if(pool){const result=await pool.query(`SELECT m.id,m.profile_user_id AS "profileUserId",m.author_id AS "authorId",m.author,m.content,m.created_at AS "createdAt",u.nickname,u.avatar FROM profile_messages m LEFT JOIN users u ON u.id=m.author_id WHERE m.profile_user_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,[profileUserId]);return res.json({messages:result.rows});}const file=path.join(DATA_DIR,'profile_messages.json');if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');const messages=JSON.parse(fs.readFileSync(file,'utf8')).filter(i=>Number(i.profileUserId)===profileUserId).sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,100).map(i=>({...i,nickname:i.nickname||i.author,avatar:i.avatar||''}));res.json({messages});}catch(error){console.error('Profile messages load error:',error);res.status(500).json({error:'Ошибка загрузки сообщений'});}});
function sanitizeProfileMessageHtml(value=''){
  let html=String(value||'').replace(/<!--[^]*?-->/g,'');
  html=html.replace(/<font\b([^>]*)>/gi,(match,attrs)=>{
    const face=(attrs.match(/\bface=["']([^"']+)["']/i)||[])[1]||'';
    const size=(attrs.match(/\bsize=["']([1-7])["']/i)||[])[1]||'';
    const fonts=['Arial','Oxanium','Rajdhani','Georgia','Verdana','Tahoma','Courier New'];
    const safeFont=fonts.find(f=>f.toLowerCase()===face.toLowerCase());
    const sizes={1:'12px',2:'13px',3:'14px',4:'16px',5:'18px',6:'22px',7:'28px'};
    const style=[];
    if(safeFont)style.push('font-family:'+safeFont);
    if(sizes[size])style.push('font-size:'+sizes[size]);
    return style.length?'<span style="'+style.join(';')+'">':'<span>';
  }).replace(/<\/font>/gi,'</span>');
  html=html.replace(/<(?!\/?(?:b|strong|i|em|u|br|p|div|span)\b)[^>]*>/gi,'');
  html=html.replace(/<(b|strong|i|em|u|br|p|div)\b[^>]*>/gi,'<$1>');
  html=html.replace(/<span\b([^>]*)>/gi,(match,attrs)=>{
    const style=(attrs.match(/\bstyle=["']([^"']*)["']/i)||[])[1]||'';
    const out=[];
    const fm=style.match(/font-family\s*:\s*([^;]+)/i);
    const sm=style.match(/font-size\s*:\s*([^;]+)/i);
    const fonts=['Arial','Oxanium','Rajdhani','Georgia','Verdana','Tahoma','Courier New'];
    const sizes=['12px','13px','14px','16px','18px','22px','28px'];
    if(fm){const v=fm[1].replace(/[\\'"]/g,'').trim();const safe=fonts.find(f=>f.toLowerCase()===v.toLowerCase());if(safe)out.push('font-family:'+safe);}
    if(sm){const v=sm[1].trim();if(sizes.includes(v))out.push('font-size:'+v);}
    return out.length?'<span style="'+out.join(';')+'">':'<span>';
  });
  return html.trim();
}
app.post('/api/profile/:id/messages',auth,async(req,res)=>{
  const profileUserId=Number(req.params.id),content=sanitizeProfileMessageHtml(req.body.content||'');
  const plain=content.replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').trim();
  if(!Number.isInteger(profileUserId)||profileUserId<1)return res.status(400).json({error:'Некорректный пользователь'});
  if(!plain||plain.length>1000)return res.status(400).json({error:'Сообщение должно содержать от 1 до 1000 символов'});
  try{
    const profile=await getUser(profileUserId);
    if(!profile)return res.status(404).json({error:'Пользователь не найден'});
    const now=new Date().toISOString();
    if(pool){
      const result=await pool.query(`INSERT INTO profile_messages(profile_user_id,author_id,author,content,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id,profile_user_id AS "profileUserId",author_id AS "authorId",author,content,created_at AS "createdAt"`,[profileUserId,req.user.id,req.user.nickname,content,now]);
      await createNotification({recipientId:profileUserId,actorId:req.user.id,type:'profile_message',title:'Новое сообщение в профиле',body:req.user.nickname+' оставил(а) сообщение в вашем профиле.',url:'profile.html?id='+profileUserId});
      return res.status(201).json({message:{...result.rows[0],nickname:req.user.nickname,avatar:req.user.avatar||''}});
    }
    const file=path.join(DATA_DIR,'profile_messages.json');
    if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');
    const messages=JSON.parse(fs.readFileSync(file,'utf8')),message={id:nextId(messages),profileUserId,authorId:req.user.id,author:req.user.nickname,nickname:req.user.nickname,avatar:req.user.avatar||'',content,createdAt:now};
    messages.push(message);fs.writeFileSync(file,JSON.stringify(messages,null,2),'utf8');await createNotification({recipientId:profileUserId,actorId:req.user.id,type:'profile_message',title:'Новое сообщение в профиле',body:req.user.nickname+' оставил(а) сообщение в вашем профиле.',url:'profile.html?id='+profileUserId});res.status(201).json({message});
  }catch(error){console.error('Profile message create error:',error);res.status(500).json({error:'Не удалось отправить сообщение'});}
});
app.delete('/api/profile/:profileId/messages/:messageId',auth,async(req,res)=>{
  const profileUserId=Number(req.params.profileId),messageId=Number(req.params.messageId);
  if(!Number.isInteger(profileUserId)||profileUserId<1||!Number.isInteger(messageId)||messageId<1)return res.status(400).json({error:'Некорректный запрос'});
  try{
    if(pool){
      const result=await pool.query('SELECT id,profile_user_id AS "profileUserId",author_id AS "authorId" FROM profile_messages WHERE id=$1 AND profile_user_id=$2',[messageId,profileUserId]);
      const message=result.rows[0];
      if(!message)return res.status(404).json({error:'Сообщение не найдено'});
      const allowed=Number(message.authorId)===Number(req.user.id)||Number(message.profileUserId)===Number(req.user.id)||canAccessAdmin(req.user);
      if(!allowed)return res.status(403).json({error:'Недостаточно прав для удаления сообщения'});
      await pool.query('DELETE FROM profile_messages WHERE id=$1',[messageId]);
      return res.json({ok:true});
    }
    const file=path.join(DATA_DIR,'profile_messages.json');
    if(!fs.existsSync(file))return res.status(404).json({error:'Сообщение не найдено'});
    const messages=JSON.parse(fs.readFileSync(file,'utf8')),message=messages.find(m=>Number(m.id)===messageId&&Number(m.profileUserId)===profileUserId);
    if(!message)return res.status(404).json({error:'Сообщение не найдено'});
    const allowed=Number(message.authorId)===Number(req.user.id)||Number(message.profileUserId)===Number(req.user.id)||canAccessAdmin(req.user);
    if(!allowed)return res.status(403).json({error:'Недостаточно прав для удаления сообщения'});
    const next=messages.filter(m=>!(Number(m.id)===messageId&&Number(m.profileUserId)===profileUserId));
    fs.writeFileSync(file,JSON.stringify(next,null,2),'utf8');
    return res.json({ok:true});
  }catch(error){console.error('Profile message delete error:',error);res.status(500).json({error:'Не удалось удалить сообщение'});}
});

app.get('/api/unbans',async(req,res)=>{
  try{
    if(pool){
      const result=await pool.query(`SELECT id,punishment_id AS "punishmentId",nickname,moderator,reason,mode,server,created_at AS "createdAt" FROM unban_history ORDER BY created_at DESC,id DESC LIMIT 200`);
      return res.json({unbans:result.rows});
    }
    const file=path.join(DATA_DIR,'unban_history.json');
    if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');
    return res.json({unbans:readJsonFile(file).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,200)});
  }catch(error){console.error('Unbans load error:',error);res.status(500).json({error:'Ошибка загрузки истории разблокировок'});}
});

app.get('/api/punishments',async(req,res)=>{
  try{
    if(pool){
      const result=await pool.query(`SELECT id,nickname,reason,moderator,expires_at AS "expiresAt",mode,punishment_type AS "type",server,external_id AS "externalId",created_at AS "createdAt" FROM punishment_history ORDER BY created_at DESC,id DESC LIMIT 100`);
      return res.json({punishments:result.rows});
    }
    const file=path.join(DATA_DIR,'punishment_history.json');
    if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');
    const punishments=readJsonFile(file).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,100);
    res.json({punishments});
  }catch(error){console.error('Punishments load error:',error);res.status(500).json({error:'Ошибка загрузки истории блокировок'});}
});

// Машинная интеграция: Minecraft-серверы отправляют бан сюда по API-ключу Render.
app.post('/api/integrations/punishments',async(req,res)=>{
  const mode=String(req.body.mode||'').trim();
  const apiKey=String(req.get('X-EPM-API-Key')||'').trim();
  if(!PUNISHMENT_MODES.includes(mode)||!punishmentApiKeyValid(mode,apiKey))return res.status(401).json({error:'Недействительный API-ключ интеграции'});
  const nickname=String(req.body.nickname||'').trim().slice(0,24);
  const reason=String(req.body.reason||'Не указана').trim().slice(0,500)||'Не указана';
  const moderator=String(req.body.moderator||'Неизвестно').trim().slice(0,64)||'Неизвестно';
  const type=String(req.body.type||'BAN').trim().slice(0,24)||'BAN';
  const server=String(req.body.server||mode).trim().slice(0,64)||mode;
  const externalId=String(req.body.externalId||'').trim().slice(0,160);
  const expiresAt=req.body.expiresAt ? new Date(req.body.expiresAt) : null;
  if(!nickname)return res.status(400).json({error:'Не указан ник игрока'});
  if(expiresAt && Number.isNaN(expiresAt.getTime()))return res.status(400).json({error:'Некорректная дата окончания блокировки'});
  try{
    if(pool){
      if(externalId){
        const duplicate=await pool.query('SELECT id FROM punishment_history WHERE external_id=$1',[externalId]);
        if(duplicate.rows[0])return res.json({ok:true,duplicate:true,id:duplicate.rows[0].id});
      }
      const result=await pool.query(`INSERT INTO punishment_history(nickname,reason,moderator,expires_at,mode,punishment_type,server,external_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id,nickname,reason,moderator,expires_at AS "expiresAt",mode,punishment_type AS "type",server,external_id AS "externalId",created_at AS "createdAt"`,[nickname,reason,moderator,expiresAt?expiresAt.toISOString():null,mode,type,server,externalId||null]);
      return res.status(201).json({ok:true,punishment:result.rows[0]});
    }
    const file=path.join(DATA_DIR,'punishment_history.json');
    if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');
    const punishments=readJsonFile(file);
    if(externalId){const duplicate=punishments.find(p=>p.externalId===externalId);if(duplicate)return res.json({ok:true,duplicate:true,id:duplicate.id});}
    const punishment={id:nextId(punishments),nickname,reason,moderator,expiresAt:expiresAt?expiresAt.toISOString():null,mode,type,server,externalId:externalId||null,createdAt:new Date().toISOString()};
    punishments.push(punishment);fs.writeFileSync(file,JSON.stringify(punishments,null,2),'utf8');
    res.status(201).json({ok:true,punishment});
  }catch(error){console.error('Integration punishment error:',error);res.status(500).json({error:'Не удалось сохранить блокировку'});}
});

app.post('/api/punishments',auth,async(req,res)=>{
  if(!hasRoleLevel(req.user,'Ст.Модератор'))return res.status(403).json({error:'Добавлять блокировки могут только Ст.Модератор и выше'});
  const nickname=String(req.body.nickname||'').trim().slice(0,24),reason=String(req.body.reason||'').trim().slice(0,500);
  const mode=String(req.body.mode||'').trim().slice(0,64)||'EPM';
  if(!nickname||!reason)return res.status(400).json({error:'Укажи ник игрока и причину блокировки'});
  try{
    const createdAt=new Date().toISOString();
    if(pool){
      const result=await pool.query(`INSERT INTO punishment_history(nickname,reason,moderator,mode,punishment_type,server,created_at) VALUES($1,$2,$3,$4,'BAN',$4,$5) RETURNING id,nickname,reason,moderator,expires_at AS "expiresAt",mode,punishment_type AS "type",server,external_id AS "externalId",created_at AS "createdAt"`,[nickname,reason,req.user.nickname,mode,createdAt]);
      return res.status(201).json({punishment:result.rows[0]});
    }
    const file=path.join(DATA_DIR,'punishment_history.json');if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');
    const punishments=readJsonFile(file),punishment={id:nextId(punishments),nickname,reason,moderator:req.user.nickname,expiresAt:null,mode,type:'BAN',server:mode,externalId:null,createdAt};
    punishments.push(punishment);fs.writeFileSync(file,JSON.stringify(punishments,null,2),'utf8');res.status(201).json({punishment});
  }catch(error){console.error('Punishment create error:',error);res.status(500).json({error:'Не удалось добавить блокировку'});}
});

app.get('/api/news',async(req,res)=>{
  try{
    if(pool){
      const result=await pool.query(`SELECT id,category,title,text,date,link,created_at AS "createdAt",updated_at AS "updatedAt" FROM news ORDER BY created_at DESC,id DESC`);
      return res.json(result.rows);
    }
    const newsFile=path.join(DATA_DIR,'news.json');
    if(!fs.existsSync(newsFile))fs.writeFileSync(newsFile,'[]','utf8');
    return res.json(readJsonFile(newsFile));
  }catch(error){console.error('News load error:',error);res.status(500).json({error:'Ошибка загрузки новостей'});}
});

app.post('/api/admin/news',auth,async(req,res)=>{
  if(!canAccessAdmin(req.user))return res.status(403).json({error:'Доступ только для Мл.Хелпера и выше'});
  const category=String(req.body.category||'community').trim().slice(0,32)||'community';
  const title=String(req.body.title||'').trim().slice(0,160);
  const text=String(req.body.text||'').trim().slice(0,3000);
  const date=String(req.body.date||new Date().toLocaleDateString('ru-RU')).trim().slice(0,32);
  const link=String(req.body.link||'').trim().slice(0,160);
  if(!title||!text)return res.status(400).json({error:'Укажи заголовок и текст новости'});
  try{
    if(pool){
      const result=await pool.query(`INSERT INTO news(category,title,text,date,link) VALUES($1,$2,$3,$4,$5)
        RETURNING id,category,title,text,date,link,created_at AS "createdAt",updated_at AS "updatedAt"`,[category,title,text,date,link]);
      return res.status(201).json({news:result.rows[0]});
    }
    const file=path.join(DATA_DIR,'news.json');if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');
    const rows=readJsonFile(file),item={id:nextId(rows),category,title,text,date,link,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    rows.unshift(item);fs.writeFileSync(file,JSON.stringify(rows,null,2),'utf8');res.status(201).json({news:item});
  }catch(error){console.error('News create error:',error);res.status(500).json({error:'Не удалось создать новость'});}
});

app.patch('/api/admin/news/:id',auth,async(req,res)=>{
  if(!canAccessAdmin(req.user))return res.status(403).json({error:'Доступ только для Мл.Хелпера и выше'});
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Некорректная новость'});
  const category=String(req.body.category||'community').trim().slice(0,32)||'community';
  const title=String(req.body.title||'').trim().slice(0,160);
  const text=String(req.body.text||'').trim().slice(0,3000);
  const date=String(req.body.date||new Date().toLocaleDateString('ru-RU')).trim().slice(0,32);
  const link=String(req.body.link||'').trim().slice(0,160);
  if(!title||!text)return res.status(400).json({error:'Укажи заголовок и текст новости'});
  try{
    if(pool){
      const result=await pool.query(`UPDATE news SET category=$2,title=$3,text=$4,date=$5,link=$6,updated_at=NOW() WHERE id=$1
        RETURNING id,category,title,text,date,link,created_at AS "createdAt",updated_at AS "updatedAt"`,[id,category,title,text,date,link]);
      if(!result.rows[0])return res.status(404).json({error:'Новость не найдена'});
      return res.json({news:result.rows[0]});
    }
    const file=path.join(DATA_DIR,'news.json'),rows=readJsonFile(file),i=rows.findIndex(x=>Number(x.id)===id);
    if(i<0)return res.status(404).json({error:'Новость не найдена'});
    rows[i]={...rows[i],category,title,text,date,link,updatedAt:new Date().toISOString()};fs.writeFileSync(file,JSON.stringify(rows,null,2),'utf8');res.json({news:rows[i]});
  }catch(error){console.error('News update error:',error);res.status(500).json({error:'Не удалось обновить новость'});}
});

app.delete('/api/admin/news/:id',auth,async(req,res)=>{
  if(!canAccessAdmin(req.user))return res.status(403).json({error:'Доступ только для Мл.Хелпера и выше'});
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Некорректная новость'});
  try{
    if(pool){
      const result=await pool.query('DELETE FROM news WHERE id=$1 RETURNING id',[id]);
      if(!result.rows[0])return res.status(404).json({error:'Новость не найдена'});
      return res.json({ok:true});
    }
    const file=path.join(DATA_DIR,'news.json'),rows=readJsonFile(file),next=rows.filter(x=>Number(x.id)!==id);
    if(next.length===rows.length)return res.status(404).json({error:'Новость не найдена'});
    fs.writeFileSync(file,JSON.stringify(next,null,2),'utf8');res.json({ok:true});
  }catch(error){console.error('News delete error:',error);res.status(500).json({error:'Не удалось удалить новость'});}
});

app.get('/api/reviews',async(req,res)=>{
  try{
    if(pool)return res.json({reviews:(await pool.query('SELECT id,nickname,rating,text,created_at AS "createdAt" FROM reviews ORDER BY created_at DESC,id DESC LIMIT 200')).rows});
    const file=path.join(DATA_DIR,'reviews.json');if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');return res.json({reviews:readJsonFile(file)});
  }catch(error){res.status(500).json({error:'Ошибка загрузки отзывов'});}
});

app.get('/api/purchases',auth,async(req,res)=>{
  if(!canAccessAdmin(req.user))return res.status(403).json({error:'Доступ только для Мл.Хелпера и выше'});
  try{
    if(pool)return res.json({purchases:(await pool.query('SELECT id,nickname,product,amount,status,created_at AS "createdAt" FROM purchases ORDER BY created_at DESC,id DESC LIMIT 500')).rows});
    const file=path.join(DATA_DIR,'purchases.json');if(!fs.existsSync(file))fs.writeFileSync(file,'[]','utf8');return res.json({purchases:readJsonFile(file)});
  }catch(error){res.status(500).json({error:'Ошибка загрузки покупок'});}
});
function readJsonFile(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return [];}}

app.use(express.static(__dirname));
app.use((err,req,res,next)=>{console.error('EPM API error:',err);if(res.headersSent)return next(err);res.status(500).json({error:'Внутренняя ошибка сервера'});});

(async()=>{try{await initDatabase();app.listen(PORT,()=>console.log(`EPM server started on port ${PORT}`));}catch(error){console.error('Database initialization error:',error);process.exit(1);}})();




