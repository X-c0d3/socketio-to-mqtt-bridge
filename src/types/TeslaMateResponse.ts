import { TeslaWallConnectorVitals } from './TeslaWallConnector';

export interface TeslaMateResponse {
  status: string;
  remaining_time: string;
  expected_finish_time: string;
  range_rated: number; // km
  range_estimated: number; // km
  scheduled_charging: string;
  charge_limit: number; // %
  soc: number; // %
  temp_outside: number; // °C
  temp_inside: number; // °C
  mileage: number; // km
  speed?: number; // km/h
  estimated_range_100: string;

  lat?: number;
  lng?: number;

  version: string;
  lastUpdate: string;
}

export const createEmptyTeslaMate = (): TeslaMateResponse => ({
  remaining_time: '',
  expected_finish_time: '',
  range_rated: 0,
  range_estimated: 0,
  scheduled_charging: '',
  charge_limit: 0,
  soc: 0,
  temp_outside: 0,
  temp_inside: 0,
  mileage: -1,
  speed: -1,
  estimated_range_100: '',
  status: '',
  version: '',
  lastUpdate: '',
});

export const getStatusName = (wallCharge: TeslaWallConnectorVitals | null): string => {
  if (!wallCharge) return 'Unknown';

  switch (wallCharge.evse_state) {
    case 1:
      return 'Not Connected';
    case 4:
      return 'Finished';
    case 9:
      return 'Charging Stopped';
    case 11:
      return 'Charging';
    default:
      return 'Unknown';
  }
};
