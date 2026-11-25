import { useSearchParams } from "react-router";
import { LayoutGrid, Table2 } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";

export type ViewMode = "grid" | "table";

/** Grid/table switch kept in the URL (?view=table) so it survives refreshes and sharing. */
export function useViewMode(param = "view"): [ViewMode, (v: ViewMode) => void] {
  const [params, setParams] = useSearchParams();
  const mode: ViewMode = params.get(param) === "table" ? "table" : "grid";
  const set = (v: ViewMode) =>
    setParams((p) => {
      if (v === "grid") p.delete(param);
      else p.set(param, v);
      return p;
    }, { preventScrollReset: true, replace: true });
  return [mode, set];
}

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={value}
      onValueChange={(v) => v && onChange(v as ViewMode)} aria-label="View">
      <ToggleGroupItem value="grid" aria-label="Grid view"><LayoutGrid /> <span className="hidden sm:inline">Grid</span></ToggleGroupItem>
      <ToggleGroupItem value="table" aria-label="Table view"><Table2 /> <span className="hidden sm:inline">Table</span></ToggleGroupItem>
    </ToggleGroup>
  );
}
