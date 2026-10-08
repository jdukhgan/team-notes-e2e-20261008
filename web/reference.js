// Representative Team Notes screen built only from web/components.js with in-memory,
// fictional sample data. No network calls. Used for design review and as the Builder's
// integration reference. URL parameters reproduce states for screenshots:
//   ?theme=light|dark|system  &list=ready|loading|error|empty  &composer=new|edit|invalid|busy|failed
//   &status=active|archived   &q=<search>

import {
  AppShell,
  NoteComposer,
  NoteList,
  Panel,
  SearchFilter,
  ThemeToggle,
  applyTheme,
  createToaster,
  debounce,
  h,
  initTheme,
} from "./components.js";

const params = new URLSearchParams(location.search);
if (params.has("theme")) applyTheme(params.get("theme"));
let theme = initTheme();

const loadedAt = Date.now();
const minutesAgo = (m) => new Date(loadedAt - m * 60_000).toISOString();

let nextId = 7;
let notes = [
  {
    id: 1,
    title: "Thursday release checklist",
    body: "1. Freeze main at 14:00\n2. Run the smoke suite against staging\n3. Post the change summary in #harbor-lane\n\nOwner for rollback: Priya (backup: Tomás).",
    author: "Mara Quill",
    archived: false,
    created_at: minutesAgo(60 * 26),
    updated_at: minutesAgo(18),
  },
  {
    id: 2,
    title: "Design review notes — onboarding flow",
    body: "Agreed to drop the second welcome screen. Keep the progress indicator but make the step labels shorter. Copy review is due before the release checklist is signed off.",
    author: "Ilya Fenwick",
    archived: false,
    created_at: minutesAgo(60 * 5),
    updated_at: minutesAgo(60 * 5),
  },
  {
    id: 3,
    title: "On-call handover",
    body: "Queue latency alert fired twice overnight; both cleared on their own after the nightly batch finished. No customer impact. Watching it for one more night before opening a ticket.",
    author: "Tomás Reyes",
    archived: false,
    created_at: minutesAgo(60 * 50),
    updated_at: minutesAgo(60 * 50),
  },
  {
    id: 4,
    title: "Team lunch options",
    body: "Noodle bar on Pier St, the Lebanese place, or the usual pizza. Vote by Wednesday.",
    author: "Priya Anand",
    archived: false,
    created_at: minutesAgo(60 * 24 * 9),
    updated_at: minutesAgo(60 * 24 * 9),
  },
  {
    id: 5,
    title: "Q3 retro actions",
    body: "• Rotate standup facilitator weekly\n• Move retro to Friday mornings\n• Write down decisions in Team Notes instead of chat",
    author: "Mara Quill",
    archived: true,
    created_at: minutesAgo(60 * 24 * 40),
    updated_at: minutesAgo(60 * 24 * 12),
  },
  {
    id: 6,
    title: "Old staging credentials rotation",
    body: "Done — rotated and announced. Nothing left to do here.",
    author: "Ilya Fenwick",
    archived: true,
    created_at: minutesAgo(60 * 24 * 60),
    updated_at: minutesAgo(60 * 24 * 30),
  },
];

const state = {
  status: params.get("status") === "archived" ? "archived" : "active",
  query: params.get("q") || "",
  list: params.get("list") || "ready",
  composer: params.get("composer") || "new",
  editingId: null,
  busyIds: [],
};
if (state.list === "empty") notes = [];
if (["edit", "invalid", "busy", "failed"].includes(state.composer) && notes.length) state.editingId = state.composer === "edit" ? 1 : null;

// ---------- Layout ----------

const themeToggle = ThemeToggle({ value: theme, onChange: (value) => (theme = value) });
const shell = AppShell({ title: "Team Notes", subtitle: "Harbor Lane product team", headerActions: [themeToggle] });
const listRegion = shell.querySelector('[data-region="list"]');
const asideRegion = shell.querySelector('[data-region="aside"]');
const toaster = createToaster(shell.querySelector('[data-region="toasts"]'));

const searchFilter = SearchFilter({
  query: state.query,
  status: state.status,
  onQueryChange: debounce((q) => {
    state.query = q;
    renderList();
  }, 150),
  onStatusChange: (status) => {
    state.status = status;
    renderList();
  },
});
const listBody = h("div", {});
listRegion.append(searchFilter, listBody);

// Reference-only control bar for reviewing states.
const refBar = h(
  "div",
  { class: "tn-ref-bar", role: "region", "aria-label": "Design reference controls" },
  h(
    "div",
    { class: "tn-ref-bar__inner" },
    h("strong", {}, "Design reference"),
    refSelect("List state", "list", ["ready", "loading", "error", "empty"]),
    refSelect("Composer state", "composer", ["new", "edit", "invalid", "busy", "failed"]),
  ),
);

