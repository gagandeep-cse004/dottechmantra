// Deprecated: db.js used to contain a local SQLite connection for development.
// Project migrated to Supabase (see `supabaseClient.js`).
//
// This file remains as a compatibility stub so `require('./db')` does not crash
// existing scripts. Replace usage with `require('./supabaseClient')` and then
// remove this file.

module.exports = new Proxy({}, {
  get() {
    throw new Error('db.js is deprecated. Use supabaseClient.js (Supabase) instead.');
  }
});
