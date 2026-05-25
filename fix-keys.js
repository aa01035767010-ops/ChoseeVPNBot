import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const conn = new Client();

console.log('🔄 CONNECTING TO VPS TO GENERATE REAL XRAY KEYS AND UPDATE DATABASE...');

conn.on('ready', () => {
  console.log('✅ SSH Connected!');
  
  const cmd = `
# 1. Locate xray binary
XRAY_PATH=$(find /usr/local/x-ui -name "xray*" | grep -v "config" | head -n 1)
if [ -z "$XRAY_PATH" ]; then
  XRAY_PATH=$(which xray)
fi

if [ -z "$XRAY_PATH" ]; then
  echo "❌ Error: xray binary not found on VPS!"
  exit 1
fi

echo "🔍 Found xray binary at: $XRAY_PATH"

# 2. Generate Reality Keys
KEYS=$($XRAY_PATH x25519)
PRIVATE_KEY=$(echo "$KEYS" | grep -i "PrivateKey:" | cut -d' ' -f2)
PUBLIC_KEY=$(echo "$KEYS" | grep -i "PublicKey" | cut -d' ' -f3)
SHORT_ID=$(openssl rand -hex 4)

if [ -z "$PRIVATE_KEY" ] || [ -z "$PUBLIC_KEY" ]; then
  echo "❌ Error: failed to generate Reality keys using $XRAY_PATH!"
  echo "Output was: $KEYS"
  exit 1
fi

echo "🔑 Generated Private Key: $PRIVATE_KEY"
echo "🔑 Generated Public Key: $PUBLIC_KEY"
echo "🔑 Generated Short ID: $SHORT_ID"

# 3. Detect DB Path
DB_PATH=""
if [ -f "/etc/x-ui-yu/x-ui.db" ]; then
  DB_PATH="/etc/x-ui-yu/x-ui.db"
elif [ -f "/etc/x-ui/x-ui.db" ]; then
  DB_PATH="/etc/x-ui/x-ui.db"
fi

echo "📦 Found Database at: $DB_PATH"

# 4. Clean and insert the proper VLESS-Reality inbound
sqlite3 $DB_PATH "DELETE FROM inbounds WHERE id = 1;"
sqlite3 $DB_PATH "DELETE FROM inbounds WHERE port = 443;"

sqlite3 $DB_PATH "INSERT INTO inbounds (id, user_id, up, down, total, remark, enable, expiry_time, listen, port, protocol, settings, stream_settings, tag, sniffing) VALUES (1, 0, 0, 0, 0, 'Chosee-Reality', 1, 0, '', 443, 'vless', '{\\"clients\\":[],\\"decryption\\":\\"none\\",\\"fallbacks\\":[]}', '{\\"network\\":\\"tcp\\",\\"security\\":\\"reality\\",\\"realitySettings\\":{\\"show\\":false,\\"xver\\":0,\\"dest\\":\\"microsoft.com:443\\",\\"type\\":\\"chrome\\",\\"serverNames\\":[\\"microsoft.com\\",\\"www.microsoft.com\\"],\\"privateKey\\":\\"$PRIVATE_KEY\\",\\"minClient\\":\\"\\",\\"maxClient\\":\\"\\",\\"publicKey\\":\\"$PUBLIC_KEY\\",\\"shortIds\\":[\\"$SHORT_ID\\"]}}', 'inbound-443', '{\\"enabled\\":true,\\"destOverride\\":[\\"http\\",\\"tls\\",\\"quic\\"]}');"

# 5. Restart x-ui service
systemctl restart x-ui
echo "✅ Restarted x-ui service!"

# 6. Check status again
sleep 2
systemctl status x-ui --no-pager | grep -A 3 -i "xray"

# Output summary
echo "===FIXSUMMARY==="
echo "{\\"public_key\\":\\"$PUBLIC_KEY\\",\\"short_id\\":\\"$SHORT_ID\\"}"
echo "===FIXSUMMARY==="
`;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let stdout = '';
    stream.on('close', () => {
      console.log('\n=== remote fix results ===');
      console.log(stdout);
      
      // Parse summary
      const match = stdout.match(/===FIXSUMMARY===([\s\S]*?)===FIXSUMMARY===/);
      if (match) {
        const details = JSON.parse(match[1].trim());
        console.log('\n✅ Successfully regenerated keys on VPS!');
        console.log(`Public Key: ${details.public_key}`);
        console.log(`Short ID: ${details.short_id}`);
        
        // Let's check the local .env and update the XUI port to 2096 since 3X-UI is running on 2096!
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');
          // Replace URL port 2053 with 2096
          envContent = envContent.replace('http://138.124.53.29:2053', 'http://138.124.53.29:2096');
          fs.writeFileSync(envPath, envContent);
          console.log('✅ Updated local .env to use port 2096!');
        }
      }
      conn.end();
    }).on('data', (data) => {
      stdout += data.toString();
    });
  });
}).connect({
  host: '138.124.53.29',
  port: 22,
  username: 'root',
  password: 'dRBT4SEJ0Za6'
});
