import { Client } from 'ssh2';

const conn = new Client();

console.log('🔍 CONNECTING TO VPS TO DIAGNOSE x-ui AND PORTS...');

conn.on('ready', () => {
  console.log('✅ SSH Connected!');
  
  // Commands to check system status
  const cmd = `
echo "=== SERVICE STATUS ==="
systemctl status x-ui --no-pager

echo "=== LISTENING PORTS ==="
ss -tlnp

echo "=== FIREWALL STATUS ==="
ufw status

echo "=== ACTIVE DATABASES ==="
find /etc -name "x-ui.db" -o -name "x-ui-yu.db"
`;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let stdout = '';
    stream.on('close', () => {
      console.log('\n=== VPS DIAGNOSTIC REPORT ===');
      console.log(stdout);
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
