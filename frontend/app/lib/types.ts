export type Role = "admin" | "viewer";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  display_name: string;
  pc_count?: number;
}

export type UpdateStatus = "up_to_date" | "available" | "downloading" | "unsupported" | "unknown";

export interface RouterStatus {
  online: boolean;
  response_ms: number | null;
  model: string | null;
  firmware: string | null;
  carrier: string | null;
  network_type: string | null;
  wan_ip: string | null;
  signal_bars: number | null;
  rsrp: number | null;
  rsrq: number | null;
  sinr: number | null;
  csq: number | null;
  unread_sms: number | null;
  update_status: UpdateStatus;
  down_rate: number | null;
  up_rate: number | null;
  today_bytes: number | null;
  month_down: number | null;
  month_up: number | null;
  uptime_seconds: number | null;
  clients_supported: boolean;
  auth_ok: boolean | null;
  last_error: string | null;
  extra: Record<string, unknown>;
  polled_at: string | null;
}

export interface RouterInfo {
  id: number;
  ip: string;
  name: string;
  kind: "huawei" | "usr";
  username: string;
  has_password: boolean;
  enabled: boolean;
  notes: string;
  pc_count: number;
  status?: RouterStatus;
}

export interface Usage {
  rx: number;
  tx: number;
}

export interface PcInfo {
  id: number;
  name: string;
  mac: string;
  ip: string;
  notes: string;
  router_id: number | null;
  router_ip: string | null;
  user_id: number | null;
  owner: string | null;
  auto_discovered: boolean;
  online: boolean;
  hostname: string;
  interface: string;
  down_rate: number;
  up_rate: number;
  last_seen: string | null;
  usage?: { h1: Usage; h24: Usage; d7: Usage; d28: Usage };
}

export interface ChartData {
  buckets: number[];
  step: number;
  series: Record<string, Record<string, (number | null)[]>>;
  labels: Record<string, string>;
}

export interface HistoryPoint {
  t: number;
  label: string;
  rx: number;
  tx: number;
}

export type Theme = "light" | "dark" | "system";
