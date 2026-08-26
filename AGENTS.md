# AGENTS.md

## Project overview

This workspace contains a single-page task planner with a Sword Art Online-inspired visual design. It is a TypeScript/React application using the Next.js App Router API through Vinext, with Vite and the Cloudflare Vite plugin as the local and production runtime.

The application is currently client-only. Tasks, preferences, and theme state are stored in browser `localStorage`; there is no backend or database binding configured in `.openai/hosting.json`.

## Repository map

- `app/page.tsx`: application types, state, recurrence logic, and UI.
- `app/globals.css`: all application styling and responsive behavior.
- `app/layout.tsx`: root HTML layout and page metadata.
- `vite.config.ts`: Vinext, OpenAI Sites, Tailwind PostCSS, and Cloudflare configuration.
- `.openai/hosting.json`: optional Sites storage bindings; both D1 and R2 are currently disabled.
- `dist/`, `.next/`, `.vinext/`, and `.wrangler/`: generated output; do not edit by hand.

## Setup and commands

Use Node.js 22.13 or newer. Install JavaScript dependencies with `npm install` (or `npm ci` for a clean, lockfile-exact install).

- `npm run dev`: start the local development server with hot reload.
- `npm run lint`: run ESLint.
- `npm run build`: create the production build in `dist/`.
- `npm run start`: serve the production build; run `npm run build` first.

A Python virtual environment exists at `.venv`, but the web application does not use Python. Activate it only for auxiliary Python tooling with `source .venv/bin/activate`.

## Working conventions

- Keep application code in TypeScript and preserve strict type checking.
- Follow the existing two-space indentation, single-quote strings, and semicolon style.
- Prefer small, focused changes. The main page is large, so extract a component or helper when new behavior would make it materially harder to navigate.
- Preserve Chinese UI copy and the established English tactical labels unless a requested design change says otherwise.
- Treat `localStorage` schema changes as migrations. Continue accepting existing `sao-planner-*` keys or add an explicit migration path so users do not lose saved tasks.
- Keep browser-only APIs inside client components or effects. `app/page.tsx` is intentionally marked with `'use client'`.
- Do not add D1 or R2 assumptions unless `.openai/hosting.json` is updated as part of the same feature.
- Never edit generated directories or commit secrets and local `.env*` files.

## Validation

Before handing off a change, run:

```sh
npm run lint
npm run build
```

For UI changes, also start `npm run dev` and check the affected desktop and narrow/mobile layouts in a browser. Verify that task creation, status transitions, recurrence, settings, theme, and page reload persistence still behave as expected when related code changes.
