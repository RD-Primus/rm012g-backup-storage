/**
 * Setup script — encrypts your plain password and saves it into config/credentials.
 * Run once: node scripts/encrypt-password.js
 * Requires SECURITY_TOKEN to be present in .config
 */

const fs = require('fs');
const path = require('path');
const { encrypt } = require('../src/crypto');
const readline = require('readline');

const CREDENTIALS_PATH = path.join(__dirname, '..', '.config', 'credentials');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q) { return new Promise(res => rl.question(q, res)); }

(async () => {
  console.log('=== SFTP Credentials Encryptor ===\n');

  const existing = fs.existsSync(CREDENTIALS_PATH)
    ? JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'))
    : {};

  const username = await ask(`Username [${existing.username || ''}]: `) || existing.username || '';
  const password = await ask('Password (plain, will be encrypted): ');
  const port = await ask(`Port [${existing.port || 22}]: `) || (existing.port || 22);

  rl.close();

  if (!password) { console.error('❌ Password cannot be empty.'); process.exit(1); }

  const creds = { username, password, port: parseInt(port, 10) };

  // Encrypt the entire object as a single string
  const encryptedFileContent = encrypt(JSON.stringify(creds));

  fs.writeFileSync(CREDENTIALS_PATH, encryptedFileContent);
  console.log('\n✅ credentials updated. The entire file is now encrypted.');
  console.log('   Keep SECURITY_KEY safe — without it the file cannot be decrypted.');
})();
