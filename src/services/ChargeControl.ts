/*
  # Author : Watchara Pongsri
  # [github/X-c0d3] https://github.com/X-c0d3/
  # Web Site: https://www.rockdevper.com
*/

import { AppConfig } from '../constants/Constants';
import { isInTimeWindow, toLocalDateTimeTH } from '../util/Helper';
import { sendTelegramNotify } from '../util/TelegramNotify';
import { getValidToken, setChargeCurrent, initialFleetAPIConfig, updateCommandCounter } from './TeslaFleetApi';

let MIN_AMPS = 5;
let MAX_AMPS = 32;

const IMPORT_THRESHOLD = 130; // If > 130W, reduce charge amps
const ZERO_THRESHOLD = 60; // If < 60W, increase charge amps

const GRID_AVG_SAMPLES = 10;
const ADJUST_DELAY = 40_000;

// $10 budget: 10,000 commands (vehicle-commands tier)
// MAX_DAILY_COMMANDS = 330 -> 330 * 30 = 9,900 commands/month = ~$9.90, within $10 budget
const MAX_DAILY_COMMANDS = 330; // Limit qoata to 330 commands per day

let currentAmps: number | null = null;
let lastAdjustTime = Date.now();
let gridHistory: number[] = [];
let lastSentAmps: number | null = null;

let FLEET_API_COUNTER = 0;
let lastResetDate = '';
let resetProcessRunning = false;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const resetDailyCounter = async (): Promise<void> => {
  const today = new Date().toDateString();
  if (lastResetDate !== '' && today !== lastResetDate && !resetProcessRunning) {
    resetProcessRunning = true;
    FLEET_API_COUNTER = 0;
    lastResetDate = today;
    await updateCommandCounter(0);
    await sendTelegramNotify('🔄 Daily counter reset');
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

export const solarChargingControl = async (data: any, mobileCharger: boolean): Promise<number> => {
  try {
    const { vehicle_current_a, contactor_closed } = data?.tesla.wallCharge;
    const { grid_power, pv_power } = data?.deviceState;
    const { charge_limit, soc } = data?.tesla.teslaMate;

    // for mobile charger, limit max amps to 13A (except Model 3/Y that can do 16A), for wall charger can go up to 32A
    MAX_AMPS = mobileCharger ? 13 : 32;

    if (currentAmps === null) {
      let config = await initialFleetAPIConfig();
      FLEET_API_COUNTER = config.dailyCounter;
      lastResetDate = new Date(config.lastUpdate).toDateString();

      const actualAmps = Math.round(vehicle_current_a ?? 0);

      currentAmps = actualAmps <= MIN_AMPS ? MIN_AMPS : actualAmps;
      lastSentAmps = actualAmps <= MIN_AMPS ? MIN_AMPS : actualAmps;
      await sendTelegramNotify(`🔄 Starting amps sync. Detected current from WallConnector: ${currentAmps}A`);
      return FLEET_API_COUNTER;
    }

    await resetDailyCounter();

    currentAmps = Math.round(vehicle_current_a ?? 0);
    const avgGridPower = getAverageGridPower((grid_power ?? 0) * 1000);

    const now = Date.now();
    if (now - lastAdjustTime < ADJUST_DELAY) {
      // รอให้ครบ delay ก่อนปรับ
      return FLEET_API_COUNTER;
    }

    await getValidToken();

    // only charge if contactor_closed =true and current is above 5A and PV power is available
    if (!(vehicle_current_a >= 5 && contactor_closed && pv_power > 0)) {
      return FLEET_API_COUNTER;
    }

    if (!isInTimeWindow(Number(AppConfig.CHARGE_HOUR_START), Number(AppConfig.CHARGE_HOUR_END))) {
      console.log('⏰ Outside time window');
      return FLEET_API_COUNTER;
    }
    resetProcessRunning = false;

    let direction: 'UP' | 'DOWN' | null = null;
    let newAmps = currentAmps;

    let actualStep = 1; // ปรับทีละ 1A เป็นค่าเริ่มต้น
    if (avgGridPower > IMPORT_THRESHOLD) {
      if (avgGridPower > 500) actualStep = 2;
      if (avgGridPower > 2000) actualStep = 3;
      if (avgGridPower > 4000) actualStep = 4;
      if (avgGridPower > 6000) actualStep = 5;

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
      `PV ${formatter.format(pv_power * 1000)} W Grid AVG: ${formatter.format(avgGridPower)} W | NewAmps: ${newAmps} A CurrentAmps: ${currentAmps} A | Direction: ${direction ?? 'None'} | GridAvgSamples: ${gridHistory.length} | FleetAPI Counter: ${FLEET_API_COUNTER}/${MAX_DAILY_COMMANDS} | Soc: ${soc}/${charge_limit} %`,
    );
  } catch (err) {
    console.error('Control loop error:', err);
  }
  return FLEET_API_COUNTER;
};

const setCurrent = async (newAmps: number, direction: 'UP' | 'DOWN', actualStep: number, avgGridPower: number, secondsSinceLastAdjust: number, data: any): Promise<boolean> => {
  const { vehicle_current_a, grid_v } = data.tesla?.wallCharge;
  const { charge_limit, soc } = data.tesla?.teslaMate;
  try {
    if (newAmps === lastSentAmps) {
      console.log(`Skip API (same amps ${newAmps})`);
      return false;
    }

    if (FLEET_API_COUNTER >= MAX_DAILY_COMMANDS) {
      console.log('Daily command limit reached (prevent send)');
      return false;
    }

    FLEET_API_COUNTER++;
    console.log(`-----------------------------------------------`);
    await sendTelegramNotify(`
✅ Set charging ${lastSentAmps}A to ${newAmps}A 
Direction: ${direction === 'UP' ? '⬆️' : '⬇️'} (STEP: ${actualStep}A) ~ Grid: ${formatter.format(avgGridPower)} W 
Daily Counter: ${FLEET_API_COUNTER} / ${MAX_DAILY_COMMANDS} per days
Soc: ${soc}% | Charged Limit: ${charge_limit}% 
⏱ ${secondsSinceLastAdjust.toFixed(1)}s since last adjust
Grid: ${grid_v.toFixed(0)} V / ${vehicle_current_a} A | Charging: ~ ${formatter.format(grid_v * vehicle_current_a)} W
LastUpdate: ${toLocalDateTimeTH()}`);
    console.log(`-----------------------------------------------`);
    const success = await setChargeCurrent(newAmps);
    if (success) {
      lastSentAmps = newAmps;
      await updateCommandCounter(FLEET_API_COUNTER);
    }
    return success;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    await sendTelegramNotify('Error: ' + (err.response?.data || err.message));
    return false;
  }
};