import express from 'express';
import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config.js';
import { 
  initDb, 
  getUser, 
  getUserDevices, 
  addDevice, 
  deleteDevice, 
  createTransaction, 
  completeTransaction, 
  getDevice,
  updateBalance
} from './database.js';
import { xuiService } from './xui.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB first
await initDb();

// ----------------------------------------------------
// TELEGRAM BOT DEVELOPMENT
// ----------------------------------------------------
const bot = new Bot(config.botToken || '123456789:AABBCCDDEEFFgg-hhiijjkkllmmnnooppqq');

// Handle Bot Commands
bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name || `user_${userId}`;

  try {
    // Pre-register user in DB
    await getUser(userId, username);

    const welcomeText = `👋 *Привет, ${ctx.from.first_name || 'друг'}!* \n\n` +
      `Добро пожаловать в *ChoseeVPN* — сверхбыстрый и безопасный VPN на базе протокола *VLESS-Reality (Xray)*! \n\n` +
      `🛡️ Этот протокол полностью устойчив к любым блокировкам провайдеров в РФ, так как маскирует трафик под посещение доверенных веб-ресурсов.\n\n` +
      `📱 Для управления устройствами, получения ключей доступа и пополнения баланса нажмите на кнопку ниже:`;

    // Safe defensive check for valid HTTPS WebApp URL
    let keyboard;
    const miniAppUrl = process.env.WEBAPP_URL || '';

    if (miniAppUrl.startsWith('https://')) {
      keyboard = new InlineKeyboard().webApp('💻 Личный Кабинет', miniAppUrl);
    } else {
      console.warn(`⚠️ Warning: WEBAPP_URL is not configured with a valid HTTPS address: "${miniAppUrl}". WebApp inline button is disabled.`);
    }

    await ctx.reply(welcomeText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error handling /start command:', error);
    await ctx.reply('⚠️ Произошла ошибка при запуске. Пожалуйста, попробуйте позже.');
  }
});

bot.command('help', async (ctx) => {
  const helpText = `ℹ️ *Инструкция по использованию ChoseeVPN* \n\n` +
    `1️⃣ Откройте *Личный Кабинет* с помощью кнопки под приветственным сообщением.\n` +
    `2️⃣ Нажмите *«Добавить устройство»*, чтобы мгновенно сгенерировать персональный VLESS-ключ.\n` +
    `3️⃣ Скачайте рекомендованное приложение под ваше устройство (ссылки внутри кабинета).\n` +
    `4️⃣ Скопируйте сгенерированный ключ и импортируйте его в приложение одной кнопкой.\n\n` +
    `💰 Пополнение баланса также происходит прямо внутри кабинета в симулированном или реальном режиме оплаты.`;

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// Run bot in the background
if (config.botToken && config.botToken !== '123456789:AABBCCDDEEFFgg-hhiijjkkllmmnnooppqq') {
  bot.start().catch((err) => {
    console.error('❌ Grammy bot failed to start:', err.message);
  });
  console.log('🤖 Grammy bot listener started (Long Polling).');
} else {
  console.log('🧪 Running bot in Mock Mode (Grammy listener offline, configure TELEGRAM_BOT_TOKEN to connect).');
}

// ----------------------------------------------------
// EXPRESS WEB APP & API DEVELOPMENT
// ----------------------------------------------------
const app = express();
app.use(express.json());

// Serve Static Frontend Assets
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Cryptographically verifies Telegram Mini App initData
 * @param {string} initData - The query string from window.Telegram.WebApp.initData
 * @returns {object|null} The verified user object or null
 */
function verifyTelegramWebAppData(initData) {
  if (config.mockMode && (!initData || initData === 'mock_mode_active')) {
    // Return mock user for local desktop browser preview
    return {
      id: 987654321,
      username: 'TesterFlatDesign',
      first_name: 'FlatTester'
    };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    // Check auth_date for expiration (allow 24 hours in prod)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      console.warn('⚠️ Telegram WebApp auth_date expired');
      if (!config.mockMode) return null;
    }

    params.delete('hash');
    const sortedKeys = Array.from(params.keys()).sort();
    const dataCheckString = sortedKeys
      .map(key => `${key}=${params.get(key)}`)
      .join('\n');

    // Compute Secret
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(config.botToken || '123456789:AABBCCDDEEFFgg-hhiijjkkllmmnnooppqq')
      .digest();

    // Compute Hash
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash === hash) {
      const userJSON = params.get('user');
      return JSON.parse(userJSON);
    }
  } catch (error) {
    console.error('❌ Error verifying Telegram WebAppData:', error.message);
  }
  return null;
}

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Telegram ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const initData = authHeader.substring(9); // Strip "Telegram "
  const telegramUser = verifyTelegramWebAppData(initData);

  if (!telegramUser) {
    return res.status(403).json({ error: 'Forbidden: Cryptographic verification of Telegram initData failed' });
  }

  req.tgUser = telegramUser;
  next();
};

