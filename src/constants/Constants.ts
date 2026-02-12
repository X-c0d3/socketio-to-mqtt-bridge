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
};

export { AppConfig };
