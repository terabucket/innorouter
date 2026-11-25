# innoRoutes frontend

React Router v8 framework mode (the continuation of Remix), started from the official
`create-react-router` template, with Tailwind CSS v4, shadcn/ui and Recharts.

```bash
npm install
cp .env.example .env   # API_URL, SESSION_SECRET
npm run dev            # http://localhost:5173
npm run typecheck
npm run build && npm start
```

- `app/routes/`: pages (dashboard, router, PC, settings/*, login)
- `app/lib/api.server.ts`: server-side calls to the FastAPI backend with the user's token
- `app/lib/session.server.ts`: login session and theme cookies
- `app/components/`: cards, sortable table, charts, status badges

See the root README for the full setup.
