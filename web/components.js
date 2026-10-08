// Team Notes — reusable UI components (dependency-free ES module).
// Design authority and the export/event contract: docs/design.md.
//
// Conventions
// - Every component is a function taking one props object and returning an HTMLElement.
// - Interaction is reported through `on*` callback props; components never fetch or persist.
// - Components that keep in-progress user input (NoteComposer, SearchFilter) expose a small
//   imperative controller on the returned element so callers can update them without
//   re-rendering and losing focus/caret position.
// - All text is inserted as text nodes; no innerHTML of caller data.

export const DEFAULT_LIMITS = Object.freeze({ title: 120, author: 60, body: 5000 });

const THEME_KEY = "team-notes-theme";
const THEMES = ["system", "light", "dark"];

let idCounter = 0;
export function uid(prefix = "tn") {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

// ---------- DOM helper ----------

// h("button", { class: "x", onClick: fn, "aria-label": "Close" }, "text", childNode)
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "class") {
      el.className = value;
    } else if (key === "dataset") {
      Object.assign(el.dataset, value);
    } else if (key === "value" || key === "checked") {
      el[key] = value;
    } else {
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// ---------- Icons (inline SVG, decorative unless labelled by the caller) ----------

const ICON_PATHS = {
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z", "m20 20-4-4"],
  plus: ["M12 5v14", "M5 12h14"],
  edit: ["M4 20h4L19 9l-4-4L4 16v4Z", "m13.5 6.5 4 4"],
  archive: ["M3 5h18v4H3z", "M5 9v10h14V9", "M10 13h4"],
  restore: ["M4 12a8 8 0 1 0 2.3-5.6", "M4 4v4h4"],
  alert: ["M12 3 2 20h20L12 3Z", "M12 10v4", "M12 17h.01"],
  check: ["m5 12 5 5 9-10"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  notes: ["M6 3h9l4 4v14H6z", "M14 3v5h5", "M9 12h7", "M9 16h5"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"],
  moon: ["M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"],
  monitor: ["M3 4h18v12H3z", "M8 20h8", "M12 16v4"],
};

export function Icon(name, className = "tn-button__icon") {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", className);
  for (const d of ICON_PATHS[name] || []) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

// ---------- Utilities ----------

export function debounce(fn, wait = 200) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export function formatTimestamp(iso, { now = new Date(), locale } = {}) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSeconds / 86400), "day");
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

// Counts Unicode code points (matching the API's Python len()), not UTF-16 code units,
// so an emoji or other astral character counts as 1.
export function codePointLength(text) {
  let count = 0;
  for (const _ of String(text ?? "")) count += 1;
  return count;
}

// Client-side presentation validation only; the API remains the source of truth.
// Length limits are in code points (see codePointLength).
export function validateNote(values, limits = DEFAULT_LIMITS) {
  const errors = {};
  const title = (values.title || "").trim();
  const author = (values.author || "").trim();
  const body = values.body || "";
  if (!title) errors.title = "Add a title.";
  else if (codePointLength(title) > limits.title) errors.title = `Keep the title under ${limits.title} characters.`;
  if (!author) errors.author = "Add who is writing this note.";
  else if (codePointLength(author) > limits.author) errors.author = `Keep the author under ${limits.author} characters.`;
  if (!body.trim()) errors.body = "Write something in the note.";
  else if (codePointLength(body) > limits.body) errors.body = `Keep the note under ${limits.body} characters.`;
  return errors;
}

// Splits text into text nodes and <mark> elements for case-insensitive matches of `query`.
export function highlight(text, query) {
  const source = String(text ?? "");
  const needle = (query || "").trim().toLowerCase();
  if (!needle) return [document.createTextNode(source)];
  const lower = source.toLowerCase();
  const out = [];
  let index = 0;
  while (index < source.length) {
    const hit = lower.indexOf(needle, index);
    if (hit === -1) break;
    if (hit > index) out.push(document.createTextNode(source.slice(index, hit)));
    out.push(h("mark", { class: "tn-highlight" }, source.slice(hit, hit + needle.length)));
    index = hit + needle.length;
  }
  if (index < source.length) out.push(document.createTextNode(source.slice(index)));
  return out;
}

// ---------- Theme ----------

export function getThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEMES.includes(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

// "system" removes data-theme so the prefers-color-scheme media query applies.
export function applyTheme(preference) {
  const value = THEMES.includes(preference) ? preference : "system";
  if (value === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", value);
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    /* storage unavailable: theme still applies for this page view */
  }
  return value;
}

export function initTheme() {
  return applyTheme(getThemePreference());
}

export function ThemeToggle({ value = getThemePreference(), onChange } = {}) {
  const name = uid("theme");
  const options = [
    { value: "system", label: "Auto", icon: "monitor" },
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
  ];
  return h(
    "fieldset",
    { class: "tn-segmented tn-theme-toggle" },
    h("legend", { class: "tn-visually-hidden" }, "Colour theme"),
    options.map((option) =>
      h(
        "label",
        { class: "tn-segmented__option", title: `${option.label} theme` },
        h("input", {
          type: "radio",
          name,
          value: option.value,
          checked: option.value === value,
          onChange: (event) => {
            const applied = applyTheme(event.target.value);
            onChange?.(applied);
          },
        }),
        h("span", {}, Icon(option.icon), h("span", { class: "tn-visually-hidden" }, option.label)),
      ),
    ),
  );
}

// ---------- Button ----------

export function Button({
  label,
  variant = "secondary",
  size,
  type = "button",
  icon,
  iconOnly = false,
  busy = false,
  disabled = false,
  onClick,
  ...attrs
} = {}) {
  const classes = ["tn-button", `tn-button--${variant}`, size === "sm" ? "tn-button--sm" : ""].filter(Boolean).join(" ");
  return h(
    "button",
    {
      ...attrs,
      type,
      class: classes,
      disabled: disabled || busy,
      "aria-busy": busy ? "true" : undefined,
      "aria-label": iconOnly ? label : attrs["aria-label"],
      onClick,
    },
    busy ? h("span", { class: "tn-spinner", "aria-hidden": "true" }) : icon ? Icon(icon) : null,
    iconOnly ? null : label,
  );
}

// ---------- Shell ----------

// Returns the page shell. Fill regions with element.querySelector('[data-region="list"|"aside"]').
// A polite toast region is included at [data-region="toasts"]; pass it to createToaster().
export function AppShell({ title = "Team Notes", subtitle, headerActions = [], list, aside } = {}) {
  return h(
    "div",
    { class: "tn-shell" },
    h("a", { class: "tn-skip-link", href: "#tn-main" }, "Skip to notes"),
    h(
      "header",
      { class: "tn-header" },
      h(
        "div",
        { class: "tn-header__inner" },
        h(
          "div",
          { class: "tn-brand" },
          h("div", { class: "tn-brand__mark", "aria-hidden": "true" }, "TN"),
          h(
            "div",
            {},
            h("h1", { class: "tn-brand__title" }, title),
            subtitle ? h("p", { class: "tn-brand__subtitle" }, subtitle) : null,
          ),
        ),
        headerActions,
      ),
    ),
    h(
      "main",
      { class: "tn-main", id: "tn-main", tabindex: "-1" },
      h("section", { class: "tn-main__list", "aria-label": "Notes", dataset: { region: "list" } }, list),
      h("aside", { class: "tn-main__aside", "aria-label": "Note editor", dataset: { region: "aside" } }, aside),
    ),
    h("div", { class: "tn-toast-region", role: "status", "aria-live": "polite", dataset: { region: "toasts" } }),
  );
}

export function Panel({ title, titleId = uid("panel"), actions, children = [] } = {}) {
  return h(
    "section",
    { class: "tn-panel", "aria-labelledby": titleId },
    h("div", { class: "tn-panel__header" }, h("h2", { class: "tn-panel__title", id: titleId }, title), actions),
    children,
  );
}

// ---------- Search & status filter ----------

// counts: { active?: number, archived?: number }
// element.searchFilter = { setQuery(q), setStatus(s), setCounts(c), focus() }
export function SearchFilter({ query = "", status = "active", counts = {}, onQueryChange, onStatusChange, placeholder = "Search titles and notes" } = {}) {
  const inputId = uid("search");
  const input = h("input", {
    id: inputId,
    class: "tn-input",
    type: "search",
    value: query,
    placeholder,
    autocomplete: "off",
    spellcheck: "false",
    onInput: (event) => onQueryChange?.(event.target.value),
    onKeydown: (event) => {
      if (event.key === "Escape" && input.value) {
        event.preventDefault();
        input.value = "";
        onQueryChange?.("");
      }
    },
  });

  const name = uid("status");
  const countEls = {};
  const statusOptions = [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
  ].map((option) => {
    countEls[option.value] = h("span", { class: "tn-segmented__count" });
    return h(
      "label",
      { class: "tn-segmented__option" },
      h("input", {
        type: "radio",
        name,
        value: option.value,
        checked: option.value === status,
        onChange: (event) => onStatusChange?.(event.target.value),
      }),
      h("span", {}, option.label, countEls[option.value]),
    );
  });

  const setCounts = (next = {}) => {
    for (const key of Object.keys(countEls)) {
      const value = next[key];
      countEls[key].hidden = value === undefined || value === null;
      countEls[key].textContent = value ?? "";
    }
  };
  setCounts(counts);

  const el = h(
    "div",
    { class: "tn-toolbar", role: "search" },
    h(
      "div",
      { class: "tn-search" },
      h("label", { class: "tn-visually-hidden", for: inputId }, "Search notes"),
      Icon("search", "tn-search__icon"),
      input,
    ),
    h("fieldset", { class: "tn-segmented" }, h("legend", { class: "tn-visually-hidden" }, "Show notes"), statusOptions),
  );

  el.searchFilter = {
    setQuery: (q) => {
      input.value = q;
    },
    setStatus: (s) => {
      for (const radio of el.querySelectorAll(`input[name="${name}"]`)) radio.checked = radio.value === s;
    },
    setCounts,
    focus: () => input.focus(),
  };
  return el;
}

// ---------- Feedback ----------

// tone: "info" | "success" | "warning" | "error". Errors use role="alert".
export function Banner({ tone = "info", title, message, actions = [], onDismiss } = {}) {
  return h(
    "div",
    { class: `tn-banner tn-banner--${tone}`, role: tone === "error" ? "alert" : "status" },
    tone === "error" || tone === "warning" ? Icon("alert") : tone === "success" ? Icon("check") : null,
    h(
      "div",
      { class: "tn-banner__body" },
      title ? h("p", { class: "tn-banner__title" }, title) : null,
      message ? h("p", {}, message) : null,
    ),
    actions.length || onDismiss
      ? h(
          "div",
          { class: "tn-banner__actions" },
          actions,
          onDismiss ? Button({ label: "Dismiss", variant: "ghost", size: "sm", icon: "close", iconOnly: true, onClick: onDismiss }) : null,
        )
      : null,
  );
}

// toaster.show({ message, actionLabel, onAction, timeout }) → dismiss()
export function createToaster(region) {
  return {
    show({ message, actionLabel, onAction, timeout = 5000 }) {
      let timer;
      const dismiss = () => {
        clearTimeout(timer);
        toast.remove();
      };
      const toast = h(
        "div",
        { class: "tn-toast" },
        h("span", { class: "tn-toast__message" }, message),
        actionLabel
          ? Button({
              label: actionLabel,
              variant: "ghost",
              size: "sm",
              onClick: () => {
                dismiss();
                onAction?.();
              },
            })
          : null,
        Button({ label: "Dismiss notification", variant: "ghost", size: "sm", icon: "close", iconOnly: true, onClick: dismiss }),
      );
      region.append(toast);
      if (timeout) timer = setTimeout(dismiss, timeout);
      return dismiss;
    },
  };
}

export function EmptyState({ icon = "notes", title, message, action, tone } = {}) {
  return h(
    "div",
    { class: `tn-empty${tone === "error" ? " tn-empty--error" : ""}`, role: tone === "error" ? "alert" : undefined },
    Icon(icon, "tn-empty__icon"),
    h("p", { class: "tn-empty__title" }, title),
    message ? h("p", { class: "tn-empty__text" }, message) : null,
    action,
  );
}

// ---------- Notes ----------

// note: { id, title, body, author, archived, created_at, updated_at }
export function NoteCard({ note, query = "", current = false, busy = false, onEdit, onArchive, onRestore, now } = {}) {
  const titleId = uid("note-title");
  // Treat sub-second differences as the same write so fresh notes read "Created".
  const edited = Date.parse(note.updated_at) - Date.parse(note.created_at) > 1000;
  const stamp = edited ? note.updated_at : note.created_at;
  const actions = note.archived
    ? [Button({ label: "Restore", variant: "ghost", size: "sm", icon: "restore", busy, onClick: () => onRestore?.(note), "aria-describedby": titleId })]
    : [
        Button({ label: "Edit", variant: "ghost", size: "sm", icon: "edit", disabled: busy, onClick: () => onEdit?.(note), "aria-describedby": titleId }),
        Button({ label: "Archive", variant: "ghost", size: "sm", icon: "archive", busy, onClick: () => onArchive?.(note), "aria-describedby": titleId }),
      ];
  return h(
    "article",
    {
      class: `tn-note-card${note.archived ? " tn-note-card--archived" : ""}`,
      "aria-labelledby": titleId,
      "aria-current": current ? "true" : undefined,
      "aria-busy": busy ? "true" : undefined,
      dataset: { noteId: note.id },
    },
    h(
      "div",
      { class: "tn-note-card__head" },
      h("h3", { class: "tn-note-card__title", id: titleId }, highlight(note.title, query)),
      note.archived ? h("span", { class: "tn-badge" }, "Archived") : current ? h("span", { class: "tn-badge tn-badge--accent" }, "Editing") : null,
    ),
    h(
      "p",
      { class: "tn-note-card__meta" },
      h("span", {}, note.author),
      h("span", { class: "tn-note-card__meta-sep", "aria-hidden": "true" }, "·"),
      h("span", {}, edited ? "Updated " : "Created ", h("time", { datetime: stamp, title: new Date(stamp).toLocaleString() }, formatTimestamp(stamp, { now }))),
    ),
    h("p", { class: "tn-note-card__body" }, highlight(note.body, query)),
    h("div", { class: "tn-note-card__actions" }, actions),
  );
}

function SkeletonCard() {
  return h(
    "li",
    { "aria-hidden": "true" },
    h(
      "div",
      { class: "tn-note-card tn-note-card--skeleton" },
      h("span", { class: "tn-skeleton tn-skeleton--title" }),
      h("span", { class: "tn-skeleton tn-skeleton--meta" }),
      h("span", { class: "tn-skeleton tn-skeleton--line" }),
      h("span", { class: "tn-skeleton tn-skeleton--short" }),
    ),
  );
}

// state: "ready" | "loading" | "error"
// An empty `notes` array in "ready" renders the correct empty state for status/query.
export function NoteList({
  state = "ready",
  notes = [],
  status = "active",
  query = "",
  currentId = null,
  busyIds = [],
  errorMessage = "The notes service did not respond. Check that the server is running, then try again.",
  onRetry,
  onClearSearch,
  onCreateFirst,
  onEdit,
  onArchive,
  onRestore,
  now,
} = {}) {
  const q = query.trim();
  const noun = status === "archived" ? "archived" : "active";
  let summary = "";
  let content;

  if (state === "loading") {
    summary = "Loading notes…";
    content = h("ul", { class: "tn-note-list" }, [SkeletonCard(), SkeletonCard(), SkeletonCard()]);
  } else if (state === "error") {
    summary = "Notes could not be loaded.";
    content = EmptyState({
      icon: "alert",
      tone: "error",
      title: "Couldn’t load notes",
      message: errorMessage,
      action: onRetry ? Button({ label: "Try again", variant: "secondary", icon: "restore", onClick: onRetry }) : null,
    });
  } else if (!notes.length && q) {
    summary = `No ${noun} notes match “${q}”.`;
    content = EmptyState({
      icon: "search",
      title: `No ${noun} notes match “${q}”`,
      message: status === "archived" ? "Try another word, or look in Active notes." : "Try another word, or check Archived notes.",
      action: onClearSearch ? Button({ label: "Clear search", variant: "secondary", onClick: onClearSearch }) : null,
    });
  } else if (!notes.length) {
    summary = `No ${noun} notes.`;
    content =
      status === "archived"
        ? EmptyState({ icon: "archive", title: "Nothing archived", message: "Archived notes are kept here and can be restored at any time." })
        : EmptyState({
            title: "No notes yet",
            message: "Capture a decision, a handover or a quick reminder for the team.",
            action: onCreateFirst ? Button({ label: "Write the first note", variant: "primary", icon: "plus", onClick: onCreateFirst }) : null,
          });
  } else {
    const count = notes.length;
    summary = q ? `${count} ${noun} ${count === 1 ? "note matches" : "notes match"} “${q}”` : `${count} ${noun} ${count === 1 ? "note" : "notes"}`;
    content = h(
      "ul",
      { class: "tn-note-list" },
      notes.map((note) =>
        h(
          "li",
          {},
          NoteCard({ note, query: q, current: note.id === currentId, busy: busyIds.includes(note.id), onEdit, onArchive, onRestore, now }),
        ),
      ),
    );
  }

  return h(
    "div",
    { class: "tn-note-list-wrap", "aria-busy": state === "loading" ? "true" : "false" },
    h("p", { class: "tn-toolbar__status", role: "status", "aria-live": "polite" }, summary),
    content,
  );
}

// ---------- Composer ----------

function Field({ id, label, control, error, hint, counter }) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, errorId].filter(Boolean).join(" ");
  control.id = id;
  control.setAttribute("aria-describedby", describedBy);
  const errorEl = h("p", { class: "tn-field__error", id: errorId, hidden: !error }, error || "");
  if (error) control.setAttribute("aria-invalid", "true");
  const field = h(
    "div",
    { class: "tn-field" },
    h(
      "div",
      { class: "tn-field__top" },
      h("label", { class: "tn-label", for: id }, label, " ", h("span", { class: "tn-label__required" }, "(required)")),
      counter,
    ),
    control,
    hint ? h("p", { class: "tn-field__hint", id: hintId }, hint) : null,
    errorEl,
  );
  field.setError = (message) => {
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
    if (message) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");
  };
  return field;
}

function Counter(control, max) {
  const el = h("span", { class: "tn-counter", "aria-hidden": "true" });
  const update = () => {
    const length = codePointLength(control.value);
    el.textContent = `${length}/${max}`;
    el.dataset.over = String(length > max);
  };
  control.addEventListener("input", update);
  update();
  el.update = update;
  return el;
}

// mode: "create" | "edit"
// values: { title, body, author }; errors: { title?, body?, author? }; formError: string
// onSubmit(values) receives untrimmed raw values after client validation passes (validate: true).
// element.composer = { setBusy(bool), setErrors(errors, formError), setValues(values), reset(), focus(), getValues() }
export function NoteComposer({
  mode = "create",
  values = {},
  errors = {},
  formError = "",
  busy = false,
  limits = DEFAULT_LIMITS,
  validate = true,
  onSubmit,
  onCancel,
} = {}) {
  const prefix = uid("composer");
  // Native maxlength counts UTF-16 code units, so allow 2 per code point; validateNote enforces the real limit.
  const titleInput = h("input", { class: "tn-input", type: "text", name: "title", autocomplete: "off", value: values.title || "", maxlength: String(limits.title * 2) });
  const authorInput = h("input", { class: "tn-input", type: "text", name: "author", autocomplete: "name", value: values.author || "", maxlength: String(limits.author * 2) });
  const bodyInput = h("textarea", { class: "tn-textarea", name: "body", rows: "6" });
  bodyInput.value = values.body || "";

  const counters = [Counter(titleInput, limits.title), Counter(authorInput, limits.author), Counter(bodyInput, limits.body)];
  const fields = {
    title: Field({ id: `${prefix}-title`, label: "Title", control: titleInput, error: errors.title, counter: counters[0] }),
    author: Field({ id: `${prefix}-author`, label: "Author", control: authorInput, error: errors.author, counter: counters[1] }),
    body: Field({
      id: `${prefix}-body`,
      label: "Note",
      control: bodyInput,
      error: errors.body,
      counter: counters[2],
      hint: "Line breaks and spacing are kept exactly as typed.",
    }),
  };
  const controls = { title: titleInput, author: authorInput, body: bodyInput };

  // Clear a field's error as soon as the user edits it.
  for (const [key, control] of Object.entries(controls)) {
    control.addEventListener("input", () => fields[key].setError(""));
  }

  const formErrorSlot = h("div", {});
  const submitLabel = mode === "edit" ? "Save changes" : "Add note";
  let submitButton = Button({ label: submitLabel, variant: "primary", type: "submit", icon: mode === "edit" ? "check" : "plus", busy });
  const actions = h(
    "div",
    { class: "tn-form__actions" },
    onCancel ? Button({ label: mode === "edit" ? "Cancel editing" : "Clear", variant: "ghost", onClick: onCancel, disabled: busy }) : null,
    submitButton,
  );

  const getValues = () => ({ title: titleInput.value, author: authorInput.value, body: bodyInput.value });

  const form = h(
    "form",
    {
      class: "tn-form",
      novalidate: true,
      "aria-label": mode === "edit" ? "Edit note" : "New note",
      onSubmit: (event) => {
        event.preventDefault();
        if (form.dataset.busy === "true") return;
        const current = getValues();
        if (validate) {
          const found = validateNote(current, limits);
          if (Object.keys(found).length) {
            api.setErrors(found);
            return;
          }
        }
        onSubmit?.(current);
      },
    },
    formErrorSlot,
    fields.title,
    fields.author,
    fields.body,
    actions,
  );

  const api = {
    setBusy(next) {
      form.dataset.busy = String(Boolean(next));
      const replacement = Button({ label: submitLabel, variant: "primary", type: "submit", icon: mode === "edit" ? "check" : "plus", busy: next });
      submitButton.replaceWith(replacement);
      submitButton = replacement;
      for (const control of Object.values(controls)) control.readOnly = Boolean(next);
      const cancel = actions.querySelector(".tn-button--ghost");
      if (cancel) cancel.disabled = Boolean(next);
    },
    setErrors(next = {}, message = "") {
      let first = null;
      for (const key of ["title", "author", "body"]) {
        fields[key].setError(next[key]);
        if (next[key] && !first) first = controls[key];
      }
      formErrorSlot.replaceChildren(message ? Banner({ tone: "error", message }) : "");
      first?.focus();
    },
    setValues(next = {}) {
      titleInput.value = next.title ?? "";
      authorInput.value = next.author ?? "";
      bodyInput.value = next.body ?? "";
      counters.forEach((counter) => counter.update());
      api.setErrors({});
    },
    reset() {
      api.setValues({ author: authorInput.value });
    },
    focus: () => titleInput.focus(),
    getValues,
  };

  form.dataset.busy = String(Boolean(busy));
  if (busy) for (const control of Object.values(controls)) control.readOnly = true;
  if (formError) formErrorSlot.replaceChildren(Banner({ tone: "error", message: formError }));
  form.composer = api;
  return form;
}
