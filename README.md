# Àjọfún — Open-Source Multi-Group Anonymous Gifter

An open-source, multi-group Anonymous Gifter gift exchange platform powered by **Neon PostgreSQL**, **Neon Auth**, **Neon Data API + Row-Level Security (RLS)**, a lightweight **Python (FastAPI)** backend for blind draws and invite previews, and a **React + TypeScript + Vite** frontend.

## Features

- **Multi-Group Isolation:** Anyone can create an independent gift exchange with its own budget, date, invite link, and participant roster.
- **Database-Enforced Secrecy (RLS):** PostgreSQL Row-Level Security guarantees that participants can only read *their own* outgoing assignment (`giver_id = auth.user_id()`). Neither the browser nor direct Data API queries can inspect who drew whom.
- **Blind Organizer Draw:** The FastAPI backend computes a cryptographically randomized derangement respecting exclusion rules and writes pairings inside a single transaction without returning the pairs in the response—so even the organizer can participate without spoiling the surprise.
- **Frictionless Invite Onboarding:** Guests open `/join/CODE`, see a safe public preview (title, budget, date, member count), sign in via Email/Password or Google OAuth, and submit their wishlist in one step.
- **Exclusion Rules:** Organizers can prevent specific people (such as couples or housemates) from drawing each other before running the draw.
- **Wishlists & Anonymous Q&A:** Participants share gift ideas, dislikes, and delivery notes, and Anonymous Gifters can message their match anonymously without exposing their identity.

---

## Architecture

```text
secret santa/
├── db/
│   └── schema.sql        # Neon PostgreSQL tables, app_private helpers, RLS policies & role grants
├── backend/              # Python + FastAPI (public invite preview, verified join, blind draw)
│   ├── app/
│   └── tests/
├── frontend/             # React + TypeScript + Vite + Tailwind CSS v3 (Neon Auth + Data API fetch client)
│   └── src/
├── start.ps1             # One-command runner for both backend and frontend on Windows
└── README.md
```

- **Frontend → Neon Auth & Neon Data API (`src/lib/neon.ts`):** Handles sign-up/sign-in (Email + Password and Google OAuth), creating/updating exchanges, editing wishlists, managing exclusions, revealing matches, and anonymous Q&A—all strictly enforced by PostgreSQL RLS.
- **Frontend → FastAPI Backend:** Handles the three operations that require controlled privilege escalation:
  1. `GET /api/invites/{code}` — unauthenticated invite preview returning non-PII summary only.
  2. `POST /api/invites/{code}/join` — verifies an invite code before inserting a participant.
  3. `POST /api/exchanges/{id}/draw` & `/reset-draw` — blind Anonymous Gifter matching respecting exclusions.

---

## Setup Guide

### 1. Create a Neon Project & Enable Auth + Data API

1. Sign in to the [Neon Console](https://console.neon.tech) and create a new project.
2. **Enable Neon Auth:**
   - Open **Auth** in the sidebar and click **Enable Auth**.
   - Under **Providers**, enable **Email & Password** and **Google** (configure your Google OAuth Client ID/Secret in the Neon Auth console).
   - Add your frontend URL (`http://localhost:5173` for local dev) to the trusted/redirect origins if prompted.
   - Copy your **Auth Base URL** (e.g. `https://ep-xxx.neonauth.us-east-2.aws.neon.build/neondb/auth`).
3. **Enable Neon Data API:**
   - Open **Data API** in the sidebar and enable it with **Neon Auth** as the auth provider.
   - Copy your **Data API URL** (e.g. `https://ep-xxx.apirest.us-east-2.aws.neon.build/neondb/rest/v1`).
4. **Apply the Database Schema:**
   - Open the **SQL Editor** in the Neon Console (or connect with `psql "$DATABASE_URL"`), paste the contents of `db/schema.sql`, and run it.

---

### 2. Run the Python Backend

Requires Python 3.11+ and [`uv`](https://docs.astral.sh/uv/).

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
DATABASE_URL=postgresql://user:password@ep-xxx.aws.neon.tech/neondb?sslmode=require
NEON_AUTH_URL=https://ep-xxx.neonauth.us-east-2.aws.neon.build/neondb/auth
FRONTEND_URL=http://localhost:5173
```

Install dependencies and start the server:

```bash
uv sync --all-extras --python 3.11
uv run --python 3.11 python -m uvicorn app.main:app --reload --port 8000
```

Run backend tests:

```bash
uv run --python 3.11 python -m pytest -v
```

---

### 3. Run the React Frontend

Requires Node.js 20+.

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_NEON_AUTH_URL=https://ep-xxx.neonauth.us-east-2.aws.neon.build/neondb/auth
VITE_NEON_DATA_API_URL=https://ep-xxx.apirest.us-east-2.aws.neon.build/neondb/rest/v1
VITE_API_URL=http://localhost:8000
```

Install dependencies and start Vite:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

### Quick Start (Run Both Servers)

Once both `backend\.env` and `frontend\.env` are configured, you can launch both the FastAPI backend (`:8000`) and the Vite frontend (`:5173`) together from the project root in PowerShell:

```powershell
cd "C:\Users\NEW USER\Desktop\secret santa"
.\start.ps1
```

Press `Ctrl+C` in that terminal to stop both servers cleanly.

---

## License

MIT
