# Contributing

## Development workflow

1. Use Node.js 22.13 or newer.
2. Install dependencies with `npm ci`.
3. Start the complete local stack with `npm run dev`.
4. Keep changes focused and preserve the SQLite and visual-design contracts.
5. Run `npm run check` before opening a pull request.

## Data safety

- Never commit files from `data/`, `backups/`, or `recovery/`.
- Run `npm run db:backup` before database schema or migration work.
- Do not add browser storage as an authoritative fallback.
- Keep the local data API bound to `127.0.0.1` unless authentication and network exposure are explicitly designed and reviewed.

## Visual changes

Read `docs/STYLE_GUIDE.md` and `docs/moodboard/p4g/README.md` before changing the brand lockup or global art direction. Private reference PNGs are intentionally excluded from the public repository; the checked-in manifest provides the reproducible evidence boundary.

## Pull requests

Describe the user-visible outcome, data migration impact, and validation performed. Include screenshots only when they contain no personal task data or copyrighted reference artwork.
