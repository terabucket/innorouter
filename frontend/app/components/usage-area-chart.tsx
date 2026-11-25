import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatBytes } from "~/lib/format";
import { useHydrated } from "~/lib/hooks";
import type { HistoryPoint } from "~/lib/types";

const SERIES = [
  { key: "rx", label: "Download", color: "var(--series-1)" },
  { key: "tx", label: "Upload", color: "var(--series-2)" },
] as const;

/** Stacked download/upload volume per hour, day or week. */
export function UsageAreaChart({ points }: { points: HistoryPoint[] }) {
  const hydrated = useHydrated();
  const hasData = points.some((p) => p.rx || p.tx);

  return (
    <div>
      <div className="mb-3 flex gap-4" role="list" aria-label="Legend">
        {SERIES.map((s) => (
          <span key={s.key} role="listitem" className="inline-flex items-center gap-1.5 text-xs">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <div className="h-80 w-full">
        {!hydrated ? null : !hasData ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No traffic recorded for this period yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 32, bottom: 0, left: 0 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.08} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" minTickGap={24} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => formatBytes(v).replace(/ /g, "\u00a0")} width={72}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as HistoryPoint;
                  return (
                    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                      <div className="mb-1 font-medium">{label}</div>
                      {SERIES.map((s) => (
                        <div key={s.key} className="flex items-center gap-2">
                          <span className="size-2 rounded-sm" style={{ background: s.color }} />
                          <span className="text-muted-foreground">{s.label}</span>
                          <span className="ml-auto pl-3 font-medium tabular-nums">{formatBytes(p[s.key])}</span>
                        </div>
                      ))}
                      <div className="mt-1 flex border-t pt-1">
                        <span className="text-muted-foreground">Total</span>
                        <span className="ml-auto pl-3 font-medium tabular-nums">{formatBytes(p.rx + p.tx)}</span>
                      </div>
                    </div>
                  );
                }}
              />
              {SERIES.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} stackId="usage" stroke={s.color} strokeWidth={2}
                  fill={`url(#fill-${s.key})`} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
