/**
 * Symmetric encryption using AES-256-GCM.
 * Key is derived from SECURITY_KEY env variable via SHA-256 to ensure 32-byte length.
 * Encrypted format stored as: "GCM:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGO = 'aes-256-gcm';
const TAG_LENGTH = 16;
const TOKEN_PATH = path.join(__dirname, '..', '.config', 'SECURITY_TOKEN');

function getKey() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(`SECURITY_TOKEN file not found at ${TOKEN_PATH}. Please create it with your secret key.`);
  }
  const raw = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
  if (!raw) throw new Error('SECURITY_TOKEN is empty');

  // Derive a consistent 32-byte key using SHA-256
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string} - prefixed encrypted string
 */
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `GCM:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a string created by encrypt().
 * @param {string} encryptedStr
 * @returns {string} - original plaintext
 */
function decrypt(encryptedStr) {
  if (!encryptedStr.startsWith('GCM:')) {
    // Not encrypted — return as-is (allows migration from plain passwords)
    return encryptedStr;
  }
  const [, ivHex, tagHex, dataHex] = encryptedStr.split(':');
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };
