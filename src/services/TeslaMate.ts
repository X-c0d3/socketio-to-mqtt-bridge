import axios from 'axios';
import { AppConfig } from '../constants/Constants';
import { JSDOM } from 'jsdom';
import { createEmptyTeslaMate, TeslaMateResponse } from '../types/TeslaMateResponse';

function getRowValue(document: Document, label: string): { value: string; tooltip: string } {
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
}

function parseLocation(document: Document): { lat?: number; lng?: number } {
  const input = document.querySelector('input[id^="position_"]') as HTMLInputElement | null;
  if (!input?.value) return {};

  const [lat, lng] = input.value.split(',').map(Number);

  return {
    lat: isFinite(lat) ? lat : undefined,
    lng: isFinite(lng) ? lng : undefined,
  };
}

function extractTooltipsFromIcons(document: Document): string[] {
  const iconsDiv = document.querySelector('.icons.ml-5');
  if (!iconsDiv) return [];

  const tooltipElements = iconsDiv.querySelectorAll('[data-tooltip]');
  const tooltips = Array.from(tooltipElements)
    .filter((el) => !el.classList.contains('spinner'))
    .map((el) => el.getAttribute('data-tooltip')?.trim() || '')
    .filter((text) => text !== '');

  return tooltips;
}

function parseTeslaMateHtml(dom: any): TeslaMateResponse {
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
  tesla.speed = r.value ? parseFloat(r.value.replace(/[^0-9.]/g, '')) : -1;

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

  const now = new Date();
  tesla.lastUpdate = now
    .toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    })
    .replace(',', ' at');

  return tesla;
}

const getTeslaMateInfo = async (): Promise<TeslaMateResponse | null> => {
  try {
    const res = await axios.get(`${AppConfig.TESLAMATE_URL}`, {
      timeout: 5000,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      },
    });

    const dom = new JSDOM(res.data);
    return parseTeslaMateHtml(dom);
  } catch (err) {
    console.error(err);
    return null;
  }
};

export { getTeslaMateInfo };
