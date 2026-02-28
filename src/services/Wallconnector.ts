/*
  # Author : Watchara Pongsri
  # [github/X-c0d3] https://github.com/X-c0d3/
  # Web Site: https://www.rockdevper.com
*/

import axios from 'axios';
import { AppConfig } from '../constants/Constants';

const getWallConnector = async <T>(endpoint: string): Promise<T | null> => {
  try {
    const res = await axios.get<T>(`${AppConfig.TESLA_WALLCONNECTOR_URL}/api/1/${endpoint}`, {
      timeout: 5000,
      headers: {
        Accept: 'application/json',
      },
    });
    return res.data;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export { getWallConnector };
