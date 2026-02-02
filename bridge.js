const io = require('socket.io-client');
const mqtt = require('mqtt');
const path = require('path');

require('dotenv').config({
    path: path.resolve(__dirname, '.env'),
});

const lastPublishTime = {};
const lastData = {};
const DEBOUNCE_MS = 3000;


// MQTT Client
const mqttClient = mqtt.connect(process.env.MQTT_BROKER, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clientId: 'socketio_mqtt_bridge_' + Math.random().toString(16).substr(2, 8),
    reconnectPeriod: 5000,
});

mqttClient.on('connect', () => console.log('Connected to MQTT broker'));
mqttClient.on('error', (err) => console.error('MQTT error:', err.message));




// Socket.IO Client
const socket = io(process.env.SOCKET_IO_URL, {
    path: '/socket.io/',
    transports: ['polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 20000
});

socket.on('connect', () => console.log('Connected to Socket.IO server'));
socket.on('disconnect', () => console.log('Disconnected from Socket.IO'));
socket.io.on('error', (err) => console.error('Engine.IO level error:', err));
socket.io.on('packetCreate', (packet) => console.log('Sent packet:', packet));

socket.on('connect_error', (err) => {
    console.error('Connect error details:', err);
    console.error('Message:', err.message);
    if (err.description) console.error('Description:', err.description);
    if (err.data) console.error('Data:', err.data);
});

socket.on(process.env.SOCKET_IO_EVENT, (data) => {
    const deviceKey = data.deviceName?.replace(/[^a-zA-Z0-9]/g, '_');
    if (!deviceKey) return;

    const now = Date.now();
    const lastTime = lastPublishTime[deviceKey] || 0;

    lastData[deviceKey] = data;
    if (now - lastTime < DEBOUNCE_MS) {
        //console.log(`Debouncing ${deviceKey}... waiting for next publish`);
        return;
    }

    console.log('Received from Socket.IO:', data);

    const topic = `${process.env.MQTT_TOPIC_BASE}/${deviceKey}/state`;
    console.log((new Date()).toISOString(), 'Publish to MQTT topic:', topic);
    // Publish to MQTT
    mqttClient.publish(topic, JSON.stringify(lastData[deviceKey]), { qos: 1, retain: true }, (err) => {
        if (err) console.error('Publish error:', err);
        else console.log(`Published full JSON to ${topic}`);
    });

    lastPublishTime[deviceKey] = now;
});

// Graceful shutdown
process.on('SIGINT', () => {
    mqttClient.end();
    socket.disconnect();
    process.exit(0);
});