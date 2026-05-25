import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read arguments
const args = process.argv.slice(2);
const vpsIp = args[0] || '138.124.53.29';
const vpsPassword = args[1] || 'dRBT4SEJ0Za6';
const botToken = args[2] || '123456789:AABBCCDDEEFFgg-hhiijjkkllmmnnooppqq'; // default placeholder if they haven't sent it yet

console.log('🚀 AUTOMATED VPS DEPLOYMENT FOR CHOSEEVPN');
console.log('-----------------------------------------');
console.log(`📡 Server IP: ${vpsIp}`);
console.log(`🔑 Username: root`);
console.log(`🤖 Bot Token: ${botToken.substring(0, 10)}... (hidden)`);
console.log('⏳ Connecting to VPS via SSH...');

const conn = new Client();

conn.on('ready', () => {
  console.log('✅ SSH Connection established successfully!');
  console.log('⚙️ Starting automated installation of 3X-UI and VLESS-Reality configuration on your VPS...');
  console.log('⏳ This will take about 1-2 minutes. Please wait...\n');

  let stdoutData = '';

  const shellCommand = `
# Stop ufw if active to prevent locks, or allow port 2053 and 443
if command -v ufw >/dev/null 2>&1; then
  ufw allow 2053/tcp
  ufw allow 443/tcp
  ufw reload
fi

# Install curl, sqlite3, openssl
apt-get update && apt-get install -y curl sqlite3 openssl

# Non-interactive 3X-UI installation
echo "n" | bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh)

# Stop service to modify SQLite DB safely
systemctl stop x-ui

# Find DB path
DB_PATH=""
if [ -f "/etc/x-ui-yu/x-ui.db" ]; then
  DB_PATH="/etc/x-ui-yu/x-ui.db"
elif [ -f "/etc/x-ui/x-ui.db" ]; then
  DB_PATH="/etc/x-ui/x-ui.db"
else
  mkdir -p /etc/x-ui-yu
  DB_PATH="/etc/x-ui-yu/x-ui.db"
fi

# Generate Reality Keys
XRAY_PATH="/usr/local/x-ui/bin/xray"
KEYS=$($XRAY_PATH x25519)
PRIVATE_KEY=$(echo "$KEYS" | grep "Private key:" | cut -d' ' -f3)
PUBLIC_KEY=$(echo "$KEYS" | grep "Public key:" | cut -d' ' -f3)
SHORT_ID=$(openssl rand -hex 4)

# Create random secure credentials
PANEL_USER="admin_chosee"
PANEL_PASS=$(openssl rand -base64 9 | tr -d '/+=')

# Setup clean database VLESS-Reality Inbound
sqlite3 $DB_PATH "DELETE FROM inbounds WHERE id = 1;"
sqlite3 $DB_PATH "DELETE FROM inbounds WHERE port = 443;"

sqlite3 $DB_PATH "INSERT INTO inbounds (id, user_id, up, down, total, remark, enable, expiry_time, listen, port, protocol, settings, stream_settings, tag, sniffing) VALUES (1, 0, 0, 0, 0, 'Chosee-Reality', 1, 0, '', 443, 'vless', '{\\"clients\\":[],\\"decryption\\":\\"none\\",\\"fallbacks\\":[]}', '{\\"network\\":\\"tcp\\",\\"security\\":\\"reality\\",\\"realitySettings\\":{\\"show\\":false,\\"xver\\":0,\\"dest\\":\\"microsoft.com:443\\",\\"type\\":\\"chrome\\",\\"serverNames\\":[\\"microsoft.com\\",\\"www.microsoft.com\\"],\\"privateKey\\":\\"$PRIVATE_KEY\\",\\"minClient\\":\\"\\",\\"maxClient\\":\\"\\",\\"publicKey\\":\\"$PUBLIC_KEY\\",\\"shortIds\\":[\\"$SHORT_ID\\"]}}', 'inbound-443', '{\\"enabled\\":true,\\"destOverride\\":[\\"http\\",\\"tls\\",\\"quic\\"]}');"

# Update admin credentials in database
sqlite3 $DB_PATH "UPDATE users SET username = '$PANEL_USER', password = '$PANEL_PASS' WHERE id = 1;"

# Start service
systemctl start x-ui

# Output result JSON safely
echo "===DEPLOYSUMMARY==="
echo "{\\"username\\":\\"$PANEL_USER\\",\\"password\\":\\"$PANEL_PASS\\",\\"public_key\\":\\"$PUBLIC_KEY\\",\\"short_id\\":\\"$SHORT_ID\\"}"
echo "===DEPLOYSUMMARY==="
`;

  conn.exec(shellCommand, (err, stream) => {
    if (err) {
      console.error('❌ Failed to execute deployment script on VPS:', err.message);
      conn.end();
      process.exit(1);
    }

    stream.on('close', (code, signal) => {
      conn.end();
      console.log('✅ Remote execution completed!');
      parseAndConfigure(stdoutData);
    }).on('data', (data) => {
      stdoutData += data.toString();
      // Print installation ticks to console to show life
      if (data.toString().includes('Installing') || data.toString().includes('installed') || data.toString().includes('x-ui')) {
        process.stdout.write('⏳ ');
      }
    }).stderr.on('data', (data) => {
      // Ignore apt-get warnings, keep screen clean
    });
  });
}).on('error', (err) => {
  console.error('\n❌ SSH Connection Error:', err.message);
  console.error('Please check your IP and Root Password, and verify your VPS is turned on.');
  process.exit(1);
}).connect({
  host: vpsIp,
  port: 22,
  username: 'root',
  password: vpsPassword,
  readyTimeout: 30000
});

