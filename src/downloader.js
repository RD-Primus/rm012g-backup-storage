const SFTPClient = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
const { fixRemotePermissions } = require('./ssh');
const { logEmitter } = require('./logger');

async function countFiles(sftp, remoteDir) {
  let count = 0;
  try {
    const items = await sftp.list(remoteDir);
    for (const item of items) {
      if (item.type === 'd') {
        count += await countFiles(sftp, `${remoteDir}/${item.name}`);
      } else {
        count++;
      }
    }
  } catch (err) { }
  return count;
}

function emitProgress(stats) {
  const current = stats.downloaded + stats.same + stats.skipped;
  if (stats.total > 0) {
    const percent = Math.floor((current / stats.total) * 100);
    logEmitter.emit('progress', { ...stats, current, percent });
  }
}


/**
 * Recursively download remoteDir → localDir, skipping up-to-date files (rsync-style).
 * Each file is tried individually so corrupted files don't stop the rest.
 */
async function downloadRecursive(sftp, remoteDir, localDir, stats) {
  let items;
  try {
    items = await sftp.list(remoteDir);
  } catch (err) {
    console.error(`[Skip Dir] Cannot list "${remoteDir}": ${err.message}`);
    stats.skipped++;
    return;
  }

  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

  const files = items.filter(i => i.type !== 'd');
  const dirs = items.filter(i => i.type === 'd');
  console.log(`[Scan] ${remoteDir}  (${files.length} files, ${dirs.length} dirs)`);

  for (const item of items) {
    const remoteSrc = `${remoteDir}/${item.name}`;
    const localDest = path.join(localDir, item.name);

    if (item.type === 'd') {
      await downloadRecursive(sftp, remoteSrc, localDest, stats);
    } else {
      // rsync: skip if local file matches size & mtime
      if (fs.existsSync(localDest)) {
        const localStat = fs.statSync(localDest);
        if (localStat.size === item.size && localStat.mtimeMs >= item.modifyTime) {
          stats.same++;
          emitProgress(stats);
          if ((stats.same + stats.downloaded + stats.skipped) % 20 === 0) {
            console.log(`[Progress] Checked: ${stats.same + stats.downloaded + stats.skipped} | New: ${stats.downloaded} | Same: ${stats.same} | Error: ${stats.skipped}`);
          }
          continue;
        }
      }

      try {
        await sftp.fastGet(remoteSrc, localDest);
        stats.downloaded++;
        emitProgress(stats);
        console.log(`[Download] ${item.name}  (${(item.size / 1024).toFixed(1)} KB)`);
      } catch (fileErr) {
        stats.skipped++;
        emitProgress(stats);
        console.error(`[Skip] "${item.name}": ${fileErr.message}`);
      }
    }
  }
}

/**
 * Main entry point called by the scheduler or API.
 * @param {object} client - { host, localDir, remotePath }
 * @param {object} credentials - { username, password, port }
 */
async function downloadFiles(client, credentials) {
  const sftp = new SFTPClient();
  sftp.on('error', err => console.error('[SFTP Client Error]:', err.message));

  const remotePath = '/media/pi/sdcard';
  const localDirName = client.localDir || 'data';
  const localPath = path.isAbsolute(localDirName)
    ? localDirName
    : path.join(process.cwd(), localDirName);

  const sftpConfig = {
    host: client.host,
    port: credentials.port || 22,
    username: credentials.username,
    password: credentials.password
  };

  try {
    if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });

    // Step 1: SSH permission fix
    await fixRemotePermissions(sftpConfig, remotePath);

    // Step 2: SFTP connect and download
    console.log(`[Downloader] Connecting to ${sftpConfig.host}...`);
    await sftp.connect(sftpConfig);
    console.log(`[Downloader] Connected. Syncing ${remotePath} → ${localPath}`);

    // Scan total files first for progress
    console.log(`[Downloader] Scanning files for ${remotePath}...`);
    const totalFiles = await countFiles(sftp, remotePath);
    console.log(`[Downloader] Found ${totalFiles} total files.`);

    const stats = { downloaded: 0, skipped: 0, same: 0, total: totalFiles, clientId: client.id };
    emitProgress(stats); // initial 0% emit
    await downloadRecursive(sftp, remotePath, localPath, stats);

    console.log(`[Downloader] Done! New: ${stats.downloaded}, Same: ${stats.same}, Skipped: ${stats.skipped}`);
    return { success: true, message: `Sync OK — New: ${stats.downloaded}, Same: ${stats.same}, Skipped: ${stats.skipped}`, stats };

  } catch (err) {
    console.error('[Downloader Error]:', err.message);
    throw err;
  } finally {
    sftp.end();
  }
}

module.exports = { downloadFiles };
