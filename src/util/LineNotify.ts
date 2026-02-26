/*
  # Author : Watchara Pongsri
  # [github/X-c0d3] https://github.com/X-c0d3/
  # Web Site: https://www.rockdevper.com
*/

import axios from 'axios';
import { AppConfig } from '../constants/Constants';

const sendLineNotify = async (message: String) => {
  const userIds = (AppConfig.LINE_SENDER_ID || '')
    .split(/[,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  await axios({
    method: 'post',
    url: 'https://api.line.me/v2/bot/message/multicast',
    timeout: 8000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AppConfig.LINE_TOKEN}`,
    },
    data: {
      to: userIds,
      messages: [
        {
          type: 'text',
          text: message,
        },
      ],
    },
  }).catch((err) => console.log(err));
};

export { sendLineNotify };
