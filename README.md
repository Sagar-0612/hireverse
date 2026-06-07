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
| Resume parsing | `pdf-parse`, `mammoth`, `word-extractor` | Extract raw text from `.pdf`, `.docx`, and legacy `.doc` resumes respectively (see `src/lib/resumeAnalysis.ts` and §6). |
| Language | TypeScript (`astro/tsconfigs/strict`) | All API routes, models, and frontmatter are typed. |
| Package manager | npm | See `package.json` / `package-lock.json`. |
| Node | `>=22.12.0` | Declared in `package.json#engines`. Repo has been run on Node v24 without issues. |

No authentication layer or ORM beyond Mongoose is wired up yet, and there's no external LLM API call. Resume parsing & candidate scoring are **real** — implemented with deterministic text extraction + heuristic scoring (see §6) — while interview-evaluation fields (`commScore`/`techScore`/transcript summaries) remain seed/manual-entry placeholders for a future AI integration.

---

## 2. Project Structure

```
.
├── astro.config.mjs        # Astro config: server output, Node adapter, Tailwind Vite plugin
├── DESIGN.md               # Design-system spec (colors, typography, spacing, components)
├── .env                    # MONGODB_URI (not committed — copy .env.example to create it, see §7)
├── .env.example            # Template for the local .env file (committed)
├── public/                 # Static assets (favicon)
├── src/
│   ├── layouts/
│   │   └── AppLayout.astro # Shared shell: sidebar nav, topbar (search, theme toggle, avatar), auto-seed-on-first-load
│   ├── styles/
│   │   └── global.css      # Tailwind import + design tokens (light/dark CSS variables)
│   ├── lib/
│   │   ├── resumeAnalysis.ts # extractResumeText() + analyzeResume() — real text extraction & heuristic scoring (see §6)
│   │   ├── pipeline.ts       # Shared helpers for per-job configurable hiring pipelines (stage colors/icons/order)
│   │   └── activity.ts       # logActivity() — writes denormalized entries to the ActivityLog audit trail
│   ├── db/
│   │   ├── connection.ts   # connectDB() — memoized Mongoose connection
│   │   ├── seed.ts         # seedDatabase() — inserts demo Jobs/Candidates/Interviews/Team
│   │   └── models/
│   │       ├── Job.ts          # incl. embedded `pipeline[]` — per-job configurable hiring stages
│   │       ├── Candidate.ts
│   │       ├── Interview.ts
│   │       ├── Team.ts
│   │       └── ActivityLog.ts  # Audit-trail entries (job/candidate/interview/stage/team actions)
│   └── pages/
│       ├── index.astro                    # "/" → redirects to /dashboard
│       ├── dashboard.astro                # KPI overview, recent activity
│       ├── 404.astro / 500.astro          # Error pages
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
│           ├── candidates/{index,[id],upload,[id]/resume}.ts
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
- `pipeline[]`: an **ordered, embedded array of `{ key, label, color, icon, order }`** stages — each job defines its own hiring pipeline (no hardcoded stage names/counts anywhere else in the app). Helpers for rendering/sorting stages live in `src/lib/pipeline.ts`.

### `Candidate`
A person who applied to a `Job` (`jobId` ref).
- Identity: `name`, `email`, `phone`, `location`, `locationConfidence` (`high | medium | low | none` — how confident the resume parser is in the extracted location)
- AI scoring: `score`, `experience`, `skillsMatch`, `educationMatch`, `recommendation` (e.g. "Strongly Recommend") — all derived from real resume content, see §6
- Pipeline: `status` — set to the `key` of one of the job's configured `pipeline[]` stages (defaults follow `applied → screening → shortlisted → interview → offered → hired`, or `rejected`)
- Resume: `resumeName`, `resumeType`, `resumeBase64` (file stored inline as base64 — no external object storage; downloadable via `/api/candidates/[id]/resume`)
- `skills[]`, `notes`

### `Interview`
A scheduled/completed interview round, linking a `Candidate` and `Job`.
- Scheduling: `round`, `interviewer`, `date`, `time`, `duration`, `format`, `status` (`scheduled | completed | cancelled | rescheduled`)
- Post-interview AI evaluation: `commScore`, `techScore`, `confidenceScore`, `recommendation`, `transcriptSummary`, `notes`

### `Team`
Internal HireVerse users (recruiters, hiring managers, interviewers).
- `name`, `email`, `role`, `department`, `status` (`active | inactive`)

### `ActivityLog`
Append-only audit trail written by `logActivity()` (`src/lib/activity.ts`) whenever a job/candidate/interview/stage/team action happens.
- `type` (`job | candidate | interview | stage | team`), `action`, `message` (frozen, human-readable — stays meaningful even after the referenced entity is deleted), `actor`, `entityType`, `entityId`, `jobId`, `candidateId`, `meta`
- Indexed on `createdAt` (descending) for fast "recent activity" queries; only `createdAt` timestamp is kept (no `updatedAt` — entries are immutable)

### Relationships
```
Job (1) ──< Candidate (N) ──< Interview (N)
                 │                  │
                 └──────────────────┘  (Interview also refs Job directly)

