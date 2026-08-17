# Design Layout Management

A lightweight task and workflow management web app for an Analog IC / PLL design and layout team.

## Stack

- **Frontend:** React + Vite + Tailwind CSS + Lucide icons
- **Backend:** Express + Prisma + SQLite
- **Notifications:** Nodemailer with a manual/scheduled reminder runner

## Features

- Pending-approval registration flow for Admin / Team Lead, Design Engineer, and Layout Engineer roles
- PLL block matrix tracker for schematic, layout, EMX, and post-layout stages
- Task board and list views with assignee, block, priority, and deadline management
- Dashboard analytics for completion, upcoming deadlines, pending simulations, and approval queue
- Notification reminder/overdue warning workflow with persistent notification logs

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

3. Push the Prisma schema to the local SQLite database:

   ```bash
   npm run db:push
   ```

4. Start the API server:

   ```bash
   npm run dev:server
   ```

5. In a second terminal, start the frontend:

   ```bash
   npm run dev
   ```

6. Open the app at `http://localhost:5173`.

## Environment variables

```bash
DATABASE_URL="file:./dev.db"
PORT=4000
TEAM_LEAD_EMAIL="lead@example.com"
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="pll-workflow@example.com"
CORS_ORIGIN="http://localhost:5173"
VITE_API_BASE_URL=""
ENABLE_NOTIFICATION_SCHEDULER=false
```

- Leave the SMTP values empty to use Nodemailer's JSON transport locally.
- Set `ENABLE_NOTIFICATION_SCHEDULER=true` to run the reminder scan every hour automatically.

## Key API routes

- `POST /api/auth/register`
- `GET /api/users`
- `PATCH /api/users/:id/approval`
- `GET /api/dashboard`
- `GET /api/blocks`
- `POST /api/blocks`
- `PATCH /api/block-stages/:id`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `POST /api/notifications/run-reminders`

## Build

```bash
npm run build
```

## Deploy to the web (free, single service)

In production the Express server also serves the built Vite frontend from the
`dist/` folder, so the whole app (frontend + backend) runs as **one service on
one port**. The `dist/` folder only exists after `vite build`, so local
development keeps using the Vite dev server + proxy exactly as before.

Production scripts:

- `npm run build` – generate the Prisma client, type-check, and build the
  frontend into `dist/`.
- `npm run start` – generate the Prisma client, push the schema to the database
  (creating tables on first boot), and start the Express server which serves both
  the API and the built frontend.

### Option A – Render Blueprint (fastest, near-zero config)

A [`render.yaml`](./render.yaml) blueprint is included.

1. Push this repository to GitHub (see below).
2. In the [Render dashboard](https://dashboard.render.com/), click
   **New + → Blueprint** and select this repository.
3. Render reads `render.yaml` and provisions a free web service with:
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`
   - A 1 GB persistent disk mounted at `/var/data` so the SQLite file survives
     restarts and redeploys (`DATABASE_URL=file:/var/data/dev.db`).
4. Fill in the `sync: false` environment variables (SMTP + team lead email) in
   the dashboard, then click **Apply**.
5. When the deploy finishes, share the public `*.onrender.com` URL with your team.

### Option B – Manual Render / Railway web service

1. Push the repository to GitHub.
2. Create a **New Web Service** and connect the repository.
3. Set:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm run start`
4. Add the environment variables listed below.
5. Deploy and share the generated public URL.

### Environment variables to set in the hosting dashboard

| Variable | Value / notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `file:/var/data/dev.db` for SQLite on a persistent disk, or a PostgreSQL connection string (see below) |
| `TEAM_LEAD_EMAIL` | Seed team-lead email address |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional – leave empty to disable real email sending |
| `ENABLE_NOTIFICATION_SCHEDULER` | `true` to run the reminder scan hourly |

> `PORT` is provided automatically by Render/Railway – do not hard-code it.
> `CORS_ORIGIN` and `VITE_API_BASE_URL` are not needed in the unified deployment
> because the frontend and API are served from the same origin.

### Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### Database: SQLite persistence vs. free PostgreSQL

**SQLite (default).** SQLite stores data in a single file (`DATABASE_URL`). On
Render/Railway the container filesystem is ephemeral, so you **must** attach a
persistent disk and point `DATABASE_URL` at a path on it (the blueprint uses
`/var/data/dev.db`). Without a persistent disk, the database resets on every
redeploy or restart.

**Free PostgreSQL (Supabase / Neon), recommended for multi-user use.** SQLite
allows only one writer at a time, so a hosted PostgreSQL instance is a better fit
for a shared team app. To switch:

1. Create a free database on [Supabase](https://supabase.com/) or
   [Neon](https://neon.tech/) and copy its connection string.
2. Change the datasource provider in [`prisma/schema.prisma`](./prisma/schema.prisma):

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

3. Set `DATABASE_URL` in the hosting dashboard to the PostgreSQL connection
   string (e.g. `******host:5432/dbname?sslmode=require`).
4. Remove the persistent disk block from `render.yaml` – it is only needed for
   SQLite.

`npm run start` runs `prisma db push` on boot, so the tables are created
automatically the first time the app connects to the new database.
