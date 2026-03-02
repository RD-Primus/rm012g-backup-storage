/**
 * One-shot: encrypts the plain password in credentials using SECURITY_TOKEN
 * Run: node scripts/do-encrypt.js
 */
const fs = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('../src/crypto');

const CRED = path.join(__dirname, '..', '.config', 'credentials');
let raw = fs.readFileSync(CRED, 'utf-8').trim();

if (raw.startsWith('GCM:')) {
  console.log('✅ credentials is already fully encrypted. No changes made.');
} else {
  // Try to parse to ensure it's valid JSON
  const parsed = JSON.parse(raw);

  // If it's the legacy format with only password encrypted, we decrypt it first
  // so the whole file can be encrypted cleanly
  if (parsed.password && parsed.password.startsWith('GCM:')) {
    parsed.password = decrypt(parsed.password);
  }

  // Encrypt the entire JSON string
  const encrypted = encrypt(JSON.stringify(parsed));
  fs.writeFileSync(CRED, encrypted);

  console.log('✅ Entire credentials encrypted successfully!');
  console.log('   Format: GCM:...');
}
