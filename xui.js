import { config } from './config.js';
import crypto from 'crypto';

// Disable TLS verification for self-signed certificates in panel connections if HTTPS is used
if (!config.mockMode && config.xui.url.startsWith('https:')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

let sessionCookie = null;

// Helper to handle login and session management
async function login() {
  if (config.mockMode) return true;

  const url = `${config.xui.url.replace(/\/$/, '')}/login`;
  console.log(`🔑 Logging into 3X-UI Panel at ${url}...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: config.xui.username,
        password: config.xui.password,
      }),
    });

    if (!response.ok) {
      throw new Error(`Login failed with status: ${response.status}`);
    }

    const resJson = await response.json();
    if (resJson && resJson.success) {
      // Extract Cookie from Headers
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        // Extract session cookie (usually session=...)
        sessionCookie = setCookie.split(';')[0];
        console.log('✅ Logged into 3X-UI panel and obtained session cookie.');
        return true;
      } else {
        throw new Error('No set-cookie header received from 3X-UI panel');
      }
    } else {
      throw new Error(resJson?.msg || 'Invalid credentials');
    }
  } catch (error) {
    console.error('❌ 3X-UI Login Error:', error.message);
    throw error;
  }
}

// Universal API fetcher that handles automatic authentication and session renewal
async function apiCall(path, method = 'GET', body = null) {
  if (config.mockMode) return null;

  const url = `${config.xui.url.replace(/\/$/, '')}${path}`;
  const headers = {
    'Accept': 'application/json',
  };

  if (config.xui.apiToken) {
    headers['Authorization'] = `Bearer ${config.xui.apiToken}`;
  } else {
    if (!sessionCookie) {
      await login();
    }
    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }
  }

  let options = { method, headers };

  if (body) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  try {
    let response = await fetch(url, options);

    // If 401 or redirect back to login and we are using cookies, the session might have expired
    if (!config.xui.apiToken && (response.status === 401 || response.url.endsWith('/login'))) {
      console.log('🔄 Session cookie expired. Re-authenticating...');
      await login();
      
      // Retry call once
      if (sessionCookie) {
        headers['Cookie'] = sessionCookie;
      }
      response = await fetch(url, options);
    }

    if (!response.ok) {
      throw new Error(`Request to ${path} failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ API Call Error [${method} ${path}]:`, error.message);
    throw error;
  }
}

// 3X-UI Panel Service Wrapper
export const xuiService = {
  /**
   * Generates a new VLESS user key (client) on the VPS panel
   * @param {number} userId - Telegram ID of the user
   * @param {string} deviceName - Label of the device (e.g. "Work iPhone")
   * @returns {Promise<{uuid: string, link: string}>}
   */
  async createClient(userId, deviceName) {
    const clientUuid = crypto.randomUUID();
    const email = `tg_${userId}_${crypto.randomBytes(3).toString('hex')}`;

    if (config.mockMode) {
      // Return a simulated high-quality VLESS Reality link
      const fakeVlessLink = `vless://${clientUuid}@vps.choseevpn.xyz:443?security=reality&sni=microsoft.com&fp=chrome&pbk=c8_cZq92k6eP8kH45H_wP7QfHkF8vN4-4&sid=6b7c8d&flow=xtls-rprx-vision#${encodeURIComponent(deviceName)}`;
      return { uuid: clientUuid, link: fakeVlessLink };
    }

    try {
      // 1. Register Client via new v3 API
      console.log(`📡 Adding VLESS Client on VPS in v3 format: ${email}...`);
      const response = await apiCall('/panel/api/clients/add', 'POST', {
        client: {
          email: email,
          uuid: clientUuid,
          flow: 'xtls-rprx-vision',
          enable: true
        },
        inboundIds: [config.xui.inboundId]
      });

      if (!response || !response.success) {
        throw new Error(response?.msg || 'Could not add client to panel');
      }

      // 2. Fetch the newly created client's actual UUID from the VPS list
      console.log(`📡 Resolving generated client details from VPS for email: ${email}...`);
      const listRes = await apiCall('/panel/api/clients/list', 'GET');
      if (!listRes || !listRes.success || !Array.isArray(listRes.obj)) {
        throw new Error('Could not fetch clients list to resolve generated UUID');
      }

      const client = listRes.obj.find(c => c.email === email);
      if (!client) {
        throw new Error(`Client with email "${email}" was added but could not be found in list`);
      }

      const activeUuid = client.uuid || clientUuid;
      console.log(`✅ Client UUID resolved on VPS: ${activeUuid}`);

      // 3. Fetch Inbound configuration details to dynamically build a fully working VLESS link
      console.log(`📡 Fetching inbound configuration details (ID: ${config.xui.inboundId})...`);
      const inboundRes = await apiCall(`/panel/api/inbounds/get/${config.xui.inboundId}`, 'GET');
      
      if (!inboundRes || !inboundRes.success || !inboundRes.obj) {
        throw new Error('Could not fetch inbound configuration from panel');
      }

      const inbound = inboundRes.obj;
      const port = inbound.port;
      const streamSettings = typeof inbound.streamSettings === 'string' ? JSON.parse(inbound.streamSettings) : inbound.streamSettings;

      // Parse VPS host domain or IP
      const vpsHost = config.xui.url.replace(/^https?:\/\//, '').split(':')[0];

      // Extract Reality configurations
      const security = streamSettings.security || 'reality';
      const sni = streamSettings.realitySettings?.serverNames?.[0] || 'microsoft.com';
      const fp = streamSettings.realitySettings?.fingerprint || 'chrome';
      const pbk = streamSettings.realitySettings?.publicKey || 'MISSING_PUBLIC_KEY';
      const sid = streamSettings.realitySettings?.shortIds?.[0] || '';

      // Build precise VLESS link
      const vlessLink = `vless://${activeUuid}@${vpsHost}:${port}?security=${security}&sni=${sni}&fp=${fp}&pbk=${pbk}&sid=${sid}&flow=xtls-rprx-vision#${encodeURIComponent(deviceName)}`;

      console.log(`✅ Client created on VPS. Key: vless://${activeUuid.slice(0,8)}...`);
      return { uuid: activeUuid, link: vlessLink };

    } catch (error) {
      console.error('❌ Failed to create VLESS client on 3X-UI VPS:', error.message);
      throw new Error(`VPS Connection Error: ${error.message}`);
    }
  },

  /**
   * Deletes a VLESS client key from the VPS panel
   * @param {string} clientUuid - The unique ID of the client (UUID)
   * @returns {Promise<boolean>}
   */
  async deleteClient(clientUuid) {
    if (config.mockMode) {
      console.log(`🧪 Mock Mode: Client ${clientUuid} successfully deleted.`);
      return true;
    }

    try {
      console.log(`📡 Searching for client email with UUID: ${clientUuid}...`);
      
      // 1. Fetch the list of all clients
      const listRes = await apiCall('/panel/api/clients/list', 'GET');
      if (!listRes || !listRes.success || !Array.isArray(listRes.obj)) {
        throw new Error('Could not fetch clients list to resolve email');
      }

      const clients = listRes.obj;
      const client = clients.find(c => c.uuid === clientUuid);
      
      if (!client) {
        console.warn(`⚠️ Client with UUID ${clientUuid} not found on VPS. Skipping deletion.`);
        return true; // treat as success since it is already gone
      }

      const email = client.email;
      console.log(`📡 Deleting client "${email}" from VPS...`);

      // 2. Delete the client by email using the v3 endpoint
      const response = await apiCall(`/panel/api/clients/del/${email}`, 'POST');

      if (!response || !response.success) {
        throw new Error(response?.msg || 'Failed to delete client');
      }

      console.log(`✅ Client "${email}" successfully deleted from VPS.`);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete VLESS client from 3X-UI VPS:', error.message);
      // We will still allow DB deletion even if VPS has an issue, but warn the admin
      return false;
    }
  }
};