ActivityLog — denormalized audit entries referencing Job/Candidate by id + frozen display strings
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
| POST | `/api/candidates/upload` | Resume upload — extracts real text from the file (`extractResumeText`), runs `analyzeResume()` against the job's requirements for a real score/skills-match/recommendation, de-dupes by email/filename, drops the candidate into the job's first configured pipeline stage, stores the file as base64, and writes an `ActivityLog` entry |
| GET | `/api/candidates/[id]/resume` | Download the candidate's stored resume file (streams `resumeBase64` back with its original filename/MIME type) |
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
3. **Candidates** (`/candidates`) — Global candidate list filterable by job/status; resumes can be uploaded here (hits `/api/candidates/upload`, which extracts the resume's real text and scores it against the target job — see §6) → **`/candidates/[id]`** is the candidate's scorecard (real score breakdown, resume preview/download from `resumeBase64`, status-change actions, notes) → **`/candidates/[id]/journey`** visualizes their progression through the job's configured pipeline stages with timestamps.
4. **Interviews** (`/interviews`) — List of scheduled/completed interviews → **`/interviews/schedule`** books a new round (links a candidate + job + interviewer/date/time) → **`/interviews/[id]`** shows the post-interview AI evaluation (communication/technical/confidence scores, transcript summary, recommendation) and lets reviewers update outcome/status.
5. **Analytics** (`/analytics`) — Visualizes the hiring funnel (`applied → screening → shortlisted → interview → offered → hired`, with conversion percentages) and a 6-month candidate-volume trend, computed live via MongoDB aggregation in `/api/analytics`.
6. **Team** (`/team`) — Directory of internal recruiters/hiring managers/interviewers; add/edit/deactivate members.
7. **Settings** (`/settings`) — App/account-level preferences (theme, etc.).

### Cross-cutting behaviors
- **Auto-seeding**: `AppLayout.astro` calls `connectDB()` on every request; if `Job.countDocuments()` is `0`, it runs `seedDatabase()` automatically — so a fresh database is populated with realistic demo data (5 team members, 8 jobs, 7 candidates, 5 interviews) on first load. DB errors are swallowed so the UI still renders if Mongo is unreachable.
- **Theme**: Dark mode is the default (`<html class="dark">`); a toggle in the topbar flips the `dark` class and persists the choice to `localStorage` under `hv-theme`.
- **Design tokens**: All colors/spacing/typography are CSS variables defined once in `global.css` (and documented for designers in `DESIGN.md`), so light/dark switching just swaps `:root` vs `.dark` variable values — components don't hardcode colors.

---

## 6. Resume Analysis — Real, Heuristic (Not an LLM)

`src/lib/resumeAnalysis.ts` does **real** text extraction and scoring — there is no random/placeholder data here, and no external AI API call either. It's deterministic regex/heuristic analysis of the actual resume content:

- **Text extraction** (`extractResumeText`): reads the real bytes of the uploaded file —
  - `.pdf` → `pdf-parse` (`PDFParse#getText`)
  - `.docx` → `mammoth` (`extractRawText`)
  - `.doc` (legacy binary/OLE2) → `word-extractor` (mammoth can't read this format; without this branch every `.doc` upload silently produced empty text)
  - anything else → decoded as UTF-8 only if it looks like printable text (`isLikelyText`)
- **Field extraction** (`analyzeResume` / helpers in the same file), all derived from the extracted text with layered heuristics and graceful fallbacks:
  - `name` — tries a labeled `"Name: ..."` line first (common in consultancy/corporate templates), then scans the first ~15 lines for a name-shaped line while filtering out section headers (`SECTION_HEADER_RE`) and contact-info noise (`NAME_NOISE`); falls back to cleaning up the filename (`extractNameFromFilename`)
  - `email` / `phone` — straightforward regex extraction with digit-count sanity checks on phone candidates
  - `location` + `locationConfidence` — tiered matching from `"City, ST"` (high confidence) down to a bare capitalized line (low confidence), actively comparing candidates against the already-extracted name and job-title noise words so it doesn't mistake the candidate's own name or role for their city
  - `experience` — parses every date range in the resume (`"Sept 2019 – May 2023"`, `"2016 - Present"`, etc.), classifies each as work vs. education by nearby keywords (`EDU_NEARBY_RE`), merges overlapping/concurrent ranges, and sums only the actually-covered months — gaps between jobs are intentionally **not** counted, capped at 45 years
  - `skills`, `skillsMatch`, `educationMatch`, `score`, `recommendation` — matched against the specific `Job`'s `requiredSkills[]` / `niceToHaveSkills[]` / `education`, so the same resume scores differently against different job postings
- **Job-level AI toggles**: `Job.autoRank`, `aiSummary`, `biasCheck`, `threshold` exist as schema fields/UI controls. `threshold` is the intended cutoff for auto-shortlisting (`score >= threshold`); `autoRank`/`aiSummary`/`biasCheck` are present in the schema/UI as hooks for future automation but don't yet drive behavior beyond display.
- **Interview evaluation** (`commScore`/`techScore`/`confidenceScore`/`transcriptSummary`/`recommendation` on `Interview`) is the one area still backed by seed/manual-entry data — it represents what a future AI call-analysis pipeline would produce, and is the next clear integration point for a real LLM/transcription service.

> If you're extending the scoring logic, start in `src/lib/resumeAnalysis.ts` — it's self-contained, heavily commented on the *why* of each heuristic, and has no external dependencies beyond the three parsing libraries above.

---

## 7. Setup & Development — including moving to a new machine

This section is the **complete, from-scratch checklist** — everything needed to get HireVerse running on a brand-new machine lives here. Nothing required to run the app should exist only on one computer.

### 7.1 Prerequisites
- **Node.js `>= 22.12.0`** (declared in `package.json#engines`; this repo has also been run successfully on Node v24)
- **npm** (ships with Node) — this is the package manager used; `package-lock.json` is committed and authoritative
- **Git**
- **A MongoDB instance** — either:
  - local MongoDB (`mongodb://localhost:27017/hireverse`), or
  - a hosted **MongoDB Atlas** cluster (recommended specifically *because* it travels with you across machines — no local DB to install/sync)

### 7.2 Clone & install
```bash
git clone https://github.com/Sagar-0612/hireverse.git
cd hireverse
npm install
```
`node_modules/` and `dist/` are gitignored and **must be regenerated** on every machine via `npm install` / `npm run build` — they are never committed.

### 7.3 Environment — the one thing that does NOT travel via git
`.env` is gitignored (it holds your MongoDB credentials) and will **not** exist after cloning on a new machine. You must recreate it yourself every time:

```bash
cp .env.example .env       # macOS/Linux
copy .env.example .env     # Windows (cmd)
Copy-Item .env.example .env  # Windows (PowerShell)
```

Then edit `.env` and set your real connection string:
```
MONGODB_URI=mongodb://localhost:27017/hireverse
# or, for Atlas (recommended when you switch machines often — same DB everywhere):
# MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/hireverse
```
`src/db/connection.ts` falls back to the local URI above if the env var isn't set, so the app will still boot without a `.env` — but it'll try to reach a local Mongo instance.

> **Tip for working across multiple machines**: point every machine's `.env` at the *same* Atlas cluster (rather than separate local MongoDB installs). That way your jobs/candidates/interviews/activity history are identical everywhere, with nothing to export/import or keep in sync.

### 7.4 Run it
| Command | Action |
|---|---|
| `npm install` | Install dependencies (run this first, and again after pulling changes that touch `package.json`) |
| `npm run dev` | Start dev server at `http://localhost:4321` |
| `npm run build` | Build production bundle to `./dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run astro -- <cmd>` | Run any Astro CLI command (e.g. `astro check`) |

On first run against an empty database, `AppLayout.astro` auto-seeds demo data (5 team members, 8 jobs, 7 candidates, 5 interviews) — see §5 "Auto-seeding". So a fresh clone + fresh DB needs nothing more than `npm install && npm run dev` to show a populated UI.

### 7.5 Resetting demo data
- Visit/curl `GET /api/seed` to check current document counts.
- `POST /api/seed` wipes all collections and re-inserts the fixtures from `src/db/seed.ts` (5 team members, 8 jobs, 7 candidates, 5 interviews). This also happens automatically the first time the app runs against an empty database.

### 7.6 What's tracked in git vs. machine-local
| Tracked in git (travels with the repo) | Machine-local (recreate on each machine) |
|---|---|
| All source under `src/`, configs (`astro.config.mjs`, `tsconfig.json`, `package.json`/`package-lock.json`), `DESIGN.md`, `README.md`, `.env.example`, `.gitignore`, `.agents/` skills, `.claude/settings.local.json` | `.env` (your `MONGODB_URI` — see §7.3), `node_modules/` (`npm install`), `dist/` & `.astro/` (build output, regenerated by `npm run build` / `npm run dev`), `.vscode/` (editor-local; `extensions.json`/`launch.json` exist locally but are gitignored) |

### 7.7 Repository
- Remote: `https://github.com/Sagar-0612/hireverse.git`
- Default branch: `main`

---

## 8. Conventions & Notes for Contributors

- **No client-side framework**: interactivity is plain `<script>` blocks inside `.astro` files (e.g. theme toggle, mobile sidebar). Keep this consistent unless there's a strong reason to introduce React/Vue/Svelte.
- **API responses always serialize ObjectIds to strings** (`_id: doc._id.toString()`), and populated refs are flattened to plain string IDs plus denormalized display fields (e.g. `jobTitle`, `candidateName`) so the frontend never has to handle Mongoose documents directly.
- **Styling**: prefer the existing CSS variables / utility classes (`.btn`, `.input`, `.nav-item`, `.avatar`, `.card`, etc. — see `global.css`) and the palette/type scale in `DESIGN.md` over ad-hoc styles, to keep light/dark theming consistent.
- **Per-job pipelines are configurable, not hardcoded**: a candidate's `status` is the `key` of one of that job's `pipeline[]` stages (`src/db/models/Job.ts` / `src/lib/pipeline.ts`). Don't hardcode stage names/order/colors anywhere — read them from the job document and use the `sortedPipeline()` / `getIconSvg()` helpers.
- **Audit everything user-visible**: significant job/candidate/interview/stage/team actions should call `logActivity()` (`src/lib/activity.ts`) with a frozen, human-readable `message` string — the dashboard's "recent activity" and the candidate journey both read from `ActivityLog`, and history must stay legible even after the referenced entity is deleted.
- **Resume scoring is heuristic, not an LLM call** (see §6) — when improving it, keep changes inside `src/lib/resumeAnalysis.ts` and prefer adding/adjusting regex heuristics with a comment explaining the *why* (the file is full of these — they document real-world resume-template quirks that motivated each rule).
- **Cascade deletes**: deleting a `Candidate` removes its `Interview`s; check the `[id].ts` DELETE handlers before adding new related collections so cascades stay consistent.
