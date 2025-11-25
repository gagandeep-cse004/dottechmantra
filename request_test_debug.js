(async () => {
  const url = 'http://127.0.0.1:4100/debug/write-local';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'node-fetch-test', source: 'node' })
    });
    console.log('STATUS', r.status);
    const txt = await r.text();
    console.log('BODY:', txt);
  } catch (e) {
    console.error('ERR', e && e.stack ? e.stack : e);
  }
})();
