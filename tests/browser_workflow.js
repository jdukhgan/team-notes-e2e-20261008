async (page) => {
  // Run with the project's installed browser_run_code tool after starting server.py
  // on 127.0.0.1:8765 with a NEW temporary fictional SQLite database.
  const evidenceDir = '.kandev/evidence/integration-unicode';
  const checks = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const wait = async (fn) => {
    for (let i = 0; i < 100; i++) {
      if (await fn()) return;
      await page.waitForTimeout(50);
    }
    throw new Error('Condition timed out');
  };
  const title = page.locator('input[name="title"]');
  const author = page.locator('input[name="author"]');
  const body = page.locator('textarea[name="body"]');
  const search = page.getByRole('searchbox', { name: 'Search notes' });
  const active = page.getByRole('radio', { name: 'Active', exact: true });
  const archived = page.getByRole('radio', { name: 'Archived', exact: true });
  const list = page.locator('.tn-note-list-wrap');
  const card = (text) => page.getByRole('article').filter({ has: page.getByRole('heading', { name: text, exact: true }) });
  const ready = () => wait(async () => await list.getAttribute('aria-busy') === 'false');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/');
  await ready();
  check(await page.getByRole('article').count() === 2, 'Real seeded active notes load');

  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  check(await title.getAttribute('aria-invalid') === 'true' && await title.evaluate(el => el === document.activeElement), 'Required-field validation focuses labelled title');
  await title.fill('Sprint planning');
  await author.fill('Mara Quill');
  const originalBody = 'Plan the fictional release\n\n  Keep the rehearsal checklist.\n';
  await body.fill(originalBody);
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await card('Sprint planning').waitFor();
  check(await title.inputValue() === '' && await author.inputValue() === 'Mara Quill', 'Create clears saved text and keeps author');
  let saved = await page.evaluate(async () => (await (await fetch('/api/notes?q=Sprint%20planning')).json()).notes[0]);
  check(saved.body === originalBody, 'Create persists exact whitespace through HTTP');

  // Switching editor preserves an unfinished create draft and edit draft.
  await title.fill('Draft reminder');
  await body.fill('Unfinished fictional reminder');
  await card('Sprint planning').getByRole('button', { name: 'Edit', exact: true }).click();
  await title.fill('Release rehearsal');
  await author.fill('Ilya Fenwick');
  await body.fill('Body-only search marker: compass rehearsal.');
  await card('Studio kickoff').getByRole('button', { name: 'Edit', exact: true }).click();
  await card('Sprint planning').getByRole('button', { name: 'Edit', exact: true }).click();
  check(await title.inputValue() === 'Release rehearsal', 'Switching notes preserves unfinished edit');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await card('Release rehearsal').waitFor();
  check(await title.inputValue() === 'Draft reminder' && await body.inputValue() === 'Unfinished fictional reminder', 'Saving edit restores unfinished create draft');
  saved = await page.evaluate(async () => (await (await fetch('/api/notes?q=Release%20rehearsal')).json()).notes[0]);
  check(saved.title === 'Release rehearsal' && saved.author === 'Ilya Fenwick' && saved.body.includes('compass'), 'All three edited fields persist through API');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();

  await search.fill('COMPASS');
  await wait(async () => await page.getByRole('article').count() === 1 && await card('Release rehearsal').count() === 1 && await list.getAttribute('aria-busy') === 'false');
  check(true, 'Case-insensitive body search');
  await search.fill('RELEASE');
  await wait(async () => await list.textContent().then(t => t.includes('“RELEASE”')) && await list.getAttribute('aria-busy') === 'false');
  check(await card('Release rehearsal').count() === 1, 'Case-insensitive title search');
  await search.fill('no-such-fictional-note');
  await page.getByRole('button', { name: 'Clear search', exact: true }).waitFor();
  check(true, 'No-match empty state has recovery');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await card('Release rehearsal').waitFor();

  await card('Release rehearsal').getByRole('button', { name: 'Archive', exact: true }).click();
  await wait(async () => await card('Release rehearsal').count() === 0 && await list.getAttribute('aria-busy') === 'false');
  await archived.check();
  await card('Release rehearsal').waitFor();
  check(await card('Release rehearsal').getByRole('button', { name: 'Restore', exact: true }).count() === 1, 'Archive and archived filter');
  await card('Release rehearsal').getByRole('button', { name: 'Restore', exact: true }).click();
  await wait(async () => await card('Release rehearsal').count() === 0 && await list.getAttribute('aria-busy') === 'false');
  await active.check();
  await card('Release rehearsal').waitFor();
  check(true, 'Restore returns persisted note to active filter');
  await card('Release rehearsal').getByRole('button', { name: 'Archive', exact: true }).click();
  await wait(async () => await card('Release rehearsal').count() === 0 && await list.getAttribute('aria-busy') === 'false');
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await card('Release rehearsal').waitFor();
  check(true, 'Undo performs real restore');

  // Fault injection is separate from visual fixtures. It never bypasses API data validation.
  const failPost = route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary test storage failure' }) });
  await page.route('**/api/notes', failPost);
  await title.fill('Recovery reminder');
  await body.fill('Try the fictional rehearsal again.');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Temporary test storage failure' }).waitFor();
  check(await title.inputValue() === 'Recovery reminder' && await body.inputValue() === 'Try the fictional rehearsal again.', 'Failed save retains entered content and reports server error');
  await page.unroute('**/api/notes', failPost);
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await card('Recovery reminder').waitFor();
  check(true, 'Retry save succeeds');

  const failList = route => route.abort('failed');
  await page.route('**/api/notes?*', failList);
  await archived.check();
  await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  check(await page.getByRole('alert').filter({ hasText: 'Couldn’t load notes' }).count() === 1, 'Failed list reports recoverable network error');
  await page.unroute('**/api/notes?*', failList);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await card('Previous sprint').waitFor();
  await active.check();
  await card('Release rehearsal').waitFor();

  const failArchive = route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Temporary archive failure"}' });
  await page.route(`**/api/notes/${saved.id}`, failArchive);
  await card('Release rehearsal').getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Temporary archive failure' }).waitFor();
  check(await card('Release rehearsal').count() === 1, 'Failed archive keeps note and offers retry');
  await page.unroute(`**/api/notes/${saved.id}`, failArchive);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await wait(async () => await card('Release rehearsal').count() === 0 && await list.getAttribute('aria-busy') === 'false');
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await card('Release rehearsal').waitFor();

  // Old search response arrives during the new search's debounce window.
  let releaseOld;
  const gate = new Promise(resolve => releaseOld = resolve);
  let oldStarted = false;
  const delayed = async route => {
    if (new URL(route.request().url()).searchParams.get('q') === 'old-query') {
      oldStarted = true;
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [{ ...saved, title: 'STALE RESULT' }] }) }).catch(() => {});
    } else await route.continue();
  };
  await page.route('**/api/notes?*', delayed);
  await search.fill('old-query');
  await wait(async () => oldStarted);
  await search.fill('compass');
  releaseOld();
  await card('Release rehearsal').waitFor();
  await ready();
  check(await page.getByText('STALE RESULT', { exact: true }).count() === 0 && await page.getByRole('article').count() === 1, 'Stale response cannot replace newer search');
  await page.unroute('**/api/notes?*', delayed);
  await search.press('Escape');
  await card('Recovery reminder').waitFor();
  check(await search.inputValue() === '', 'Escape clears search and reloads');

  // Shared Designer validation, visible counters, app validation and real HTTP
  // must agree for every API field at and above the astral-character boundary.
  const boundaries = { title: 200, author: 80, body: 20000 };
  const controls = { title, author, body };
  for (const [field, limit] of Object.entries(boundaries)) {
    const result = await page.evaluate(async ({ field, limit, limits }) => {
      const { validateNote, DEFAULT_LIMITS } = await import('/web/components.js');
      const baseline = { title: 'Boundary fixture', author: 'Mara Quill', body: 'Fictional boundary check' };
      const at = { ...baseline, [field]: '😀'.repeat(limit) };
      const above = { ...baseline, [field]: '😀'.repeat(limit + 1) };
      const post = async data => {
        const response = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return { status: response.status, data: await response.json() };
      };
      const accepted = await post(at);
      const rejected = await post(above);
      if (accepted.data.note) await fetch(`/api/notes/${accepted.data.note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"archived":true}' });
      const defaultAt = { ...baseline, [field]: '😀'.repeat(DEFAULT_LIMITS[field]) };
      const defaultAbove = { ...baseline, [field]: '😀'.repeat(DEFAULT_LIMITS[field] + 1) };
      return {
        sharedAt: validateNote(at, limits), sharedAbove: validateNote(above, limits),
        defaultAt: validateNote(defaultAt), defaultAbove: validateNote(defaultAbove),
        accepted, rejected,
      };
    }, { field, limit, limits: boundaries });
    check(Object.keys(result.sharedAt).length === 0 && Boolean(result.sharedAbove[field]), `${field}: shared API-limit validation accepts boundary and rejects above`);
    check(Object.keys(result.defaultAt).length === 0 && Boolean(result.defaultAbove[field]), `${field}: shared default-limit validation accepts boundary and rejects above`);
    check(result.accepted.status === 201 && result.accepted.data.note[field] === '😀'.repeat(limit) && result.rejected.status === 400, `${field}: real API accepts and preserves boundary, rejects above`);
    await title.fill('Boundary fixture');
    await author.fill('Mara Quill');
    await body.fill('Fictional boundary check');
    await controls[field].fill('😀'.repeat(limit));
    const counter = page.locator('.tn-counter').nth(Object.keys(boundaries).indexOf(field));
    check(await counter.textContent() === `${limit}/${limit}` && await counter.getAttribute('data-over') === 'false', `${field}: boundary counter is accurate and not over limit`);
    await controls[field].fill('😀'.repeat(limit - 1) + 'xx'); // Within native UTF-16 maxlength, over code-point limit.
    check(await counter.textContent() === `${limit + 1}/${limit}` && await counter.getAttribute('data-over') === 'true', `${field}: above-boundary counter reports over limit`);
    const writes = [];
    const onRequest = request => { if (request.method() === 'POST') writes.push(request.url()); };
    page.on('request', onRequest);
    await page.getByRole('button', { name: 'Add note', exact: true }).click();
    page.off('request', onRequest);
    check(await controls[field].getAttribute('aria-invalid') === 'true' && writes.length === 0, `${field}: app rejects above boundary before HTTP`);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
  }

  // Unicode boundaries use code points to match SQLite API validation.
  await title.fill('🧭'.repeat(200));
  await author.fill('😀'.repeat(80));
  await body.fill('😀'.repeat(20000));
  await page.screenshot({ path: `${evidenceDir}/robustness-counters.png`, fullPage: true });
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await wait(async () => await title.inputValue() === '' && await list.getAttribute('aria-busy') === 'false');
  check(await page.getByRole('heading', { name: '🧭'.repeat(200), exact: true }).count() === 1, 'All Unicode field boundaries accepted together by app and backend');
  await page.screenshot({ path: `${evidenceDir}/robustness-unicode.png`, fullPage: true });
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: '🧭'.repeat(200), exact: true }) }).getByRole('button', { name: 'Archive', exact: true }).click();
  await ready();
  await title.fill('x'.repeat(201));
  await body.fill('Limit check');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  check(await title.getAttribute('aria-invalid') === 'true', '201-character title rejected in form');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();

  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.reload();
  await card('Release rehearsal').waitFor();
  check(await page.locator('html').getAttribute('data-theme') === 'dark', 'Theme survives reload');
  await search.focus();
  await page.keyboard.press('Tab');
  check(await active.evaluate(el => el === document.activeElement), 'Keyboard reaches native filter');
  await page.keyboard.press('ArrowRight');
  await card('Previous sprint').waitFor();
  check(await archived.isChecked(), 'Arrow keys switch filter');
  await active.check();
  await card('Release rehearsal').waitFor();
  check(errors.length === 0, 'No uncaught browser errors');

  // Representative captures contain only realistic fictional notes.
  for (const [name, width, height] of [['desktop',1440,900], ['tablet',820,1180], ['phone',390,844]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.getByRole('radio', { name: theme === 'light' ? 'Light' : 'Dark', exact: true }).check();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250); // Capture after Designer theme transitions settle.
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${theme}: no horizontal overflow`);
      await page.screenshot({ path: `${evidenceDir}/${name}-${theme}.png`, fullPage: true });
    }
  }
  return { verdict: 'PASS', checks, pageErrors: errors, noteId: saved.id, screenshots: evidenceDir };
}
