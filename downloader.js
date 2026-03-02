const Client = require('ssh2-sftp-client');
const { Client: SSHClient } = require('ssh2'); // Used to run commands
const path = require('path');
const fs = require('fs');

// Helper to run chown via SSH before downloading
async function fixRemotePermissions(sftpConfig, remotePath) {
  return new Promise((resolve) => {
    const conn = new SSHClient();
    conn.on('ready', () => {
      const cmd = `echo '${sftpConfig.password}' | sudo -S chown -R ${sftpConfig.username}:${sftpConfig.username} ${remotePath} && sudo chmod -R 755 ${remotePath}`;
      console.log(`[SSH] Running permission fix on ${remotePath}...`);

      conn.exec(cmd, (err, stream) => {
        if (err) { conn.end(); return resolve(); }

        stream.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) console.log(`[SSH stdout]: ${msg}`);
        }).stderr.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) console.log(`[SSH stderr]: ${msg}`);
        });

        stream.on('close', (code) => {
          conn.end();
          if (code !== 0) {
            console.log(`[SSH] chown exited code ${code} — some paths may be unreadable (corrupt SD card), continuing anyway.`);
          } else {
            console.log(`[SSH] Permissions updated successfully.`);
          }
          resolve();
        });
      });
    }).on('error', (err) => {
      console.error(`[SSH Error]:`, err.message);
      resolve();
    }).connect(sftpConfig);
  });
}

// Recursive download — rsync-style: skip unchanged, log per-file errors, show progress
async function downloadRecursive(sftp, remoteDir, localDir, stats) {
  let items;
  try {
    items = await sftp.list(remoteDir);
  } catch (err) {
    console.error(`[Skip Dir] Cannot list "${remoteDir}": ${err.message}`);
    stats.skipped++;
    return;
  }

  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  const files = items.filter(i => i.type !== 'd');
  const dirs = items.filter(i => i.type === 'd');
  console.log(`[Scan] ${remoteDir}  (${files.length} files, ${dirs.length} dirs)`);

  for (const item of items) {
    const remoteSrc = `${remoteDir}/${item.name}`;
    const localDest = path.join(localDir, item.name);

    if (item.type === 'd') {
      await downloadRecursive(sftp, remoteSrc, localDest, stats);
    } else {
      // rsync: skip if local file exists with same size & mtime
      if (fs.existsSync(localDest)) {
        const localStat = fs.statSync(localDest);
        if (localStat.size === item.size && localStat.mtimeMs >= item.modifyTime) {
          stats.same++;
          // Show periodic progress so UI feels alive
          if ((stats.same + stats.downloaded + stats.skipped) % 20 === 0) {
            console.log(`[Progress] Checked: ${stats.same + stats.downloaded + stats.skipped} | New/Updated: ${stats.downloaded} | Unchanged: ${stats.same} | Error: ${stats.skipped}`);
          }
          continue;
        }
      }

      // Download new or modified file
      try {
        await sftp.fastGet(remoteSrc, localDest);
        stats.downloaded++;
        console.log(`[Download] ${item.name}  (${(item.size / 1024).toFixed(1)} KB)  → ${localDest}`);
      } catch (fileErr) {
        stats.skipped++;
        console.error(`[Skip] "${item.name}": ${fileErr.message}`);
      }
    }
  }
}

async function downloadFiles(config) {
  const sftp = new Client();

  sftp.on('error', (err) => {
    console.error('[SFTP Client Error]:', err.message);
  });

  const remotePath = '/media/pi/sdcard';

  const localDirName = config.LOCAL_DIR || 'data';
  const localPath = path.isAbsolute(localDirName)
    ? localDirName
    : path.join(__dirname, localDirName);

  try {
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    const sftpConfig = {
      host: config.SFTP_HOST,
      port: 22,
      username: 'pi',
      password: 'primus'
    };

    // Step 1: Fix permissions
    await fixRemotePermissions(sftpConfig, remotePath);

    // Step 2: Connect SFTP
    console.log(`[Downloader] Connecting to ${sftpConfig.host}...`);
    await sftp.connect(sftpConfig);
    console.log(`[Downloader] Connected. Starting download: ${remotePath} → ${localPath}`);

    // Step 3: Custom recursive download (rsync-style: only new or modified)
    const stats = { downloaded: 0, skipped: 0, same: 0 };
    await downloadRecursive(sftp, remotePath, localPath, stats);

    console.log(`[Downloader] Done! Downloaded: ${stats.downloaded}, Up-to-date: ${stats.same}, Skipped (errors): ${stats.skipped}`);
    return { success: true, message: `Sync complete. New/Updated: ${stats.downloaded}, Unchanged: ${stats.same}, Skipped: ${stats.skipped}` };

  } catch (err) {
    console.error('[Downloader Error]:', err.message);
    throw new Error(err.message);
  } finally {
    sftp.end();
  }
}

module.exports = { downloadFiles };
