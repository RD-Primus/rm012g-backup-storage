const fs = require('fs');
const path = require('path');
const { decrypt } = require('./crypto');

const CLIENTS_PATH = path.join(__dirname, '..', '.config', 'clients.json');
const CREDENTIALS_PATH = path.join(__dirname, '..', '.config', 'credentials');

function readClients() {
  if (!fs.existsSync(CLIENTS_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(CLIENTS_PATH, 'utf-8')); }
  catch { return []; }
}

function writeClients(clients) {
  const dir = path.dirname(CLIENTS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLIENTS_PATH, JSON.stringify(clients, null, 2));
}

function readCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`credentials not found. Copy credentials.example → credentials and run: node scripts/encrypt-password.js`);
  }
  let content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8').trim();

  // If the entire file is encrypted, decrypt it first
  if (content.startsWith('GCM:')) {
    content = decrypt(content);
  }

  const raw = JSON.parse(content);
  // Support legacy format where only password was encrypted
  if (raw.password && raw.password.startsWith('GCM:')) {
    return { ...raw, password: decrypt(raw.password) };
  }
  return raw;
}

module.exports = { readClients, writeClients, readCredentials };
