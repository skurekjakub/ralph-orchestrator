# UI surface rules

Read this before landing any feature that introduces UI surface — a new
component, a new stylesheet, a new chrome element, a new content renderer,
anything that lands a colour, background or border in styles or markup.

- **Theme tokens, never literals.** Colours, spacing and typography come from
  the design tokens the project defines; never hard-code a hex value. Tokens
  are what make every theme (including dark mode, if the product has one)
  follow for free.
- **Every theme, every surface.** If the product supports more than one theme,
  a new surface must render correctly in each before it ships — check it in
  the Phase 5 smoke test.
- **One styling approach for new code.** New components follow the project's
  current styling convention; legacy styles that predate it are not rewritten
  wholesale — touch them only when the feature requires it.
- **Reference component:**
  `dashboard-local/src/components/log-browser/ContextWindowChart.tsx` — the
  component whose shape new UI copies (styling, state handling,
  accessibility): an orchestrator parent with local `useState` / `useMemo`,
  `<button type="button">` ▾/▸ toggles, shared constants in
  `context-window-chart-shared.ts`, a colocated `ContextWindowChart.test.tsx`.
  Don't copy its tooltip's inline hex colours or `bg-surface-raised` (not
  declared in `dashboard-local/src/styles.css`, so it renders transparent).
  For token-only class styling, copy `dashboard-local/src/components/Button.tsx`.
  dashboard-local has one dark theme; its tokens are the `@theme` block in
  `src/styles.css`, and SVG colours are named constants in a `*-shared.ts`
  file (see `docs/conventions/stack-profile.md` § Frontend).
