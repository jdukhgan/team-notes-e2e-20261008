# Team Notes backend contract

Python 3.9+ standard library only (`sqlite3`, `http.server`). Run from the checkout:

```sh
python3 server.py --host 127.0.0.1 --port 8000 --db /tmp/team-notes-dev/notes.sqlite3
python3 -m unittest discover -s tests -v
```

Without flags the host is `127.0.0.1`, port `8000`, and database is
`~/.local/share/team-notes/notes.sqlite3`, outside tracked source. Environment
variables `TEAM_NOTES_HOST`, `TEAM_NOTES_PORT`, `TEAM_NOTES_DB` supply defaults;
CLI flags take precedence. `--port 0` chooses a free port and startup prints
`Listening on HOST:PORT`. `--static-root PATH` defaults to the server checkout.
Terminate with Ctrl+C (or SIGTERM for a supervised process). Tests use ephemeral
loopback HTTP servers, temporary SQLite databases and fixture static roots; all
child processes and temporary files are cleaned up.

## Notes and requests

A note is `{id,title,body,author,archived,created_at,updated_at}`. `id` is an
integer. `archived` is a JSON boolean. Timestamps are UTC ISO 8601 strings with
microseconds and `Z`; creation time stays fixed and successful updates replace
`updated_at`. Responses are JSON with UTF-8 and `Cache-Control: no-store`.

- `GET /api/health` returns `200 {"ready":true}` after a database read.
- `GET /api/notes?status=active|archived&q=...` returns `200 {"notes":[...]}`.
  Omitted or empty `status` means active; other values return 400. Omitted/empty
  `q` returns all notes in that status. Search is literal Unicode case-insensitive
  title/body substring matching (`casefold`); `%` and `_` have no wildcard meaning.
  Results sort by `updated_at` descending, then `id` descending. No pagination.
- `POST /api/notes` requires `title`, `body`, `author`; returns
  `201 {"note":{...}}`. New notes are active. Client-supplied `archived`, IDs and
  timestamps are rejected.
- `PATCH /api/notes/{id}` accepts any nonempty subset of `title`, `body`, `author`,
  `archived`; returns `200 {"note":{...}}`. Set `archived:true` to archive and
  `archived:false` to restore. Missing/invalid numeric IDs return 404.

Title and author are trimmed and required, with maximum lengths of 200 and 80
Unicode characters respectively. Body is required, must contain a non-whitespace
character, is preserved verbatim, and is limited to 20,000 Unicode characters.
Only strings are accepted for text fields and only JSON booleans for archived.
Unknown/read-only fields, empty PATCH objects, malformed UTF-8/JSON, non-object
JSON, missing fields and invalid lengths return `400 {"error":"useful message"}`.
Request bodies require Content-Length from 1 to 131,072 bytes; transfer-encoded
bodies are rejected. Unsupported API routes/methods return 404. Errors use
`{error:string}`; missing notes return 404; storage/file failures return 500
without disclosing paths or database internals. Requests use parameterized SQL;
column names come only from the validated field allowlist.

## Persistence and static files

SQLite creates three deterministic fictional seed notes (two active and one
archived) when the notes table is first created. The schema marker prevents
reseeding on restart, including when an existing notes table is empty. Each
request uses its own connection, commits successful writes and closes it;
connections wait up to 10 seconds for database locks. Parent directories are
created automatically. There is no login, external service or realtime channel.

Static GET/HEAD serves `/` as `index.html`, `/index.html`, and files beneath
`/web/` with `.js`, `.css`, `.html`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.ico`,
`.woff`, `.woff2` extensions. Decoding occurs before validation; dot-prefixed
path segments, traversal, backslashes, NULs, directory listing, symlink escape,
backend source and private files are rejected with 404. The resolved SQLite
file itself is never served. The frontend integration must keep browser assets
under `web/`; no catch-all SPA fallback is provided. Static files send
`X-Content-Type-Options: nosniff`.

## Functional evidence

`tests/test_server.py` exercises subprocess server startup with configured
host/port/database/static root and real HTTP requests for readiness, deterministic
seed presence, create/trim/content preservation, edit/timestamps, case-insensitive
title/body search, literal search characters, archive/restore/status filters,
restart persistence without duplicate seeds, invalid JSON/UTF-8/types/lengths,
missing IDs, static GET/HEAD and private/traversal/symlink rejection. No browser
or integrated frontend acceptance is claimed by backend tests.
