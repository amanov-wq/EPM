const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

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
  try { return JSON.parse(fs.readFileSync(files[name], 'utf8')); }
  catch { return []; }
}

function write(name, data) {
  fs.writeFileSync(files[name], JSON.stringify(data, null, 2), 'utf8');
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

app.get('/api/health', (req, res) => res.json({ ok: true, project: 'EPM' }));

app.get('/api/topics', (req, res) => {
  const topics = read('topics').sort((a, b) => {
    if (Boolean(b.pinned) !== Boolean(a.pinned)) return Number(b.pinned) - Number(a.pinned);
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  });
  res.json(topics);
});

app.get('/api/topics/:id', (req, res) => {
  const topic = read('topics').find(t => String(t.id) === String(req.params.id));
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  const replies = read('replies').filter(r => String(r.topicId) === String(topic.id));
  res.json({ ...topic, replies });
});

app.post('/api/topics', (req, res) => {
  const { title, content, author = 'Гость', category = 'Общение' } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'Заполни заголовок и текст темы' });
  const topics = read('topics');
  const now = new Date().toISOString();
  const topic = {
    id: nextId(topics), title: title.trim(), content: content.trim(), author: author.trim(), category,
    pinned: false, closed: false, views: 0, repliesCount: 0, createdAt: now, updatedAt: now
  };
  topics.push(topic);
  write('topics', topics);
  res.status(201).json(topic);
});

app.post('/api/topics/:id/replies', (req, res) => {
  const topics = read('topics');
  const topic = topics.find(t => String(t.id) === String(req.params.id));
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  if (topic.closed) return res.status(403).json({ error: 'Тема закрыта' });
  const { content, author = 'Гость' } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Напиши текст ответа' });
  const replies = read('replies');
  const now = new Date().toISOString();
  const reply = { id: nextId(replies), topicId: Number(topic.id), content: content.trim(), author: author.trim(), createdAt: now };
  replies.push(reply);
  topic.repliesCount = (topic.repliesCount || 0) + 1;
  topic.updatedAt = now;
  write('replies', replies);
  write('topics', topics);
  res.status(201).json(reply);
});

app.post('/api/topics/:id/view', (req, res) => {
  const topics = read('topics');
  const topic = topics.find(t => String(t.id) === String(req.params.id));
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  topic.views = (topic.views || 0) + 1;
  write('topics', topics);
  res.json({ views: topic.views });
});

app.delete('/api/topics/:id', (req, res) => {
  const topics = read('topics');
  const exists = topics.some(t => String(t.id) === String(req.params.id));
  if (!exists) return res.status(404).json({ error: 'Тема не найдена' });
  write('topics', topics.filter(t => String(t.id) !== String(req.params.id)));
  write('replies', read('replies').filter(r => String(r.topicId) !== String(req.params.id)));
  res.json({ ok: true });
});

app.post('/api/topics/:id/pin', (req, res) => {
  const topics = read('topics');
  const topic = topics.find(t => String(t.id) === String(req.params.id));
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  topic.pinned = !topic.pinned;
  write('topics', topics);
  res.json(topic);
});

app.post('/api/topics/:id/close', (req, res) => {
  const topics = read('topics');
  const topic = topics.find(t => String(t.id) === String(req.params.id));
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  topic.closed = !topic.closed;
  write('topics', topics);
  res.json(topic);
});

app.get('/server-info', (req, res) => {
  res.json({ project: 'EPM', server: 'EstamonHost.ru', online: false, players: 0, maxPlayers: 0, version: '—' });
});

// Express 5: wildcard routes use a named parameter.
app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found' });
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send('EPM: index.html пока не создан.');
});

app.listen(PORT, () => console.log(`EPM server started on port ${PORT}`));
