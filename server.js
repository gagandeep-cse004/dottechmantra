// Load .env at the absolute top, before any other require
const fs = require('fs');
const dotenv = require('dotenv');
let envToken = '';
if (fs.existsSync('.env')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env'));
  envToken = envConfig.ADMIN_TOKEN || '';
  process.env.ADMIN_TOKEN = envToken;
  console.log('ADMIN_TOKEN from .env:', envToken);
} else {
  require('dotenv').config();
  envToken = process.env.ADMIN_TOKEN || '';
  console.log('ADMIN_TOKEN from process.env:', envToken);
}

let viewerTokens = [];
if (fs.existsSync('.env')) {
  const envConfig = dotenv.parse(fs.readFileSync('.env'));
  if (envConfig.VIEWER_TOKENS) {
    viewerTokens = envConfig.VIEWER_TOKENS.split(',').map(t => t.trim()).filter(Boolean);
  }
} else if (process.env.VIEWER_TOKENS) {
  viewerTokens = process.env.VIEWER_TOKENS.split(',').map(t => t.trim()).filter(Boolean);
}

// All admin endpoints must be defined after app is initialized
const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./supabaseClient');

// Flag to indicate whether Supabase is reachable; set by startup check.
let supabaseAvailable = true;
let db = supabase; // always use Supabase (no local fallback)

// Test Supabase connection on startup
async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('info_submissions').select('id').limit(1);
    if (error) throw error;
    console.log('✓ Successfully connected to Supabase');
    supabaseAvailable = true;
    db = supabase;
  } catch (err) {
    console.error('✗ Failed to connect to Supabase:', err && err.message ? err.message : err);
    console.error('→ This server is configured to use Supabase only. Please ensure SUPABASE_URL and SUPABASE_KEY are correct and the network can reach Supabase.');
    supabaseAvailable = false;
    // Keep db pointing at supabase client; handlers will return 503 if unavailable
    db = supabase;
  }
}

const app = express();
const PORT = process.env.PORT || 4100;

// Test connection on startup
testSupabaseConnection();

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED_REJECTION]', reason && reason.stack ? reason.stack : reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err && err.stack ? err.stack : err);
});

process.on('exit', (code) => {
  console.error('[PROCESS_EXIT]', code);
});

process.on('beforeExit', (code) => {
  console.error('[PROCESS_BEFORE_EXIT]', code);
});

process.on('SIGTERM', () => {
  console.error('[SIGTERM]');
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Dedicated error handler for parsing errors
app.use((err, req, res, next) => {
  console.error('[MIDDLEWARE_ERROR]', err && err.message ? err.message : err);
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  next(err);
});

app.use(express.static(path.join(__dirname)));

// Warn if server is not running with a service role key. It's allowed for quick testing,
// but in production you should set SUPABASE_SERVICE_ROLE in the server environment.
if (!supabase.usingServiceRole) {
  console.warn('WARNING: Supabase client is not using SUPABASE_SERVICE_ROLE. This may mean your server is using an anon/public key. For production, set SUPABASE_SERVICE_ROLE in env to perform trusted writes and avoid loosening RLS policies.');
}

// Simple request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Wrapper to catch async errors in Express handlers
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/contact', asyncHandler(async (req, res) => {
  console.log('[CONTACT] Received body:', JSON.stringify(req.body));

  if (!supabaseAvailable) {
    console.warn('[CONTACT] Supabase unavailable; rejecting request');
    return res.status(503).json({ error: 'Database unavailable' });
  }

  const { name, email, phone, service, message } = req.body || {};
  if (!name || !email || !phone) {
    console.warn('[CONTACT] Missing required fields');
    return res.status(400).json({ error: 'name, email and phone are required' });
  }

  // Normalize and trim inputs; enforce reasonable length limits to avoid accidental huge payloads
  const trimmed = (v, max = 1000) => (typeof v === 'string' ? v.trim().slice(0, max) : (v === null ? null : String(v).slice(0, max)));
  const emailNorm = trimmed(email || '').toLowerCase().slice(0, 255) || null;
  const nameNorm = trimmed(name || '').slice(0, 255) || null;
  const phoneNorm = trimmed(phone || '').slice(0, 40) || null;
  // Accept either `service` or `service_interested`/`service_interested_in` client-side names
  const incomingService = (typeof service !== 'undefined' && service !== null) ? service : (req.body.service_interested || req.body.service_interested_in || null);
  const serviceNorm = incomingService ? trimmed(incomingService, 255) : null;
  const messageNorm = message ? trimmed(message, 2000) : null;

  // Write the column that exists in your schema: `service_interested_in`.
  const payload = {
    institute_name: nameNorm,
    email: emailNorm,
    phone: phoneNorm,
    service_interested_in: serviceNorm,
    message: messageNorm
  };

  try {
    console.log('[CONTACT] Inserting payload:', JSON.stringify(payload));
    const resp = await db.from('info_submissions').insert([payload]).select('id').limit(1);
    // log the full response to help debug schema/column issues
    console.log('[CONTACT] Supabase response:', JSON.stringify(resp, Object.getOwnPropertyNames(resp)));
    if (resp.error) {
      console.error('[CONTACT] Supabase error full:', resp.error);
      // If Supabase reports a missing column, include the full message so it's actionable
      const details = resp.error && resp.error.message ? resp.error.message : resp.error;
      return res.status(500).json({ error: 'Database error', details });
    }
    const id = resp.data && resp.data[0] ? resp.data[0].id : null;
    return res.json({ success: true, id });
  } catch (err) {
    console.error('[CONTACT] Unexpected error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Server error' });
  }
}));

