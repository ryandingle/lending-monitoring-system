# Lending Monitoring System

Next.js app for monitoring lending groups and members.

## Roles

- **super-admin**
- **encoder**

## Features

- Authentication: login, logout, edit account information
- Groups: create/list groups (name, description, created date)
- Members: create/list members in a group (balance, savings, optional demographics)
- Savings accrual: exposed as an API endpoint you can call from Cron/EventBridge (idempotent catch-up)

## Quick start (Docker)

### Local development

1. Copy env file:

   - Create `./.env` from `./.env.example`

2. Start:

   - `docker compose -f docker-compose.local.yml up --build`

App: `http://localhost:3005`

## Savings accrual trigger (Cron / EventBridge)

- Endpoint: `POST /api/jobs/accrue-savings`
- Auth: `Authorization: Bearer <LMS_JOBS_API_KEY>` (or `X-Job-Key: <LMS_JOBS_API_KEY>`)
- Env: `SAVINGS_DAILY_INCREMENT` controls the amount (default **20.00**)

### Production-like

- `docker compose -f docker-compose.prod.yml up --build -d`

## Seeded users

Seed creates:

- **super-admin**: `admin@example.com` / `admin123`
- **encoder**: `encoder@example.com` / `encoder123`

---

## Deploy to AWS Amplify

Yes. This app (Next.js with API routes and Prisma) can be deployed on **AWS Amplify Hosting**. API routes run as part of Amplify’s Next.js SSR/compute support.

### Prerequisites

- **PostgreSQL** that Amplify’s runtime can reach (e.g. [Amazon RDS](https://aws.amazon.com/rds/), [Neon](https://neon.tech), [Supabase](https://supabase.com), or any host with a public or VPC-accessible URL).
- **Database migrations** applied to that database (e.g. run `prisma migrate deploy` once from your machine or a CI job, or use a migration step in Amplify).

### Steps

1. **Connect the repo**  
   In [Amplify Console](https://console.aws.amazon.com/amplify/) → Create new app → connect your Git provider and the `lending-monitoring-system` repo (and branch).

2. **Build**  
   Amplify will use the repo’s `amplify.yml`. It runs `npm ci` and `npm run build` (which runs `prisma generate` via `prebuild`). No change needed if your app builds locally.

3. **Environment variables**  
   In Amplify: **App settings → Environment variables**, add:

   | Variable | Required | Notes |
   |----------|----------|--------|
   | `DATABASE_URL` | Yes | PostgreSQL URL (e.g. `postgresql://user:pass@host:5432/dbname`) |
   | `AUTH_SECRET` | Yes | Strong random secret for sessions |
   | `APP_URL` | Yes | Full app URL (e.g. `https://main.xxx.amplifyapp.com`) — set after first deploy |
   | `AUTH_COOKIE_NAME` | No | Default `lms_session` |
   | `LMS_JOBS_API_KEY` | No | For `POST /api/jobs/accrue-savings` (Cron/EventBridge) |
   | `SAVINGS_DAILY_INCREMENT` | No | Default `20.00` |
   | `LMS_MONTHLY_TARGET_PHP` | No | Dashboard gauge (e.g. `20000`) |

   For **server-side** (API routes, SSR), ensure these are set in Amplify’s **Environment variables** for the app; Amplify injects them at runtime.

4. **First deploy**  
   Save and deploy. After the first successful deploy, set `APP_URL` to the real Amplify app URL and redeploy if you had used a placeholder.

5. **Migrations**  
   Amplify’s build does not run `prisma migrate deploy`. Run migrations yourself (e.g. from your machine with `DATABASE_URL` pointing at prod, or from a one-off job/script) so the production DB schema is up to date.

6. **Optional: daily savings accrual**  
   Call `POST /api/jobs/accrue-savings` daily (e.g. [EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/) or an external cron) with header `Authorization: Bearer <LMS_JOBS_API_KEY>` or `X-Job-Key: <LMS_JOBS_API_KEY>`.

### Notes

- **Next.js 16**: Docs mention Next 12–15; Next 16 should work with the same build/artifact setup (`.next`). If you hit issues, try the latest Amplify runtime/Node version in the build image.
- **RDS / private DB**: If the database is in a VPC, use Amplify’s VPC/backend configuration so the Next.js server can reach it, or use a DB with a public URL and restrict access by IP/security group.

