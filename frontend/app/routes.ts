import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("theme", "routes/theme.tsx"),
  layout("routes/app-layout.tsx", [
    index("routes/dashboard.tsx"),
    route("routers/:routerId", "routes/router.tsx"),
    route("pcs/:pcId", "routes/pc.tsx"),
    route("settings", "routes/settings/layout.tsx", [
      index("routes/settings/index.tsx"),
      route("routers", "routes/settings/routers.tsx"),
      route("pcs", "routes/settings/pcs.tsx"),
      route("users", "routes/settings/users.tsx"),
      route("general", "routes/settings/general.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
