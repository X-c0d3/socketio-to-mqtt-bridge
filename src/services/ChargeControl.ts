import { AppConfig } from '../constants/Constants';
import { isInTimeWindow, toLocalDateTimeTH } from '../util/Helper';
import { sendTelegramNotify } from '../util/TelegramNotify';
import { getValidToken, setChargeCurrent, initalFlatAPIConfig, updateCommandCounter } from './TeslaFleetApi';

const MIN_AMPS = 6;
const MAX_AMPS = 32;
const STEP = 1;

const IMPORT_THRESHOLD = 130; // ถ้ามากกว่า > 120w จะต้องลด กระแสการชาร์จลง
const ZERO_THRESHOLD = 60; // ถ้าน้อยกว่า < 50W จะต้องเพิ่มกระแสการชาร์จขึ้น

const GRID_AVG_SAMPLES = 10;
const ADJUST_DELAY = 40_000;

// $10 สามารถซื้อได้: 10,000 commands (ถ้าใช้เฉพาะคำสั่ง)
// โค้ดปัจจุบัน MAX_DAILY_COMMANDS = 330 → 330 * 30 ≈ 9,900 commands/เดือน ≈ $9.90 → อยู่ภายในงบ $10 แต่เหลือ margin ต่ำ (~$0.10)
const MAX_DAILY_COMMANDS = 330; // Limit qoata to 330 commands per day

let currentAmps: number | null = null;
let lastAdjustTime = Date.now();
let gridHistory: number[] = [];
let lastSentAmps: number | null = null;

let dailyCounter = 0;
let lastResetDate = '';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const resetDailyCounter = async (): Promise<void> => {
  const today = new Date().toDateString();
  if (lastResetDate !== '' && today !== lastResetDate) {
    dailyCounter = 0;
    lastResetDate = today;
    await updateCommandCounter(0);
    sendTelegramNotify('🔄 Daily counter reset');
  }
};

const getAverageGridPower = (value: number) => {
  gridHistory.push(value);

  if (gridHistory.length > GRID_AVG_SAMPLES) {
    gridHistory.shift();
  }

  const sum = gridHistory.reduce((a, b) => a + b, 0);
  return sum / gridHistory.length;
};

export const solarChargingControl = async (data: any) => {
  try {
    if (!isInTimeWindow(Number(AppConfig.CHARGE_HOUR_START), Number(AppConfig.CHARGE_HOUR_END))) {
      console.log('⏰ Outside time window');
      return;
    }

    if (currentAmps === null) {
      let config = await initalFlatAPIConfig();
      dailyCounter = config.dailyCounter;
      lastResetDate = new Date(config.lastUpdate).toDateString();

      const actualAmps = Math.round(data?.tesla?.wallCharge?.vehicle_current_a ?? 0);
      sendTelegramNotify(`🔄 Starting amps sync. Detected current from WallConnector: ${actualAmps}A`);
      currentAmps = actualAmps;
      lastSentAmps = actualAmps;
      return;
    }

    await resetDailyCounter();

    currentAmps = Math.round(data?.tesla?.wallCharge?.vehicle_current_a ?? 0);
    const rawGridPowerKW = data?.deviceState?.grid_power ?? 0;
    const avgGridPower = getAverageGridPower(rawGridPowerKW * 1000);

    const now = Date.now();
    if (now - lastAdjustTime < ADJUST_DELAY) {
      // รอให้ครบ delay ก่อนปรับ
      return;
    }

    await getValidToken();

    let direction: 'UP' | 'DOWN' | null = null;
    let newAmps = currentAmps;

    let actualStep = STEP;
    if (avgGridPower > IMPORT_THRESHOLD) {
      if (avgGridPower > 500) actualStep = 2;
      if (avgGridPower > 2000) actualStep = 3;
      if (avgGridPower > 4000) actualStep = 4;

      newAmps = clamp(currentAmps - actualStep, MIN_AMPS, MAX_AMPS);
      direction = 'DOWN';
    } else if (Math.abs(avgGridPower) < ZERO_THRESHOLD) {
      newAmps = clamp(currentAmps + actualStep, MIN_AMPS, MAX_AMPS);
      direction = 'UP';
    }

    if (newAmps <= MIN_AMPS) {
      newAmps = MIN_AMPS;
    } else if (newAmps >= MAX_AMPS) {
      newAmps = MAX_AMPS;
    }

    if (direction && newAmps !== currentAmps && gridHistory.length >= GRID_AVG_SAMPLES) {
      const secondsSinceLastAdjust = (now - lastAdjustTime) / 1000;

      lastAdjustTime = now;
      const ok = await setCurrent(newAmps, direction, actualStep, avgGridPower, secondsSinceLastAdjust, data);
      if (ok) {
        currentAmps = newAmps;
      }
    }

    console.log(
      `Grid avg: ${avgGridPower.toFixed(0)}W | NewAmps: ${newAmps}A Current: ${currentAmps}A | Direction: ${direction ?? 'None'} | GridAvgSamples: ${gridHistory.length} | Cmd Counter: ${dailyCounter}/${MAX_DAILY_COMMANDS} | Soc: ${data?.tesla.teslaMate.soc}/${data?.tesla.teslaMate.charge_limit}%`,
    );
  } catch (err) {
    console.error('Control loop error:', err);
  }
};

const setCurrent = async (newAmps: number, direction: 'UP' | 'DOWN', actualStep: number, avgGridPower: number, secondsSinceLastAdjust: number, data: any): Promise<boolean> => {
  try {
    if (newAmps === lastSentAmps) {
      console.log(`Skip API (same amps ${newAmps})`);
      return false;
    }

    if (dailyCounter >= MAX_DAILY_COMMANDS) {
      console.log('Daily command limit reached (prevent send)');
      return false;
    }

    dailyCounter++;
    console.log(`-----------------------------------------------`);
    sendTelegramNotify(`
✅ Set charging ${lastSentAmps}A to ${newAmps}A 
Direction: ${direction === 'UP' ? '⬆️' : '⬇️'} (STEP: ${actualStep}A) ~ ${avgGridPower.toFixed(0)}W 
Daily Counter: ${dailyCounter} / ${MAX_DAILY_COMMANDS} per days
Soc: ${data?.tesla.teslaMate.soc}% | Charged Limit: ${data?.tesla.teslaMate.charge_limit}% 
⏱ ${secondsSinceLastAdjust.toFixed(1)}s since last adjust
Grid: ${data.tesla?.wallCharge.grid_v.toFixed(0)} V / ${data.tesla?.wallCharge.vehicle_current_a} A | Charging: ~ ${(data.tesla.wallCharge.grid_v * data.tesla?.wallCharge.vehicle_current_a).toFixed(0)} W
LastUpdate: ${toLocalDateTimeTH()}`);
    console.log(`-----------------------------------------------`);
    const success = await setChargeCurrent(newAmps);
    if (success) {
      lastSentAmps = newAmps;
      await updateCommandCounter(dailyCounter);
    }
    return success;
  } catch (error: any) {
    sendTelegramNotify('Error: ' + error.response?.data || error.message);
    return false;
  }
};
