import { config } from './config.js';

console.log('🔍 Testing connection to your Telegram Bot and VPS 3X-UI Panel...\n');

async function testTelegramBot() {
  if (!config.botToken || config.botToken === '123456789:AABBCCDDEEFFgg-hhiijjkkllmmnnooppqq') {
    console.error('❌ Telegram Bot: Token is not configured. Please get it from @BotFather.');
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`);
    const data = await response.json();

    if (data.ok) {
      console.log(`✅ Telegram Bot: Connection successful!`);
      console.log(`   Bot Name: @${data.result.username} (${data.result.first_name})`);
      return true;
    } else {
      console.error(`❌ Telegram Bot: Invalid token. Telegram API returned: ${data.description}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Telegram Bot: Failed to connect to Telegram API. Network error: ${error.message}`);
    return false;
  }
}

async function testXuiPanel() {
  if (config.mockMode) {
    console.log('⚠️ 3X-UI Panel: Running in MOCK_MODE. Skipping actual VPS connection tests.');
    return true;
  }

  if (!config.xui.url) {
    console.error('❌ 3X-UI Panel: XUI_PANEL_URL is missing in .env.');
    return false;
  }

  const baseUrl = config.xui.url.replace(/\/$/, '');
  
  // 1. Try to ping URL
  try {
    console.log(`📡 Connecting to VPS Panel at: ${baseUrl}...`);
    const pingRes = await fetch(baseUrl, { method: 'GET' });
    console.log(`✅ 3X-UI Panel: Server is reachable (Status: ${pingRes.status}).`);
  } catch (error) {
    console.error(`❌ 3X-UI Panel: Cannot reach your VPS panel. Make sure the port is open in your VPS firewall!`);
    console.error(`   Error details: ${error.message}`);
    return false;
  }

  // 2. Try to login
  let sessionCookie = null;
  try {
    const loginUrl = `${baseUrl}/login`;
    console.log(`🔑 Attempting admin login as: "${config.xui.username}"...`);
    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: config.xui.username,
        password: config.xui.password,
      }),
    });

    if (!loginRes.ok) {
      console.error(`❌ 3X-UI Panel: Login request failed with status ${loginRes.status}.`);
      return false;
    }

    const data = await loginRes.json();
    if (data && data.success) {
      const setCookie = loginRes.headers.get('set-cookie');
      if (setCookie) {
        sessionCookie = setCookie.split(';')[0];
        console.log('✅ 3X-UI Panel: Login successful!');
      } else {
        console.error('❌ 3X-UI Panel: Login succeeded but no session cookie was returned.');
        return false;
      }
    } else {
      console.error(`❌ 3X-UI Panel: Login failed. Reason: ${data?.msg || 'Invalid credentials'}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ 3X-UI Panel: Error during login request: ${error.message}`);
    return false;
  }

  // 3. Check Inbound Configuration
  try {
    console.log(`📡 Checking VLESS Inbound configuration (ID: ${config.xui.inboundId})...`);
    const getInboundUrl = `${baseUrl}/panel/api/inbounds/get/${config.xui.inboundId}`;
    const response = await fetch(getInboundUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cookie': sessionCookie
      }
    });

    if (!response.ok) {
      console.error(`❌ 3X-UI Panel: Failed to fetch inbound settings. Status: ${response.status}`);
      return false;
    }

    const data = await response.json();
    if (data && data.success && data.obj) {
      const inbound = data.obj;
      console.log(`✅ 3X-UI Panel: Inbound ID ${config.xui.inboundId} found!`);
      console.log(`   Protocol: ${inbound.protocol.toUpperCase()}`);
      console.log(`   Port: ${inbound.port}`);
      
      const streamSettings = JSON.parse(inbound.streamSettings);
      console.log(`   Security Mode: ${streamSettings.security || 'none'}`);
      
      if (inbound.protocol.toLowerCase() !== 'vless') {
        console.error('❌ Warning: The specified Inbound protocol is NOT VLESS. Please use a VLESS protocol inbound.');
      }
      
      if (streamSettings.security !== 'reality') {
        console.warn('⚠️ Warning: Security mode is not "reality". It is recommended to use Reality for anti-blocking.');
      }
      
      return true;
    } else {
      console.error(`❌ 3X-UI Panel: Inbound ID ${config.xui.inboundId} not found in the panel. Check XUI_INBOUND_ID in .env.`);
      return false;
    }
  } catch (error) {
    console.error(`❌ 3X-UI Panel: Error fetching inbound settings: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('--- TEST 1: TELEGRAM BOT ---');
  const botOk = await testTelegramBot();
  console.log('\n--- TEST 2: VPS 3X-UI PANEL ---');
  const xuiOk = await testXuiPanel();
  
  console.log('\n--- DIAGNOSIS RESULT ---');
  if (botOk && xuiOk) {
    if (config.mockMode) {
      console.log('🎉 Everything works in MOCK mode! To go live, edit .env: set MOCK_MODE=false and fill in your VPS panel settings.');
    } else {
      console.log('🎉 CONGRATULATIONS! Your VPS and Bot are fully connected and configured in live production mode! Run "npm start" to launch.');
    }
  } else {
    console.log('⚠️ Some checks failed. Please fix the errors above and run this script again.');
  }
}

runTests();
