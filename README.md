# Sword Art Online — Daily Operations

A local-first personal task planner with a high-energy retro JRPG interface. The application combines a three-column mission board, detailed task metadata, recurrence, calendar and archive views, and a durable SQLite source of truth.

> This is an independent fan-made productivity project. It is not affiliated with or endorsed by Atlus, SEGA, Bandai Namco, Aniplex, or the creators and rights holders of Persona or Sword Art Online.

## Highlights

- Mission board with Pending, In Progress, and Completed states
- Drag-and-drop status transitions and manual ordering
- Priority, location, task type, deadlines, and recurrence rules
- Archive, calendar, daily agenda, and configurable defaults
- Day and night themes
- Local SQLite persistence with transactional writes and revision checks
- One-time legacy `localStorage` migration and a recovery utility
- Automated visual-design harness for the unified perspective wordmark

## Requirements

- macOS or another Node.js-compatible desktop environment
- Node.js 22.13 or newer
- npm

The bundled Python virtual environment is optional and is not used by the web application.

## Quick start

```sh
npm ci
npm run dev
```

Open [http://localhost:1998](http://localhost:1998). Press `Ctrl+C` to stop both the web application and its local database service.

The development launcher starts:

```text
Browser → http://localhost:1998
              ↓
Local API → http://127.0.0.1:43110
              ↓
SQLite   → data/sword-art-online.sqlite
```

Changing the frontend port does not create a different dataset. The SQLite file remains authoritative.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start SQLite and the hot-reload app on port 1998 |
| `npm run build` | Create the production build |
| `npm run start` | Start SQLite and the production build on port 1998 |
| `npm run db:backup` | Create a consistent backup in `backups/` |
| `npm run recover:legacy -- --port 3001` | Recover old browser data from a specific origin |
| `npm run design:check` | Validate the logo and moodboard design contract |
| `npm run lint` | Run the design harness and ESLint |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run check` | Run lint, typecheck, and production build |

## Personal data and backups

The following paths are intentionally excluded from Git:

- `data/`: the live SQLite database and WAL files
- `backups/`: user-created SQLite backups
- `recovery/`: recovered browser-storage exports
- `docs/moodboard/p4g/*.png`: private, user-provided visual references

Do not remove these paths when updating the application. Run `npm run db:backup` before schema work or large data changes.

See [docs/DATA_ARCHITECTURE.md](docs/DATA_ARCHITECTURE.md) for the schema, migration guarantees, and future Dashboard integration boundary. See [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) for the visual system.

## Repository structure

```text
app/                         React UI and database client
docs/                        Data and visual architecture
scripts/local-db-server.mjs  Loopback SQLite API
scripts/run-local-app.mjs    Combined database/web lifecycle
scripts/                     Validation, backup, and recovery utilities
.github/workflows/ci.yml     GitHub Actions quality gate
```

## GitHub readiness

This repository includes automated checks, contribution guidance, privacy boundaries, and an explicit open-source license suitable for a public GitHub remote.

## License

Original project code is released under the [MIT License](LICENSE). Third-party names, marks, and visual references remain the property of their respective rights holders and are not licensed by this repository.
