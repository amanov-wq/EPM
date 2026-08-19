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

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}

function writeJson(file, rows) {
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
}

async function syncStartup() {
  if (!pool) {
    console.log('EPM: DATABASE_URL is not set; using local JSON storage.');
    return;
  }

  await initDatabase();

  for (const name of Object.keys(files)) {
    const fromDb = await loadToJson(name);
    const local = readJson(files[name]);

    if (fromDb && fromDb.length > 0) {
      writeJson(files[name], fromDb);
    } else if (local.length > 0) {
      await replaceFromJson(name, local);
    }
  }

  const pending = new Map();
  for (const [name, file] of Object.entries(files)) {
    fs.watch(file, () => {
      clearTimeout(pending.get(name));
      pending.set(name, setTimeout(async () => {
        try {
          await replaceFromJson(name, readJson(file));
        } catch (error) {
          console.error(`EPM DB sync error (${name}):`, error.message);
        }
      }, 250));
    });
  }

  console.log('EPM: PostgreSQL persistence enabled.');
}

syncStartup()
  .then(() => require('./server'))
  .catch(error => {
    console.error('EPM database startup failed:', error);
    process.exit(1);
  });
