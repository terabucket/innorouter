import { KeyRound, Pencil, Plus } from "lucide-react";

import type { Route } from "./+types/routers";
import { DeleteButton, Field, FormDialog, str } from "~/components/crud";
import { DataTable, type Column } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { api, apiAction } from "~/lib/api.server";
import type { RouterInfo } from "~/lib/types";

export async function loader({ request }: Route.LoaderArgs) {
  return { routers: await api<RouterInfo[]>(request, "/api/admin/routers") };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const id = str(form, "id");
  if (form.get("intent") === "delete") return apiAction(request, `/api/admin/routers/${id}`, { method: "DELETE" });

  const password = String(form.get("password") ?? "");
  const body = {
    ip: str(form, "ip"),
    name: str(form, "name"),
    kind: str(form, "kind") || "huawei",
    username: str(form, "username") || "admin",
    // empty field keeps the saved password; the checkbox clears it
    password: form.get("clear_password") ? "" : password || (id ? null : ""),
    enabled: form.get("enabled") === "on",
    notes: str(form, "notes"),
  };
  return apiAction(request, id ? `/api/admin/routers/${id}` : "/api/admin/routers",
    { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
}

function RouterForm({ router }: { router?: RouterInfo }) {
  const p = router ? `r${router.id}-` : "new-";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="IP address" htmlFor={`${p}ip`}>
        <Input id={`${p}ip`} name="ip" defaultValue={router?.ip} placeholder="192.168.9.14" required />
      </Field>
      <Field label="Display name" htmlFor={`${p}name`}>
        <Input id={`${p}name`} name="name" defaultValue={router?.name} placeholder="Gateway 14" />
      </Field>
      <Field label="Router type" htmlFor={`${p}kind`}>
        <Select name="kind" defaultValue={router?.kind ?? "huawei"}>
          <SelectTrigger id={`${p}kind`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="huawei">Huawei / Brovi 5G CPE</SelectItem>
            <SelectItem value="usr">USR IoT (USR-G815)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Admin username" htmlFor={`${p}username`}>
        <Input id={`${p}username`} name="username" defaultValue={router?.username ?? "admin"} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Admin password" htmlFor={`${p}password`}
          hint={router?.has_password ? "A password is saved. Leave empty to keep it." : "Needed for signal, firmware and per-PC data."}>
          <Input id={`${p}password`} name="password" type="password" autoComplete="new-password"
            placeholder={router?.has_password ? "••••••••" : ""} />
        </Field>
        {router?.has_password && (
          <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="clear_password" className="accent-[var(--primary)]" /> Remove the saved password
          </label>
        )}
      </div>
      <div className="sm:col-span-2">
        <Field label="Notes" htmlFor={`${p}notes`}>
          <Input id={`${p}notes`} name="notes" defaultValue={router?.notes} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Switch name="enabled" defaultChecked={router?.enabled ?? true} /> Poll this router
      </label>
    </div>
  );
}

export default function RoutersSettings({ loaderData }: Route.ComponentProps) {
  const columns: Column<RouterInfo>[] = [
    { key: "ip", header: "IP", sort: (r) => r.ip.split(".").map((n) => n.padStart(3, "0")).join("."),
      cell: (r) => <span className="font-mono font-medium">{r.ip}</span> },
    { key: "name", header: "Name", sort: (r) => r.name, cell: (r) => r.name || "—" },
    { key: "kind", header: "Type", sort: (r) => r.kind, cell: (r) => r.kind === "huawei" ? "Huawei / Brovi" : "USR IoT" },
    { key: "user", header: "Login", sort: (r) => (r.has_password ? 1 : 0),
      cell: (r) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <KeyRound className="size-3.5 text-muted-foreground" /> {r.username}
          {r.has_password ? <Badge variant="secondary">password saved</Badge> : <Badge variant="outline">no password</Badge>}
        </span>) },
    { key: "enabled", header: "Polling", sort: (r) => (r.enabled ? 1 : 0),
      cell: (r) => r.enabled ? <Badge variant="secondary">on</Badge> : <Badge variant="outline">paused</Badge> },
    { key: "pcs", header: "PCs", align: "right", sort: (r) => r.pc_count, cell: (r) => r.pc_count },
    { key: "actions", header: "", align: "right", cell: (r) => (
      <div className="flex justify-end gap-1">
        <FormDialog title={`Edit ${r.ip}`} id={r.id} success={`Router ${r.ip} saved`}
          trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.ip}`}><Pencil /></Button>}>
          <RouterForm router={r} />
        </FormDialog>
        <DeleteButton id={r.id} what="Router" name={r.ip} />
      </div>) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Routers are polled on the interval set under Polling.</p>
        <FormDialog title="Add router" success="Router added" submitLabel="Add router"
          trigger={<Button size="sm"><Plus /> Add router</Button>}>
          <RouterForm />
        </FormDialog>
      </div>
      <DataTable rows={loaderData.routers} columns={columns} rowKey={(r) => r.id} empty="No routers yet." />
    </div>
  );
}
