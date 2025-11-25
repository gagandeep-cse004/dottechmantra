const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, res => {
  console.log('STATUS', res.statusCode);
  console.log('HEADERS', res.headers);
  let body = '';
  res.setEncoding('utf8');
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('BODY', body);
    process.exit(0);
  });
});

req.on('timeout', () => {
  console.error('Request timed out');
  req.abort();
});
req.on('error', err => {
  console.error('Request error:', err.message);
  process.exit(1);
});
req.end();
