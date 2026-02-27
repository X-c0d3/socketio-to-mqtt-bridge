import io from 'socket.io-client';
import mqtt from 'mqtt';
import { AppConfig } from './constants/Constants';
import { getWallConnector } from './services/Wallconnector';
import { TeslaWallConnectorVitals } from './types/TeslaWallConnector';
import { getTeslaMateInfo } from './services/TeslaMate';
import { getStatusName } from './types/TeslaMateResponse';
import { solarChargingControl } from './services/ChargeControl';
import { toLocalDateTimeTH } from './util/Helper';

const lastPublishTime: any = {};
const lastData: any = {};

// MQTT Client
const mqttClient = mqtt.connect(AppConfig.MQTT_BROKER || '', {
  username: AppConfig.MQTT_USERNAME || undefined,
  password: AppConfig.MQTT_PASSWORD || undefined,
  clientId: 'socketio_mqtt_bridge_' + Math.random().toString(16).substr(2, 8),
  reconnectPeriod: 5000,
});

mqttClient.on('connect', () => console.log('Connected to MQTT broker'));
mqttClient.on('error', (err) => console.error('MQTT error:', err.message));

// Socket.IO Client
const socket = io(AppConfig.SOCKET_IO_URL || '', {
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  timeout: 20000,
});

socket.on('connect', () => console.log('Connected to Socket.IO server'));
socket.on('disconnect', () => console.log('Disconnected from Socket.IO'));
socket.io.on('error', (err: any) => console.error('Engine.IO level error:', err));
//socket.io.on('packetCreate', (packet: any) => console.log('Sent packet:', packet));

socket.on('connect_error', (err: any) => {
  console.error('Connect error details:', err);
  console.error('Message:', err.message);
  if (err.description) console.error('Description:', err.description);
  if (err.data) console.error('Data:', err.data);
});

var counter = 0;
socket.on(AppConfig.SOCKET_IO_EVENT || '', async (data: any) => {
  const deviceKey = data.deviceName?.replace(/[^a-zA-Z0-9]/g, '_');
  if (!deviceKey) return;

  const now = Date.now();
  const lastTime = lastPublishTime[deviceKey] || 0;

  if (deviceKey === 'Huawei_SUN2000_10K_LC0') {
    var teslaMate = await getTeslaMateInfo();
    var wallCharge = await getWallConnector<TeslaWallConnectorVitals>('vitals');
    // var wifi_status = await getWallConnector<TeslaWallConnectorWifiStatus>('wifi_status');
    // var lifetime = await getWallConnector<TeslaWallConnectorLifetimeStats>('lifetime');
    // var deviceInfo = await getWallConnector<TeslaWallConnectorDeviceInfo>('version');

    if (wallCharge?.evse_state) {
      wallCharge.statusName = getStatusName(wallCharge);
    }

    data = {
      ...data,
      tesla: {
        wallCharge,
        teslaMate,
        // wifi_status,
        // lifetime,
        //deviceInfo,
      },
    };
  }

  lastData[deviceKey] = data;
  if (now - lastTime < AppConfig.DEBOUNCE_MS) {
    //console.log(`Debouncing ${deviceKey}... waiting for next publish`);
    return;
  }

  const sensorData = lastData[deviceKey];
  if (deviceKey === 'Huawei_SUN2000_10K_LC0') {
    const { vehicle_current_a, contactor_closed } = sensorData.tesla.wallCharge;
    //Only charge if contactor is open and current is above 5A
    if (vehicle_current_a >= 5 && contactor_closed && sensorData.deviceState.pv_power > 0) {
      await solarChargingControl(sensorData);
    }
  }

  counter++;
  //console.log('Received from Socket.IO:', sensorData);
  const topic = `${AppConfig.MQTT_TOPIC_BASE}/${deviceKey}/state`;
  console.log(toLocalDateTimeTH(), `[${counter}] Publish to MQTT topic:`, topic);

  //Publish to MQTT
  mqttClient.publish(topic, JSON.stringify(sensorData), { qos: 1, retain: true }, (err) => {
    if (err) console.error('Publish error:', err);
  });

  lastPublishTime[deviceKey] = now;
  if (counter > 10000) counter = 0;
});

// Graceful shutdown
process.on('SIGINT', () => {
  mqttClient.end();
  socket.disconnect();
  process.exit(0);
});
