#!/usr/bin/env python3
"""Dependency-free fictional Team Notes API and static server."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qs, unquote, urlsplit

LIMITS = {'title': 200, 'author': 80, 'body': 20000}
MAX_REQUEST = 128 * 1024
SEEDS = (
    ('Studio kickoff', 'Agree on a small fictional launch checklist for the studio.', 'Mira', False),
    ('Workshop ideas', 'Try paper prototypes and share three ideas at the next workshop.', 'Niko', False),
    ('Previous sprint', 'The fictional team completed its first practice sprint.', 'Ada', True),
)


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


@contextmanager
def connect(db):
    connection = sqlite3.connect(db, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize(db):
    db.parent.mkdir(parents=True, exist_ok=True)
    with connect(db) as connection:
        # A schema marker, rather than row count, prevents reseeding an existing DB.
        exists = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='notes'").fetchone()
        connection.execute('''CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL, body TEXT NOT NULL, author TEXT NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL)''')
        if not exists:
            for title, body, author, archived in SEEDS:
                connection.execute('INSERT INTO notes (title,body,author,archived,created_at,updated_at) VALUES (?,?,?,?,?,?)',
                                   (title, body, author, archived, '2026-10-08T00:00:00.000000Z', '2026-10-08T00:00:00.000000Z'))


def note_json(row):
    result = dict(row)
    result['archived'] = bool(result['archived'])
    return result


def validate(data, creating):
    if not isinstance(data, dict):
        raise ValueError('Request must be a JSON object')
    allowed = set(LIMITS) | (set() if creating else {'archived'})
    if set(data) - allowed:
        raise ValueError('Unknown or read-only fields: ' + ', '.join(sorted(set(data) - allowed)))
    if not data:
        raise ValueError('Provide at least one note field')
    if creating and set(LIMITS) - set(data):
        raise ValueError('title, body and author are required')
    fields = dict(data)
    for field, limit in LIMITS.items():
        if field not in fields:
            continue
        value = fields[field]
        if not isinstance(value, str):
            raise ValueError(field + ' must be a string')
        if field != 'body':
            value = value.strip()
        if not value.strip():
            raise ValueError(field + ' is required')
        if len(value) > limit:
            raise ValueError(f'{field} must be at most {limit} characters')
        fields[field] = value
    if 'archived' in fields and type(fields['archived']) is not bool:
        raise ValueError('archived must be a boolean')
    return fields


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise ValueError('Invalid Content-Length') from None
        if self.headers.get('Transfer-Encoding'):
            raise ValueError('Transfer-Encoding is not supported')
        if length <= 0 or length > MAX_REQUEST:
            raise ValueError('JSON request must be between 1 and 131072 bytes')
        try:
            return json.loads(self.rfile.read(length).decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError('Invalid JSON') from None

    def do_GET(self):
        self.dispatch()

    def do_HEAD(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_PATCH(self):
        self.dispatch()

    def __getattr__(self, name):
        # BaseHTTPRequestHandler otherwise emits HTML 501 for unknown methods.
        if name.startswith('do_'):
            return self.dispatch
        raise AttributeError(name)

    def dispatch(self):
        try:
            self.route()
        except ValueError as error:
            self.reply(400, {'error': str(error)})
        except (sqlite3.Error, OSError):
            self.log_error('Storage or file operation failed')
            self.reply(500, {'error': 'Server storage or file operation failed'})

    def route(self):
        parsed = urlsplit(self.path)
        path = parsed.path
        if path == '/api/health' and self.command in ('GET', 'HEAD'):
            with connect(self.server.db) as connection:
                connection.execute('SELECT id FROM notes LIMIT 1').fetchall()
            self.reply(200, {'ready': True})
        elif path == '/api/notes' and self.command in ('GET', 'HEAD'):
            query = parse_qs(parsed.query, keep_blank_values=True)
            status = query.get('status', ['active'])[0] or 'active'
            if status not in ('active', 'archived'):
                raise ValueError('status must be active or archived')
            search = query.get('q', [''])[0].casefold()
            with connect(self.server.db) as connection:
                rows = connection.execute('SELECT * FROM notes WHERE archived=? ORDER BY updated_at DESC, id DESC', (status == 'archived',)).fetchall()
            # Python casefold gives Unicode-aware literal matching, including % and _.
            self.reply(200, {'notes': [note_json(row) for row in rows if search in row['title'].casefold() or search in row['body'].casefold()]})
        elif path == '/api/notes' and self.command == 'POST':
            fields = validate(self.read_json(), True)
            now = timestamp()
            with connect(self.server.db) as connection:
                cursor = connection.execute('INSERT INTO notes (title,body,author,created_at,updated_at) VALUES (?,?,?,?,?)',
                                            (fields['title'], fields['body'], fields['author'], now, now))
                row = connection.execute('SELECT * FROM notes WHERE id=?', (cursor.lastrowid,)).fetchone()
            self.reply(201, {'note': note_json(row)})
        elif re.fullmatch(r'/api/notes/[0-9]+', path) and self.command == 'PATCH':
            fields = validate(self.read_json(), False)
            identifier = path.rsplit('/', 1)[1]
            if len(identifier) > 18:
                self.reply(404, {'error': 'Note not found'})
                return
            with connect(self.server.db) as connection:
                if not connection.execute('SELECT id FROM notes WHERE id=?', (int(identifier),)).fetchone():
                    self.reply(404, {'error': 'Note not found'})
                    return
                fields['updated_at'] = timestamp()
                assignments = ', '.join(field + '=?' for field in fields)
                connection.execute('UPDATE notes SET ' + assignments + ' WHERE id=?', (*fields.values(), int(identifier)))
                row = connection.execute('SELECT * FROM notes WHERE id=?', (int(identifier),)).fetchone()
            self.reply(200, {'note': note_json(row)})
        elif path.startswith('/api/'):
            self.reply(404, {'error': 'API route not found'})
        elif self.command in ('GET', 'HEAD'):
            self.static(path)
        else:
            self.reply(404, {'error': 'Route not found'})

    def static(self, path):
        decoded = unquote(path)
        relative = 'index.html' if decoded == '/' else decoded.lstrip('/')
        parts = Path(relative).parts
        # Serve the application only; never expose DBs, git metadata or backend source.
        allowed = relative == 'index.html' or (parts and parts[0] == 'web' and Path(relative).suffix in {'.js', '.css', '.html', '.svg', '.png', '.jpg', '.jpeg', '.ico', '.woff', '.woff2'})
        if not allowed or any(part.startswith('.') for part in parts) or '\\' in decoded or '\x00' in decoded:
            self.reply(404, {'error': 'File not found'})
            return
        target = self.server.static_root
        for part in parts:
            target = target / part
            # Check every component before resolve erases symlink provenance.
            if target.is_symlink():
                self.reply(404, {'error': 'File not found'})
                return
        target = target.resolve()
        if not target.is_relative_to(self.server.static_root) or not target.is_file() or target == self.server.db:
            self.reply(404, {'error': 'File not found'})
            return
        body = target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default=os.environ.get('TEAM_NOTES_HOST', '127.0.0.1'))
    parser.add_argument('--port', type=int, default=os.environ.get('TEAM_NOTES_PORT', '8000'))
    parser.add_argument('--db', type=Path, default=os.environ.get('TEAM_NOTES_DB', str(Path.home() / '.local/share/team-notes/notes.sqlite3')))
    parser.add_argument('--static-root', type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    db = args.db.expanduser().resolve()
    initialize(db)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.db = db
    server.static_root = args.static_root.resolve()
    print(f'Listening on {args.host}:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
