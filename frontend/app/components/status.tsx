import {
  ArrowUpCircle,
  CheckCircle2,
  CircleHelp,
  Download,
  MessageSquare,
  MinusCircle,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { UpdateStatus } from "~/lib/types";
import { cn } from "~/lib/utils";

/** Status colors are reserved and always shown with an icon + label. */
export function OnlineBadge({ online, className }: { online: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      {online ? (
        <Wifi className="size-3.5 text-[var(--status-good)]" aria-hidden />
      ) : (
        <WifiOff className="size-3.5 text-[var(--status-critical)]" aria-hidden />
      )}
      <span className="text-muted-foreground">{online ? "Online" : "Offline"}</span>
    </span>
  );
}

export function SmsBadge({ count }: { count: number | null | undefined }) {
  if (count == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative inline-flex items-center">
          <MessageSquare className={cn("size-5", count ? "text-foreground" : "text-muted-foreground")} />
          <span
            className={cn(
              "absolute -top-1.5 -right-2 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold",
              count ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {count}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{count ? `${count} unread SMS` : "No unread SMS"}</TooltipContent>
    </Tooltip>
  );
}

const UPDATE: Record<UpdateStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  up_to_date: { label: "Up to date", icon: CheckCircle2, className: "border-[var(--status-good)]/40 text-foreground [&>svg]:text-[var(--status-good)]" },
  available: { label: "Update available", icon: ArrowUpCircle, className: "border-[var(--status-warning)]/60 text-foreground [&>svg]:text-[var(--status-warning)]" },
  downloading: { label: "Downloading", icon: Download, className: "border-[var(--series-1)]/50 text-foreground [&>svg]:text-[var(--series-1)]" },
  unsupported: { label: "Not reported", icon: MinusCircle, className: "text-muted-foreground" },
  unknown: { label: "Unknown", icon: CircleHelp, className: "text-muted-foreground" },
};

export function UpdateBadge({ status }: { status: UpdateStatus | undefined }) {
  const u = UPDATE[status ?? "unknown"] ?? UPDATE.unknown;
  const Icon = u.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", u.className)}>
      <Icon /> {u.label}
    </Badge>
  );
}

export function SignalBars({ bars, title }: { bars: number | null | undefined; title?: string }) {
  if (bars == null) {
    return <span className="text-xs text-muted-foreground" title="Signal needs the router password">—</span>;
  }
  const level = Math.max(0, Math.min(5, Math.round(bars)));
  return (
    <span className="inline-flex items-end gap-0.5" title={title ?? `Signal ${level}/5`} aria-label={`Signal ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn("w-1 rounded-sm", i <= level ? "bg-foreground" : "bg-muted-foreground/25")}
          style={{ height: 4 + i * 3 }}
        />
      ))}
    </span>
  );
}
