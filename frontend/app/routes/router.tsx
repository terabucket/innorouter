import { useMemo, type ReactNode } from "react";
import { Link, useNavigate, useRouteLoaderData } from "react-router";
import {
  Activity, ArrowDown, ArrowUp, CalendarDays, ChevronLeft, Clock, Gauge, Info, KeyRound, Settings, SignalHigh,
} from "lucide-react";

import type { Route } from "./+types/router";
import { DataTable, type Column } from "~/components/data-table";
import { PcCard } from "~/components/pc-card";
import { SeriesChart, useRange, type Dataset } from "~/components/series-chart";
import { StatTile } from "~/components/stat-tile";
import { OnlineBadge, SignalBars, SmsBadge, UpdateBadge } from "~/components/status";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { useViewMode, ViewToggle } from "~/components/view-toggle";
import { api } from "~/lib/api.server";
import { formatBytes, formatDuration, formatMs, formatRate, timeAgo, totalRate, usageTotal } from "~/lib/format";
import { useAutoRefresh } from "~/lib/hooks";
import type { ChartData, PcInfo, RouterInfo, User } from "~/lib/types";

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `${loaderData?.router.ip ?? "Router"} · innoRoutes` },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const range = new URL(request.url).searchParams.get("range") ?? "1h";
  const [detail, chart] = await Promise.all([
    api<{ router: RouterInfo; pcs: PcInfo[]; poll_interval: number }>(request, `/api/routers/${params.routerId}`),
    api<ChartData>(request, `/api/routers/${params.routerId}/chart?range=${encodeURIComponent(range)}`),
  ]);
  return { ...detail, chart };
}

const DATASETS: Dataset[] = [
  { key: "down_rate", label: "Download speed", format: formatRate, summable: true },
  { key: "up_rate", label: "Upload speed", format: formatRate, summable: true },
  { key: "usage", label: "Data usage", format: (v) => formatBytes(v), summable: true },
];

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium break-all">{children ?? "—"}</dd>
    </div>
  );
}

