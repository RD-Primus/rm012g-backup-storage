const { Client: SSHClient } = require('ssh2');

/**
 * Connect via SSH and run sudo chown/chmod on the remote path.
 * Resolves regardless of outcome so SFTP can still be attempted.
 */
function fixRemotePermissions(sftpConfig, remotePath) {
  return new Promise((resolve) => {
    const conn = new SSHClient();
    conn.on('ready', () => {
      const cmd = `echo '${sftpConfig.password}' | sudo -S chown -R ${sftpConfig.username}:${sftpConfig.username} ${remotePath} && sudo chmod -R 755 ${remotePath}`;
      console.log(`[SSH] Running permission fix on ${remotePath}...`);

      conn.exec(cmd, (err, stream) => {
        if (err) { conn.end(); return resolve(); }

        stream.on('data', d => { const m = d.toString().trim(); if (m) console.log(`[SSH stdout]: ${m}`); });
        stream.stderr.on('data', d => { const m = d.toString().trim(); if (m) console.log(`[SSH stderr]: ${m}`); });
        stream.on('close', code => {
          conn.end();
          if (code === 0) console.log('[SSH] Permissions updated.');
          else console.log(`[SSH] chown exited code ${code} — some paths may be unreadable (corrupt SD card).`);
          resolve();
        });
      });
    }).on('error', err => {
      console.error('[SSH Error]:', err.message);
      resolve();
    }).connect(sftpConfig);
  });
}

module.exports = { fixRemotePermissions };
