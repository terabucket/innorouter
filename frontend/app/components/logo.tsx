import { cn } from "~/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block shrink-0", className)}>
      <img src="/logo-light.png" alt="" className="size-full rounded-md dark:hidden" />
      <img src="/logo-dark.png" alt="" className="hidden size-full rounded-md dark:block" />
    </span>
  );
}
