/**
 * SQLite-backed local DB fallback for when Supabase is unavailable.
 *
 * This module attempts to use `sqlite3`. If it's not installed the code
 * will print a helpful error. After installing dependencies run the server
 * and it will create `local_data.db` (in this project folder) and the
 * required tables.
 */

const path = require('path');
const DB_PATH = path.join(__dirname, 'local_data.db');
let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (e) {
  console.error('sqlite3 is not installed. Please run `npm install sqlite3` and restart the server.');
  // Provide a minimal in-memory stub so server doesn't completely break
  module.exports = {
    from: () => ({
      select: () => ({ then: (f) => Promise.resolve(f({ data: [], error: null })) }),
      insert: () => ({ select: () => ({ limit: () => ({ then: (f) => Promise.resolve(f({ data: [{ id: 1 }], error: null })) }) }) }),
      delete: () => ({ eq: () => ({ then: (f) => Promise.resolve(f({ error: null })) }) }),
      update: () => ({ eq: () => ({ then: (f) => Promise.resolve(f({ error: null })) }) })
    }),
    usingServiceRole: true
  };
}

const db = new sqlite3.Database(DB_PATH);

// Initialize tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS info_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institute_name TEXT,
    email TEXT,
    phone TEXT,
    message TEXT,
    created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    phone TEXT,
    created_at TEXT
  )`);
});

function runAsync(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function allAsync(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

class SQLiteQuery {
  constructor(table) {
    this.table = table;
    this._mode = null; // 'select'|'insert'|'delete'|'update'
    this._cols = '*';
    this._records = [];
    this._filters = {};
    this._order = null;
    this._limit = null;
    this._updates = {};
  }

  select(cols='*') { this._mode='select'; this._cols = cols; return this; }
  insert(records) { this._mode='insert'; this._records = Array.isArray(records)?records:[records]; return this; }
  delete() { this._mode='delete'; return this; }
  update(updates) { this._mode='update'; this._updates = updates; return this; }

  eq(col, val) { this._filters[col]=val; return this; }
  order(col, opts) { this._order = { col, asc: opts && opts.ascending }; return this; }
  limit(n) { this._limit = n; return this; }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }

  catch(onRejected) { return this.then(null, onRejected); }

  async execute() {
    try {
      if (this._mode === 'select') {
        let sql = `SELECT ${this._cols} FROM ${this.table}`;
        const params = [];
        const where = Object.keys(this._filters).map(k => { params.push(this._filters[k]); return `${k} = ?`; });
        if (where.length) sql += ' WHERE ' + where.join(' AND ');
        if (this._order) sql += ` ORDER BY ${this._order.col} ${this._order.asc ? 'ASC' : 'DESC'}`;
        if (this._limit) sql += ` LIMIT ${this._limit}`;
        const rows = await allAsync(sql, params);
        return { data: rows, error: null };
      }

      if (this._mode === 'insert') {
        const inserted = [];
        for (const rec of this._records) {
          const now = rec.created_at || new Date().toISOString();
          const cols = Object.keys(rec).filter(c => c !== 'id');
          const placeholders = cols.map(()=>'?').join(',');
          const sql = `INSERT INTO ${this.table} (${cols.join(',')}, created_at) VALUES (${placeholders}, ?)`;
          const params = cols.map(c=>rec[c]);
          params.push(now);
          const r = await runAsync(sql, params);
          const row = Object.assign({}, rec, { id: r.lastID, created_at: now });
          inserted.push(row);
        }
        return { data: inserted, error: null };
      }

      if (this._mode === 'delete') {
        const where = Object.keys(this._filters);
        if (!where.length) return { data: null, error: 'Missing filter for delete' };
        const params = where.map(k=>this._filters[k]);
        const sql = `DELETE FROM ${this.table} WHERE ` + where.map(k=>`${k} = ?`).join(' AND ');
        const r = await runAsync(sql, params);
        return { data: { rowsDeleted: r.changes }, error: null };
      }

      if (this._mode === 'update') {
        const setCols = Object.keys(this._updates);
        if (!setCols.length) return { data: null, error: 'No updates provided' };
        const setSql = setCols.map(c=>`${c} = ?`).join(', ');
        const params = setCols.map(c=>this._updates[c]);
        const whereCols = Object.keys(this._filters);
        if (!whereCols.length) return { data: null, error: 'Missing filter for update' };
        const whereSql = whereCols.map(c=>`${c} = ?`).join(' AND ');
        params.push(...whereCols.map(c=>this._filters[c]));
        const sql = `UPDATE ${this.table} SET ${setSql} WHERE ${whereSql}`;
        const r = await runAsync(sql, params);
        return { data: { changes: r.changes }, error: null };
      }

      return { data: null, error: 'Unknown query mode' };
    } catch (err) {
      return { data: null, error: err };
    }
  }
}

const localDb = {
  from: (tableName) => new SQLiteQuery(tableName),
  usingServiceRole: true
};

module.exports = localDb;