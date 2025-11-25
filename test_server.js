const express = require('express');
const app = express();
app.use(express.json());
app.get('/health', (req, res) => res.json({status:'ok'}));
app.post('/api/contact', (req, res) => {
  console.log('test_server received:', req.body);
  res.json({ok:true});
});
app.listen(4101, '127.0.0.1', ()=>console.log('test_server listening on 4101'));
