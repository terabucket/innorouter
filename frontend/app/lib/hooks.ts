import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";

/** Re-run the page loaders every `seconds` while the tab is visible. */
export function useAutoRefresh(seconds: number) {
  const revalidator = useRevalidator();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") revalidator.revalidate();
    }, Math.max(5, seconds) * 1000);
    return () => window.clearInterval(id);
  }, [seconds, revalidator]);
}

export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
