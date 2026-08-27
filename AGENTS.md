# AGENTS.md

## Project overview

This workspace contains a single-page task planner with a Sword Art Online-inspired visual design. It is a TypeScript/React application using the Next.js App Router API through Vinext, with Vite and the Cloudflare Vite plugin as the local and production runtime.

The application is local-first and uses `data/sword-art-online.sqlite` as its sole source of truth. A small loopback-only Node API owns SQLite access. Browser `localStorage` is read only by a guarded one-time migration on the active frontend origin and is cleared after a confirmed import. There is no hosted database binding configured in `.openai/hosting.json`.

## Repository map

- `app/page.tsx`: application types, state, recurrence logic, and UI.
- `app/lib/planner-store.ts`: browser client for the loopback SQLite API.
- `app/components/BrandLockup.tsx`: semantic markup for the unified brand wordmark.
- `app/brand.css`: isolated perspective, face, stroke, and extrusion system for the wordmark.
- `app/design-tokens.css`: shared visual and motion tokens.
- `app/globals.css`: application styling and responsive behavior outside the brand lockup; logo and brand selectors are forbidden here.
- `docs/STYLE_GUIDE.md`: binding visual design contract.
- `docs/DATA_ARCHITECTURE.md`: SQLite schema, migration, backup, and future integration contract.
- `docs/moodboard/p4g/`: user-provided internal visual evidence; never ship these images as product assets.
- `app/layout.tsx`: root HTML layout and page metadata.
- `vite.config.ts`: Vinext, OpenAI Sites, Tailwind PostCSS, and Cloudflare configuration.
- `.openai/hosting.json`: optional Sites storage bindings; both D1 and R2 are currently disabled.
- `scripts/local-db-server.mjs`: loopback API and SQLite schema/transactions.
- `scripts/run-local-app.mjs`: lifecycle wrapper that starts and stops SQLite with Vinext.
- `scripts/recover-legacy-storage.mjs`: explicit, non-destructive browser-origin recovery page for pre-SQLite data.
- `data/sword-art-online.sqlite`: ignored personal database; never commit or delete it during normal development.
- `dist/`, `.next/`, `.vinext/`, and `.wrangler/`: generated output; do not edit by hand.

## Setup and commands

Use Node.js 22.13 or newer. Install JavaScript dependencies with `npm install` (or `npm ci` for a clean, lockfile-exact install).

- `npm run dev`: start SQLite and the hot-reload web app at `http://localhost:1998`.
- `npm run lint`: run ESLint.
- `npm run build`: create the production build in `dist/`.
- `npm run start`: start SQLite and serve the production build at `http://localhost:1998`; run `npm run build` first.
- `npm run db:backup`: create a consistent database copy in ignored `backups/`.
- `npm run recover:legacy -- --port <port>`: capture legacy `localStorage` from the same browser profile into ignored `recovery/`; it must never clear automatically.

A Python virtual environment exists at `.venv`, but the web application does not use Python. Activate it only for auxiliary Python tooling with `source .venv/bin/activate`.

## Working conventions

- Keep application code in TypeScript and preserve strict type checking.
- Follow the existing two-space indentation, single-quote strings, and semicolon style.
- Prefer small, focused changes. The main page is large, so extract a component or helper when new behavior would make it materially harder to navigate.
- Preserve Chinese UI copy and the established English tactical labels unless a requested design change says otherwise.
- Treat SQLite schema changes as migrations. Preserve existing data and the `migration_backups` audit record.
- Keep SQLite access in `scripts/local-db-server.mjs` and browser transport in `app/lib/planner-store.ts`; UI components must not access the database file directly.
- Do not restore `localStorage` as a write target or fallback source of truth. The only allowed reads are inside the guarded first-run migration.
- Keep the local API bound to `127.0.0.1`. Do not expose it to a LAN or public network without adding authentication and explicit user approval.
- Keep browser-only APIs inside client components or effects. `app/page.tsx` is intentionally marked with `'use client'`.
- Do not add D1 or R2 assumptions unless `.openai/hosting.json` is updated as part of the same feature.
- Never edit generated directories or commit secrets and local `.env*` files.

## Visual design harness

Before changing the logo, brand area, page identity, or global visual direction:

1. Read `docs/STYLE_GUIDE.md`.
2. Read `docs/moodboard/p4g/README.md` and inspect at minimum references 02, 03, and 08.
3. Preserve the distinction between colorful composition and restrained wordmark construction.

Logo non-negotiables:

- `SWORD ART` and `ONLINE` use the same logo font family.
- Every logo word lives inside one `.brand-plane` and inherits one perspective transform and visual center.
- Every logo face uses the same depth vector, stroke hierarchy, extrusion method, and paper/ink/yellow palette.
- The wordmark must show spatial thickness. A flat box shadow or unrelated background cards do not count as extrusion.
- Do not split logo words into differently colored tiles, independent badges, separate rotations, or contradictory skews.
- Rainbow and supporting colors belong to background composition, category semantics, or very small signal details—not primary letter faces.
- The mark must remain one readable silhouette at mobile size, in night mode, and in grayscale.

Run `npm run design:check` after any brand or style-system change. Do not weaken or bypass the harness to make a new design pass.

## Validation

Before handing off a change, run:

```sh
npm run lint
npm run build
```

For UI changes, also start `npm run dev` and check the affected desktop and narrow/mobile layouts in a browser. Verify that task creation, status transitions, recurrence, settings, theme, and page reload persistence still behave as expected when related code changes.