// Temporary debug endpoint to verify local DB writes without going through the full contact flow
app.post('/debug/write-local', asyncHandler(async (req, res) => {
  // Ensure debug writes use the same normalization as the contact endpoint
  const body = req.body || {};
  const name = body.name || body.institute_name || '';
  const email = body.email || '';
  const phone = body.phone || '';
  const incomingService = body.service || body.service_interested || body.service_interested_in || null;
  const trimmedVal = (v, max = 1000) => (typeof v === 'string' ? v.trim().slice(0, max) : (v === null ? null : String(v).slice(0, max)));
  const testRecord = {
    institute_name: trimmedVal(name, 255),
    email: (trimmedVal(email, 255) || null),
    phone: (trimmedVal(phone, 40) || null),
    service_interested_in: incomingService ? trimmedVal(incomingService, 255) : null,
    message: trimmedVal(body.message || '', 2000),
    created_at: new Date().toISOString()
  };
  console.log('[DEBUG/WRITE-LOCAL] inserting:', JSON.stringify(testRecord));
  const result = await db.from('info_submissions').insert([testRecord]).select('id').limit(1);
  if (result.error) return res.status(500).json({ error: result.error.message });
  return res.json({ success: true, id: result.data?.[0]?.id });
}));

app.post('/api/offer', asyncHandler(async (req, res) => {
  const { email, phone } = req.body;
  if (!email || !phone) return res.status(400).json({ error: 'email, phone required' });
  const result = await db.from('subscribers').insert([{ email, phone }]).select('id').limit(1);
  if (result.error) return res.status(500).json({ error: result.error.message });
  return res.json({ id: result.data?.[0]?.id });
}));

app.post('/api/newsletter', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  const result = await db.from('subscribers').insert([{ email }]).select('id').limit(1);
  if (result.error) return res.status(500).json({ error: result.error.message });
  return res.json({ id: result.data?.[0]?.id });
}));

