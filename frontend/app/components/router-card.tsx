import { Link } from "react-router";
import { ArrowDown, ArrowUp, Gauge, MonitorSmartphone } from "lucide-react";

import { OnlineBadge, SignalBars, SmsBadge, UpdateBadge } from "~/components/status";
import { Card } from "~/components/ui/card";
import { formatMs, formatRate } from "~/lib/format";
import type { RouterInfo } from "~/lib/types";

export function RouterCard({ router }: { router: RouterInfo }) {
  const s = router.status;
  const online = !!s?.online;
  return (
    <Link to={`/routers/${router.id}`} className="group rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
      <Card className="h-full gap-4 p-5 transition-colors group-hover:border-primary/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-mono text-lg font-semibold tracking-tight">{router.ip}</div>
            <div className="truncate text-sm text-muted-foreground">
              {s?.model ?? (router.kind === "usr" ? "USR" : "Huawei")}{router.name ? ` · ${router.name}` : ""}
            </div>
          </div>
          <SmsBadge count={s?.unread_sms} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/50 p-2.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowDown className="size-3" /> Download</div>
            <div className="mt-0.5 font-semibold tabular-nums">{online ? formatRate(s?.down_rate) : "—"}</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-2.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowUp className="size-3" /> Upload</div>
            <div className="mt-0.5 font-semibold tabular-nums">{online ? formatRate(s?.up_rate) : "—"}</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <OnlineBadge online={online} />
          <span className="inline-flex items-center gap-1 text-muted-foreground" title="Response time">
            <Gauge className="size-3.5" /> <span className="tabular-nums text-foreground">{formatMs(s?.response_ms)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5" title="Signal quality">
            <SignalBars bars={s?.signal_bars} />
            {s?.network_type && <span className="text-xs text-muted-foreground">{s.network_type}</span>}
          </span>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <UpdateBadge status={s?.update_status} />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MonitorSmartphone className="size-3.5" /> {router.pc_count} PC{router.pc_count === 1 ? "" : "s"}
          </span>
        </div>
      </Card>
    </Link>
  );
}
