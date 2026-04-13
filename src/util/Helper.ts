/*
  # Author : Watchara Pongsri
  # [github/X-c0d3] https://github.com/X-c0d3/
  # Web Site: https://www.rockdevper.com
*/

import path from 'path';
import fs from 'fs';
import axios from 'axios';
import https from 'https';
import { LatLon, TeslaMateResponse } from '../types/TeslaMateResponse';
import { AppConfig } from '../constants/Constants';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

const truncateFolderName = (maxLength: number, folderName: string) => {
  if (folderName.length <= maxLength) {
    return folderName;
  } else {
    return folderName.substr(0, maxLength);
  }
};

const ensureDirectoryExistence = (filePath: string) => {
  var dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
};

const saveFile = async (indexFile: number, fileUrl: string, pathDir: string, fileExtension: string = '') => {
  // Get the file name
  const fileName = truncateString(`${indexFile}.${path.basename(fileUrl)}`, 30);
  const localFilePath = path.resolve(__dirname, `${pathDir}`, fileName + fileExtension);
  ensureDirectoryExistence(localFilePath);
  try {
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream',
      timeout: 50000,
      httpsAgent: httpsAgent,
    });

    const w = response.data.pipe(fs.createWriteStream(localFilePath));
    w.on('finish', () => {
      //console.log('Successfully downloaded file!');
    });
  } catch (err: any) {
    console.log(err);
    //throw new Error(err);
  }
};

const extractText = (strToParse: string, strStart: string, strFinish: string) => {
  if (strToParse == null || strStart == null || strFinish == null) return;

  var res = strToParse.match(strStart + '(.*?)' + strFinish);
  if (res != null) return res[1];
};

const removeSpecialCharacter = (content: string) => {
  var res = content.replace('/', '-').trim();
  return truncateFolderName(50, res);
};

const truncateString = (name: string, num: number) => {
  const ext: string = name.substring(name.lastIndexOf('.') + 1, name.length).toLowerCase();
  let newName: string = name.replace('.' + ext, '');
  if (name.length <= 8) {
    // if file name length is less than 8 do not format
    // return same name
    return name;
  }
  newName = newName.substring(0, num);
  return newName + '.' + ext;
};

function toSafeNumber(value: string | undefined | null): number | null {
  if (!value || value.trim() === '' || value === '-' || value === '—') {
    return 0;
  }
  const cleaned = value.replace(/[^0-9.-]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

const getRandomValues = (min: number, max: number) => (Math.random() * (max - min + 1) + min) | 0;

function isInTimeWindow(startHour: number, endHour: number): boolean {
  const bkkTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    hour: 'numeric',
    hour12: false,
  }).format(new Date());

  const hour = parseInt(bkkTime);
  return hour >= startHour && hour < endHour;
}

const toLocalDateTimeTH = () => {
  const now = new Date();
  return now.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
};

const dateToLocalDateTimeTH = (date: Date) => {
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
};

const getAuthorHeader = (token: string) => {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
};

const getDistanceKm = (a: LatLon, b: LatLon) => {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;

  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const isAtHome = (testlaInfo: TeslaMateResponse | null): boolean => {
  if (!testlaInfo?.lat || !testlaInfo?.lng) return true;

  const raw = AppConfig.HOME_LOCATION;
  if (!raw) throw new Error('HOME_LOCATION is not set');

  const [h_lat, h_lon] = raw.split(',').map(v => parseFloat(v.trim()));

  if (isNaN(h_lat) || isNaN(h_lon)) throw new Error('Invalid HOME_LOCATION format. Use "lat,lon"');

  const homeLocation = { lat: h_lat, lon: h_lon };
  const currentLocation = { lat: testlaInfo.lat, lon: testlaInfo.lng };
  const distance = getDistanceKm(currentLocation, homeLocation);

  const radiusKm = AppConfig.HOME_RADIUS_KM; //200 meters default radius
  return distance < radiusKm;
}

export { saveFile, ensureDirectoryExistence, extractText, removeSpecialCharacter, truncateString, toSafeNumber, getRandomValues, isInTimeWindow, toLocalDateTimeTH, getAuthorHeader, dateToLocalDateTimeTH, getDistanceKm, isAtHome };
