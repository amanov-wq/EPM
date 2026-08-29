const fs = require('fs');
const path = require('path');
const { initDatabase, pool, loadToJson, replaceFromJson } = require('./database');

const DATA_DIR = path.join(__dirname, 'data');
const files = {
  users: path.join(DATA_DIR, 'users.json'),
  topics: path.join(DATA_DIR, 'topics.json'),
  replies: path.join(DATA_DIR, 'replies.json'),
  battlepass: path.join(DATA_DIR, 'battlepass.json')
};

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function writeJson(file, rows) {
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
}

function ensureJsonFiles() {
  for (const file of Object.values(files)) {
    if (!fs.existsSync(file)) writeJson(file, []);
  }
}

async function syncStartup() {
  ensureJsonFiles();

  if (!pool) {
    console.log('EPM: DATABASE_URL is not set; using local JSON storage.');
    return;
  }

  await initDatabase();

  // PostgreSQL is the source of truth when it contains data.
  // Legacy JSON files are imported only for an empty database, then kept as
  // a compatibility mirror. We intentionally do not watch/write them at
  // runtime because doing so could overwrite newer database data.
  for (const name of Object.keys(files)) {
    const fromDb = await loadToJson(name);
    const local = readJson(files[name]);

    if (fromDb && fromDb.length > 0) {
      writeJson(files[name], fromDb);
    } else if (local.length > 0) {
      await replaceFromJson(name, local);
    }
  }

  console.log('EPM: PostgreSQL persistence enabled.');
}

syncStartup()
  .then(() => require('./server'))
  .catch((error) => {
    console.error('EPM database startup failed:', error);
    process.exit(1);
  });
