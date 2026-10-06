/*
  # Author : Watchara Pongsri
  # [github/X-c0d3] https://github.com/X-c0d3/
  # Web Site: https://www.rockdevper.com
*/

import axios from 'axios';
import { AppConfig } from '../constants/Constants';
import { JSDOM } from 'jsdom';
import { createEmptyTeslaMate, TeslaMateResponse } from '../types/TeslaMateResponse';
import { getDistanceKm, toLocalDateTimeTH } from '../util/Helper';

const notChargeStatus: string[] = ['offline', 'sleep'];
const chargingStatus: string[] = ['charging'];
const getRowValue = (document: Document, label: string): { value: string; tooltip: string } => {
  const rows = document.querySelectorAll('tbody tr');

  for (const row of rows) {
    const labelTd = row.querySelector('td.has-text-weight-medium');
    if (!labelTd) continue;

    if (labelTd.textContent?.trim() === label) {
      const valueTd = labelTd.nextElementSibling as HTMLElement | null;
      if (!valueTd) return { value: '', tooltip: '' };

      const tooltip = valueTd.querySelector('[data-tooltip]')?.getAttribute('data-tooltip') ?? '';
      const span = row.querySelector('span[id^="scheduled_start_time_"]');
      if (span && label === 'Scheduled Charging') {
        const dataDate = span.getAttribute('data-date') as any;
        const date = new Date(dataDate);
        return {
          value: date.toLocaleTimeString('en-US', {
            timeZone: 'Asia/Bangkok',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          }),
          tooltip: '',
        };
      }

      return {
        value: valueTd.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        tooltip: tooltip.replace(/\s+/g, ' ').trim(),
      };
    }
  }

  return { value: '', tooltip: '' };
};

const parseLocation = (document: Document): { lat?: number; lng?: number } => {
  const input = document.querySelector('input[id^="position_"]') as HTMLInputElement | null;
  if (!input?.value) return {};

  const [lat, lng] = input.value.split(',').map(Number);

  return {
    lat: isFinite(lat) ? lat : undefined,
    lng: isFinite(lng) ? lng : undefined,
  };
};

const getDistanceFromHomeKm = (lat?: number, lng?: number): number | null => {
  if (lat === undefined || lng === undefined) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)
    || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const coordinates = AppConfig.HOME_LOCATION?.split(',').map(value => value.trim());
  if (!coordinates) return null;
  if (coordinates.length !== 2 || coordinates.some(value => value === '')) {
    console.warn('Invalid HOME_LOCATION format. Use "lat,lon"');
    return null;
  }

  const [homeLat, homeLon] = coordinates.map(Number);
  if (!Number.isFinite(homeLat) || !Number.isFinite(homeLon)
    || Math.abs(homeLat) > 90 || Math.abs(homeLon) > 180) {
    console.warn('Invalid HOME_LOCATION coordinates');
    return null;
  }

  return getDistanceKm({ lat, lon: lng }, { lat: homeLat, lon: homeLon });
};

const getPreferredDistanceFromHomeKm = async (lat?: number, lng?: number): Promise<number | null> => {
  const fallback = getDistanceFromHomeKm(lat, lng);
  if (fallback === null) return null;
  const [homeLat, homeLon] = AppConfig.HOME_LOCATION!.split(',').map(Number);
  const radius = AppConfig.OSRM_MAX_SNAP_DISTANCE_METERS;
  const timeout = AppConfig.OSRM_TIMEOUT_MS;
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(timeout) || timeout <= 0) {
    console.warn('Invalid OSRM settings; using straight-line distance');
    return fallback;
  }

  try {
    const baseUrl = AppConfig.OSRM_URL.replace(/\/+$/, '');
    const response = await axios.get<{
      code?: string;
      routes?: { distance?: number }[];
      waypoints?: { distance?: number }[];
    }>(`${baseUrl}/route/v1/driving/${lng},${lat};${homeLon},${homeLat}`, {
      timeout,
      params: { overview: false, radiuses: `${radius};${radius}` },
    });
    const { code, routes, waypoints } = response.data;
    const distance = routes?.[0]?.distance;
    // Limit snapping: a regional map must not pull distant coordinates onto its edge.
    if (code === 'Ok' && typeof distance === 'number' && Number.isFinite(distance)
      && distance >= 0 && waypoints?.length === 2
      && waypoints.every(point => typeof point.distance === 'number'
        && Number.isFinite(point.distance) && point.distance >= 0 && point.distance <= radius)) {
      return distance / 1000;
    }
    console.warn('OSRM returned no usable route; using straight-line distance');
  } catch (error: unknown) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    console.warn(`OSRM request failed${status ? ` (HTTP ${status})` : ''}; using straight-line distance`);
  }
  return fallback;
};

