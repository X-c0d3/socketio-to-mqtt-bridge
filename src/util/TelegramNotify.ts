/*
  # Author : Watchara Pongsri
  # [github/X-c0d3] https://github.com/X-c0d3/
  # Web Site: https://www.rockdevper.com
*/

import axios from 'axios';
import { AppConfig } from '../constants/Constants';

const sendTelegramNotify = async (message: String) => {
  console.log(message);
  await axios({
    method: 'post',
    url: `https://api.telegram.org/bot${AppConfig.TELEGRAM_API_KEY}/sendMessage`,
    timeout: 5000,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: {
      chat_id: AppConfig.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
    },
  }).catch((err) => console.log(err));
};

export { sendTelegramNotify };
