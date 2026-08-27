# Security policy

## Supported scope

This project is designed for personal use on one trusted computer. The SQLite API binds to `127.0.0.1` and accepts only local HTTP origins. It has no authentication and must not be exposed to a LAN, tunnel, public hostname, or hosted environment in its current form.

## Sensitive files

The live database, backups, recovery exports, environment files, and private moodboard images are ignored by Git. Review `git status --ignored` before publishing a repository if local privacy is a concern.

## Reporting a problem

Do not open a public issue containing tasks, recovered browser data, database files, credentials, or private screenshots. Use a private communication channel selected by the repository owner.