const getModelName = (document: Document): string => {
  const modelElement = document.querySelector('.media-content .subtitle');
  return modelElement?.textContent?.replace(/\s+/g, ' ').trim() || '';
};

const extractTooltipsFromIcons = (document: Document): string[] => {
  const iconsDiv = document.querySelector('.icons.ml-5');
  if (!iconsDiv) return [];

  const tooltipElements = iconsDiv.querySelectorAll('[data-tooltip]');
  const tooltips = Array.from(tooltipElements)
    .filter((el) => !el.classList.contains('spinner'))
    .map((el) => el.getAttribute('data-tooltip')?.trim() || '')
    .filter((text) => text !== '');

  return tooltips;
};

const parseTeslaMateHtml = (dom: any): TeslaMateResponse => {
  const document = dom.window.document;

  const tesla = createEmptyTeslaMate();

  let r;

  // Status
  r = getRowValue(document, 'Status');
  tesla.status = r.value;

  //Remaining Time'
  r = getRowValue(document, 'Remaining Time');
  tesla.remaining_time = r.value;

  //Expected Finish Time
  r = getRowValue(document, 'Expected Finish Time');
  tesla.expected_finish_time = r.value;

  // Range (rated)
  r = getRowValue(document, 'Range (rated)');
  tesla.range_rated = parseFloat(r.value.replace('km', '')) || 0;

  //Charged
  r = getRowValue(document, 'Charged');
  tesla.charged = r.value;

  //Charger Power
  r = getRowValue(document, 'Charger Power');
  tesla.charger_power = r.value;

  r = getRowValue(document, 'Scheduled Charging');
  tesla.scheduled_charging = r.value;

  r = getRowValue(document, 'Charge Limit');
  tesla.charge_limit = parseInt(r.value.replace('%', ''), 10) || 0;

  // Range (est.)
  r = getRowValue(document, 'Range (est.)');
  tesla.range_estimated = parseFloat(r.value.replace('km', '')) || 0;

  // SOC + tooltip
  r = getRowValue(document, 'State of Charge');
  tesla.soc = parseInt(r.value.replace('%', ''), 10) || 0;
  tesla.estimated_range_100 = r.tooltip;

  // Outside temp
  r = getRowValue(document, 'Outside Temperature');
  tesla.temp_outside = parseFloat(r.value.replace('°C', '')) || 0;

  // Inside temp
  r = getRowValue(document, 'Inside Temperature');
  tesla.temp_inside = parseFloat(r.value.replace('°C', '')) || 0;

  // Mileage
  r = getRowValue(document, 'Mileage');
  tesla.mileage = parseInt(r.value.replace(/km|,/g, ''), 10) || -1;

  // Speed
  r = getRowValue(document, 'Speed');
  tesla.speed = r.value ? parseFloat(r.value.replace(/[^0-9.]/g, '')) : 0;

  // Version (อยู่ใน <a>)
  const versionLink = document.querySelector('a[href*="software-updates/version"]');
  if (versionLink) {
    tesla.version = versionLink.textContent?.trim() ?? '';
  }

  const indicatorIcons = extractTooltipsFromIcons(document);
  if (indicatorIcons.includes('Locked')) tesla.isLocked = true;
  else if (indicatorIcons.includes('Unlocked')) tesla.isLocked = false;

  tesla.isPluggedIn = indicatorIcons.includes('Plugged In');

  const loc = parseLocation(document);
  tesla.lat = loc.lat;
  tesla.lng = loc.lng;
  tesla.distanceFromHomeKm = getDistanceFromHomeKm(loc.lat, loc.lng);

  tesla.lastUpdate = toLocalDateTimeTH().replace(',', ' at');
  tesla.isOnline = !notChargeStatus.some(x => tesla?.status.toLowerCase().includes(x.toLowerCase()));
  tesla.isCharging = chargingStatus.some(x => tesla?.status.toLowerCase().includes(x.toLowerCase()));
  tesla.modelName = getModelName(document);

  return tesla;
};

const getTeslaMateInfo = async (): Promise<TeslaMateResponse | null> => {
  try {
    const res = await axios.get(`${AppConfig.TESLAMATE_URL}`, {
      timeout: 5000,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      },
    });

    const dom = new JSDOM(res.data);
    const tesla = parseTeslaMateHtml(dom);
    const distance = await getPreferredDistanceFromHomeKm(tesla.lat, tesla.lng);
    tesla.distanceFromHomeKm = distance === null ? null : Number(distance.toFixed(3));
    return tesla;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export { getTeslaMateInfo };
