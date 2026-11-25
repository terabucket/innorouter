import { Form, redirect, useActionData, useNavigation, useSearchParams } from "react-router";
import { LoaderCircle } from "lucide-react";

import type { Route } from "./+types/login";
import { Logo } from "~/components/logo";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { login } from "~/lib/api.server";
import { getSession, sessionStorage } from "~/lib/session.server";

export const meta: Route.MetaFunction = () => [{ title: "Sign in · innoRoutes" }];

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (session.get("token")) throw redirect("/");
  return null;
}

function safeRedirect(to: FormDataEntryValue | null) {
  const value = typeof to === "string" ? to : "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "Enter your username and password." };

  const result = await login(username, password);
  if ("error" in result) return { error: result.error };

  const session = await getSession(request);
  session.set("token", result.access_token);
  session.set("user", result.user);
  return redirect(safeRedirect(form.get("redirectTo")), {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const busy = navigation.state !== "idle";

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mx-auto mb-2 size-16" />
          <CardTitle className="text-xl">innoRoutes</CardTitle>
          <CardDescription>Sign in to monitor your gateways</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid gap-4">
            <input type="hidden" name="redirectTo" value={params.get("redirectTo") ?? "/"} />
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" autoComplete="username" autoFocus required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {actionData?.error && (
              <p role="alert" className="text-sm text-destructive">{actionData.error}</p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy && <LoaderCircle className="animate-spin" />}
              Sign in
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
