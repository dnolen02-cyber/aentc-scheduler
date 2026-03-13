# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AENTC Scheduling Assistant — a secure web app for Austin ENT & Allergy clinical schedulers to identify the correct provider/location for a patient using an AI engine backed by live scheduling rules.

## Commands

```bash
# Install all dependencies (use /tmp/npm-cache to avoid permission issues with system npm cache)
npm install --cache /tmp/npm-cache          # root (server deps)
cd client && npm install --cache /tmp/npm-cache  # client deps

# Development (runs server on :3001 and Vite on :5173 concurrently)
npm run dev

# Run server only
npm run dev:server

# Run client only
npm run dev:client

# Build React client for production
npm run build

# Start production server (serves built client as static files)
npm start
```

## Architecture

Monorepo with two layers:

- **`server/`** — Node.js + Express REST API (port 3001)
  - `index.js` — app entry point, static serving of React build
  - `db.js` — SQLite init, schema creation, seed data
  - `auth.js` — bcryptjs + JWT helpers
  - `middleware/authenticate.js` — JWT validation middleware
  - `routes/auth.js` — `/api/auth/*` (login, change-password, forgot-password, reset-password)
  - `routes/schedule.js` — `/api/schedule/query` (AI call)
  - `routes/admin.js` — `/api/admin/*` (rules, users, allergy log)
  - `services/ai.js` — assembles system prompt from DB rules + calls Anthropic SDK

- **`client/`** — React + Vite SPA (port 5173 in dev; served from Express in prod)
  - Tailwind CSS with AENTC brand palette (see `tailwind.config.js`)
  - JWT stored in React state only — not localStorage or cookies
  - Vite proxy: `/api` → `localhost:3001` in dev

## Key Architecture Decisions

**AI prompt assembly**: System prompt is built dynamically at query time by concatenating all `scheduling_rules` rows from the DB. Admins edit rules via the UI; changes take effect immediately on the next query — no restart needed.

**Auto-logging**: After every AI response, the backend parses the `{"_meta":{...}}` JSON block that the AI always appends. If `is_sinus_allergy` is `true`, a record is written to `allergy_sinus_log`. The frontend strips the `_meta` block before displaying to the user.

**bcryptjs vs bcrypt**: This project uses `bcryptjs` (pure JS) instead of `bcrypt` (native). The API is identical — just `require('bcryptjs')`.

**No PHI**: No patient names, DOB, or MRN are stored anywhere. The DB only logs complaint, insurance, age, and provider recommendations.

## Environment Variables

Copy `.env.example` to `.env` and fill in values. On Replit, use Replit Secrets instead of `.env`.

Required: `ANTHROPIC_API_KEY`, `JWT_SECRET`, `ADMIN_SETUP_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

## Build Steps (from TechSpec Section 12)

1. ✅ Project setup — done
2. Database (`db.js` schema + seed data)
3. Auth (login, JWT middleware, change-password)
4. First-run setup screen (`/setup`)
5. Scheduler UI (form + placeholder AI response)
6. AI integration (prompt assembly + Anthropic API)
7. Auto-logging (parse AI metadata → `allergy_sinus_log`)
8. Admin panel (Rules Editor → User Management → Allergy Log)
9. CSV export
10. Polish (loading states, error handling)
11. Replit deployment
