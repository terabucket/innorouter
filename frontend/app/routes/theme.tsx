import { data } from "react-router";

import type { Route } from "./+types/theme";
import { themeCookie } from "~/lib/session.server";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const theme = String(form.get("theme"));
  const value = theme === "light" || theme === "dark" ? theme : "system";
  return data({ theme: value }, { headers: { "Set-Cookie": await themeCookie.serialize(value) } });
}