// --- REST API ROUTES ---

// 1. Get User Profile and Device list
app.get('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const user = await getUser(req.tgUser.id, req.tgUser.username);
    const devices = await getUserDevices(req.tgUser.id);
    res.json({ user, devices });
  } catch (error) {
    console.error('API Error /user/profile:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. Add New Device (Create VLESS client key)
app.post('/api/devices', authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Device name is required' });
  }

  try {
    const userId = req.tgUser.id;
    const user = await getUser(userId);
    const devices = await getUserDevices(userId);

    // Calculate trial active: user.created_at + 2 days
    const trialDuration = 2 * 24 * 60 * 60 * 1000;
    const isTrialActive = new Date(user.created_at).getTime() + trialDuration > Date.now();

    let expiresAt;
    let chargeAmount = 0;

    // Check if the device can be added for free (First device during 2-day trial)
    if (isTrialActive && devices.length === 0) {
      // Trial device: expires exactly at the end of the trial period
      const trialEndTime = new Date(new Date(user.created_at).getTime() + trialDuration);
      expiresAt = trialEndTime.toISOString();
      chargeAmount = 0;
    } else {
      // Regular device: costs 50 rubles for 30 days
      chargeAmount = 50;
      if (user.balance < chargeAmount) {
        return res.status(400).json({ 
          error: `Недостаточно средств. Стоимость добавления устройства — ${chargeAmount} ₽ за 30 дней. Пожалуйста, пополните баланс!` 
        });
      }
      const expireTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      expiresAt = expireTime.toISOString();
    }

    // Call 3X-UI to register the client and generate the VLESS link
    const { uuid, link } = await xuiService.createClient(userId, name.trim());

    // Deduct balance if charged
    if (chargeAmount > 0) {
      await updateBalance(userId, -chargeAmount);
    }

    // Write to SQLite
    const deviceId = crypto.randomUUID();
    const newDevice = await addDevice(deviceId, userId, name.trim(), uuid, link, expiresAt);

    res.status(201).json(newDevice);
  } catch (error) {
    console.error('API Error adding device:', error.message);
    res.status(500).json({ error: `Failed to create VPN key: ${error.message}` });
  }
});

// 3. Delete Device
app.delete('/api/devices/:id', authMiddleware, async (req, res) => {
  const deviceId = req.params.id;

  try {
    const userId = req.tgUser.id;
    const device = await getDevice(deviceId);

    if (!device || device.user_id !== userId) {
      return res.status(404).json({ error: 'Device not found or access denied' });
    }

    // Remove client from VPS panel
    await xuiService.deleteClient(device.client_uuid);

    // Delete from Database
    await deleteDevice(userId, deviceId);

    res.json({ success: true, message: 'Device successfully deleted' });
  } catch (error) {
    console.error('API Error deleting device:', error.message);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// 4. Create Top-up Transaction
app.post('/api/payments/create', authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  try {
    const userId = req.tgUser.id;
    const transactionId = `tx_${crypto.randomBytes(8).toString('hex')}`;
    
    const tx = await createTransaction(transactionId, userId, parseFloat(amount));
    res.json({ transactionId: tx.id, amount: tx.amount, status: tx.status });
  } catch (error) {
    console.error('API Error creating payment:', error.message);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// 5. Confirm Mock Transaction (For local testing & demonstration)
app.post('/api/payments/confirm-mock', authMiddleware, async (req, res) => {
  const { transactionId } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'Transaction ID is required' });
  }

  try {
    const userId = req.tgUser.id;
    
    // Credit transaction in DB
    const tx = await completeTransaction(transactionId);
    if (tx.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized transaction completion' });
    }

    const updatedUser = await getUser(userId);
    res.json({ success: true, newBalance: updatedUser.balance });
  } catch (error) {
    console.error('API Error confirming mock payment:', error.message);
    res.status(500).json({ error: error.message || 'Failed to complete transaction' });
  }
});

// Catch-all to serve index.html for SPA router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Web Server
app.listen(config.port, () => {
  console.log(`🌐 Web App Server is running at http://localhost:${config.port}`);
  console.log(`📡 In mock mode, open http://localhost:${config.port} directly in browser to preview layout.`);
});
