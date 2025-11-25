const supabase = require('./supabaseClient');

async function printRows(table) {
  const { data: rows, error } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  console.log(`\n=== ${table.toUpperCase()} (${rows.length} rows) ===`);
  if (!rows || rows.length === 0) {
    console.log('(no rows)');
  } else {
    rows.forEach(r => console.log(JSON.stringify(r)));
  }
}

(async function() {
  try {
    await printRows('contacts');
  await printRows('info_submissions');
  await printRows('subscribers');
    // Supabase is remote; no local DB to close
  } catch (err) {
    console.error('Error reading DB:', err);
    // nothing to close for Supabase
    process.exit(1);
  }
})();
