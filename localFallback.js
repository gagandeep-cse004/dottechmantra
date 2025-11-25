const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'local_db.json');

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const init = { info_submissions: [], subscribers: [], contacts: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
      return init;
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error('localFallback read error:', err);
    return { info_submissions: [], subscribers: [], contacts: [] };
  }
}

function writeDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return true;
  } catch (err) {
    console.error('localFallback write error:', err);
    return false;
  }
}

function genId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

async function insert(table, obj) {
  const db = readDB();
  if (!db[table]) db[table] = [];
  const row = Object.assign({}, obj);
  row.id = genId();
  row.created_at = new Date().toISOString();
  db[table].unshift(row);
  writeDB(db);
  return { data: [row], error: null };
}

async function selectAll(table, options = {}) {
  const db = readDB();
  const rows = db[table] || [];
  // ordering: by created_at desc by default
  const sorted = rows.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const limit = options.limit || null;
  return { data: limit ? sorted.slice(0, limit) : sorted, error: null };
}

async function findOne(table, predicate) {
  const db = readDB();
  const rows = db[table] || [];
  const r = rows.find(predicate);
  return { data: r ? [r] : [], error: null };
}

async function deleteById(table, id) {
  const db = readDB();
  if (!db[table]) return { error: null };
  const before = db[table].length;
  db[table] = db[table].filter(r => String(r.id) !== String(id));
  writeDB(db);
  return { error: null };
}

async function updateById(table, id, updates) {
  const db = readDB();
  if (!db[table]) return { error: null };
  let found = false;
  db[table] = db[table].map(r => {
    if (String(r.id) === String(id)) {
      found = true;
      return Object.assign({}, r, updates);
    }
    return r;
  });
  writeDB(db);
  return { error: null };
}

module.exports = {
  usingServiceRole: false,
  insert,
  selectAll,
  findOne,
  deleteById,
  updateById
};
