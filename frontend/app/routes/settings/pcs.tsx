import { Pencil, Plus, Sparkles } from "lucide-react";

import type { Route } from "./+types/pcs";
import { DeleteButton, Field, FormDialog, str } from "~/components/crud";
import { DataTable, type Column } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { api, apiAction } from "~/lib/api.server";
import type { PcInfo, RouterInfo, User } from "~/lib/types";

export async function loader({ request }: Route.LoaderArgs) {
  const [pcs, routers, users] = await Promise.all([
    api<PcInfo[]>(request, "/api/admin/pcs"),
    api<RouterInfo[]>(request, "/api/admin/routers"),
    api<User[]>(request, "/api/admin/users"),
  ]);
  return { pcs, routers, users };
}

const NONE = "none";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const id = str(form, "id");
  if (form.get("intent") === "delete") return apiAction(request, `/api/admin/pcs/${id}`, { method: "DELETE" });

  const ref = (key: string) => (str(form, key) && str(form, key) !== NONE ? Number(str(form, key)) : null);
  const body = {
    name: str(form, "name"), mac: str(form, "mac"), ip: str(form, "ip"),
    router_id: ref("router_id"), user_id: ref("user_id"), notes: str(form, "notes"),
  };
  return apiAction(request, id ? `/api/admin/pcs/${id}` : "/api/admin/pcs",
    { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
}

function PcForm({ pc, routers, users }: { pc?: PcInfo; routers: RouterInfo[]; users: User[] }) {
  const p = pc ? `pc${pc.id}-` : "new-";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" htmlFor={`${p}name`}>
        <Input id={`${p}name`} name="name" defaultValue={pc?.name} placeholder="ALICE-DESKTOP" required />
      </Field>
      <Field label="MAC address" htmlFor={`${p}mac`}>
        <Input id={`${p}mac`} name="mac" defaultValue={pc?.mac} placeholder="AA:BB:CC:DD:EE:FF" required
          pattern="([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}" className="font-mono" />
      </Field>
      <Field label="IP address" htmlFor={`${p}ip`} hint="Updated automatically when the router reports it.">
        <Input id={`${p}ip`} name="ip" defaultValue={pc?.ip} placeholder="192.168.9.101" />
      </Field>
      <Field label="Gateway (router)" htmlFor={`${p}router`}>
        <Select name="router_id" defaultValue={pc?.router_id ? String(pc.router_id) : NONE}>
          <SelectTrigger id={`${p}router`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No gateway</SelectItem>
            {routers.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.ip}{r.name ? ` · ${r.name}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Owner (user)" htmlFor={`${p}user`}>
        <Select name="user_id" defaultValue={pc?.user_id ? String(pc.user_id) : NONE}>
          <SelectTrigger id={`${p}user`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Unassigned</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Notes" htmlFor={`${p}notes`}>
        <Input id={`${p}notes`} name="notes" defaultValue={pc?.notes} />
      </Field>
    </div>
  );
}

export default function PcsSettings({ loaderData }: Route.ComponentProps) {
  const { pcs, routers, users } = loaderData;
  const columns: Column<PcInfo>[] = [
    { key: "name", header: "Name", sort: (p) => p.name,
      cell: (p) => (
        <span className="inline-flex items-center gap-2 font-medium">
          {p.name}
          {p.auto_discovered && <Badge variant="outline" className="font-normal"><Sparkles /> discovered</Badge>}
        </span>) },
    { key: "mac", header: "MAC", sort: (p) => p.mac, cell: (p) => <span className="font-mono text-xs">{p.mac}</span> },
    { key: "ip", header: "IP", sort: (p) => p.ip, cell: (p) => <span className="font-mono text-xs">{p.ip || "—"}</span> },
    { key: "router", header: "Gateway", sort: (p) => p.router_ip, cell: (p) => p.router_ip ? <span className="font-mono">{p.router_ip}</span> : "—" },
    { key: "owner", header: "Owner", sort: (p) => p.owner, cell: (p) => p.owner ?? <span className="text-muted-foreground">Unassigned</span> },
    { key: "actions", header: "", align: "right", cell: (p) => (
      <div className="flex justify-end gap-1">
        <FormDialog title={`Edit ${p.name}`} id={p.id} success={`PC ${p.name} saved`}
          trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`}><Pencil /></Button>}>
          <PcForm pc={p} routers={routers} users={users} />
        </FormDialog>
        <DeleteButton id={p.id} what="PC" name={p.name} />
      </div>) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          PCs are matched to router data by MAC address. New devices with traffic are added automatically.
        </p>
        <FormDialog title="Add PC" success="PC added" submitLabel="Add PC" trigger={<Button size="sm"><Plus /> Add PC</Button>}>
          <PcForm routers={routers} users={users} />
        </FormDialog>
      </div>
      <DataTable rows={pcs} columns={columns} rowKey={(p) => p.id} initialSort={{ key: "name", dir: "asc" }} empty="No PCs yet." />
    </div>
  );
}
