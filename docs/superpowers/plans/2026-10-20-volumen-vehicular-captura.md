# Volumen Vehicular — Captura (fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second study type ("Volumen vehicular en glorieta") to the existing Velocidad PWA, letting a user capture tally counts per movement/category/15-min interval, correct them, and sync them between teammates' phones — without touching the existing Velocidad flow's behavior.

**Architecture:** A new top-level study-type chooser gates two independent app shells that already coexist in one `index.html`/one deployed page: the untouched Velocidad shell (`js/app.js`, unchanged except its auto-init is now gated) and a new Volumen shell (`js/volumen.js`), each with its own localStorage key, view-toggling, and JSON export/import. Shared code (category constants, stats helpers, the Excel/Chart.js vendor libs) stays in `js/common.js`/`js/export.js`.

**Tech Stack:** Vanilla JS (no framework, no build step), same as the rest of the project. Verification via real headless Chrome through Playwright, run ad hoc from the scratchpad directory during each task (this project has no committed test suite or `package.json` — every prior feature was verified this way; this plan continues that pattern rather than introducing new project infrastructure unprompted).

**Spec:** `docs/superpowers/specs/2026-10-20-volumen-vehicular-captura-design.md`

## Global Constraints

- No new npm/CDN runtime dependencies; the app must keep working fully offline (established project-wide rule).
- `velpunto_volumen_session_v1` is a new, separate localStorage key. No Volumen code reads or writes `velpunto_session_v1` (Velocidad's key), and vice versa.
- Movement keys are exactly `"X1".."X4"` (entrada), `"Y1".."Y4"` (interno), `"Z1".."Z4"` (salida).
- Interval length is exactly 15 minutes (`15 * 60 * 1000` ms).
- Every tap on a movimiento button creates a new, independent aforo — never resumes or merges into a prior aforo for the same movimiento (spec, confirmed decision).
- Tally counts never go below 0.
- Any time a cached file (JS/CSS/HTML) is added or changed, `sw.js`'s `CACHE_NAME` must be bumped in the same deploy. This project shipped a real production bug earlier from forgetting this — visitors kept the stale cached version indefinitely.

## Review Focus

- Reloading the page mid-aforo (phone screen locks, browser closes) must restore the correct current interval computed from elapsed wall-clock time, not reset to interval 0 or lose the in-progress aforo. (Task 2)
- Switching between Velocidad and Volumen via "cambiar estudio" must never read, write, or corrupt the other study type's localStorage data. (Task 1)
- The existing Velocidad flow (cronómetro, registros, dashboard, Excel, JSON sync, install banner) must work identically after `app.js`/`index.html` are restructured to host two app shells — this is a refactor of code that already ships in production. (Task 1 smoke test, Task 5 full regression)
- Manually editing a count cell in "Ver conteos" to an invalid value (empty, negative, non-numeric) must clamp to a safe value, never corrupt the stored data or crash the screen. (Task 3)
- Importing a JSON file that isn't a Volumen export (a Velocidad export, or unrelated/garbage JSON) into the Volumen importer must fail with a clear message, never crash or silently corrupt `aforos`. (Task 4)

---

## Task 1: Navigation skeleton — study-type chooser, Volumen session setup, movimiento picker

**Files:**
- Modify: `index.html:13-178` (wrap the existing Velocidad markup in a new `#velocidad-app` container; add `#studytype-screen`; add `#volumen-app` shell with its own topbar, a session-setup view, and a movimiento-picker view; add a 4th "cambiar estudio" icon to the existing Velocidad topbar; add `<script>` tags for the two new files)
- Modify: `js/app.js:640-650` (replace the auto-running `buildCategoryGrid(); initSessionView();` with an exposed `VP.app.init()`; add a "cambiar estudio" button handler)
- Modify: `js/common.js` (add `VP.MOVIMIENTOS`, near `VP.CATEGORY_LABELS`)
- Create: `js/volumen.js` (Volumen module: state, persistence, session-setup view, movimiento picker, a stub conteo view)
- Create: `js/main.js` (study-type chooser wiring, `VP.goToStudyTypeChooser`)
- Modify: `css/style.css` (chooser screen, `.vol-view` show/hide rules reusing the existing `fade-in` keyframes, movimiento-picker grid grouped by access point)
- Modify: `sw.js` (add `./js/volumen.js` and `./js/main.js` to `ASSETS`; this task does NOT bump `CACHE_NAME` yet — that happens once in Task 5 after all files are final, to avoid repeated bumps per task)

**Interfaces:**
- Produces (for Task 2+):
  - `VP.MOVIMIENTOS`: `Array<{key: string, label: string}>`, 12 entries, ordered by access 1-4, each access's Entrada/Interno/Salida grouped together. Keys exactly `"X1","Y1","Z1","X2","Y2","Z2","X3","Y3","Z3","X4","Y4","Z4"`.
  - `js/volumen.js` module-scoped `session` (the current `volumenSession` object or `null`) and `VOL_STORAGE_KEY = "velpunto_volumen_session_v1"`.
  - `saveVolumenSession()` — persists `session` to `VOL_STORAGE_KEY`.
  - `loadVolumenSession()` — reads+parses from `VOL_STORAGE_KEY`, returns `null` on missing/invalid.
  - `showVolumenView(id)` — toggles `.active` among `#volumen-app .vol-view` elements by id (parallel to `app.js`'s `showView`, but scoped only to Volumen's own markup).
  - `movimientoLabel(key)` — looks up the display label for a movement key from `VP.MOVIMIENTOS`.
  - `goToMovimientoPicker()` — renders the 12 buttons (if not already built) and shows `view-volumen-movimiento`.
  - `selectMovimiento(key)` — creates a new aforo: `{id, movimiento: key, inicioMs: Date.now(), horaInicio: <HH:MM:SS>, horaFin: null, intervalos: [{inicio, fin, counts: {all 6 categories at 0}}]}`, pushes it into `session.aforos`, saves, calls `goToConteo()`.
  - `goToConteo()` — **stub in this task**: shows `view-volumen-conteo` with `#conteoMovimientoLabel` set to the active aforo's movement label. Task 2 replaces this with real tally rendering.
  - `VP.volumen.init()` — if a session exists, pre-fills the form and shows it (mirrors `initSessionView`'s "always show session screen first" pattern — it does NOT auto-skip to the picker); else shows a blank form.
  - DOM ids now in the page: `studytype-screen`, `btnChooseVelocidad`, `btnChooseVolumen`, `velocidad-app`, `volumen-app`, `btnChangeStudyVelocidad` (new 4th icon in the existing topbar), `btnChangeStudyVolumen`, `view-volumen-session`, `formVolumenSession`, `v-fecha`, `v-equipo`, `v-ubicacion`, `btnStartVolumenSession`, `btnNewVolumenSession`, `view-volumen-movimiento`, `movimientoGrid`, `view-volumen-conteo`, `conteoMovimientoLabel`.
  - `VP.goToStudyTypeChooser()` (in `js/main.js`) — hides both app shells, shows `#studytype-screen`.

- [ ] **Step 1: Write the verification script (ad-hoc Playwright, scratchpad)**

```js
// scratchpad/pw/vol-task1.js — asserts, per the project's established pattern:
// 1. Fresh load (localStorage cleared) shows #studytype-screen, both app shells hidden.
// 2. Click #btnChooseVolumen -> chooser hidden, #volumen-app visible, #view-volumen-session
//    active, #v-fecha pre-filled with today's date (YYYY-MM-DD).
// 3. Fill #v-ubicacion="Glorieta Av 80 CL 50", #v-equipo="Grupo 3", submit #formVolumenSession
//    -> #view-volumen-movimiento active, exactly 12 buttons inside #movimientoGrid, button
//    text includes "Entrada 1" and "Salida 4" (spot-check the two ends of the ordering).
// 4. Click the button whose text contains "Interno 2" -> #view-volumen-conteo active,
//    #conteoMovimientoLabel text contains "Interno 2"; localStorage velpunto_volumen_session_v1
//    has exactly 1 aforo, movimiento "Y2", intervalos.length === 1, all 6 counts at 0.
// 5. Via page.evaluate, seed localStorage velpunto_session_v1 with a minimal known Velocidad
//    session (one lectura, distinctive localizacion string) BEFORE this point, so the
//    cross-contamination check below has something to protect.
// 6. Click #btnChangeStudyVolumen -> #studytype-screen visible again.
// 7. Click #btnChooseVelocidad -> existing Velocidad flow loads with the seeded session
//    (session form pre-filled with the distinctive localizacion -- regression smoke test
//    for the app.js refactor, and proof Volumen's init never touched this key).
// 8. Click the existing #btnMenuNav flow's "cambiar estudio" equivalent back to the chooser,
//    then #btnChooseVolumen again -> assert velpunto_volumen_session_v1 in localStorage is
//    byte-for-byte the same as it was after step 4 (the aforo created earlier is still
//    there, untouched by the round trip through Velocidad).
// 9. Assert zero console errors / zero pageerror events across the whole script.
```

- [ ] **Step 2: Run it against the current code to confirm it fails**

Serve `speed-app/` on localhost (same one-liner Node static server used throughout this project), run the script, confirm it fails at step 2 (no `#studytype-screen` exists yet).

- [ ] **Step 3: Implement `VP.MOVIMIENTOS` in `js/common.js`**

12-entry array as specified above. One line comment is fine; no body ambiguity — the table is in the spec verbatim.

- [ ] **Step 4: Restructure `index.html`**

Wrap the current `<header class="topbar">...</header>` through `<div id="printArea">...</div>` (today's entire visible app) in `<div id="velocidad-app" hidden>...</div>` — do not change any id or content inside it. Add `<div id="studytype-screen">` before it with a heading and two buttons (`btnChooseVelocidad`, `btnChooseVolumen`). Add `<div id="volumen-app" hidden>` after it containing: a topbar (title + `btnChangeStudyVolumen` icon button), `<main id="volumen-content">` with `view-volumen-session` (form: `v-fecha` date input, `v-equipo` text input, `v-ubicacion` text input required, `btnStartVolumenSession` submit, `btnNewVolumenSession` ghost button hidden-by-default — mirror the existing Velocidad session form's markup and classes), `view-volumen-movimiento` (`<div id="movimientoGrid" class="category-grid">`, JS-populated), `view-volumen-conteo` (just `<p>Movimiento: <strong id="conteoMovimientoLabel"></strong></p>` for this task). Add a 4th icon button `btnChangeStudyVelocidad` next to the existing 3 in the Velocidad topbar's `.topbar-right`. Add `<script src="js/volumen.js"></script>` and `<script src="js/main.js"></script>` after the existing `app.js` script tag.

- [ ] **Step 5: Add the "cambiar estudio" handler and expose `VP.app.init()` in `js/app.js`**

Replace lines 640-650's auto-running `buildCategoryGrid(); initSessionView();` with:
```js
VP.app = {
  init: function () {
    buildCategoryGrid();
    initSessionView();
  }
};
```
keep the service-worker-registration block below it exactly as-is (still runs unconditionally). Add, near the other topbar nav listeners: `document.getElementById("btnChangeStudyVelocidad").addEventListener("click", VP.goToStudyTypeChooser);`

- [ ] **Step 6: Implement `js/volumen.js`**

Mirror `js/app.js`'s structure (IIFE, module-scoped `session`, `loadVolumenSession`/`saveVolumenSession` matching `loadSession`/`saveSession`'s try/catch pattern). Implement every function listed in this task's Interfaces block. `selectMovimiento` and `goToConteo` only need to satisfy this task's stub behavior (full tally rendering is Task 2). Expose `VP.volumen = { init: function () { ... } };` — do not auto-run it.

- [ ] **Step 7: Implement `js/main.js`**

Wires `btnChooseVelocidad`/`btnChooseVolumen` clicks to hide `#studytype-screen`, show the matching app shell, and call that shell's `init()`. Defines `VP.goToStudyTypeChooser` as specified. This file's own IIFE runs immediately (it's the true entry point) and shows `#studytype-screen` on load — neither `VP.app.init()` nor `VP.volumen.init()` run until a chooser button is clicked.

- [ ] **Step 8: Add CSS for the new screens**

`.vol-view { display: none; } .vol-view.active { display: block; animation: fade-in 0.2s ease; }` (reuses the existing `@keyframes fade-in`). Style `#studytype-screen` and the Volumen topbar consistently with the existing `.card`/`.topbar`/`.btn` classes already in the file — no new visual language, same palette.

- [ ] **Step 9: Add the two new files to `sw.js`'s `ASSETS` array** (do not bump `CACHE_NAME` yet, per this task's Files note)

- [ ] **Step 10: Run the verification script again, confirm every assertion passes, confirm zero console errors**

- [ ] **Step 11: Commit**

```bash
git add index.html js/app.js js/common.js js/volumen.js js/main.js css/style.css sw.js
git commit -m "feat: add study-type chooser and Volumen session/movimiento-picker skeleton"
```

---

## Task 2: Counting screen — tally mechanics and automatic interval advance

**Files:**
- Modify: `index.html` (flesh out `view-volumen-conteo`: add `#conteoIntervaloLabel`, `#tallyGrid` container, `btnFinalizarAforo`)
- Modify: `js/volumen.js` (replace the Task 1 stub `goToConteo`; add `findActiveAforo`, `currentIntervalIndex`, `ensureIntervalsUpTo`, `renderConteo`, `buildTallyGridOnce`, `changeCount`, `finalizarAforo`, `fmtHora`; modify `VP.volumen.init` to resume directly into the conteo screen if an unfinished aforo exists)
- Modify: `css/style.css` (`.tally-grid`, `.tally-card` — a 2-column grid of cards, each with a label, a large count, and +1/-1 buttons; reuse `.btn`/`.btn-primary`/`.btn-ghost`)

**Interfaces:**
- Consumes: `VP.CATEGORIES` (`common.js`), `VP.MOVIMIENTOS`/`movimientoLabel` (Task 1), `session`/`saveVolumenSession`/`showVolumenView` (Task 1).
- Produces (for Task 3+):
  - `findActiveAforo()`: `() => aforo | null` — the most recent aforo in `session.aforos` with `horaFin === null`. Canonical way to find "the aforo being counted right now"; used by Task 3's delete logic too (must not delete an active aforo without finalizing it first — see Task 3).
  - `currentIntervalIndex(aforo)`: `(aforo) => number` — `Math.floor((Date.now() - aforo.inicioMs) / (15*60*1000))`.
  - DOM ids: `conteoIntervaloLabel`, `tallyGrid`, `btnFinalizarAforo`, and per-category elements inside `#tallyGrid` addressable via `[data-tally-count="<categoria>"]`.

- [ ] **Step 1: Write the verification script**

```js
// scratchpad/pw/vol-task2.js
// 1. Fresh session -> pick movimiento "Entrada 1" -> on #view-volumen-conteo, tap the Moto
//    card's +1 button 3 times and the Bus card's +1 once. Assert displayed counts: Moto=3,
//    Bus=1, all others 0. Assert localStorage's aforo.intervalos[0].counts matches.
// 2. Tap Bus's -1 twice (second tap would go negative) -> displayed count stays 0, storage
//    matches (never negative).
// 3. Interval auto-advance: via page.evaluate, rewrite the active aforo's inicioMs in
//    localStorage to Date.now() - 16*60*1000 (16 min ago). Reload the page. Assert
//    VP.volumen.init() lands directly on #view-volumen-conteo (not the session form) because
//    an unfinished aforo exists. Assert #conteoIntervaloLabel reflects interval index 1
//    (computed from the rewritten inicioMs), and aforo.intervalos.length === 2, with
//    intervalos[0]'s counts still holding the values tapped in step 1 untouched.
// 4. Tap Moto's +1 once more (now inside interval 1) -> intervalos[1].counts.Moto === 1,
//    intervalos[0].counts.Moto still === 3 (writes go to the current interval only).
// 5. Click #btnFinalizarAforo -> #view-volumen-movimiento shown, aforo.horaFin is now set
//    (non-null) in storage.
// 6. Zero console errors across the whole script.
```

- [ ] **Step 2: Run it, confirm it fails** (tally buttons don't exist yet)

- [ ] **Step 3: Implement the functions listed in this task's Interfaces/Produces, plus `ensureIntervalsUpTo`, `renderConteo`, `buildTallyGridOnce`, `changeCount`, `finalizarAforo`, `fmtHora`, in `js/volumen.js`**

`ensureIntervalsUpTo(aforo, index)` pushes zero-initialized interval objects (computing each one's `inicio`/`fin` display strings from `aforo.inicioMs + n*15min`) until `aforo.intervalos.length > index`. `renderConteo` calls `findActiveAforo()`, returns to the movimiento picker if none (defensive — shouldn't happen via normal navigation), else calls `ensureIntervalsUpTo`, updates the interval label and all 6 tally counts. `goToConteo` now: calls `buildTallyGridOnce()`, `renderConteo()`, starts a `setInterval(renderConteo, 1000)` (store the id in a module var, clearing any prior one first), shows the view. `changeCount(categoria, delta)` writes to the current interval's `counts[categoria]`, clamped with `Math.max(0, ...)`, saves, re-renders. `finalizarAforo` sets `horaFin`, clears the ticking interval, saves, navigates to the picker.

- [ ] **Step 4: Modify `VP.volumen.init()`** to call `goToConteo()` directly when `findActiveAforo()` is non-null, bypassing the session-setup form (Review Focus item: reload mid-aforo must resume correctly).

- [ ] **Step 5: Add the tally grid HTML/CSS**

- [ ] **Step 6: Run the verification script again, confirm every assertion passes, zero console errors**

- [ ] **Step 7: Commit**

```bash
git add index.html js/volumen.js css/style.css
git commit -m "feat: implement Volumen tally counting with automatic 15-min interval advance"
```

---

## Task 3: Ver conteos — correction screen and multi-aforo

**Files:**
- Modify: `index.html` (add `view-volumen-registros`: aforo `<select>`, editable table, `btnEliminarAforo`, `btnVolumenRecordsBack`; add a "Ver conteos" nav icon to the Volumen topbar)
- Modify: `js/volumen.js` (`goToRegistros`, `renderAforoSelector`, `renderRegistrosTable`, cell-edit handler, `eliminarAforoActual`)
- Modify: `css/style.css` (editable cell style; reuse existing `.table-wrap`/table rules)

**Interfaces:**
- Consumes: `findActiveAforo` (Task 2, to prevent deleting the in-progress aforo without warning).
- Produces (for Task 4): a visible "Ver conteos" screen is where Task 4's export/import buttons live (same placement pattern as Velocidad's `.sync-section` inside its records view).

- [ ] **Step 1: Write the verification script**

```js
// scratchpad/pw/vol-task3.js
// 1. Create two aforos in one session: "Entrada 1" with Moto=3 tapped, "Salida 3" with
//    Taxi=2 tapped (finalize each via btnFinalizarAforo so both are closed).
// 2. Navigate to "Ver conteos". Assert the aforo selector has 2 options, both movement
//    labels present. Assert the table for the selected aforo shows the right counts.
// 3. Switch the selector to the other aforo -> table updates to show its own counts.
// 4. Edit a count cell: set it to "7" -> assert localStorage reflects 7 for that
//    category/interval after the change event fires.
// 5. Edit a cell to "-3" -> assert it clamps to 0 (Review Focus: invalid input never
//    corrupts data). Edit a cell to "abc" -> assert it resolves to 0, no crash, no
//    console error.
// 6. Click "Eliminar aforo" on the currently-selected one, confirm the dialog -> assert
//    it's gone from the selector and from localStorage; the other aforo is untouched.
// 7. Zero console errors across the whole script.
```

- [ ] **Step 2: Run it, confirm it fails**

- [ ] **Step 3: Implement `goToRegistros`, `renderAforoSelector`, `renderRegistrosTable` in `js/volumen.js`**

Table cells are `<input type="number" min="0">`, one per category per interval row, with a `change` listener that reads `parseInt(input.value, 10) || 0`, clamps with `Math.max(0, ...)`, writes back into the selected aforo's matching interval/category, calls `saveVolumenSession()`.

- [ ] **Step 4: Implement `eliminarAforoActual`**

`confirm()` dialog (mirror the existing `deleteRecord` pattern in `app.js`), splices the selected aforo out of `session.aforos`, saves, re-renders the selector (select another aforo if any remain, else return to the movimiento picker).

- [ ] **Step 5: Add the HTML/CSS for the registros view and its nav icon**

- [ ] **Step 6: Run the verification script again, confirm every assertion passes, zero console errors**

- [ ] **Step 7: Commit**

```bash
git add index.html js/volumen.js css/style.css
git commit -m "feat: add Volumen correction screen with editable counts and multi-aforo support"
```

---

## Task 4: Export / Import JSON for Volumen (team sync)

**Files:**
- Modify: `js/common.js` (add `VP.mergeAforos(existing, incoming)`)
- Modify: `js/export.js` (add `VP.downloadVolumenSessionJson(session)`)
- Modify: `index.html` (add export/import buttons + hidden file input to `view-volumen-registros`, mirroring Velocidad's `.sync-section`)
- Modify: `js/volumen.js` (wire the new buttons; import handler)

**Interfaces:**
- Consumes: `VP.MOVIMIENTOS` (Task 1, to validate incoming `movimiento` values), the existing `VP.mergeLecturas` in `js/common.js` as the pattern to mirror (same file, read for reference, not modified).
- Produces: nothing further tasks depend on — this is the last Volumen-specific feature task.

`VP.mergeAforos(existing, incoming)` mirrors `VP.mergeLecturas`'s shape exactly: dedupe by `id` into a map, validate each incoming record (`typeof id === "string"`, `movimiento` is one of the 12 `VP.MOVIMIENTOS` keys, `Array.isArray(intervalos)`), return `{merged, added, skipped, total}`, sort merged by the numeric prefix of `id`.

`VP.downloadVolumenSessionJson(session)` mirrors `VP.downloadSessionJson` exactly, except the envelope's `formato` field is `"estudio-volumen-vehicular"` (not `"estudio-velocidad-punto"`) — this is what lets the importer reject a Velocidad export instead of silently misreading it.

- [ ] **Step 1: Write the verification script**

```js
// scratchpad/pw/vol-task4.js
// 1. "Device A" (browser context 1): create a session, aforo for "Entrada 2" with Moto=5,
//    export JSON, save to disk.
// 2. "Device B" (browser context 2, separate storage): create its own session, aforo for
//    "Salida 4" with Bus=2, go to Ver conteos, import device A's file.
// 3. Assert device B's aforo selector now has 2 entries (its own + the imported one), and
//    both show correct counts.
// 4. Re-import the SAME file into device B -> assert the dialog reports 0 new aforos added
//    (idempotent), and the selector still has exactly 2 entries (no duplicate).
// 5. Try importing a Velocidad JSON export (use VP.downloadSessionJson's format from the
//    existing Velocidad flow) into device B's Volumen importer -> assert a clear error
//    message, zero aforos added, existing data untouched.
// 6. Try importing garbage (invalid JSON text) -> same: clear error, no crash, data intact.
// 7. Zero console errors across the whole script.
```

- [ ] **Step 2: Run it, confirm it fails**

- [ ] **Step 3: Implement `VP.mergeAforos` in `js/common.js`**

- [ ] **Step 4: Implement `VP.downloadVolumenSessionJson` in `js/export.js`**

- [ ] **Step 5: Wire export/import buttons in `js/volumen.js`**

Import handler mirrors `app.js`'s existing `importFileInput` change handler: read file(s) as text, `JSON.parse`, accept either `data.session` or a bare session object, reject (with the file name in the error) if `formato !== "estudio-volumen-vehicular"` or `!Array.isArray(incoming.aforos)`, else call `VP.mergeAforos(session.aforos, incoming.aforos)`, assign the merged result back, save, re-render, show a summary `alert` (added/skipped counts), same UX as the existing Velocidad import.

- [ ] **Step 6: Add the HTML for the buttons/file input**

- [ ] **Step 7: Run the verification script again, confirm every assertion passes, zero console errors**

- [ ] **Step 8: Commit**

```bash
git add js/common.js js/export.js index.html js/volumen.js
git commit -m "feat: add JSON export/import for Volumen team data sync"
```

---

## Task 5: Cache bump, full regression, deploy

**Files:**
- Modify: `sw.js` (bump `CACHE_NAME` — this is the only remaining file change; all Volumen files were already added to `ASSETS` in Task 1)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: the deployed app at https://idkronald.github.io/estudio-velocidad-punto/.

- [ ] **Step 1: Bump `CACHE_NAME` in `sw.js`** to the next version string (check the current value first; increment it).

- [ ] **Step 2: Run the full Velocidad regression**

Reuse the project's existing ad-hoc Playwright scripts (session → categories → stopwatch → save → records → edit/delete → print → Excel export → dashboard → JSON export/import → install banner). Confirm every assertion still passes exactly as before this feature existed, zero console errors.

- [ ] **Step 3: Run the complete Volumen suite**

All four verification scripts from Tasks 1-4, in one fresh run, confirm all pass together (not just individually) — catches any cross-task interference.

- [ ] **Step 4: Commit the cache bump**

```bash
git add sw.js
git commit -m "chore: bump service worker cache version for the Volumen vehicular release"
```

- [ ] **Step 5: Push to `origin main`**

```bash
git push origin main
```

- [ ] **Step 6: Poll GitHub Pages until the new version is live**

`curl` the deployed `index.html` in a loop until it contains `studytype-screen` (same polling pattern used for every prior deploy in this project).

- [ ] **Step 7: Run one live-site smoke test**

Playwright against the real `https://idkronald.github.io/estudio-velocidad-punto/` URL: chooser renders, a basic Volumen capture (pick movimiento, tap a few counts, finalize) works end to end, service worker's active cache name matches the new `CACHE_NAME`, zero console errors, zero failed network requests. Mirrors the live-verification pattern already used for every prior deploy in this project.

- [ ] **Step 8: Report the live URL and a one-line summary of what shipped to the user**
