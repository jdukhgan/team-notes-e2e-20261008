# Notes-first mobile verification — 2026-10-08

Scope: existing editor becomes an inline disclosure at <=56rem; desktop keeps its two-column composition. No new dependencies or server changes. Baseline02e35b2749957ee180a5e661af915226389feb11 remains recoverable.

Observed on a fresh local fictional SQLite preview through the Codex browser:

- Before change: no New note button; narrow editor always occupied the first screen.
- After: phone/tablet show New note, search and notes first. Opening focuses Title.
- Create draft survives Close editor and New note; all three values retained, focus returns to New note.
- Edit draft survives Close editor and reopening its card; focus returns to that card's Edit button.
- Create and edit persist through HTTP; successful save closes narrow editor. Search, archive and restore passed.
- Required-field validation exposes aria-invalid and focuses Title; Tab reaches Author.
- Theme change and focused desktop→phone resize retain the draft and keep editor visible.
- Six native viewport screenshots inspected:390×844,768×1024,1440×1000, light/dark. No clipping/overflow. Open phone create/error states in both themes and edit badge/Close layout in dark also inspected. Existing components/tokens retained.
- Five backend HTTP/persistence tests passed; JavaScript syntax and git diff checks passed. Independent source/six-layout review found no concrete defects; executor checked remaining narrow open-editor states.

Evidence is retained locally in the task's teamnotes-mobile screenshot directory; not embedded into the public application. Physical-device virtual keyboard and assistive-technology execution were not tested. This patch is excluded from the fresh workflow efficiency comparison.
