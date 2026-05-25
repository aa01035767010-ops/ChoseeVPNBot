import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read arguments or file
const args = process.argv.slice(2);
let sftpHost = args[0];
let sftpPort = parseInt(args[1] || '2022', 10);
let sftpUser = args[2];
let sftpPassword = args[3];

if (!sftpHost || !sftpUser || !sftpPassword) {
  // Try to load from credentials file
  const credPath = path.join(__dirname, 'bothost-credentials.json');
  if (fs.existsSync(credPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      sftpHost = creds.host || creds.ip;
      sftpPort = parseInt(creds.port || '2022', 10);
      sftpUser = creds.username || creds.user;
      sftpPassword = creds.password;
    } catch (e) {
      console.error('❌ Failed to parse bothost-credentials.json:', e.message);
    }
  }
}

if (!sftpHost || !sftpUser || !sftpPassword) {
  console.error('❌ Bothost SFTP details are missing!');
  console.log('Usage: node deploy-bothost.js <host> <port> <username> <password>');
  console.log('Or create a "bothost-credentials.json" file in the project folder.');
  process.exit(1);
}

console.log('🚀 AUTOMATED DEPLOYMENT TO BOTHOST.RU');
console.log('-------------------------------------');
console.log(`📡 SFTP Host: ${sftpHost}`);
console.log(`🔌 SFTP Port: ${sftpPort}`);
console.log(`👤 Username:  ${sftpUser}`);
console.log('⏳ Connecting to Bothost server...');

const conn = new Client();

conn.on('ready', () => {
  console.log('✅ Connected to Bothost SFTP server!');
  
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('❌ Failed to start SFTP session:', err.message);
      conn.end();
      process.exit(1);
    }

    // List of files to upload in root
    const filesToUpload = [
      'server.js',
      'config.js',
      'database.js',
      'xui.js',
      'package.json',
      '.env'
    ];

    // Ensure remote public/ directory exists and upload files inside
    console.log('📂 Creating remote public/ directory...');
    sftp.mkdir('public', (mkdirErr) => {
      // Ignore if directory already exists
      
      const uploadQueue = [];

      // Add root files to upload queue
      filesToUpload.forEach(file => {
        const localPath = path.join(__dirname, file);
        if (fs.existsSync(localPath)) {
          uploadQueue.push({
            local: localPath,
            remote: file,
            name: file
          });
        }
      });

      // Add public files to upload queue
      const publicFiles = ['index.html', 'style.css', 'app.js'];
      publicFiles.forEach(file => {
        const localPath = path.join(__dirname, 'public', file);
        if (fs.existsSync(localPath)) {
          uploadQueue.push({
            local: localPath,
            remote: `public/${file}`,
            name: `public/${file}`
          });
        }
      });

      let completed = 0;
      const total = uploadQueue.length;

      console.log(`📡 Starting upload of ${total} project files...`);

      function uploadNext() {
        if (uploadQueue.length === 0) {
          console.log('\n✅ ALL FILES SUCCESSFULLY UPLOADED!');
          console.log('----------------------------------------------------');
          console.log('🚀 Bothost server successfully updated!');
          console.log('👉 Go to bothost.ru panel ➔ Console ➔ Click START.');
          console.log('   The hosting will automatically install packages and run.');
          console.log('====================================================\n');
          conn.end();
          process.exit(0);
          return;
        }

        const task = uploadQueue.shift();
        process.stdout.write(`⏳ Uploading [${++completed}/${total}]: ${task.name}... `);

        sftp.fastPut(task.local, task.remote, (putErr) => {
          if (putErr) {
            console.log('❌ FAILED!');
            console.error(`   Error details: ${putErr.message}`);
            conn.end();
            process.exit(1);
          }
          console.log('✅ OK');
          uploadNext();
        });
      }

      uploadNext();
    });
  });
}).on('error', (err) => {
  console.error('\n❌ SFTP Connection Error:', err.message);
  console.error('Please check your Bothost SFTP host, port, and password credentials.');
  process.exit(1);
}).connect({
  host: sftpHost,
  port: sftpPort,
  username: sftpUser,
  password: sftpPassword,
  readyTimeout: 20000
});
