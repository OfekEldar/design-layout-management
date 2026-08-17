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
