# REPS deployment

1. Point the domain A/AAAA records at the VPS and install Docker Engine plus Compose.
2. Copy `.env.example` to `.env`, replace every placeholder, and keep it outside Git.
3. Build and start the database: `docker compose build app && docker compose up -d db`.
4. Apply schema and create the owner once: `docker compose run --rm app node scripts/migrate.mjs` then `docker compose run --rm -e OWNER_PASSWORD app node scripts/seed-owner.mjs`.
5. Start: `docker compose up -d`; confirm `https://$APP_DOMAIN/api/health`, login, installation, and offline recording.

## Updates and rollback

Tag every release (`APP_TAG`), then run migrations before rollout: `docker compose run --rm app node scripts/migrate.mjs && docker compose up -d --build app`. View logs with `docker compose logs -f app db caddy`; restart with `docker compose restart app`. To roll back, restore the previous `APP_TAG`/Git tag and run `docker compose up -d app`; only roll back across a migration after following that migration's documented down/restore plan.

## Backups

Schedule `scripts/backup.sh` daily with cron. Promote selected daily files into weekly/monthly folders, retaining 7 daily, 4 weekly, and 6 monthly copies. Encrypt and copy backups off the VPS. Restore with `scripts/restore.sh /path/to/reps.dump.gz`, and test the restore into a disposable database regularly. JSON export is an extra user copy, not the server backup.

