import { data, redirect } from "react-router";

import { requireAuth, sessionStorage, getSession } from "./session.server";

export const API_URL = process.env.API_URL || "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function errorMessage(res: Response) {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { loc?: string[]; msg: string }) =>
        `${d.loc?.slice(-1)[0] ?? "field"}: ${d.msg}`).join("; ");
    }
  } catch {
    /* not JSON */
  }
  return `${res.status} ${res.statusText}`;
}

/** Call the FastAPI backend as the logged-in user. Redirects to /login when the token expired. */
export async function api<T = unknown>(request: Request, path: string, init: RequestInit = {}): Promise<T> {
  const { token } = await requireAuth(request);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
    });
  } catch {
    throw data({ message: `Backend unreachable at ${API_URL}` }, { status: 503 });
  }
  if (res.status === 401) {
    const session = await getSession(request);
    throw redirect("/login", { headers: { "Set-Cookie": await sessionStorage.destroySession(session) } });
  }
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (res.status === 204 ? null : await res.json()) as T;
}

/** For actions: run an API call and turn failures into `{ error }` for the form. */
export async function apiAction(request: Request, path: string, init: RequestInit) {
  try {
    await api(request, path, init);
    return { ok: true as const, error: null };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false as const, error: e.message };
    throw e;
  }
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).catch(() => null);
  if (!res) return { error: `Backend unreachable at ${API_URL}` };
  if (!res.ok) return { error: await errorMessage(res) };
  return (await res.json()) as { access_token: string; user: import("./types").User };
}
