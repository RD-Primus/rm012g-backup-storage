const Client = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

async function main() {
  const sftp = new Client();
  const config = {
    host: process.env.SFTP_HOST || '10.222.1.3',
    port: process.env.SFTP_PORT || 22,
    username: process.env.SFTP_USERNAME || 'pi',
    password: process.env.SFTP_PASSWORD 
    // privateKey: fs.readFileSync(process.env.SFTP_KEY_PATH) // Uncomment if using key
  };

  const remotePath = '/media/pi/sdcaed/csv'; // Verify this path (could it be sdcard?)
  const localPath = path.join(__dirname, 'data');

  try {
    // Create local directory 'data' if it doesn't exist
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    if (!config.password && !config.privateKey) {
      console.warn("WARNING: No SFTP_PASSWORD provided in .env");
    }

    console.log(`Connecting to SFTP server at ${config.host}...`);
    await sftp.connect(config);
    console.log('Connected successfully. Starting download...');

    // Log individual file downloads
    sftp.on('download', info => {
      console.log(`Downloaded ${info.source}`);
    });

    // downloadDir downloads the entire directory recursively
    const result = await sftp.downloadDir(remotePath, localPath);
    console.log('Download completed successfully!');
    console.log(result);

  } catch (err) {
    console.error('An error occurred:', err.message);
  } finally {
    sftp.end();
  }
}

main();
