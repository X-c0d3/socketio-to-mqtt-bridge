/*
  # Author : Watchara Pongsri
  # [github/X-c0d3] https://github.com/X-c0d3/
  # Web Site: https://www.rockdevper.com
*/

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import https from 'https';
import { AppConfig } from '../constants/Constants';
import { TokenFleetTokenResponse } from '../types/TokenFleetTokenResponse';
import { sendTelegramNotify } from '../util/TelegramNotify';
import { getAuthorHeader } from '../util/Helper';

axios.defaults.httpsAgent = new https.Agent({ rejectUnauthorized: false });

const TOKEN_PATH = path.join(process.cwd(), 'data', 'token.json');

var currentAccessToken = '';
var currentRefreshToken = '';
var accessTokenExpiresAt = 0;
var dailyCounter = 0;

const teslaProxyDomain = (endpoint: string) => `${AppConfig.TESLA_PROXY_BASE}/api/1/vehicles/${AppConfig.TESLA_VIN}/${endpoint}`;
const teslaOauthDomain = () => `${AppConfig.TESLA_OAUTH_BASE}/oauth2/v3/token`;

export const initalFlatAPIConfig = async (): Promise<any> => {
  if (!(await fs.pathExists(TOKEN_PATH))) {
    throw new Error('token.json not found');
  }

  let config = await fs.readJson(TOKEN_PATH);

  currentAccessToken = config.access_token;
  currentRefreshToken = config.refresh_token;
  accessTokenExpiresAt = config.expires_at;
  dailyCounter = config.dailyCounter;

  return config;
};

export const updateCommandCounter = async (counter: number): Promise<void> => {
  if (!(await fs.pathExists(TOKEN_PATH))) {
    throw new Error('token.json not found');
  }
  dailyCounter = counter;

  const now = new Date();
  let config = await fs.readJson(TOKEN_PATH);
  config.dailyCounter = counter;
  config.lastUpdate = now.toISOString();
  await saveToken(config);
};

export const saveToken = async (configFile: any): Promise<void> => await fs.writeJson(TOKEN_PATH, configFile, { spaces: 2 });

export const getPartnerToken = async (): Promise<string> => {
  try {
    const response = await axios.post(
      `${AppConfig.TESLA_OAUTH_BASE}/oauth2/v3/token`,
      {
        grant_type: 'client_credentials',
        client_id: AppConfig.TESLA_CLIENT_ID,
        client_secret: AppConfig.TESLA_CLIENT_SECRET,
        scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds',
        audience: AppConfig.TESLA_API_BASE,
      },
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting token:', error);
    throw error;
  }
};

export const getValidToken = async (): Promise<string> => {
  // const REFRESH_BEFORE_MS = 30 * 60 * 1000;
  if (Date.now() < accessTokenExpiresAt - 1800000) {
    return currentAccessToken;
  }

  await sendTelegramNotify('Access token ใกล้หมดอายุหรือหมดแล้ว → Refresh...');
  try {
    await refreshToken();
    await initalFlatAPIConfig();

    await sendTelegramNotify('Refresh สำเร็จ! Expires at: ' + new Date(accessTokenExpiresAt).toISOString());
    return currentAccessToken;
  } catch (error: any) {
    await sendTelegramNotify('Refresh ล้มเหลว ต้อง authorize ใหม่ ' + error.response?.data || error.message);
    throw error;
  }
};

export const refreshToken = async (): Promise<TokenFleetTokenResponse> => {
  try {
    const response = await axios.post<TokenFleetTokenResponse>(
      teslaOauthDomain(),
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: AppConfig.TESLA_CLIENT_ID || '',
        client_secret: AppConfig.TESLA_CLIENT_SECRET || '',
        refresh_token: currentRefreshToken || '',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const newToken = response.data;
    console.log('Refresh success!');
    console.log('Refresh token new:', newToken.refresh_token);

    const now = new Date();
    const tokenData = {
      access_token: newToken.access_token,
      refresh_token: newToken.refresh_token || currentRefreshToken,
      expires_in: newToken.expires_in,
      id_token: newToken.id_token,
      expires_at: Date.now() + newToken.expires_in * 1000,
      dailyCounter: dailyCounter,
      lastUpdate: now.toISOString(),
    };

    await saveToken(tokenData);

    return newToken;
  } catch (error: any) {
    await sendTelegramNotify('Refresh token ล้มเหลว:' + error.response?.data || error.message);
    if (error.response?.data?.error === 'login_required' || error.response?.data?.error === 'invalid_grant') {
      await sendTelegramNotify('refresh_token หมดอายุหรือ invalid ต้องทำ OAuth flow ใหม่ (authorize ใน browser)');
    }

    throw error;
  }
};

export const getVehicleData = async (): Promise<any> => {
  try {
    const response = await axios.get(teslaProxyDomain('vehicle_data'), getAuthorHeader(currentAccessToken));
    return response.data;
  } catch (error: any) {
    console.error('Error getting vehicle data:', error.response);
    return null;
  }
};

//https://developer.tesla.com/docs/fleet-api/endpoints/vehicle-commands
export const setChargeCurrent = async (amps: number): Promise<boolean> => {
  try {
    const response = await axios.post(teslaProxyDomain('command/set_charging_amps'), { charging_amps: amps }, getAuthorHeader(currentAccessToken));
    return response.data.response.result === true;
  } catch (error: any) {
    console.error('Error setting amps:', error.response?.data || error.message);
    throw error;
  }
};

export const startCharged = async (): Promise<boolean> => {
  try {
    const response = await axios.post(teslaProxyDomain('command/charge_start'), {}, getAuthorHeader(currentAccessToken));
    return response.data.response.result === true;
  } catch (error: any) {
    console.error('Error setting amps:', error.response?.data || error.message);
    throw error;
  }
};

export const stopCharged = async (): Promise<boolean> => {
  try {
    const response = await axios.post(teslaProxyDomain('command/charge_stop'), {}, getAuthorHeader(currentAccessToken));
    return response.data.response.result === true;
  } catch (error: any) {
    console.error('Error setting amps:', error.response?.data || error.message);
    throw error;
  }
};

export const actuateTrunk = async (trunk: 'front' | 'rear'): Promise<boolean> => {
  try {
    const response = await axios.post(teslaProxyDomain('command/actuate_trunk'), { which_trunk: trunk }, getAuthorHeader(currentAccessToken));
    return response.data.response.result === true;
  } catch (error: any) {
    console.error('Error setting amps:', error.response?.data || error.message);
    throw error;
  }
};

export const flashLights = async (): Promise<boolean> => {
  try {
    const { data } = await axios.post(teslaProxyDomain('command/flash_lights'), {}, getAuthorHeader(currentAccessToken));
    return data.response?.result === true;
  } catch (error: any) {
    console.error('Error flashing lights:', error.response?.data || error.message);
    throw error;
  }
};
