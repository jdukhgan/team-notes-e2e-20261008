# Team Notes — design authority

This file is the visual authority for Team Notes. Tokens and component styles live in
`web/styles.css`; reusable components live in `web/components.js`; `web/reference.html`
(+ `web/reference.js`) is the working representative screen built only from those components.
Owner: UI Designer. Changes to tokens or component contracts go through this file.

## Direction

A quiet, practical team notebook. Content (titles and note text) carries the page; chrome
stays neutral and low-contrast so notes are easy to scan.

- **Surfaces:** slightly warm neutrals (paper-like light theme, charcoal dark theme) with
  hairline borders and minimal shadow. One accent (deep teal) for primary actions, the
  selected filter and the note being edited. No decorative colour.
- **Type:** platform sans-serif stack (no web fonts). Sizes 12 / 14 / 16 / 18 / 22 px;
  weights 400 / 500 / 600. Titles 600, metadata 12 px muted, note text 14 px at 1.55
  line-height. `system-ui` is intentionally excluded from the stack because some Linux
  setups map it to a CJK face with no bold weight.
- **Spacing:** 4 px base scale (`--space-1` … `--space-10`). Cards 16/20 px padding,
  12 px gap between cards, 24 px page gutters (16 px on phone).
- **Shape:** radius 6 px (controls), 10 px (cards, banners), 14 px (panels), pill for
  segmented controls and badges.
- **Density:** comfortable; one note card shows title, author · timestamp, up to four lines
  of body (whitespace preserved), and its actions.

## Layout

| Width | Layout |
| --- | --- |
| > 56rem (≈ 896 px) — desktop | Two columns: list (fluid) + sticky composer panel (24rem) on the right. Max content width 72rem. |
| ≤ 56rem — tablet | Single column: composer panel first (compact 7.5rem textarea), then search/filter and the list. |
| ≤ 36rem — phone | As tablet with 16 px gutters; header subtitle hidden; status filter stretches full width. |

## Themes

`light`, `dark`, and `system` (default, follows `prefers-color-scheme`). The choice is stored in
`localStorage["team-notes-theme"]` and applied as `<html data-theme="light|dark">`; `system`
removes the attribute. Pages should include the inline pre-paint snippet from
`web/reference.html` `<head>` to avoid a theme flash.

Measured contrast (WCAG): body text ≥ 13.9:1, muted text ≥ 6.0:1, subtle text ≥ 4.9:1,
accent button label ≥ 6.0:1, danger text ≥ 5.7:1, form-control borders ≥ 3.2:1 (both themes).

## Tokens (`web/styles.css` `:root`)

- Type: `--font-sans`, `--font-mono`, `--text-xs|sm|md|lg|xl`, `--leading-tight|body`, `--weight-regular|medium|semibold`
- Space: `--space-1|2|3|4|5|6|8|10`
- Radius: `--radius-sm|md|lg|pill`
- Layout: `--layout-max`, `--layout-aside`, `--control-height`
- Motion: `--duration-fast|base`, `--ease` (reduced-motion respected globally)
- Colour: `--color-bg`, `--color-surface`, `--color-surface-muted`, `--color-surface-sunken`,
  `--color-selected`, `--color-border`, `--color-border-strong`, `--color-border-input`,
  `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-accent`,
  `--color-accent-hover`, `--color-accent-soft`, `--color-accent-text`, `--color-on-accent`,
  `--color-danger|-hover|-soft`, `--color-success|-soft`, `--color-warning|-soft`,
  `--color-info|-soft`, `--color-focus`, `--focus-ring`, `--shadow-sm|md`, `--skeleton-a|b`

Dark values are defined twice (explicit `[data-theme="dark"]` and the `system` media query);
keep both blocks in sync. Do not hard-code colours in components or app CSS.

## Component contract (`web/components.js`)

All components are plain functions `Component(props) → HTMLElement`. They never fetch, persist
or hold app state; interactions are reported through `on*` callback props. Caller data is
always inserted as text (no `innerHTML`). Class names are prefixed `tn-`.

### Exports

