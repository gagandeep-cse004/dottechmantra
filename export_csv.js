const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');

const OUT_DIR = path.join(__dirname, 'exports');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

function rowsToCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) {
    const vals = headers.map(h => {
      const v = r[h] == null ? '' : String(r[h]);
      // escape double quotes
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    });
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

async function exportTable(table) {
  const { data: rows, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const csv = rowsToCsv(rows || []);
  const outFile = path.join(OUT_DIR, `${table}.csv`);
  fs.writeFileSync(outFile, csv, 'utf8');
  console.log(`Wrote ${rows.length} rows to ${outFile}`);
}

(async function() {
  try {
  await exportTable('info_submissions');
  await exportTable('subscribers');
    console.log('Export complete. Files are in the ./exports folder');
    // Using Supabase (remote) - no local DB connection to close
  } catch (err) {
    console.error('Export failed:', err);
    // no db.close() for Supabase client
    process.exit(1);
  }
})();
