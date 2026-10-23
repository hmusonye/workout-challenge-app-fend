# REPS — Fitness Challenge Tracker

A mobile-first Next.js 16 PWA for one-tap exercise sets and configurable total or daily challenges. REPS works offline with IndexedDB, synchronizes idempotently to PostgreSQL, keeps soft-deleted sets restorable, and records server mutations in an append-only audit log.

## What is included

- Three-step onboarding with 10K push-up, 10K squat, daily rope, and custom templates
- Contextual one-tap recording, quick sets, 350 ms double-tap protection, haptics, custom sets, edit, undo, delete, and restore
- Total and daily challenge calculations, active weekdays, opening progress, calendar intensity, challenge switching, and history
- Dexie offline cache plus mutation queue and deterministic PostgreSQL sync
- Auth.js credentials owner login with Argon2id, login rate limiting, secure cookies, Zod validation, and owner-scoped APIs
- PostgreSQL/Drizzle migration, immutable audit events, JSON import/export, PWA shell, dark mode, and safe-area navigation
- Gamification: XP and levels, real day streaks, per-movement lifetime stats, best day, and a badge engine (challenge completion, lifetime milestones, streaks, big days, explorer). Total challenges auto-close at their target and award a shareable badge with a public page and Open Graph image (`/b/<slug>`)
- Social: invite links (`/invite/<code>`, optionally to a specific challenge), friendships, and a leaderboard by week/month/all time, by movement, or per shared challenge
- Back-fill of device-only IndexedDB data to the server on first sign-in, chunked sync batches
- Multi-stage non-root Docker image, private PostgreSQL, Caddy HTTPS, backups, restore, and VPS runbook

## Local development

Copy `.env.example` to `.env`, set `DATABASE_URL`, `AUTH_SECRET`, and owner values, then:

```bash
npm ci
node scripts/migrate.mjs
node scripts/seed-owner.mjs
npm run dev
```

The browser UI remains usable device-locally when the server database is unavailable; authenticated synchronization resumes when the API is reachable.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run db:generate
```

The Playwright suite uses a Pixel-sized Chromium profile and covers onboarding → record → edit → undo → history → restore, plus an offline record/reload/reconnect flow. See [DEPLOYMENT.md](./DEPLOYMENT.md) for production, updates, rollback, and backup procedures.

