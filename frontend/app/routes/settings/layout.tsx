import { NavLink, Outlet, redirect } from "react-router";
import { MonitorSmartphone, Router as RouterIcon, SlidersHorizontal, Users } from "lucide-react";

import type { Route } from "./+types/layout";
import { requireAuth } from "~/lib/session.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = () => [{ title: "Settings · innoRoutes" }];

export async function loader({ request }: Route.LoaderArgs) {
  const { user } = await requireAuth(request);
  if (user.role !== "admin") throw redirect("/");
  return null;
}

const TABS = [
  { to: "routers", label: "Routers", icon: RouterIcon },
  { to: "pcs", label: "PCs", icon: MonitorSmartphone },
  { to: "users", label: "Users", icon: Users },
  { to: "general", label: "Polling", icon: SlidersHorizontal },
];

export default function SettingsLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure gateways, client PCs, users and polling.</p>
      </div>
      <nav className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4" /> {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
