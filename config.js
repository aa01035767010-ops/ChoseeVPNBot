import dotenv from 'dotenv';
dotenv.config();

export const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  port: parseInt(process.env.PORT || '3000', 10),
  xui: {
    url: process.env.XUI_PANEL_URL || '',
    username: process.env.XUI_USERNAME || '',
    password: process.env.XUI_PASSWORD || '',
    inboundId: parseInt(process.env.XUI_INBOUND_ID || '1', 10),
    apiToken: process.env.XUI_API_TOKEN || '',
  },
  mockMode: (process.env.MOCK_MODE || 'true').toLowerCase() === 'true',
  dbName: 'database.sqlite'
};

// Validate required config
if (!config.mockMode && !config.botToken) {
  console.warn('⚠️ WARNING: TELEGRAM_BOT_TOKEN is not defined in your environment variables.');
}
