import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

const rootPath = process.cwd();
const envLocalPath = path.resolve(rootPath, '.env.local');
const envPath = path.resolve(rootPath, '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log('✅ Loaded: .env.local');
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('ℹ️ Loaded: .env');
} else {
  console.warn('⚠️ No .env or .env.local found');
}

const AppConfig = {
  SOCKET_IO_URL: process.env.SOCKET_IO_URL,
  SOCKET_IO_EVENT: process.env.SOCKET_IO_EVENT,

  MQTT_BROKER: process.env.MQTT_BROKER,
  MQTT_USERNAME: process.env.MQTT_USERNAME,
  MQTT_PASSWORD: process.env.MQTT_PASSWORD,
  MQTT_TOPIC_BASE: process.env.MQTT_TOPIC_BASE,

  TESLA_WALLCONNECTOR_URL: process.env.TESLA_WALLCONNECTOR_URL,
  TESLAMATE_URL: process.env.TESLAMATE_URL,
  DEBOUNCE_MS: Number(process.env.DEBOUNCE_MS || 3000),

  TESLA_CLIENT_ID: process.env.TESLA_CLIENT_ID,
  TESLA_CLIENT_SECRET: process.env.TESLA_CLIENT_SECRET,
  TESLA_DOMAIN: process.env.TESLA_DOMAIN,
  TESLA_OAUTH_BASE: process.env.TESLA_OAUTH_BASE,
  TESLA_API_BASE: process.env.TESLA_API_BASE,
  TESLA_PROXY_BASE: process.env.TESLA_PROXY_BASE,
  TESLA_VIN: process.env.TESLA_VIN,

  LINE_TOKEN: process.env.LINE_TOKEN,
  LINE_SENDER_ID: process.env.LINE_SENDER_ID,

  TELEGRAM_API_KEY: process.env.TELEGRAM_API_KEY,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
};

export { AppConfig };
