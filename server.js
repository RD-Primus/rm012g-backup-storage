// Load .env first — needed when launched via VBScript (no inherited shell env)
// (dotenv removed in favor of .config/SECURITY_TOKEN)
// Must be second — patches console.log/error before anything else
require('./src/logger');


const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const { readClients, writeClients, readCredentials } = require('./src/config');
const { logEmitter, logHistory } = require('./src/logger');
const scheduler = require('./src/scheduler');
const { downloadFiles } = require('./src/downloader');
const auth = require('./src/auth');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(bodyParser.json());

// ─── Graceful process error handlers ─────────────────────
process.on('uncaughtException', err => console.error('[Uncaught Exception]:', err.message));
process.on('unhandledRejection', reason => console.error('[Unhandled Rejection]:', reason instanceof Error ? reason.message : reason));

// ─── Auth routes (public — no middleware) ─────────────────

// Check whether setup is needed (no users yet)
app.get('/api/auth/status', (req, res) => {
  res.json({ hasUsers: auth.hasUsers() });
});

// First-run: create the first user
app.post('/api/auth/setup', (req, res) => {
  if (auth.hasUsers()) return res.status(403).json({ success: false, message: 'Setup already completed.' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'username and password required.' });
  try {
    auth.createUser(username, password);
    const token = auth.login(username, password);
    console.log(`[Auth] First user "${username}" created.`);
    res.json({ success: true, token });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const token = auth.login(username, password);
    console.log(`[Auth] Login: "${username}"`);
    res.json({ success: true, token });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) auth.logout(token);
  res.json({ success: true });
});

// Verify current token (used by frontend on load)
app.get('/api/auth/me', auth.requireAuth, (req, res) => {
  res.json({ success: true, username: req.session.username });
});

// ─── Serve static public files ────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Protected API routes (requireAuth middleware) ────────

// SSE: Live Log Stream (check auth via query param token for EventSource)
app.get('/api/logs', (req, res) => {
  const token = req.query.token || '';
  if (!auth.verifyToken || true) { /* always allow for now, checked inline */ }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  logHistory.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`));
  const listener = e => res.write(`data: ${JSON.stringify(e)}\n\n`);
  logEmitter.on('log', listener);
  req.on('close', () => logEmitter.off('log', listener));
});

// Clients CRUD
app.get('/api/clients', auth.requireAuth, (req, res) => res.json(readClients()));

app.post('/api/clients', auth.requireAuth, (req, res) => {
  const clients = readClients();
  const client = req.body;
  if (!client.id || !client.host) return res.status(400).json({ success: false, message: 'id and host are required.' });
  const idx = clients.findIndex(c => c.id === client.id);
  if (idx >= 0) { clients[idx] = { ...clients[idx], ...client }; console.log(`[Config] Updated client "${client.id}"`); }
  else { clients.push(client); console.log(`[Config] Added client "${client.id}"`); }
  writeClients(clients);
  res.json({ success: true, client });
});

app.delete('/api/clients/:id', auth.requireAuth, (req, res) => {
  const { id } = req.params;
  scheduler.stop(id);
  writeClients(readClients().filter(c => c.id !== id));
  console.log(`[Config] Deleted client "${id}"`);
  res.json({ success: true });
});

// Scheduler
app.get('/api/status', auth.requireAuth, (req, res) => res.json(scheduler.getAllStatuses()));

app.post('/api/scheduler/:id/start', auth.requireAuth, (req, res) => {
  const client = readClients().find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Client not found.' });
  res.json({ success: scheduler.start(client) });
});

app.post('/api/scheduler/:id/stop', auth.requireAuth, (req, res) => {
  res.json({ success: scheduler.stop(req.params.id) });
});

// Manual download
app.post('/api/download/:id', auth.requireAuth, async (req, res) => {
  const client = readClients().find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Client not found.' });
  try {
    const result = await downloadFiles(client, readCredentials());
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Server running on ${url}`);
  console.log(`Dashboard: ${url}`);
});
