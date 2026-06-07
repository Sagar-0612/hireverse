# HireVerse — AI Hiring Platform

HireVerse is an AI-assisted applicant-tracking system (ATS): a single dashboard for managing job openings, screening and ranking candidates, scheduling/reviewing interviews, and tracking hiring funnel analytics. This document is the single source of truth for the project — tech stack, architecture, data flow, conventions, and how to run/extend it.

---

## 1. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | [Astro 6](https://astro.build) (`output: 'server'`) | Server-rendered pages + file-based API routes. No client framework (React/Vue) is used — pages are `.astro` with inline `<script>` for interactivity. |
| Adapter | `@astrojs/node` (standalone mode) | Lets Astro run as a self-contained Node server (needed for SSR + API routes outside of serverless platforms). |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + custom CSS variables | Theme tokens defined in `src/styles/global.css` via `@theme` and `:root`/`.dark` CSS variables. Design language documented in `DESIGN.md` (Vercel-inspired: ink/canvas palette, Geist/Inter typography, pill buttons). |
| Database | MongoDB via [Mongoose](https://mongoosejs.com) | Connection helper in `src/db/connection.ts`; schemas in `src/db/models/`. |
| Language | TypeScript (`astro/tsconfigs/strict`) | All API routes, models, and frontmatter are typed. |
| Package manager | npm | See `package.json` / `package-lock.json`. |
| Node | `>=22.12.0` | Declared in `package.json#engines`. |

No authentication layer, ORM beyond Mongoose, or external AI API is wired up yet — "AI" features (resume scoring, interview transcripts, recommendations) are currently **simulated** with seed data and randomized scoring (see §6).

---

## 2. Project Structure

```
.
├── astro.config.mjs        # Astro config: server output, Node adapter, Tailwind Vite plugin
├── DESIGN.md               # Design-system spec (colors, typography, spacing, components)
├── .env                    # MONGODB_URI (not committed — see .env example below)
├── public/                 # Static assets (favicon)
├── src/
│   ├── layouts/
│   │   └── AppLayout.astro # Shared shell: sidebar nav, topbar (search, theme toggle, avatar), auto-seed-on-first-load
│   ├── styles/
│   │   └── global.css      # Tailwind import + design tokens (light/dark CSS variables)
│   ├── data/
│   │   └── mock.ts         # Static mock data (jobs/candidates/interviews/team) — legacy/reference, superseded by MongoDB
│   ├── db/
│   │   ├── connection.ts   # connectDB() — memoized Mongoose connection
│   │   ├── seed.ts         # seedDatabase() — inserts demo Jobs/Candidates/Interviews/Team
│   │   └── models/
│   │       ├── Job.ts
│   │       ├── Candidate.ts
│   │       ├── Interview.ts
│   │       └── Team.ts
│   └── pages/
│       ├── index.astro                    # "/" → redirects to /dashboard
│       ├── dashboard.astro                # KPI overview, recent activity
│       ├── jobs/
│       │   ├── index.astro                # Jobs list (filter/search)
│       │   ├── new.astro                  # Create job form
│       │   ├── [id].astro                 # Job detail (candidates for this job, settings)
│       │   └── [id]/edit.astro            # Edit job form
│       ├── candidates/
│       │   ├── index.astro                # Candidates list (filter by job/status, upload resumes)
│       │   ├── [id].astro                 # Candidate profile (scorecard, resume, status actions)
│       │   └── [id]/journey.astro         # Candidate pipeline timeline / stage history
│       ├── interviews/
│       │   ├── index.astro                # Interviews list (upcoming/completed)
│       │   ├── [id].astro                 # Interview detail (scores, AI transcript summary, recommendation)
│       │   └── schedule.astro             # Schedule-new-interview form
│       ├── analytics/
│       │   └── index.astro                # Funnel chart, monthly trend, hiring metrics
│       ├── team/
│       │   └── index.astro                # Team member directory (CRUD)
│       ├── settings/
│       │   └── index.astro                # App/account settings
│       └── api/                           # JSON REST endpoints (see §4)
│           ├── jobs/{index,[id]}.ts
│           ├── candidates/{index,[id],upload}.ts
│           ├── interviews/{index,[id]}.ts
│           ├── team/{index,[id]}.ts
│           ├── analytics.ts
│           └── seed.ts
└── tsconfig.json
```

---

## 3. Data Model (MongoDB / Mongoose)

All schemas live in `src/db/models/` and use `{ timestamps: true }` (adds `createdAt`/`updatedAt`).

### `Job`
Represents a job posting / requisition.
- Core: `title`, `department`, `location`, `type`, `level`, `salary`, `status` (`active | interviewing | closed | archived`)
- Content: `description`, `responsibilities`, `requiredSkills[]`, `niceToHaveSkills[]`, `education`, `hiringManager`
- AI/screening config: `threshold` (min score % to auto-shortlist), `autoRank`, `aiSummary`, `biasCheck` (booleans toggled in job settings)

### `Candidate`
A person who applied to a `Job` (`jobId` ref).
- Identity: `name`, `email`, `phone`, `location`
- AI scoring: `score`, `experience`, `skillsMatch`, `educationMatch`, `recommendation` (e.g. "Strongly Recommend")
- Pipeline: `status` (`applied → screening → shortlisted → interview → offered → hired` or `rejected`)
- Resume: `resumeName`, `resumeType`, `resumeBase64` (file stored inline as base64 — no external object storage)
- `skills[]`, `notes`

### `Interview`
A scheduled/completed interview round, linking a `Candidate` and `Job`.
- Scheduling: `round`, `interviewer`, `date`, `time`, `duration`, `format`, `status` (`scheduled | completed | cancelled | rescheduled`)
- Post-interview AI evaluation: `commScore`, `techScore`, `confidenceScore`, `recommendation`, `transcriptSummary`, `notes`

### `Team`
Internal HireVerse users (recruiters, hiring managers, interviewers).
- `name`, `email`, `role`, `department`, `status` (`active | inactive`)

### Relationships
```
Job (1) ──< Candidate (N) ──< Interview (N)
                 │                  │
                 └──────────────────┘  (Interview also refs Job directly)
```

---

## 4. API Routes (`src/pages/api/`)

All routes return JSON via a shared `json(data, status)` helper and call `connectDB()` first. ObjectId params are validated with `Types.ObjectId.isValid`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/jobs` | List jobs, optional `?status=` filter |
| POST | `/api/jobs` | Create job (comma-separated `requiredSkills`/`niceToHaveSkills` strings are split into arrays) |
| GET/PUT/DELETE | `/api/jobs/[id]` | Read/update/delete a job |
| GET | `/api/candidates` | List candidates, optional `?jobId=` / `?status=` filters; populates job title/department |
| POST | `/api/candidates` | Create candidate |
| GET/PUT/DELETE | `/api/candidates/[id]` | Read/update/delete a candidate (delete cascades to its `Interview`s) |
| POST | `/api/candidates/upload` | Resume upload — parses filename into a candidate name, generates a **simulated** AI score/recommendation, stores file as base64 |
| GET | `/api/interviews` | List interviews, optional `?status=` / `?jobId=` / `?candidateId=` filters; populates candidate name & job title |
| POST | `/api/interviews` | Schedule an interview |
| PUT/DELETE | `/api/interviews/[id]` | Update (e.g. record scores/outcome) or cancel/delete an interview |
| GET | `/api/team` | List team members |
| POST | `/api/team` | Add team member |
| PUT/DELETE | `/api/team/[id]` | Update / remove team member |
| GET | `/api/analytics` | Aggregate metrics: total counts, hiring funnel (`applied → hired` with counts/percentages), monthly candidate trend (last 6 months) |
| GET | `/api/seed` | Returns current document counts per collection (health check) |
| POST | `/api/seed` | **Destructive** — wipes all collections and re-seeds demo data |

---

## 5. Pages & User Flow

The app is a single authenticated workspace (no login screen yet — a hardcoded user "Maya Kim, Head of Talent" is shown in the sidebar). Navigation is a persistent left sidebar (`AppLayout.astro`) with: **Dashboard → Jobs → Candidates → Interviews → Analytics → Team → Settings**.

1. **`/` → `/dashboard`** — Landing redirect. Dashboard shows KPI cards (open roles, active candidates, interviews this week, etc.) and recent activity pulled from the DB.
2. **Jobs** (`/jobs`) — Browse/filter/search job postings → **`/jobs/new`** to create a posting (skills entered as comma-separated text; auto-rank/AI-summary/bias-check toggles set `Job.threshold`/`autoRank`/`aiSummary`/`biasCheck`) → **`/jobs/[id]`** shows the job plus its ranked candidate list → **`/jobs/[id]/edit`** to modify.
3. **Candidates** (`/candidates`) — Global candidate list filterable by job/status; resumes can be uploaded here (hits `/api/candidates/upload`, which fabricates an AI score/skills-match/recommendation from the filename) → **`/candidates/[id]`** is the candidate's scorecard (AI score breakdown, resume preview from `resumeBase64`, status-change actions, notes) → **`/candidates/[id]/journey`** visualizes their progression through the pipeline stages with timestamps.
4. **Interviews** (`/interviews`) — List of scheduled/completed interviews → **`/interviews/schedule`** books a new round (links a candidate + job + interviewer/date/time) → **`/interviews/[id]`** shows the post-interview AI evaluation (communication/technical/confidence scores, transcript summary, recommendation) and lets reviewers update outcome/status.
5. **Analytics** (`/analytics`) — Visualizes the hiring funnel (`applied → screening → shortlisted → interview → offered → hired`, with conversion percentages) and a 6-month candidate-volume trend, computed live via MongoDB aggregation in `/api/analytics`.
6. **Team** (`/team`) — Directory of internal recruiters/hiring managers/interviewers; add/edit/deactivate members.
7. **Settings** (`/settings`) — App/account-level preferences (theme, etc.).

### Cross-cutting behaviors
- **Auto-seeding**: `AppLayout.astro` calls `connectDB()` on every request; if `Job.countDocuments()` is `0`, it runs `seedDatabase()` automatically — so a fresh database is populated with realistic demo data (5 team members, 8 jobs, 7 candidates, 5 interviews) on first load. DB errors are swallowed so the UI still renders if Mongo is unreachable.
- **Theme**: Dark mode is the default (`<html class="dark">`); a toggle in the topbar flips the `dark` class and persists the choice to `localStorage` under `hv-theme`.
- **Design tokens**: All colors/spacing/typography are CSS variables defined once in `global.css` (and documented for designers in `DESIGN.md`), so light/dark switching just swaps `:root` vs `.dark` variable values — components don't hardcode colors.

---

## 6. "AI" Features — Current State (Simulated)

These are placeholders that mimic an AI pipeline using deterministic/random logic so the UI and data flow can be built and demoed before real model integration:

- **Resume parsing** (`api/candidates/upload.ts`): derives a candidate's display name by cleaning up the uploaded filename (strips `resume/cv/v2` etc., splits camelCase, title-cases). No actual resume text is parsed.
- **Candidate scoring**: `score`, `skillsMatch`, `educationMatch`, `experience` are randomly generated within plausible ranges at upload time; `recommendation` is derived from the resulting `score` via fixed thresholds (`≥88` Strongly Recommend, `≥75` Recommend, `≥65` Consider, else Not Recommended).
- **Interview evaluation**: `commScore`/`techScore`/`confidenceScore`/`transcriptSummary`/`recommendation` on `Interview` are seed-data placeholders meant to represent what an AI call-analysis pipeline would eventually produce.
- **Job-level AI toggles**: `Job.autoRank`, `aiSummary`, `biasCheck`, `threshold` exist as schema fields/UI controls but don't yet drive real automation — they're the intended hooks for future AI integration (e.g. auto-shortlisting candidates whose `score >= threshold`).

> When wiring up real AI (e.g. an LLM for resume parsing/scoring or interview-transcript analysis), these are the exact integration points to replace.

---

## 7. Setup & Development

### Prerequisites
- Node.js `>= 22.12.0`
- A MongoDB instance (local `mongodb://localhost:27017/hireverse` or a hosted Atlas cluster)

### Environment
Create a `.env` file in the project root:
```
MONGODB_URI=mongodb://localhost:27017/hireverse
# or, for Atlas:
# MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/hireverse
```
`src/db/connection.ts` falls back to the local URI above if the env var isn't set.

### Commands
| Command | Action |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server at `http://localhost:4321` |
| `npm run build` | Build production bundle to `./dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run astro -- <cmd>` | Run any Astro CLI command (e.g. `astro check`) |

### Resetting demo data
- Visit/curl `GET /api/seed` to check current document counts.
- `POST /api/seed` wipes all collections and re-inserts the fixtures from `src/db/seed.ts` (5 team members, 8 jobs, 7 candidates, 5 interviews). This also happens automatically the first time the app runs against an empty database.

---

## 8. Conventions & Notes for Contributors

- **No client-side framework**: interactivity is plain `<script>` blocks inside `.astro` files (e.g. theme toggle, mobile sidebar). Keep this consistent unless there's a strong reason to introduce React/Vue/Svelte.
- **API responses always serialize ObjectIds to strings** (`_id: doc._id.toString()`), and populated refs are flattened to plain string IDs plus denormalized display fields (e.g. `jobTitle`, `candidateName`) so the frontend never has to handle Mongoose documents directly.
- **Styling**: prefer the existing CSS variables / utility classes (`.btn`, `.input`, `.nav-item`, `.avatar`, `.card`, etc. — see `global.css`) and the palette/type scale in `DESIGN.md` over ad-hoc styles, to keep light/dark theming consistent.
- **`src/data/mock.ts`** predates the MongoDB integration; the live app reads from MongoDB via the API routes. The mock file is kept for reference/prototyping but isn't imported by the live pages — feel free to remove it once confirmed unused.
- **Cascade deletes**: deleting a `Candidate` removes its `Interview`s; check the `[id].ts` DELETE handlers before adding new related collections so cascades stay consistent.
