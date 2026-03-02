/**
 * Auth module — user management, password hashing, session tokens.
 * Uses only Node.js built-in `crypto` (no extra deps).
 * Users stored in config/users.json (gitignored).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const USERS_PATH = path.join(__dirname, '..', '.config', 'users.json');
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory session store: { token -> { userId, expiresAt } }
const sessions = new Map();

// ── Helpers ───────────────────────────────────────────────────────

function readUsers() {
  if (!fs.existsSync(USERS_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8')); }
  catch { return []; }
}

function writeUsers(users) {
  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Public API ───────────────────────────────────────────────────

/** True when no users exist (first-run) */
function hasUsers() {
  return readUsers().length > 0;
}

/** Create the first (or any additional) user */
function createUser(username, password) {
  const users = readUsers();
  if (users.find(u => u.username === username)) {
    throw new Error(`User "${username}" already exists.`);
  }
  users.push({ id: crypto.randomUUID(), username, passwordHash: hashPassword(password) });
  writeUsers(users);
}

/** Authenticate creds; returns session token or throws */
function login(username, password) {
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) throw new Error('Invalid username or password.');
  if (!verifyPassword(password, user.passwordHash)) throw new Error('Invalid username or password.');

  const token = generateToken();
  sessions.set(token, { userId: user.id, username: user.username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

/** Validate token from request header; returns session payload or null */
function verifyToken(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) { sessions.delete(token); return null; }
  // Slide expiry on each valid request
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

/** Express middleware — rejects requests without a valid Bearer token */
function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ success: false, message: 'Unauthorized' });
  req.session = session;
  next();
}

function logout(token) {
  sessions.delete(token);
}

module.exports = { hasUsers, createUser, login, logout, requireAuth };
