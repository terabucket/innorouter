import { Form, Link, NavLink, Outlet, useNavigation } from "react-router";
import { LayoutDashboard, LogOut, Settings, UserRound } from "lucide-react";

import type { Route } from "./+types/app-layout";
import { Logo } from "~/components/logo";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { requireAuth } from "~/lib/session.server";
import { cn } from "~/lib/utils";

export async function loader({ request }: Route.LoaderArgs) {
  const { user } = await requireAuth(request);
  return { user };
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn("inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground");

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const navigation = useNavigation();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Logo className="size-8" />
            <span className="hidden sm:inline">innoRoutes</span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              <LayoutDashboard className="size-4" /> <span className="hidden sm:inline">Dashboard</span>
            </NavLink>
            {user.role === "admin" && (
              <NavLink to="/settings" className={navClass}>
                <Settings className="size-4" /> <span className="hidden sm:inline">Settings</span>
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserRound /> <span className="hidden sm:inline">{user.display_name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal">
                  <div className="font-medium">{user.display_name}</div>
                  <div className="text-xs text-muted-foreground">{user.username} · {user.role}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <Form method="post" action="/logout">
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full"><LogOut /> Sign out</button>
                  </DropdownMenuItem>
                </Form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className={cn("h-0.5 bg-primary transition-opacity", navigation.state === "loading" ? "animate-pulse opacity-100" : "opacity-0")} />
      </header>
      <main className="mx-auto max-w-screen-2xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
