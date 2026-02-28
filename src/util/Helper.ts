import path from 'path';
import fs from 'fs';
import axios from 'axios';
import https from 'https';

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

const getAuthorHeader = (token: string) => {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
};

export { saveFile, ensureDirectoryExistence, extractText, removeSpecialCharacter, truncateString, toSafeNumber, getRandomValues, isInTimeWindow, toLocalDateTimeTH, getAuthorHeader };