function refSelect(label, key, options) {
  return h(
    "label",
    {},
    label,
    h(
      "select",
      {
        onChange: (event) => {
          const url = new URL(location.href);
          url.searchParams.set(key, event.target.value);
          location.href = url.toString();
        },
      },
      options.map((option) => h("option", { value: option, selected: option === state[key] }, option)),
    ),
  );
}

document.getElementById("app").replaceChildren(refBar, shell);

// ---------- Rendering ----------

function visibleNotes() {
  const q = state.query.trim().toLowerCase();
  return notes
    .filter((note) => note.archived === (state.status === "archived"))
    .filter((note) => !q || note.title.toLowerCase().includes(q) || note.body.toLowerCase().includes(q))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function renderList() {
  // Counts are only meaningful once notes have loaded.
  searchFilter.searchFilter.setCounts(
    state.list === "loading" || state.list === "error"
      ? {}
      : { active: notes.filter((n) => !n.archived).length, archived: notes.filter((n) => n.archived).length },
  );
  listBody.replaceChildren(
    NoteList({
      state: state.list === "empty" ? "ready" : state.list,
      notes: visibleNotes(),
      status: state.status,
      query: state.query,
      currentId: state.editingId,
      busyIds: state.busyIds,
      onRetry: () => {
        state.list = "loading";
        renderList();
        setTimeout(() => {
          state.list = "ready";
          renderList();
        }, 900);
      },
      onClearSearch: () => {
        state.query = "";
        searchFilter.searchFilter.setQuery("");
        renderList();
        searchFilter.searchFilter.focus();
      },
      onCreateFirst: () => composer?.composer.focus(),
      onEdit: (note) => startEdit(note.id),
      onArchive: (note) => setArchived(note.id, true),
      onRestore: (note) => setArchived(note.id, false),
    }),
  );
}

let composer;
function renderComposer({ focus = false } = {}) {
  const editing = notes.find((n) => n.id === state.editingId);
  const mode = editing ? "edit" : "create";
  const values = editing ?? (state.composer === "invalid" || state.composer === "failed" ? { title: "", author: "Mara Quill", body: "" } : { author: "Mara Quill" });
  if (state.composer === "busy" || state.composer === "failed") {
    Object.assign(values, { title: "Sprint 42 goals", body: "Ship archive/restore and tighten search." });
  }
  composer = NoteComposer({
    mode,
    values,
    errors: state.composer === "invalid" ? { title: "Add a title.", body: "Write something in the note." } : {},
    formError: state.composer === "failed" ? "The note wasn’t saved — the server didn’t respond. Your text is still here; try again." : "",
    busy: state.composer === "busy",
    onCancel: () => {
      state.editingId = null;
      renderComposer();
      renderList();
    },
    onSubmit: (values) => {
      composer.composer.setBusy(true);
      setTimeout(() => save(values), 500);
    },
  });
  asideRegion.replaceChildren(
    Panel({
      title: mode === "edit" ? "Edit note" : "New note",
      actions: mode === "edit" ? h("span", { class: "tn-badge tn-badge--accent" }, "Editing") : null,
      children: [composer],
    }),
  );
  if (focus) composer.composer.focus();
}

function save(values) {
  const now = new Date().toISOString();
  const clean = { title: values.title.trim(), author: values.author.trim(), body: values.body };
  if (state.editingId) {
    const note = notes.find((n) => n.id === state.editingId);
    Object.assign(note, clean, { updated_at: now });
    toaster.show({ message: `Saved “${note.title}”.` });
    state.editingId = null;
  } else {
    notes.unshift({ id: nextId++, ...clean, archived: false, created_at: now, updated_at: now });
    toaster.show({ message: `Added “${clean.title}”.` });
  }
  state.composer = "new";
  renderComposer();
  renderList();
}

function startEdit(id) {
  state.editingId = id;
  renderComposer({ focus: true });
  renderList();
  asideRegion.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function setArchived(id, archived) {
  state.busyIds = [...state.busyIds, id];
  renderList();
  setTimeout(() => {
    const note = notes.find((n) => n.id === id);
    note.archived = archived;
    note.updated_at = new Date().toISOString();
    state.busyIds = state.busyIds.filter((b) => b !== id);
    if (state.editingId === id) {
      state.editingId = null;
      renderComposer();
    }
    renderList();
    toaster.show({
      message: archived ? `Archived “${note.title}”.` : `Restored “${note.title}”.`,
      actionLabel: "Undo",
      onAction: () => setArchived(id, !archived),
    });
  }, 400);
}

renderComposer();
renderList();