export default function RouterPage({ loaderData }: Route.ComponentProps) {
  const { router, pcs, chart, poll_interval } = loaderData;
  const s = router.status!;
  const layout = useRouteLoaderData("routes/app-layout") as { user: User } | undefined;
  const [view, setView] = useViewMode();
  const [range, setRange] = useRange();
  const navigate = useNavigate();
  useAutoRefresh(poll_interval);

  const byHour = useMemo(() => [...pcs].sort((a, b) => usageTotal(b.usage?.h1) - usageTotal(a.usage?.h1)), [pcs]);
  const device = (s.extra?.device ?? {}) as Record<string, string>;

  const usageCell = (w: "h1" | "h24" | "d7") => (p: PcInfo) => (
    <div className="text-xs leading-5">
      <div className="font-medium">{formatBytes(usageTotal(p.usage?.[w]))}</div>
      <div className="text-muted-foreground">↓ {formatBytes(p.usage?.[w].rx)} ↑ {formatBytes(p.usage?.[w].tx)}</div>
    </div>
  );
  const columns: Column<PcInfo>[] = [
    { key: "name", header: "PC", sort: (p) => p.name,
      cell: (p) => <div><div className="font-medium">{p.name}</div><div className="font-mono text-xs text-muted-foreground">{p.mac}</div></div> },
    { key: "owner", header: "Owner", sort: (p) => p.owner, cell: (p) => p.owner ?? <span className="text-muted-foreground">Unassigned</span> },
    { key: "ip", header: "IP", sort: (p) => p.ip, cell: (p) => <span className="font-mono text-xs">{p.ip || "—"}</span> },
    { key: "online", header: "Status", sort: (p) => (p.online ? 1 : 0), cell: (p) => <OnlineBadge online={p.online} /> },
    { key: "h1", header: "1 hour", align: "right", sort: (p) => usageTotal(p.usage?.h1), cell: usageCell("h1") },
    { key: "h24", header: "24 hours", align: "right", sort: (p) => usageTotal(p.usage?.h24), cell: usageCell("h24") },
    { key: "d7", header: "1 week", align: "right", sort: (p) => usageTotal(p.usage?.d7), cell: usageCell("d7") },
    { key: "speed", header: "Current speed", align: "right", sort: (p) => totalRate(p.down_rate, p.up_rate),
      cell: (p) => <div className="text-xs leading-5"><div>↓ {formatRate(p.down_rate)}</div><div className="text-muted-foreground">↑ {formatRate(p.up_rate)}</div></div> },
  ];

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Dashboard
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{router.ip}</h1>
            <OnlineBadge online={s.online} />
            <UpdateBadge status={s.update_status} />
            <SmsBadge count={s.unread_sms} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[router.name, s.model, s.carrier, s.network_type].filter(Boolean).join(" · ")} · polled {timeAgo(s.polled_at)}
          </p>
        </div>
        {layout?.user.role === "admin" && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/routers"><Settings /> Configure</Link>
          </Button>
        )}
      </div>

      {s.last_error && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--status-warning)]/50 bg-[var(--status-warning)]/10 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" /> <span>{s.last_error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={<Activity />} label="Live speed" value={s.online ? formatRate(totalRate(s.down_rate, s.up_rate)) : "—"}
          hint={s.down_rate != null ? <>↓ {formatRate(s.down_rate)} · ↑ {formatRate(s.up_rate)}</> : "not reported"} />
        <StatTile icon={<Gauge />} label="Response time" value={formatMs(s.response_ms)} hint="TCP connect to web UI" />
        <StatTile icon={<SignalHigh />} label="Signal" value={<SignalBars bars={s.signal_bars} />}
          hint={s.rsrp != null ? `RSRP ${Math.round(s.rsrp)} dBm · SINR ${s.sinr?.toFixed(1) ?? "—"} dB`
            : s.csq != null ? `CSQ ${s.csq}/31` : "needs router login"} />
        <StatTile icon={<CalendarDays />} label="Used today" value={formatBytes(s.today_bytes)} />
        <StatTile icon={<CalendarDays />} label="This month" value={formatBytes(s.month_down == null ? null : (s.month_down ?? 0) + (s.month_up ?? 0))}
          hint={s.month_down != null ? <>↓ {formatBytes(s.month_down)} · ↑ {formatBytes(s.month_up)}</> : undefined} />
        <StatTile icon={<Clock />} label="Connected for" value={formatDuration(s.uptime_seconds)} hint="current mobile session" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Router details</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-4">
              <Detail label="Name">{router.name || null}</Detail>
              <Detail label="Model">{s.model}</Detail>
              <Detail label="Type">{router.kind === "huawei" ? "Huawei / Brovi 5G CPE" : "USR IoT 4G router"}</Detail>
              <Detail label="Firmware">{s.firmware}</Detail>
              <Detail label="Carrier">{s.carrier}</Detail>
              <Detail label="Network">{s.network_type}</Detail>
              <Detail label="WAN IP">{s.wan_ip}</Detail>
              {s.rsrq != null && <Detail label="RSRQ">{`${s.rsrq} dB`}</Detail>}
              {device.SerialNumber && <Detail label="Serial">{device.SerialNumber}</Detail>}
              {device.HardwareVersion && <Detail label="Hardware">{device.HardwareVersion}</Detail>}
              {typeof s.extra?.month_reset_date === "string" && <Detail label="Month counter since">{s.extra.month_reset_date}</Detail>}
              <Detail label="Router login">
                <span className="inline-flex items-center gap-1">
                  <KeyRound className="size-3.5" />
                  {!router.has_password ? "No password set" : s.auth_ok === true ? "OK" : s.auth_ok === false ? "Failed" : "Pending"}
                </span>
              </Detail>
              {router.notes && <Detail label="Notes">{router.notes}</Detail>}
          </dl>
        </CardContent>
      </Card>

      <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Client PCs <span className="text-muted-foreground">({pcs.length})</span></h2>
            <ViewToggle value={view} onChange={setView} />
          </div>
          {!s.clients_supported ? (
            <Card className="p-6 text-sm text-muted-foreground">
              This router model does not report connected clients or per-client traffic. PCs assigned to it are listed
              below, but their usage can only be measured by a different method (e.g. an agent on each PC).
            </Card>
          ) : !router.has_password ? (
            <Card className="p-6 text-sm text-muted-foreground">
              Per-PC usage needs the router's admin password. Add it in Settings → Routers to start collecting client data.
            </Card>
          ) : null}
          {view === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {byHour.map((p) => <PcCard key={p.id} pc={p} />)}
              {pcs.length === 0 && <p className="text-sm text-muted-foreground">No PCs on this gateway yet.</p>}
            </div>
          ) : (
            <DataTable rows={pcs} columns={columns} rowKey={(p) => p.id} initialSort={{ key: "h1", dir: "desc" }}
              onRowClick={(p) => navigate(`/pcs/${p.id}`)} empty="No PCs on this gateway yet." />
          )}
      </div>

      <SeriesChart title="Client PCs over time" data={chart} datasets={DATASETS} order={pcs.map((p) => String(p.id))}
        range={range} onRangeChange={setRange} />

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowDown className="size-3" /> download · <ArrowUp className="size-3" /> upload, as seen by the router
      </p>
    </div>
  );
}