| Export | Purpose / props | Events (callbacks) |
| --- | --- | --- |
| `AppShell({ title, subtitle, headerActions, list, aside })` | Skip link, header, `<main id="tn-main">` with regions `[data-region="list"]`, `[data-region="aside"]`, and a polite `[data-region="toasts"]` live region. | — |
| `Panel({ title, actions, children })` | Titled surface used for the composer. | — |
| `SearchFilter({ query, status, counts, placeholder })` | `role="search"` toolbar: labelled search box + Active/Archived radio group with optional counts. Controller: `el.searchFilter.setQuery(q)`, `.setStatus(s)`, `.setCounts({active, archived})` (omit a key to hide its count), `.focus()`. | `onQueryChange(q)` on every input and on Escape-clear (debounce in the caller, e.g. with `debounce`). `onStatusChange("active"\|"archived")`. |
| `NoteList({ state, notes, status, query, currentId, busyIds, errorMessage, now })` | `state`: `"ready"\|"loading"\|"error"`. Renders a live summary line (“4 active notes”, “2 active notes match “release””), cards, skeletons, or the matching empty/error state. Empty variants: no notes yet, nothing archived, no search matches. | `onRetry()`, `onClearSearch()`, `onCreateFirst()`, plus card events below. |
| `NoteCard({ note, query, current, busy, now })` | `note` = API shape `{id,title,body,author,archived,created_at,updated_at}`. Highlights `query` matches; body keeps whitespace, clamped to 4 lines. Shows “Updated …” when `updated_at` is > 1 s after `created_at`, else “Created …”. Active notes show Edit + Archive; archived notes show an Archived badge + Restore. `current` marks the note being edited. `busy` shows a spinner on the archive/restore action. | `onEdit(note)`, `onArchive(note)`, `onRestore(note)` |
| `NoteComposer({ mode, values, errors, formError, busy, limits, validate })` | `mode`: `"create"\|"edit"`. Fields Title, Author, Note with counters, hint, inline errors (`aria-invalid` + `aria-describedby`). `formError` shows an error banner above the fields (server/network failure). With `validate: true` (default) runs `validateNote` before submitting and focuses the first invalid field. Controller: `el.composer.setBusy(bool)`, `.setErrors(errors, formError)`, `.setValues(values)`, `.reset()` (clears title/body, keeps author), `.focus()`, `.getValues()`. | `onSubmit(values)` with raw, untrimmed `{title, author, body}`; `onCancel()` (rendered as “Clear” in create mode, “Cancel editing” in edit mode). |
| `ThemeToggle({ value })` | Auto / Light / Dark radio group (icon buttons with accessible names). Applies and stores the theme itself. | `onChange(theme)` |
| `Button({ label, variant, size, type, icon, iconOnly, busy, disabled, ...attrs })` | Variants `primary`, `secondary`, `ghost`, `danger`; `size: "sm"`. `busy` swaps the icon for a spinner, sets `aria-busy` and disables. | `onClick(event)` |
| `Banner({ tone, title, message, actions, onDismiss })` | Inline feedback; `tone`: `info\|success\|warning\|error` (`error` uses `role="alert"`). | `onDismiss()` |
| `EmptyState({ icon, title, message, action, tone })` | Placeholder used by `NoteList`; reusable elsewhere. | — |
| `createToaster(regionEl)` | `.show({ message, actionLabel, onAction, timeout = 5000 }) → dismiss()`. Use the shell’s toast region. Use for confirmations (“Added …”, “Archived …” with Undo). | `onAction()` |
| `initTheme()`, `applyTheme(pref)`, `getThemePreference()` | Theme helpers (`"system"\|"light"\|"dark"`). Call `initTheme()` once at start-up. | — |
| `validateNote(values, limits)` | Presentation-level check mirroring the API: title/author trimmed and required, body required (not trimmed), length limits counted in Unicode code points (an emoji counts as 1, matching the API's Python `len`). Returns `{field: message}`. The API remains authoritative; show its `{error}` via `formError`. | — |
| `DEFAULT_LIMITS` | `{ title: 120, author: 60, body: 5000 }`. If `docs/api.md` documents different limits, pass them as `limits` (do not edit the default per page). Limits are code points; composer counters use the same count, and native `maxlength` on Title/Author is set to 2× the limit (UTF-16 units) so the full code-point boundary can be typed while `validateNote` blocks submission past it. | — |
| `codePointLength(text)` | Code-point length used by counters and `validateNote`. | — |
| `h`, `Icon`, `highlight`, `formatTimestamp`, `debounce`, `uid` | Small helpers used by the components. | — |

### Integration guidance for the Builder (`index.html`, `web/app.js`)

1. Copy the `<head>` of `web/reference.html` (viewport, `color-scheme`, empty favicon, theme
   pre-paint snippet, `styles.css`) into `index.html`; load `web/app.js` as a module.
2. `initTheme()`, then mount `AppShell({ title: "Team Notes", headerActions: [ThemeToggle()] })`.
3. List region: one `SearchFilter`, then a container you re-render with `NoteList(...)` on every
   state change (`loading` while fetching `GET /api/notes`, `error` with `onRetry`, else `ready`).
   Debounce `onQueryChange` (~200 ms) before calling the API.
4. Aside region: `Panel({ title: "New note" | "Edit note", children: [NoteComposer(...)] })`.
   On submit call `composer.setBusy(true)`; on 400 call `setBusy(false)` + `setErrors({}, error)`
   (or map to a field); on success re-render the composer (create) or leave edit mode and
   refresh the list. Clicking Edit re-renders the composer with `mode: "edit"` and calls
   `.focus()`; pass `currentId` to `NoteList`.
5. Archive/restore: add the id to `busyIds`, PATCH, refresh, then `toaster.show({ message,
   actionLabel: "Undo", onAction })`.
6. Do not add new colours, spacing values or component variants in app code; request them here.
   The reference bar (`.tn-ref-bar`) is for the reference page only.

## Accessibility checklist

Skip link to `#tn-main`; landmarks (header, main, aside, `role="search"`); visible
`:focus-visible` ring (`--focus-ring`) on every control; radio groups (status filter, theme)
are native inputs inside `<fieldset>`/`<legend>` so arrow keys work; labelled fields with
required marker, inline errors linked by `aria-describedby`, first invalid field focused;
live regions for the list summary and toasts; errors use `role="alert"`; skeleton list marked
`aria-busy`; `prefers-reduced-motion` honoured; all targets ≥ 32 px high (controls 40 px).

## Running the reference

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory web
# open http://127.0.0.1:8765/reference.html
```

State parameters for review/screenshots: `theme=light|dark|system`,
`list=ready|loading|error|empty`, `composer=new|edit|invalid|busy|failed`,
`status=active|archived`, `q=<search>`. The reference uses fictional in-memory data only and
makes no network requests; all interactions (create, edit, archive/undo, restore, search,
filter, theme) work locally.

## Scope note

This document approves the visual foundation only. Final visual acceptance of the integrated
application is a separate inspection of the running app at its own revision.
