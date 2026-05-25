import { Client } from 'ssh2';

const conn = new Client();

console.log('🔍 LISTING FILES IN /usr/local/x-ui TO FIND XRAY...');

conn.on('ready', () => {
  console.log('✅ SSH Connected!');
  
  const cmd = `
echo "=== /usr/local/x-ui/bin ==="
ls -la /usr/local/x-ui/bin/ 2>&1

echo "=== /usr/local/x-ui/ ==="
ls -la /usr/local/x-ui/ 2>&1
`;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let stdout = '';
    stream.on('close', () => {
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