// Chat endpoint: accepts { message: string } and returns { reply: string }
// Requires `OPENAI_API_KEY` environment variable to be set.
app.post('/api/chat', asyncHandler(async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message required' });
  }

  // Load optional knowledge file (site/founder/team) to include in system prompt.
  let knowledge = '';
  try {
    if (fs.existsSync('chatbot_knowledge.json')) {
      knowledge = fs.readFileSync('chatbot_knowledge.json', 'utf8');
    }
  } catch (e) {
    console.warn('[CHAT] Could not read chatbot_knowledge.json', e && e.message ? e.message : e);
  }

  const systemPromptBase = `You are Dot TechMantra's helpful website assistant. Use the knowledge provided below to answer user queries concisely and helpfully. If the user asks for multi-step guidance, follow the guided steps in order when prompted with the word 'next'.\n\nKnowledge:\n${knowledge}`.slice(0, 25000);

  // Provider selection: prefer explicit AI_PROVIDER env var. If not set, prefer Anthropic when ANTHROPIC_API_KEY exists.
  const provider = (process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')).toLowerCase();

  try {
    if (provider === 'anthropic') {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

      // Model name can be set via env; default suggested name for your request
      const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-haiku-4.5';
      const anthropicUrl = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/complete';

      // Build a prompt in a simple conversational form. Adjust if your Anthropic integration expects a different format.
      const prompt = `\n\nHuman: ${message}\n\nAssistant:`;

      const body = {
        model: anthropicModel,
        prompt: systemPromptBase + prompt,
        max_tokens_to_sample: 800,
        temperature: 0.2
      };

      const resp = await fetch(anthropicUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'Authorization': `Bearer ${anthropicKey}`
        },
        body: JSON.stringify(body)
      });

      const data = await resp.json();
      if (!resp.ok) {
        console.error('[CHAT][ANTHROPIC] provider error:', data);
        return res.status(500).json({ error: 'Anthropic provider error', details: data });
      }

      // Anthropic responses commonly include `completion` or similar field.
      const reply = data.completion || data.output || data.text || (data.choices && data.choices[0] && (data.choices[0].text || data.choices[0].completion)) || '';
      return res.json({ reply: String(reply) });
    }

    // Default: OpenAI-compatible API
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.error('[CHAT] No AI provider key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY)');
      return res.status(500).json({ error: 'AI provider key not configured on server. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.' });
    }

    const payload = {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPromptBase },
        { role: 'user', content: message }
      ],
      max_tokens: 800,
      temperature: 0.2
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error('[CHAT][OPENAI] provider error:', data);
      return res.status(500).json({ error: 'AI provider error', details: data });
    }

    const reply = data.choices && data.choices[0] && (data.choices[0].message?.content || data.choices[0].text) ? (data.choices[0].message?.content || data.choices[0].text) : '';
    return res.json({ reply });
  } catch (err) {
    console.error('[CHAT] Unexpected error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Server error' });
  }
}));

// Admin dump endpoint (protected by ADMIN_TOKEN env var)
// Example: GET /admin/dump?token=YOUR_TOKEN
// Authentication middleware for admin routes. Applies token check for admin/viewer tokens.
function adminAuth(req, res, next) {
  const token = (req.query.token || req.headers['x-admin-token'] || (req.body && req.body.token) || '').toString().trim();
  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  const wantsJson = req.headers.accept && req.headers.accept.indexOf('application/json') !== -1;

  console.log('[ADMIN_AUTH] token received:', JSON.stringify(token), 'admin configured:', Boolean(adminToken));

  if (!adminToken) {
    if (wantsJson) return res.status(403).json({ error: 'Admin token not configured on server' });
    return res.status(403).send('<h2>Admin token not configured on server</h2>');
  }

  const isAdmin = token === adminToken;
  const isViewer = viewerTokens.map(t => t.trim()).includes(token);
  if (!token || (!isAdmin && !isViewer)) {
    console.warn('[ADMIN_AUTH] Invalid token attempt. Received:', JSON.stringify(token), '| Expected:', JSON.stringify(adminToken), '| Viewers:', JSON.stringify(viewerTokens));
    if (wantsJson) return res.status(401).json({ error: 'Invalid token' });
    return res.send(`
      <html><head><title>Admin Login</title></head><body style="font-family:sans-serif;max-width:400px;margin:40px auto;">
        <h2>Admin Login</h2>
        <form method="GET" action="/admin/dump">
          <input type="password" name="token" placeholder="Admin or Viewer Token" style="width:100%;padding:8px;margin-bottom:10px;" />
          <button type="submit" style="padding:8px 16px;">Login</button>
        </form>
      </body></html>
    `);
  }

  req.userRole = isAdmin ? 'admin' : 'viewer';
  next();
}

