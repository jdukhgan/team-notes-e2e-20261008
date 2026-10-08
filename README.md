# Team Notes

A small fictional team notebook with create/edit, title/body search, archive/restore,
SQLite persistence, and an accessible responsive light/dark interface. No login,
external services, attachments, realtime features, or rich text. Use fictional content.

Requires Python 3.9+ and a modern browser supporting ES modules, fetch,
AbortSignal.any and AbortSignal.timeout. No packages or build step.

```sh
python3 server.py --host 127.0.0.1 --port 8000
# Open http://127.0.0.1:8000/; stop with Ctrl+C.
```

The default database is `~/.local/share/team-notes/notes.sqlite3`, outside the
checkout. The first schema creation adds three fictional notes; restarts preserve
changes without reseeding. For an isolated preview:

```sh
python3 server.py --host 127.0.0.1 --port 8765 --db /tmp/team-notes-preview/notes.sqlite3
```

`--db`, `--host`, `--port` (0 for a free port) and `--static-root` configure the
server; `TEAM_NOTES_DB`, `TEAM_NOTES_HOST`, `TEAM_NOTES_PORT` provide defaults.
Keep the preview on loopback unless its exposure is separately authorized. Stop
preview processes when finished. Application publication and retained deployment
are separate workflow outcomes.

Title/author are required and trimmed (200/80 Unicode characters); body is required,
preserved exactly and limited to 20,000 characters. Failed saves keep the draft;
check the list before retrying after a connection failure because the server may
have saved it. Switching between note editors keeps unfinished drafts in the current
page; cancelling an edit discards that edit. Reloading closes unsaved drafts.
Theme preference persists in local browser storage; Auto follows the system theme.

```sh
python3 -m unittest discover -s tests -v
node --check web/app.js
node --check tests/browser_workflow.js
```

For the integrated browser regression, start a **new temporary database** on
127.0.0.1:8765, then pass `tests/browser_workflow.js` as the `filename` argument to
the project's installed Playwright `browser_run_code_unsafe` tool. It exercises real
HTTP CRUD/search/archive/restore/undo, preserved drafts, keyboard controls, validation,
Unicode boundaries, fault recovery, stale responses, theme persistence and six
viewport/theme captures. It uses fictional fixtures and request interception only
for error/race tests. Screenshots are written under `.kandev/evidence/integration-unicode/`;
robustness fixtures are captured separately. Stop the server and close the browser
after testing. The task plan binds results/artifacts to the full tested revision.

API and persistence details: [docs/api.md](docs/api.md).
Designer component/event and visual authority: [docs/design.md](docs/design.md).
Independent Review, UI verification and Designer visual acceptance remain separate gates.
