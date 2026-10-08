import {
  AppShell, Banner, Button, NoteComposer, NoteList, Panel, SearchFilter,
  ThemeToggle, createToaster, h, initTheme,
} from './components.js';

// API limits count Unicode code points rather than JavaScript UTF-16 units.
const LIMITS = Object.freeze({ title: 200, author: 80, body: 20000 });
function validate(values) {
  const errors = {};
  for (const field of Object.keys(LIMITS)) {
    const value = field === 'body' ? values[field] : values[field].trim();
    if (!value.trim()) errors[field] = `${field === 'body' ? 'Note' : field === 'title' ? 'Title' : 'Author'} is required.`;
    else if ([...value].length > LIMITS[field]) errors[field] = `Use at most ${LIMITS[field]} characters.`;
  }
  return errors;
}

async function request(path, { method = 'GET', data, signal } = {}) {
  const response = await fetch(path, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed. Please try again.');
  return result;
}
function errorText(error) {
  return error instanceof TypeError || error.name === 'TimeoutError'
    ? 'The notes service did not respond. Check the connection and try again.'
    : error.message || 'The request failed. Please try again.';
}

const state = { query: '', status: 'active', notes: [], list: 'loading', error: '', editing: null, saving: false, busyIds: new Set() };
let generation = 0;
let listRequest;
let searchTimer;
let composer;
let createDraft = {};
const editDrafts = new Map();
const shell = AppShell({ title: 'Team Notes', subtitle: 'Harbor Lane product team', headerActions: [ThemeToggle({ value: initTheme() })] });
const listRegion = shell.querySelector('[data-region="list"]');
const asideRegion = shell.querySelector('[data-region="aside"]');
const toaster = createToaster(shell.querySelector('[data-region="toasts"]'));
const actionError = h('div', {});
const listBody = h('div', {});
const searchFilter = SearchFilter({
  onQueryChange: (query) => {
    state.query = query;
    invalidateList(); // Invalidate immediately, including the debounce interval.
    searchTimer = setTimeout(loadNotes, 200);
  },
  onStatusChange: (status) => {
    state.status = status;
    loadNotes();
  },
});
listRegion.append(searchFilter, actionError, listBody);
document.getElementById('app').replaceChildren(shell);

function renderList() {
  listBody.replaceChildren(NoteList({
    state: state.list, notes: state.notes, status: state.status, query: state.query,
    currentId: state.editing?.id, busyIds: [...state.busyIds], errorMessage: state.error,
    onRetry: loadNotes,
    onClearSearch: () => {
      state.query = '';
      searchFilter.searchFilter.setQuery('');
      loadNotes();
      searchFilter.searchFilter.focus();
    },
    onCreateFirst: () => composer.composer.focus(),
    onEdit: startEdit,
    onArchive: (note) => setArchived(note, true),
    onRestore: (note) => setArchived(note, false),
  }));
}
function invalidateList() {
  clearTimeout(searchTimer);
  listRequest?.abort();
  generation += 1;
  state.list = 'loading';
  renderList();
}
async function loadNotes() {
  invalidateList();
  const current = generation;
  const controller = new AbortController();
  listRequest = controller;
  const params = new URLSearchParams({ status: state.status, q: state.query });
  try {
    const result = await request(`/api/notes?${params}`, { signal: controller.signal });
    if (current !== generation) return;
    state.notes = result.notes;
    state.list = 'ready';
  } catch (error) {
    if (current !== generation) return;
    state.list = 'error';
    state.error = errorText(error);
  } finally {
    if (current === generation) renderList();
  }
}

function rememberDraft() {
  const values = composer.composer.getValues();
  if (state.editing) editDrafts.set(state.editing.id, values);
  else createDraft = values;
}
function renderComposer(focus = false) {
  const editing = state.editing;
  composer = NoteComposer({
    mode: editing ? 'edit' : 'create',
    values: editing ? editDrafts.get(editing.id) || editing : createDraft,
    limits: LIMITS, validate: false,
    onSubmit: save,
    onCancel: () => {
      if (state.saving) return;
      const author = composer.composer.getValues().author;
      if (state.editing) editDrafts.delete(state.editing.id);
      else createDraft = { author };
      state.editing = null;
      renderComposer(true);
      renderList();
    },
  });
  asideRegion.replaceChildren(Panel({
    title: editing ? 'Edit note' : 'New note',
    actions: editing ? h('span', { class: 'tn-badge tn-badge--accent' }, 'Editing') : null,
    children: [composer],
  }));
  if (focus) composer.composer.focus();
}
function startEdit(note) {
  if (state.saving) return;
  rememberDraft();
  state.editing = note;
  renderComposer(true);
  renderList();
  asideRegion.scrollIntoView({ block: 'nearest' });
}
async function save(values) {
  if (state.saving) return;
  const errors = validate(values);
  composer.composer.setErrors(errors);
  if (Object.keys(errors).length) return;
  rememberDraft();
  const editing = state.editing;
  state.saving = true;
  composer.composer.setBusy(true);
  try {
    const { note } = await request(editing ? `/api/notes/${editing.id}` : '/api/notes', {
      method: editing ? 'PATCH' : 'POST', data: values,
    });
    if (editing) editDrafts.delete(editing.id);
    else createDraft = { author: note.author };
    state.editing = null;
    state.saving = false;
    renderComposer(true);
    toaster.show({ message: `${editing ? 'Saved' : 'Added'} “${note.title}”.` });
    await loadNotes();
  } catch (error) {
    state.saving = false;
    composer.composer.setBusy(false);
    composer.composer.setErrors({}, `${errorText(error)} Your text is still here. If the connection failed, check the list before submitting again; the save may have reached the server.`);
    composer.composer.focus();
  }
}

async function setArchived(note, archived) {
  if (state.busyIds.has(note.id)) return;
  actionError.replaceChildren();
  state.busyIds.add(note.id);
  renderList();
  try {
    await request(`/api/notes/${note.id}`, { method: 'PATCH', data: { archived } });
    toaster.show({ message: `${archived ? 'Archived' : 'Restored'} “${note.title}”.`, actionLabel: 'Undo', onAction: () => setArchived(note, !archived) });
    await loadNotes();
  } catch (error) {
    actionError.replaceChildren(Banner({
      tone: 'error', title: archived ? 'Couldn’t archive note' : 'Couldn’t restore note', message: errorText(error),
      actions: [Button({ label: 'Try again', variant: 'secondary', onClick: () => setArchived(note, archived) })],
      onDismiss: () => actionError.replaceChildren(),
    }));
  } finally {
    state.busyIds.delete(note.id);
    renderList();
    if (document.activeElement === document.body) searchFilter.searchFilter.focus();
  }
}

renderComposer();
loadNotes();
