# Outreach Campaign Management

This workspace contains:

- `frontend`: React + TypeScript + Tailwind-ready UI for campaign list and editor flows.
- `backend`: Node.js + Express API that reads and writes campaigns, outreach templates, and application forms in Supabase.
- `shared`: Shared Zod schemas and types used by both sides.

## Environment

The backend reads these variables from `.env`:

- `SUPABASE_URL`
- `SERVICE_ROLE_KEY`
- `PORT` optional, defaults to `3001`
- `CLIENT_ORIGIN` optional, comma-separated list of allowed frontend origins

The frontend can optionally use:

- `VITE_API_BASE_URL` optional, defaults to `http://localhost:3001`

## Backend

From `backend/`:

```bash
npm install
npm run dev
```

API routes:

- `POST /api/campaigns`
- `GET /api/campaigns`
- `GET /api/campaigns/:id`
- `PUT /api/campaigns/:id`
- `PATCH /api/campaigns/:id/status`
- `POST /api/templates`
- `GET /api/templates`
- `GET /api/templates/:id`
- `PUT /api/templates/:id`
- `DELETE /api/templates/:id`
- `POST /api/forms`
- `GET /api/forms`
- `GET /api/forms/:id`
- `PUT /api/forms/:id`
- `POST /api/forms/:id/fields`
- `PUT /api/fields/:id`
- `DELETE /api/fields/:id`

## Frontend

From `frontend/`:

```bash
npm install
npm run dev
```

## Supabase schema

Apply [`backend/supabase/schema.sql`](backend/supabase/schema.sql) to create the `campaigns`, `outreach_templates`, `application_forms`, and `form_fields` tables plus the timestamp trigger.
