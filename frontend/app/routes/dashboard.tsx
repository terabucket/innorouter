import { useMemo } from "react";
import { useNavigate, useRevalidator } from "react-router";
import { Activity, ArrowDown, ArrowUp, CalendarDays, MessageSquare, RefreshCw, Router as RouterIcon } from "lucide-react";

import type { Route } from "./+types/dashboard";
import { DataTable, type Column } from "~/components/data-table";
import { RouterCard } from "~/components/router-card";
import { SeriesChart, useRange, type Dataset } from "~/components/series-chart";
import { StatTile } from "~/components/stat-tile";
import { OnlineBadge, SignalBars, SmsBadge, UpdateBadge } from "~/components/status";
import { Button } from "~/components/ui/button";
import { useViewMode, ViewToggle } from "~/components/view-toggle";
import { api } from "~/lib/api.server";
import { formatBytes, formatMs, formatRate, timeAgo, totalRate } from "~/lib/format";
import { useAutoRefresh } from "~/lib/hooks";
import type { ChartData, RouterInfo } from "~/lib/types";

export const meta: Route.MetaFunction = () => [{ title: "Dashboard · innoRoutes" }];

export async function loader({ request }: Route.LoaderArgs) {
  const range = new URL(request.url).searchParams.get("range") ?? "1h";
  const [dash, chart] = await Promise.all([
    api<{ routers: RouterInfo[]; poll_interval: number; last_poll: string | null }>(request, "/api/dashboard"),
    api<ChartData>(request, `/api/dashboard/chart?range=${encodeURIComponent(range)}`),
  ]);
  return { ...dash, chart };
}

const DATASETS: Dataset[] = [
  { key: "down_rate", label: "Download speed", format: formatRate },
  { key: "up_rate", label: "Upload speed", format: formatRate },
  { key: "response_ms", label: "Response time", format: formatMs },
  { key: "usage", label: "Data usage", format: (v) => formatBytes(v), summable: true },
  { key: "signal_bars", label: "Signal (bars)", format: (v) => `${v.toFixed(1)}/5`, domain: [0, 5] },
  { key: "rsrp", label: "Signal RSRP", format: (v) => `${Math.round(v)} dBm` },
  { key: "sinr", label: "Signal SINR", format: (v) => `${v.toFixed(1)} dB` },
];

const speed = (r: RouterInfo) => (r.status?.online ? totalRate(r.status.down_rate, r.status.up_rate) : -1);

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { routers, chart, poll_interval, last_poll } = loaderData;
  const [view, setView] = useViewMode();
  const [range, setRange] = useRange();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  useAutoRefresh(poll_interval);

  const bySpeed = useMemo(() => [...routers].sort((a, b) => speed(b) - speed(a)), [routers]);
  const online = routers.filter((r) => r.status?.online).length;
  const down = routers.reduce((s, r) => s + (r.status?.online ? r.status.down_rate ?? 0 : 0), 0);
  const up = routers.reduce((s, r) => s + (r.status?.online ? r.status.up_rate ?? 0 : 0), 0);
  const today = routers.reduce((s, r) => s + (r.status?.today_bytes ?? 0), 0);
  const sms = routers.reduce((s, r) => s + (r.status?.unread_sms ?? 0), 0);

  const columns: Column<RouterInfo>[] = [
    { key: "ip", header: "Router", sort: (r) => r.ip.split(".").map((n) => n.padStart(3, "0")).join("."),
      cell: (r) => (<div><div className="font-mono font-medium">{r.ip}</div><div className="text-xs text-muted-foreground">{r.name}</div></div>) },
    { key: "model", header: "Model", sort: (r) => r.status?.model, cell: (r) => r.status?.model ?? "—" },
    { key: "online", header: "Status", sort: (r) => (r.status?.online ? 1 : 0), cell: (r) => <OnlineBadge online={!!r.status?.online} /> },
    { key: "speed", header: "Live speed", align: "right", sort: speed,
      cell: (r) => r.status?.online && r.status.down_rate != null ? (
        <div className="text-xs leading-5">
          <div><ArrowDown className="inline size-3" /> {formatRate(r.status.down_rate)}</div>
          <div className="text-muted-foreground"><ArrowUp className="inline size-3" /> {formatRate(r.status.up_rate)}</div>
        </div>) : "—" },
    { key: "response", header: "Response", align: "right", sort: (r) => r.status?.response_ms, cell: (r) => formatMs(r.status?.response_ms) },
    { key: "signal", header: "Signal", align: "center", sort: (r) => r.status?.signal_bars, cell: (r) => <SignalBars bars={r.status?.signal_bars} /> },
    { key: "sms", header: "SMS", align: "center", sort: (r) => r.status?.unread_sms, cell: (r) => <SmsBadge count={r.status?.unread_sms} /> },
    { key: "firmware", header: "Firmware", sort: (r) => r.status?.update_status, cell: (r) => <UpdateBadge status={r.status?.update_status} /> },
    { key: "today", header: "Today", align: "right", sort: (r) => r.status?.today_bytes, cell: (r) => formatBytes(r.status?.today_bytes) },
    { key: "month", header: "This month", align: "right",
      sort: (r) => (r.status?.month_down == null ? null : (r.status.month_down ?? 0) + (r.status.month_up ?? 0)),
      cell: (r) => r.status?.month_down == null ? "—" : (
        <div className="text-xs leading-5">
          <div><ArrowDown className="inline size-3" /> {formatBytes(r.status.month_down)}</div>
          <div className="text-muted-foreground"><ArrowUp className="inline size-3" /> {formatBytes(r.status.month_up)}</div>
        </div>) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gateways</h1>
          <p className="text-sm text-muted-foreground">
            {routers.length} routers · polled every {poll_interval}s · last poll {timeAgo(last_poll)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => revalidator.revalidate()} disabled={revalidator.state !== "idle"}>
            <RefreshCw className={revalidator.state !== "idle" ? "animate-spin" : undefined} /> Refresh
          </Button>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<RouterIcon />} label="Online" value={`${online} / ${routers.length}`} hint="gateways reachable" />
        <StatTile icon={<Activity />} label="Live throughput" value={formatRate(down + up)}
          hint={<><ArrowDown className="inline size-3" /> {formatRate(down)} · <ArrowUp className="inline size-3" /> {formatRate(up)}</>} />
        <StatTile icon={<CalendarDays />} label="Used today" value={formatBytes(today)} hint="routers that report usage" />
        <StatTile icon={<MessageSquare />} label="Unread SMS" value={sms} hint="across all gateways" />
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {bySpeed.map((r) => <RouterCard key={r.id} router={r} />)}
          {routers.length === 0 && <p className="text-muted-foreground">No routers configured yet. Add them in Settings.</p>}
        </div>
      ) : (
        <DataTable rows={routers} columns={columns} rowKey={(r) => r.id}
          initialSort={{ key: "speed", dir: "desc" }} onRowClick={(r) => navigate(`/routers/${r.id}`)}
          empty="No routers configured yet." />
      )}

      <SeriesChart title="Router status over time" data={chart} datasets={DATASETS}
        order={routers.map((r) => String(r.id))} range={range} onRangeChange={setRange} />
    </div>
  );
}