function parseAndConfigure(output) {
  try {
    const summaryMatch = output.match(/===DEPLOYSUMMARY===([\s\S]*?)===DEPLOYSUMMARY===/);
    if (!summaryMatch) {
      throw new Error('Could not find deployment summary markers in the VPS output.');
    }

    const vpsDetails = JSON.parse(summaryMatch[1].trim());
    console.log('\n\n✅ CONFIGURING LOCAL BOT ENVIRONMENT...');

    // Assemble new .env file content
    const envContent = `# Telegram Bot Settings
TELEGRAM_BOT_TOKEN=${botToken}

# Express Server Settings
PORT=3000

# 3X-UI Panel Settings (VPS)
XUI_PANEL_URL=http://${vpsIp}:2053
XUI_USERNAME=${vpsDetails.username}
XUI_PASSWORD=${vpsDetails.password}
XUI_INBOUND_ID=1

# Environment Mode
MOCK_MODE=false
`;

    // Write new .env file
    fs.writeFileSync(path.join(__dirname, '.env'), envContent);
    console.log('✅ Updated local .env file with active VPS parameters!');

    console.log('\n🎉 ===================================================');
    console.log('🎉 VPS DEPLOYMENT & BOT LIVE CONFIGURATION SUCCESSFUL!');
    console.log('======================================================');
    console.log(`🌐 3X-UI Panel URL:   http://${vpsIp}:2053`);
    console.log(`👤 Admin Username:   ${vpsDetails.username}`);
    console.log(`🔑 Admin Password:   ${vpsDetails.password}`);
    console.log(`📡 Inbound protocol: VLESS-Reality (Port: 443)`);
    console.log(`🛡️ Reality Public Key: ${vpsDetails.public_key}`);
    console.log(`🛡️ Reality Short ID:   ${vpsDetails.short_id}`);
    console.log('------------------------------------------------------');
    console.log('🚀 Бот переведен в РАБОЧИЙ режим (MOCK_MODE отключен)!');
    console.log('👉 Чтобы запустить бота, введите: npm start');
    console.log('======================================================\n');

  } catch (error) {
    console.error('❌ Failed to parse configuration payload from VPS:', error.message);
    console.log('\nVPS Output dump for diagnostic:');
    console.log(output);
    process.exit(1);
  }
}
