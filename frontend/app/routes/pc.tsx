import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Monitor, UserRound } from "lucide-react";

import type { Route } from "./+types/pc";
import { StatTile } from "~/components/stat-tile";
import { OnlineBadge } from "~/components/status";
import { UsageAreaChart } from "~/components/usage-area-chart";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { api } from "~/lib/api.server";
import { formatBytes, formatRate, timeAgo, totalRate, usageTotal } from "~/lib/format";
import { useAutoRefresh } from "~/lib/hooks";
import type { HistoryPoint, PcInfo } from "~/lib/types";

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `${loaderData?.pc.name ?? "PC"} · innoRoutes` }];

const VIEWS = [
  { value: "hourly", label: "Hourly", caption: "last 24 hours" },
  { value: "daily", label: "Daily", caption: "last 7 days" },
  { value: "weekly", label: "Weekly", caption: "last 4 weeks" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const view = new URL(request.url).searchParams.get("history") ?? "hourly";
  const safeView = VIEWS.some((v) => v.value === view) ? view : "hourly";
  const [detail, history] = await Promise.all([
    api<{ pc: PcInfo; owner_pcs: { id: number; name: string; online: boolean }[]; poll_interval: number }>(
      request, `/api/pcs/${params.pcId}`),
    api<{ points: HistoryPoint[] }>(request, `/api/pcs/${params.pcId}/history?view=${safeView}`),
  ]);
  return { ...detail, points: history.points, view: safeView };
}

export default function PcPage({ loaderData }: Route.ComponentProps) {
  const { pc, owner_pcs, points, view, poll_interval } = loaderData;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  useAutoRefresh(poll_interval);
  const u = pc.usage!;
  const caption = VIEWS.find((v) => v.value === view)?.caption;

  const windows = [
    { key: "h1", label: "Last hour" },
    { key: "h24", label: "Last 24 hours" },
    { key: "d7", label: "Last 7 days" },
    { key: "d28", label: "Last 4 weeks" },
  ] as const;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground"><ChevronLeft className="size-4" /> Dashboard</Link>
        {pc.router_id && (<>
          <ChevronRight className="size-3.5" />
          <Link to={`/routers/${pc.router_id}`} className="font-mono hover:text-foreground">{pc.router_ip}</Link>
        </>)}
        <ChevronRight className="size-3.5" /> <span className="text-foreground">{pc.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Monitor className="size-6 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">{pc.name}</h1>
            <OnlineBadge online={pc.online} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" /> {pc.owner ?? "Unassigned"}</span>
            <span>·</span><span className="font-mono">{pc.ip || "no IP"}</span>
            <span>·</span><span className="font-mono">{pc.mac}</span>
            {pc.interface && <><span>·</span><span>{pc.interface}</span></>}
            <span>·</span><span>last seen {timeAgo(pc.last_seen)}</span>
          </p>
        </div>
        {owner_pcs.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{pc.owner}'s machines</span>
            <Select value={String(pc.id)}
              onValueChange={(id) => navigate({ pathname: `/pcs/${id}`, search: params.toString() })}>
              <SelectTrigger size="sm" className="w-48" aria-label="Switch machine"><SelectValue /></SelectTrigger>
              <SelectContent>
                {owner_pcs.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    <span className={m.online ? "text-[var(--status-good)]" : "text-muted-foreground"}>●</span> {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Current speed" value={formatRate(totalRate(pc.down_rate, pc.up_rate))}
          hint={<><ArrowDown className="inline size-3" /> {formatRate(pc.down_rate)} · <ArrowUp className="inline size-3" /> {formatRate(pc.up_rate)}</>} />
        {windows.map((w) => (
          <StatTile key={w.key} label={w.label} value={formatBytes(usageTotal(u[w.key]))}
            hint={<><ArrowDown className="inline size-3" /> {formatBytes(u[w.key].rx)} · <ArrowUp className="inline size-3" /> {formatBytes(u[w.key].tx)}</>} />
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Network usage</CardTitle>
            <p className="text-sm text-muted-foreground">Download and upload volume, {caption}</p>
          </div>
          <ToggleGroup type="single" variant="outline" size="sm" value={view} aria-label="History view"
            onValueChange={(v) => v && setParams((p) => { p.set("history", v); return p; }, { preventScrollReset: true, replace: true })}>
            {VIEWS.map((v) => <ToggleGroupItem key={v.value} value={v.value}>{v.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          <UsageAreaChart points={points} />
        </CardContent>
      </Card>
    </div>
  );
}
