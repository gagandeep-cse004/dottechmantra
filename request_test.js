(async () => {
  try {
    const res = await fetch('http://127.0.0.1:4100/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'clientTest', email: 'c@test', phone: '999' })
    });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log('BODY', text);
  } catch (e) {
    console.error('REQUEST ERROR', e && e.stack ? e.stack : e);
  }
})();