app.get('/admin/dump', adminAuth, async (req, res) => {
  const userRole = req.userRole || 'viewer';
  const wantsJson = req.headers.accept && req.headers.accept.indexOf('application/json') !== -1;
  try {
    // Attempt to fetch tables, but recover if Supabase is unreachable so the admin UI can still load.
    let info_submissions = [];
    let subscribers = [];
    let fetchErrors = [];
    try {
      const { data, error } = await db.from('info_submissions').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) {
        console.error('Database error fetching info_submissions:', error);
        fetchErrors.push('info_submissions');
      } else {
        info_submissions = data || [];
      }
    } catch (e) {
      console.error('Unexpected error fetching info_submissions:', e && e.message);
      fetchErrors.push('info_submissions');
    }

    try {
      const { data, error } = await db.from('subscribers').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) {
        console.error('Database error fetching subscribers:', error);
        fetchErrors.push('subscribers');
      } else {
        subscribers = data || [];
      }
    } catch (e) {
      console.error('Unexpected error fetching subscribers:', e && e.message);
      fetchErrors.push('subscribers');
    }

    if (wantsJson) {
      // Add role to response and include a lightweight fetchErrors array so the client can show a message
      return res.json({ info_submissions, subscribers, role: userRole, fetchErrors });
    }

    // Otherwise, render the HTML dashboard
    res.send(`
      <html><head><title>Admin Data Dump</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; background: #f8fafc; color: #222; }
        .dashboard-container { max-width: 1200px; margin: 0 auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 12px #0001; padding: 24px; }
        table { border-collapse: collapse; margin-bottom: 32px; width: 100%; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px #0001; }
        th, td { border: 1px solid #e5e7eb; padding: 8px 12px; }
        th { background: #f1f5f9; position: sticky; top: 0; z-index: 2; }
        tr:nth-child(even) { background: #f9fafb; }
        tr:hover { background: #f1f5f9; }
        h1 { margin-bottom: 16px; }
        h2 { margin-top: 40px; margin-bottom: 12px; }
        .logout { float: right; background: #f87171; color: #fff; border: none; border-radius: 4px; padding: 6px 16px; cursor: pointer; transition: background 0.2s; }
        .logout:hover { background: #dc2626; }
        button, input[type='submit'] { background: #2563eb; color: #fff; border: none; border-radius: 4px; padding: 6px 14px; cursor: pointer; margin: 2px 0; transition: background 0.2s; }
        button:hover, input[type='submit']:hover { background: #1d4ed8; }
        form { display: inline; }
        @media (max-width: 800px) {
          .dashboard-container { padding: 8px; }
          table, th, td { font-size: 13px; }
        }
        @media (max-width: 500px) {
          table, th, td { font-size: 11px; }
          h1, h2 { font-size: 1.1em; }
        }
      </style></head><body>
        <div class="dashboard-container">
        <h1>Admin Data Dump <button onclick="logoutAdmin()" class="logout">Logout</button></h1>
        <h2>Info Submissions (${info_submissions.length})</h2>
        ${info_submissions.length === 0 ? '<em>No info submissions.</em>' : tableHtml(info_submissions)}
        <h2>Subscribers (${subscribers.length})</h2>
        ${subscribers.length === 0 ? '<em>No subscribers.</em>' : tableHtml(subscribers)}
        </div>
        <script>
          function logoutAdmin() {
            // Remove token from URL and reload to show login form
            window.location.href = '/admin/dump';
          }
        </script>
      </body></html>
    `);
  } catch (err) {
    console.error('Supabase dump error:', err);
    if (req.accepts('json')) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(500).send('<h2>Database error</h2>');
  }
});

// Debug endpoint to echo token parsing and comparison (temporary, safe for local dev)
app.get('/admin/echo', adminAuth, (req, res) => {
  const token = (req.query.token || req.headers['x-admin-token'] || '').trim();
  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  const isAdmin = token === adminToken;
  const isViewer = viewerTokens.map(t => t.trim()).includes(token);
  return res.json({ received: token, expected: adminToken ? adminToken.replace(/./g, '*') : '', isAdmin, isViewer, viewerTokens });
});

// Admin POST helpers (delete/edit) - these routes expect a token in the form body
app.post('/admin/delete/:table/:id', adminAuth, async (req, res) => {
  const { table, id } = req.params;
  try {
    const { error } = await db.from(table).delete().eq('id', parseInt(id));
    if (error) return res.status(500).send('Database error');
    return res.redirect('/admin/dump?token=' + encodeURIComponent(req.body.token || req.query.token || ''));
  } catch (err) {
    console.error('Admin delete error:', err);
    return res.status(500).send('Server error');
  }
});

app.post('/admin/edit/:table/:id', adminAuth, async (req, res) => {
  const { table, id } = req.params;
  const updates = Object.assign({}, req.body);
  delete updates.token;
  try {
    const { error } = await db.from(table).update(updates).eq('id', parseInt(id));
    if (error) return res.status(500).send('Database error');
    return res.redirect('/admin/dump?token=' + encodeURIComponent(req.body.token || req.query.token || ''));
  } catch (err) {
    console.error('Admin edit error:', err);
    return res.status(500).send('Server error');
  }
});

