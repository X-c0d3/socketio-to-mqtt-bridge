export interface TeslaWallConnectorVitals {
  contactor_closed: boolean;
  vehicle_connected: boolean;
  session_s: number;

  grid_v: number;
  grid_hz: number;

  vehicle_current_a: number;
  currentA_a: number;
  currentB_a: number;
  currentC_a: number;
  currentN_a: number;

  voltageA_v: number;
  voltageB_v: number;
  voltageC_v: number;

  relay_coil_v: number;

  pcba_temp_c: number;
  handle_temp_c: number;
  mcu_temp_c: number;

  uptime_s: number;

  input_thermopile_uv: number;
  prox_v: number;

  pilot_high_v: number;
  pilot_low_v: number;

  session_energy_wh: number;

  config_status: number;
  evse_state: number;
  statusName: string;

  current_alerts: number[]; // ปกติเป็น array ว่าง
  evse_not_ready_reasons: number[];
}

export enum EvseState {
  Unknown = 0,
  NotReady = 1,
  Ready = 2,
  Charging = 3,
  Fault = 4,
}

export interface TeslaWallConnectorWifiStatus {
  wifi_ssid: string;
  wifi_signal_strength: number; // %
  wifi_rssi: number; // dBm
  wifi_snr: number; // dB
  wifi_connected: boolean;
  wifi_infra_ip: string; // IPv4
  internet: boolean;
  wifi_mac: string; // MAC address
}

export interface TeslaWallConnectorLifetimeStats {
  contactor_cycles: number;
  contactor_cycles_loaded: number;
  alert_count: number;
  thermal_foldbacks: number;
  avg_startup_temp: number;

  charge_starts: number;
  energy_wh: number;

  connector_cycles: number;
  uptime_s: number;
  charging_time_s: number;
}

export interface TeslaWallConnectorDeviceInfo {
  firmware_version: string;
  git_branch: string;
  part_number: string;
  serial_number: string;
  web_service: string;
}
