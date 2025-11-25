// Quick script to insert a test contact and print recent contacts
const supabase = require('../supabaseClient');

(async function() {
  try {
    console.log('Inserting test contact...');
    const now = new Date().toISOString();
    const payload = {
      institute_name: 'Test Institute ' + now,
      email: `test+${Date.now()}@example.com`,
      phone: '0000000000',
      service_interested_in: 'test-service',
      message: 'Inserted by check_supabase script at ' + now
    };

    const insertRes = await supabase.from('info_submissions').insert([payload]).select('id, created_at').limit(1);
    console.log('Insert result:', insertRes);

    console.log('\nFetching last 10 info_submissions...');
    const fetchRes = await supabase.from('info_submissions').select('*').order('created_at', { ascending: false }).limit(10);
    console.log('Fetch result:', fetchRes);

    process.exit(0);
  } catch (err) {
    console.error('Error during Supabase check:', err);
    process.exit(2);
  }
})();
