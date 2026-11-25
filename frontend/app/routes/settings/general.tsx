import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { LoaderCircle, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";

import type { Route } from "./+types/general";
import { Field } from "~/components/crud";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { api, apiAction } from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  return api<{ poll_interval: number; auto_discover: boolean }>(request, "/api/admin/settings");
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  if (form.get("intent") === "poll") {
    return { ...(await apiAction(request, "/api/admin/poll-now", { method: "POST" })), intent: "poll" };
  }
  const body = { poll_interval: Number(form.get("poll_interval")), auto_discover: form.get("auto_discover") === "on" };
  return { ...(await apiAction(request, "/api/admin/settings", { method: "PUT", body: JSON.stringify(body) })), intent: "save" };
}

export default function GeneralSettings({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  const busy = (intent: string) => fetcher.state !== "idle" && fetcher.formData?.get("intent") === intent;

  const handled = useRef<typeof fetcher.data>(undefined);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    if (fetcher.data.ok) toast.success(fetcher.data.intent === "poll" ? "All routers polled" : "Polling settings saved");
    else if (fetcher.data.error) toast.error(fetcher.data.error);
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Polling</CardTitle>
          <CardDescription>How often the backend scrapes every enabled router.</CardDescription>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" className="grid gap-4">
            <input type="hidden" name="intent" value="save" />
            <Field label="Scrape interval (seconds)" htmlFor="poll_interval" hint="Between 5 and 3600. Default 30.">
              <Input id="poll_interval" name="poll_interval" type="number" min={5} max={3600} required
                defaultValue={loaderData.poll_interval} className="w-40" />
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <Switch name="auto_discover" defaultChecked={loaderData.auto_discover} className="mt-0.5" />
              <span>
                Add new client PCs automatically
                <span className="block text-xs text-muted-foreground">When a router reports an unknown device with traffic.</span>
              </span>
            </label>
            <div>
              <Button type="submit" disabled={busy("save")}>
                {busy("save") ? <LoaderCircle className="animate-spin" /> : <Save />} Save
              </Button>
            </div>
          </fetcher.Form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Poll now</CardTitle>
          <CardDescription>Scrape every router immediately instead of waiting for the next interval.</CardDescription>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="poll" />
            <Button type="submit" variant="outline" disabled={busy("poll")}>
              <RefreshCw className={busy("poll") ? "animate-spin" : undefined} /> Poll all routers
            </Button>
          </fetcher.Form>
        </CardContent>
      </Card>
    </div>
  );
}
