"""Real HTTP regressions: lost persistence, invalid writes and leaked source files."""
import http.client
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / 'notes.sqlite3'
        self.static = Path(self.temp.name) / 'site'
        self.static.mkdir()
        (self.static / 'index.html').write_text('fictional frontend')
        (self.static / 'web').mkdir()
        (self.static / 'web' / 'app.js').write_text('export const ready = true;')
        (self.static / '.secret').write_text('private')
        (self.static / 'server.py').write_text('private source')
        (self.static / 'web' / 'leak.js').symlink_to(self.db.parent / 'secret.js')
        (self.db.parent / 'secret.js').write_text('outside secret')
        self.start()
        self.addCleanup(self.stop)

    def start(self):
        self.process = subprocess.Popen(
            [sys.executable, str(ROOT / 'server.py'), '--db', str(self.db),
             '--host', '127.0.0.1', '--port', '0', '--static-root', str(self.static)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        line = self.process.stdout.readline()
        self.assertTrue(line.startswith('Listening on '), line + self.process.stderr.read() if not line else line)
        self.port = int(line.strip().rsplit(':', 1)[1])

    def stop(self):
        if self.process.poll() is None:
            self.process.terminate()
        self.process.communicate(timeout=5)

    def request(self, method, path, data=None, raw=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        body = raw if raw is not None else json.dumps(data).encode() if data is not None else None
        connection.request(method, path, body, {'Content-Type': 'application/json'})
        response = connection.getresponse()
        content = response.read()
        connection.close()
        return response.status, json.loads(content) if method != 'HEAD' and response.getheader('Content-Type', '').startswith('application/json') else content.decode()

    def create(self, **fields):
        status, result = self.request('POST', '/api/notes', {'title': '  Launch plan  ', 'body': '  Fictional\nteam body  ', 'author': '  Mira  ', **fields})
        self.assertEqual(status, 201)
        return result['note']

    def test_note_lifecycle_search_filter_and_restart_persistence(self):
        self.assertEqual(self.request('GET', '/api/health'), (200, {'ready': True}))
        seed = self.request('GET', '/api/notes')[1]['notes']
        self.assertGreater(len(seed), 0)
        note = self.create()
        self.assertEqual(set(note), {'id', 'title', 'body', 'author', 'archived', 'created_at', 'updated_at'})
        self.assertEqual((note['title'], note['author'], note['body']), ('Launch plan', 'Mira', '  Fictional\nteam body  '))
        self.assertIs(note['archived'], False)
        for query in ['LAUNCH', 'fictional%0Ateam']:
            self.assertIn(note['id'], [n['id'] for n in self.request('GET', '/api/notes?q=' + query)[1]['notes']])
        status, edited = self.request('PATCH', '/api/notes/' + str(note['id']), {'title': 'Revised %_ plan', 'body': 'Updated body', 'author': 'Niko'})
        self.assertEqual(status, 200)
        self.assertEqual(edited['note']['body'], 'Updated body')
        self.assertEqual(edited['note']['created_at'], note['created_at'])
        self.assertGreater(edited['note']['updated_at'], note['updated_at'])
        self.assertEqual(len(self.request('GET', '/api/notes?q=%25_')[1]['notes']), 1)
        self.request('PATCH', '/api/notes/' + str(note['id']), {'archived': True})
        self.assertNotIn(note['id'], [n['id'] for n in self.request('GET', '/api/notes')[1]['notes']])
        self.assertIn(note['id'], [n['id'] for n in self.request('GET', '/api/notes?status=archived&q=REVISED')[1]['notes']])
        self.stop()
        self.start()
        self.assertEqual(len(self.request('GET', '/api/notes')[1]['notes']), len(seed))
        self.assertEqual(self.request('GET', '/api/notes?status=archived')[1]['notes'][0]['title'], 'Revised %_ plan')
        status, restored = self.request('PATCH', '/api/notes/' + str(note['id']), {'archived': False})
        self.assertEqual(status, 200)
        self.assertIs(restored['note']['archived'], False)
        self.assertEqual(len(self.request('GET', '/api/notes')[1]['notes']), len(seed) + 1)

    def test_invalid_json_types_lengths_and_missing_ids(self):
        for raw in [b'{', b'null', b'[]', b'\xff']:
            with self.subTest(raw=raw):
                status, result = self.request('POST', '/api/notes', raw=raw)
                self.assertEqual(status, 400)
                self.assertIsInstance(result['error'], str)
        for fields in [{'title': ' '}, {'author': ''}, {'body': ''}, {'body': 5}, {'title': 'x' * 201}, {'author': 'x' * 81}, {'body': 'x' * 20001}, {'unknown': True}, {'archived': True}]:
            status, result = self.request('POST', '/api/notes', {'title': 'Valid', 'body': 'Body', 'author': 'Ada', **fields})
            self.assertEqual(status, 400, fields)
            self.assertIn('error', result)
        self.assertEqual(self.request('POST', '/api/notes', {})[0], 400)
        note = self.create()
        for fields in [{'archived': 'true'}, {'archived': 1}, {}, {'title': None}, {'id': 4}]:
            self.assertEqual(self.request('PATCH', '/api/notes/' + str(note['id']), fields)[0], 400)
        self.assertEqual(self.request('PATCH', '/api/notes/999999', {'archived': True})[0], 404)
        self.assertEqual(self.request('PATCH', '/api/notes/bad', {'archived': True})[0], 404)
        self.assertEqual(self.request('GET', '/api/notes?status=bad')[0], 400)

    def test_static_allowlist_rejects_traversal_private_files_and_symlinks(self):
        self.assertEqual(self.request('GET', '/'), (200, 'fictional frontend'))
        self.assertEqual(self.request('GET', '/web/app.js')[0], 200)
        for path in ['/../secret.js', '/%2e%2e/secret.js', '/web/%2e%2e/.secret', '/.secret', '/server.py', '/.git/config', '/web/leak.js', '/api/nope']:
            with self.subTest(path=path):
                self.assertEqual(self.request('GET', path)[0], 404)
        self.assertEqual(self.request('HEAD', '/web/app.js')[0], 200)

    def test_static_rejects_in_root_symlink_aliases_and_directories(self):
        web = self.static / 'web'
        (web / 'backend.js').symlink_to(self.static / 'server.py')
        (web / 'hidden.js').symlink_to(self.static / '.secret')
        (web / 'alias.js').symlink_to(web / 'app.js')
        (self.static / 'private').mkdir()
        (self.static / 'private' / 'secret.js').write_text('private contents')
        (web / 'linked').symlink_to(self.static / 'private', target_is_directory=True)
        (self.static / 'index.html').unlink()
        (self.static / 'index.html').symlink_to(self.static / '.secret')
        for path in ['/web/backend.js', '/web/hidden.js', '/web/alias.js',
                     '/web/linked/secret.js', '/', '/index.html']:
            for method in ['GET', 'HEAD']:
                with self.subTest(method=method, path=path):
                    status, result = self.request(method, path)
                    self.assertEqual(status, 404)
                    if method == 'GET':
                        self.assertEqual(result, {'error': 'File not found'})
        self.assertEqual(self.request('GET', '/web/app.js')[0], 200)

    def test_unsupported_api_methods_return_json_and_preserve_notes(self):
        before = self.request('GET', '/api/notes')[1]
        for method in ['DELETE', 'PUT', 'OPTIONS', 'TRACE', 'CONNECT', 'CUSTOM']:
            for path in ['/api/notes/1', '/api/notes', '/api/health', '/api/nope']:
                with self.subTest(method=method, path=path):
                    self.assertEqual(self.request(method, path),
                                     (404, {'error': 'API route not found'}))
        self.assertEqual(self.request('GET', '/api/notes'), (200, before))
        self.assertEqual(self.request('GET', '/api/health'), (200, {'ready': True}))


if __name__ == '__main__':
    unittest.main()
