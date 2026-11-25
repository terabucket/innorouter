import { useRouteLoaderData } from "react-router";
import { Pencil, Plus, ShieldCheck } from "lucide-react";

import type { Route } from "./+types/users";
import { DeleteButton, Field, FormDialog, str } from "~/components/crud";
import { DataTable, type Column } from "~/components/data-table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { api, apiAction } from "~/lib/api.server";
import type { User } from "~/lib/types";

export async function loader({ request }: Route.LoaderArgs) {
  return { users: await api<User[]>(request, "/api/admin/users") };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const id = str(form, "id");
  if (form.get("intent") === "delete") return apiAction(request, `/api/admin/users/${id}`, { method: "DELETE" });

  const password = String(form.get("password") ?? "");
  const body = {
    username: str(form, "username"),
    full_name: str(form, "full_name"),
    password: password || null,
    role: str(form, "role") || "viewer",
    is_active: form.get("is_active") === "on",
  };
  return apiAction(request, id ? `/api/admin/users/${id}` : "/api/admin/users",
    { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
}

function UserForm({ user }: { user?: User }) {
  const p = user ? `u${user.id}-` : "new-";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Username" htmlFor={`${p}username`}>
        <Input id={`${p}username`} name="username" defaultValue={user?.username} autoComplete="off" required minLength={2} />
      </Field>
      <Field label="Full name" htmlFor={`${p}full_name`}>
        <Input id={`${p}full_name`} name="full_name" defaultValue={user?.full_name} />
      </Field>
      <Field label="Password" htmlFor={`${p}password`} hint={user ? "Leave empty to keep the current password." : "At least 8 characters."}>
        <Input id={`${p}password`} name="password" type="password" autoComplete="new-password"
          required={!user} minLength={user ? undefined : 8} />
      </Field>
      <Field label="Role" htmlFor={`${p}role`} hint="Admins can change settings; viewers can only monitor.">
        <Select name="role" defaultValue={user?.role ?? "viewer"}>
          <SelectTrigger id={`${p}role`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Switch name="is_active" defaultChecked={user?.is_active ?? true} /> Account active (can sign in)
      </label>
    </div>
  );
}

export default function UsersSettings({ loaderData }: Route.ComponentProps) {
  const me = (useRouteLoaderData("routes/app-layout") as { user: User } | undefined)?.user;
  const columns: Column<User>[] = [
    { key: "username", header: "Username", sort: (u) => u.username, cell: (u) => <span className="font-medium">{u.username}</span> },
    { key: "full_name", header: "Full name", sort: (u) => u.full_name, cell: (u) => u.full_name || "—" },
    { key: "role", header: "Role", sort: (u) => u.role,
      cell: (u) => u.role === "admin" ? <Badge><ShieldCheck /> admin</Badge> : <Badge variant="secondary">viewer</Badge> },
    { key: "active", header: "Status", sort: (u) => (u.is_active ? 1 : 0),
      cell: (u) => u.is_active ? "Active" : <span className="text-muted-foreground">Disabled</span> },
    { key: "pcs", header: "PCs", align: "right", sort: (u) => u.pc_count, cell: (u) => u.pc_count ?? 0 },
    { key: "actions", header: "", align: "right", cell: (u) => (
      <div className="flex justify-end gap-1">
        <FormDialog title={`Edit ${u.username}`} id={u.id} success={`User ${u.username} saved`}
          trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${u.username}`}><Pencil /></Button>}>
          <UserForm user={u} />
        </FormDialog>
        {u.id !== me?.id && <DeleteButton id={u.id} what="User" name={u.username} />}
      </div>) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Users sign in to this site and can own PCs.</p>
        <FormDialog title="Add user" success="User added" submitLabel="Add user" trigger={<Button size="sm"><Plus /> Add user</Button>}>
          <UserForm />
        </FormDialog>
      </div>
      <DataTable rows={loaderData.users} columns={columns} rowKey={(u) => u.id} initialSort={{ key: "username", dir: "asc" }} />
    </div>
  );
}
