import { createCookie, createCookieSessionStorage, redirect } from "react-router";

import type { Theme, User } from "./types";

export type { Theme };

const sessionSecret = process.env.SESSION_SECRET || "dev-only-session-secret";

export const sessionStorage = createCookieSessionStorage<{ token: string; user: User }>({
  cookie: {
    name: "__innoroutes",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    secrets: [sessionSecret],
    maxAge: 60 * 60 * 12,
  },
});

export async function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function requireAuth(request: Request) {
  const session = await getSession(request);
  const token = session.get("token");
  const user = session.get("user");
  if (!token || !user) {
    const url = new URL(request.url);
    throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return { token, user };
}

export async function logout(request: Request) {
  const session = await getSession(request);
  return redirect("/login", { headers: { "Set-Cookie": await sessionStorage.destroySession(session) } });
}

export const themeCookie = createCookie("theme", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });

export async function getTheme(request: Request): Promise<Theme> {
  const value = await themeCookie.parse(request.headers.get("Cookie"));
  return value === "light" || value === "dark" ? value : "system";
}