// Helper to render array of objects as HTML table
function tableHtml(rows) {
  if (!rows || rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const isInfo = cols.includes('institute_name');
  const isSubs = cols.includes('email') && !isInfo;
  return `<table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}${(isInfo||isSubs) ? '<th>Action</th>' : ''}</tr></thead><tbody>` +
    rows.map(r => `<tr id='row-${r.id}'>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('')}
      ${isInfo ? `<td>
        <form method='POST' action='/admin/delete/info_submissions/${r.id}' style='display:inline' onsubmit='return confirm(\"Delete this record?\")'>
          <input type='hidden' name='token' value='${escapeHtml(process.env.ADMIN_TOKEN || '')}' />
          <button type='submit' style='color:red;'>Delete</button>
        </form>
        <button onclick='showEditForm(${r.id})' style='margin-left:8px;'>Edit</button>
        <form id='edit-form-${r.id}' method='POST' action='/admin/edit/info_submissions/${r.id}' style='display:none;margin-top:8px;'>
          <input type='hidden' name='token' value='${escapeHtml(process.env.ADMIN_TOKEN || '')}' />
          ${cols.filter(c=>c!=='id').map(c=>`<input name='${c}' value='${escapeHtml(r[c])}' placeholder='${c}' style='margin:2px;width:120px;' />`).join('')}<button type='submit'>Save</button>
        </form>
      </td>` : ''}
      ${isSubs ? `<td>
        <form method='POST' action='/admin/delete/subscribers/${r.id}' style='display:inline' onsubmit='return confirm(\"Delete this subscriber?\")'>
          <input type='hidden' name='token' value='${escapeHtml(process.env.ADMIN_TOKEN || '')}' />
          <button type='submit' style='color:red;'>Delete</button>
        </form>
        <button onclick='showEditFormSubs(${r.id})' style='margin-left:8px;'>Edit</button>
        <form id='edit-form-subs-${r.id}' method='POST' action='/admin/edit/subscribers/${r.id}' style='display:none;margin-top:8px;'>
          <input type='hidden' name='token' value='${escapeHtml(process.env.ADMIN_TOKEN || '')}' />
          <input name='email' value='${escapeHtml(r.email)}' placeholder='email' style='margin:2px;width:180px;' />
          <button type='submit'>Save</button>
        </form>
      </td>` : ''}
    </tr>`).join('') +
    '</tbody></table>' +
    `<script>
      function showEditForm(id) {
        document.getElementById('edit-form-' + id).style.display = 'block';
      }
      function showEditFormSubs(id) {
        document.getElementById('edit-form-subs-' + id).style.display = 'block';
      }
    </script>`;
}
function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Start the server
// Bind explicitly to localhost IPv4 to avoid IPv6/IPv4 mismatch on some Windows setups
const LISTEN_HOST = process.env.HOST || '127.0.0.1';
const server = app.listen(PORT, LISTEN_HOST, () => {
  const addr = server.address();
  // addr may be a string when listening on a pipe, or object {address,port,family}
  if (addr && typeof addr === 'object') {
    console.log(`Server bound -> address: ${addr.address}, port: ${addr.port}, family: ${addr.family}`);
  } else {
    console.log('Server bound (address info):', addr);
  }
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
});

app.get('/', (req, res) => res.redirect('/health'));

// Global Express error handler to capture unexpected errors in routes
app.use((err, req, res, next) => {
  try {
    console.error('Express error handler caught:', err && err.stack ? err.stack : err);
  } catch (e) {
    console.error('Error while logging Express error handler:', e && e.stack ? e.stack : e);
  }
  if (!res.headersSent) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Internal self-check: try to GET /health from the same Node process to verify request handling
try {
  const http = require('http');
  setTimeout(() => {
    const req = http.get({ hostname: '127.0.0.1', port: PORT, path: '/health', timeout: 2000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => body += c);
      res.on('end', () => {
        console.log('[SELF-CHECK] status', res.statusCode, 'body', body);
      });
    });
    req.on('error', (err) => {
      console.warn('[SELF-CHECK] request error:', err && err.message);
    });
    req.on('timeout', () => {
      console.warn('[SELF-CHECK] request timed out');
      req.abort();
    });
  }, 200);
} catch (e) {
  console.warn('Self-check setup failed:', e && e.message);
}

// Final Express error handler
app.use((err, req, res, next) => {
  console.error('[FINAL_ERROR_HANDLER]', err && err.stack ? err.stack : err);
  if (!res.headersSent) {
    res.status(500).json({ error: err && err.message ? err.message : 'Server error' });
  }
});
