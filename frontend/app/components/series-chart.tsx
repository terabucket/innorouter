import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { formatClock } from "~/lib/format";
import { useHydrated } from "~/lib/hooks";
import type { ChartData } from "~/lib/types";
import { cn } from "~/lib/utils";

export interface Dataset {
  key: string;
  label: string;
  format: (v: number) => string;
  /** usage-type datasets can be folded into "Other" by summing */
  summable?: boolean;
  domain?: [number, number];
}

export const RANGES = [
  { value: "1h", label: "1H", seconds: 3600 },
  { value: "6h", label: "6H", seconds: 6 * 3600 },
  { value: "24h", label: "24H", seconds: 86400 },
  { value: "7d", label: "7D", seconds: 7 * 86400 },
];

const MAX_SERIES = 8;
const OTHER = "__other";
const color = (slot: number) => `var(--series-${slot + 1})`;

export function useRange(param = "range") {
  const [params, setParams] = useSearchParams();
  const value = RANGES.some((r) => r.value === params.get(param)) ? params.get(param)! : "1h";
  const set = (v: string) =>
    setParams((p) => {
      p.set(param, v);
      return p;
    }, { preventScrollReset: true, replace: true });
  return [value, set] as const;
}

/** One line per entity (router or PC) for a switchable dataset, on a single shared axis. */
export function SeriesChart({
  title,
  data,
  datasets,
  order,
  range,
  onRangeChange,
  emptyMessage = "No samples in this time range yet.",
}: {
  title: string;
  data: ChartData;
  datasets: Dataset[];
  /** Series ids in stable order: colors follow the entity, not its rank. */
  order: string[];
  range: string;
  onRangeChange: (v: string) => void;
  emptyMessage?: string;
}) {
  const hydrated = useHydrated();
  const [datasetKey, setDatasetKey] = useState(datasets[0].key);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const dataset = datasets.find((d) => d.key === datasetKey) ?? datasets[0];
  const rangeSeconds = RANGES.find((r) => r.value === range)?.seconds ?? 3600;

  const { rows, series, hasData } = useMemo(() => {
    const ids = order.filter((id) => data.series[id]);
    const values = (id: string) => data.series[id]?.[dataset.key] ?? [];
    const total = (id: string) => values(id).reduce<number>((s, v) => s + (v ?? 0), 0);

    let shown = ids;
    let folded: string[] = [];
    if (ids.length > MAX_SERIES) {
      const top = new Set([...ids].sort((a, b) => total(b) - total(a)).slice(0, MAX_SERIES - 1));
      shown = ids.filter((id) => top.has(id));
      folded = ids.filter((id) => !top.has(id));
    }
    const series = shown.map((id, i) => ({ id, label: data.labels[id] ?? id, color: color(i) }));
    if (folded.length && dataset.summable) {
      series.push({ id: OTHER, label: `Other (${folded.length})`, color: "var(--muted-foreground)" });
    }

    const rows = data.buckets.map((t, i) => {
      const row: Record<string, number | null> = { t };
      for (const s of series) {
        row[s.id] = s.id === OTHER
          ? folded.reduce((sum, id) => sum + (values(id)[i] ?? 0), 0)
          : values(s.id)[i] ?? null;
      }
      return row;
    });
    const hasData = rows.some((r) => series.some((s) => r[s.id] != null && r[s.id] !== 0));
    return { rows, series, hasData };
  }, [data, dataset, order]);

  const toggleSeries = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dataset.key} onValueChange={setDatasetKey}>
            <SelectTrigger size="sm" className="w-44" aria-label="Dataset"><SelectValue /></SelectTrigger>
            <SelectContent>
              {datasets.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <ToggleGroup type="single" variant="outline" size="sm" value={range}
            onValueChange={(v) => v && onRangeChange(v)} aria-label="Time range">
            {RANGES.map((r) => <ToggleGroupItem key={r.value} value={r.value}>{r.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {series.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5" role="list" aria-label="Legend">
            {series.map((s) => (
              <button key={s.id} type="button" role="listitem" onClick={() => toggleSeries(s.id)}
                className={cn("inline-flex items-center gap-1.5 text-xs text-foreground", hidden.has(s.id) && "opacity-40")}
                aria-pressed={!hidden.has(s.id)}>
                <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="h-72 w-full">
          {!hydrated ? null : !hasData ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="t" tickFormatter={(t) => formatClock(t, rangeSeconds)} minTickGap={48}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => dataset.format(v).replace(/ /g, "\u00a0")} width={88} domain={dataset.domain ?? ["auto", "auto"]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const items = payload.filter((p) => p.value != null)
                      .sort((a, b) => Number(b.value) - Number(a.value));
                    return (
                      <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                        <div className="mb-1 font-medium">{formatClock(Number(label), rangeSeconds)}</div>
                        {items.map((p) => (
                          <div key={String(p.dataKey)} className="flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ background: p.color }} />
                            <span className="text-muted-foreground">{series.find((s) => s.id === p.dataKey)?.label}</span>
                            <span className="ml-auto pl-3 font-medium tabular-nums">{dataset.format(Number(p.value))}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {series.filter((s) => !hidden.has(s.id)).map((s) => (
                  <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={s.color} strokeWidth={2}
                    dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                    connectNulls={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
