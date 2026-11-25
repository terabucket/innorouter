import { Link } from "react-router";
import { ArrowDown, ArrowUp, UserRound } from "lucide-react";

import { OnlineBadge } from "~/components/status";
import { Card } from "~/components/ui/card";
import { formatBytes, formatRate, usageTotal } from "~/lib/format";
import type { PcInfo } from "~/lib/types";

export function PcCard({ pc }: { pc: PcInfo }) {
  const u = pc.usage;
  return (
    <Link to={`/pcs/${pc.id}`} className="group rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
      <Card className="h-full gap-3 p-4 transition-colors group-hover:border-primary/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold">{pc.name}</div>
            <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <UserRound className="size-3" /> {pc.owner ?? "Unassigned"}
            </div>
          </div>
          <OnlineBadge online={pc.online} />
        </div>
        <div className="font-mono text-xs text-muted-foreground">{pc.ip || "—"} · {pc.mac}</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {(["h1", "h24", "d7"] as const).map((w) => (
            <div key={w} className="rounded-lg bg-muted/50 px-1 py-2">
              <div className="text-[11px] text-muted-foreground">{w === "h1" ? "1 hour" : w === "h24" ? "24 hours" : "1 week"}</div>
              <div className="text-sm font-semibold whitespace-nowrap tabular-nums">{formatBytes(usageTotal(u?.[w]))}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 border-t pt-2.5 text-xs">
          <span className="text-muted-foreground">Current speed</span>
          <span className="whitespace-nowrap tabular-nums">
            <ArrowDown className="inline size-3" /> {formatRate(pc.down_rate)}{" "}
            <ArrowUp className="ml-1 inline size-3" /> {formatRate(pc.up_rate)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
