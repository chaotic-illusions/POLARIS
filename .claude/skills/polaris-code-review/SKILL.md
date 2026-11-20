---
name: polaris-code-review
description: Full-codebase audit of POLARIS (the LCARS page/site builder, its published-page runtime scripts, the <trek-padd> and <lcars-waveform> components, and the Tauri desktop app) covering bugs, security, data integrity, browser/app parity, performance, accessibility, this app's silent-failure classes, and docs drift. Reports findings by severity without fixing them. Use when preparing for a release, after a large feature, or for periodic quality assurance — distinct from the built-in /code-review, which reviews the current diff.
---

# POLARIS — Codebase Audit

Argument: optional focus area (`desktop only`, `security`, `export`, `flow.js`). Absent → review everything.

**Present all findings before implementing any fix.** Wait for approval; the user decides what gets touched.

Scope, narrowed if a focus argument was given:
- **Builder** — `builder/` (`builder.js`, `outline.js`, `index.html`, `builder.css`, `start-screen.lcars`), not `builder/vendor/` (third-party opentype.js).
- **Published-page runtime** — `lcars/` (`flow.js`, `pieces.js`, `waveform.js`, `motion.js`, `insignia.js`, the CSS) and `trek-padd.js`: these are copied into every site the builder publishes.
- **Shared data** — `palette-data.js` and the files generated from it.
- **Desktop app** — `desktop/src-tauri/src/main.rs`, `tauri.conf.json`, `capabilities/`, `Cargo.toml`, `desktop/stage.mjs`.
- **Tools and docs** — `tools/*.py`, the demo pages (`index.html`, `fonts.html`, `motion.html`, `palette.html`, `picks.html`, `waveform.html`, `site.css`), `README.md`.

Out of scope: `desktop/web/` (a generated copy that `stage.mjs` rebuilds), `original/` (the 2002 applet, kept for reference), `fonts/`, `mockups/`, `desktop/src-tauri/gen/`, `target/`, `node_modules/`.

Paths in this file are repo-relative — never hardcode an absolute project root; the repo lives in a different place on each machine. Run commands from the session's working directory.

---

## Categories

1. **Bugs** — logic errors, off-by-one in cell and grid math, rotated pieces (`dims()` swaps w/h at 90°/270°), stale `doc` or `selectedId` after a page switch, edits that skip `commit()` and so miss undo and dirty tracking, timers and animation frames not cancelled.
2. **Shape safety** — this is plain JavaScript with no types. Everything from a `.lcars` file, a `site.json`, localStorage, or an inspector input is untrusted in shape: check for missing fields, numbers arriving as strings, `parseInt` on ids, and arrays assumed to exist.
3. **Security** — the main window has `withGlobalTauri: true`, so HTML injection in the builder means IPC access. There are four layers, and each must hold on its own:
   - **`cleanPage`/`cleanPiece`** in `preparePage` bring every field from a file back to what the builder writes: numbers, panel options, palette names or `#RRGGBB`, `p<number>` ids, and `safeHref` links. A new piece field must be covered by them: through `TYPES`, `SECTIONS` or `COLOR_KEYS`.
   - **Escaping on output:** every `innerHTML` and template string gets `esc()`, which covers `& < > " '`, including the ids and classes in `pageHTML` and `paintSplash`. Prefer `textContent` and DOM nodes for anything built from page data.
   - **The CSP** in `tauri.conf.json` (`script-src 'self'`, no inline script). `dangerousDisableAssetCspModification: ["style-src"]` is deliberate: Tauri's style hashes would switch off `'unsafe-inline'`, which the builder's inline `style=` attributes need.
   - **Command limits** in Rust: commands are declared in `build.rs` and granted to the main window only. `open_path`/`save_site` accept only files the user chose (`grant`/`chosen`), and `show_folder` opens only the folder just published.

   Also check `outline.js`'s frame (`sandbox="allow-same-origin"`, no scripts), and path handling in `export_site`, `preview` and the `preview://` protocol (`safe_relative`).
4. **Data integrity** — Save goes through a `.tmp` file and a rename. Also check the dirty tracking (`savedSnap`, `unsaved()`, the `dirty` flag kept under `FILE_KEY`), the undo/redo stacks, images round-tripping through base64 in `projectText`/`attachImages`, publishing again into an existing folder, the localStorage quota (the site snapshot is written on every commit), and the recents list when a file has moved.
5. **Consistency** — colours by palette name (`--lcars-<name>`, `.t-<name>`, `.c-<name>`), never raw hex where a name exists. Plain IIFE scripts with `"use strict"`. Comments that explain why, in plain English. Patterns applied the same way across piece types.
6. **Dead code** — unused helpers, unreachable branches, stale comments (the long header comments in `flow.js`, `pieces.js` and `trek-padd.js` are specs and must match the code), and leftovers from the rename.
7. **Performance** — `requestAnimationFrame` and interval loops must stop when off-screen or hidden (see `waveform.js`'s IntersectionObserver), and honour reduced motion. Check whole-board re-renders on small edits, per-page `textShapes` work on publish, large base64 images sent as JSON over IPC, and listeners added on each render without removal.
8. **Accessibility** — published pages: alt text on pictures and the insignia (blank only when decorative), the hidden screen-reader copy kept when text becomes shapes, `<trek-padd>` keyboard controls, and `prefers-reduced-motion` honoured by every animation. Builder: keyboard reach, focus after dialogs and the start screen, and labels on inspector fields.
9. **Runtime script and component practices** — `lcars/*.js` and `trek-padd.js` run in published pages with no builder present. They must:
   - stay plain scripts, not modules (pages must work from `file://`);
   - read nothing from builder globals;
   - resolve their own assets from `document.currentScript` (as `flow.js` does for `sounds/`);
   - guard `customElements.define` against a second definition;
   - clean up in `disconnectedCallback`.
10. **Concurrency** — on the Rust side, the `Preview` mutex must not be held across file I/O or window calls, and commands that open a blocking dialog must stay `async`. On the JS side, check async races: switching page or project while `textShapes`/`siteFiles` is awaiting, a double click on Publish or Save, the `start-screen.lcars` fetch landing after a project opened, and `launch_file` racing the restored session.
11. **Browser/app parity** — every file feature has up to four paths. Each must behave sensibly, or fail with a clear toast:
    - the Tauri app (`APP`);
    - Chrome/Edge (`showDirectoryPicker`, File System Access);
    - Firefox (`.zip` download, blob previews);
    - a builder opened from `file://` (fetches fail, so the written-in start screen stands in).
12. **Public component contract** — `<trek-padd>` and `<lcars-waveform>` are documented for hand-written pages: their attributes, `::part()` names, events, `window.TrekPadd` (`NAMED`, `TIMING`, `stardate()`, `parse()`, `toFragment()`) and `LcarsFlow.play`/`leave`. A rename or a changed default breaks pages outside the builder.

## This app's silent-failure classes

These run without errors and fail only at runtime or in front of a user. Check each explicitly:

13. **Unregistered or misnamed commands** — every `#[tauri::command]` in `main.rs` must appear in all three places:
    - `generate_handler![…]`;
    - `COMMANDS` in `desktop/src-tauri/build.rs`;
    - an `allow-<command-with-dashes>` permission in `capabilities/default.json`.

    Every `appCall("name", …)` in `builder.js` must name one of them. Diff all five lists. A command missing from the ACL is refused with "not allowed by ACL", and many calls end in `.catch(() => {})`, so it fails silently.
14. **IPC arg casing** — Tauri 2 expects multi-word Rust parameters as **camelCase** keys from JS unless the command sets `rename_all`. Return structs (`Opened`, `Saved`, `Exported`) serialize their field names as written. Diff each `appCall` payload and each use of a result field against the Rust signature and struct.
15. **Capability gaps** — every `APP.window.*` / `APP.dialog.*` / plugin call from JS needs a permission in `desktop/src-tauri/capabilities/default.json`; a missing one is a rejected promise, usually swallowed. The preview window deliberately gets no capabilities; flag anything that widens that.
16. **Publish file list** — `LIB_FILES` in `builder.js` must list every file a published page loads: each `<script>`/`<link>` in `pageHTML`, plus everything the runtime fetches (`flow.js`'s `sounds/`). A new file works in the builder and 404s in published sites. `siteFiles` reads files as text unless the extension matches its binary regex, so a new binary type gets corrupted. The preview protocol's `content_type()` in `main.rs` must know any new extension.
17. **App staging list** — `PARTS` in `desktop/stage.mjs` must include every top-level file `builder/index.html` loads (`../site.css`, `../palette-data.js`, …). A new one works in the browser builder but is missing in the app.
18. **Every renderer, every piece field** — a new piece type or field must be handled everywhere a piece is drawn or edited:
    - the defaults in `TYPES`;
    - the inspector;
    - `pieceInner`/`pieceClasses`/`pieceVars`, which the board, preview and export share;
    - `pageHTML` and `paintSplash`, which each build the board's markup (`pieceAttrs`, `flowAttrs` and the splash's own `LcarsFlow.play` options);
    - `cleanPiece`/`cleanPage`, so a file can't bring it in malformed;
    - `outline.js` text shapes;
    - `flow.js`: `BOARD` (frame or content, and how it comes up), stepped pieces (`data-step`, `revealStep`), and groups (`data-group`, `data-opens`, `openGroup`/`closeGroup`; `surveyBoard` must skip grouped pieces);
    - `pieces.js`, for anything animated through `data-*` attributes or classes.
19. **Document upgrades** — `preparePage` brings old pages forward against `DOC_VERSION` (`SITE_VERSION` for sites). A new field whose *absence* must mean the old behaviour has to be set explicitly there, the way `flow = "none"` and `sound = false` are; otherwise old pages pick up the new default. A change in a field's meaning needs a version bump and an upgrade step (version 4 moved the Opening step to `openStep`, because a gauge's counted numbers already used `step`; version 5 turned a button's `beep` tick into a sound choice). Check new piece keys against every type's `TYPES` defaults for a clash. Check that `nextId`/`nextPage` stay ahead of every existing id.
20. **Identifiers kept on purpose** — these were kept so saved work isn't orphaned:
    - the `trektext-builder:*` localStorage keys, including the `:v1` fallback read;
    - `PROJECT_FORMAT = "lcars-builder-project"`;
    - the Tauri `identifier` `org.crymson.lcars-builder`, which names the app data and font folders;
    - the colour-set id `trektext`;
    - `window.lcarsBuilder`, `<trek-padd>` and the `.lcars` extension.

    Flag any change to these that lacks a migration as HIGH. Flag any *new* key that doesn't follow the same prefix.

    Per-window keys: in the app, `slotKey()` adds `@<window label>` to the site and file keys for every window but `main`, which keeps the original keys. Shared preferences (colours, sections, recents) stay unsuffixed. A new per-project key needs `slotKey`; a window that closes (not the last) clears its own.
21. **Generated files** — `lcars/palette.css` and the `NAMED` table in `trek-padd.js` (between `/* palette:start */` and `/* palette:end */`) come from `palette-data.js` via `tools/build_palette.py`. `lcars/insignia.svg` and `lcars/insignia.js` come from `tools/trace_badge.py`. Hand edits to generated files are lost on the next run. `builder/start-screen.lcars` is a project file, edited through the builder.
22. **Licensed content stays out** — the font (`Helvetica Ultra Compressed`) must never be staged, bundled, exported, base64-embedded or committed. Only glyph outlines for the letters used may leave the machine. `stage.mjs`'s `fonts` guard and `.gitignore`'s `/fonts/`, `/mockups/` and `/original/` must stay. Check that every export path (`siteFiles`, `projectText`, `encodeFiles`) carries no font bytes.
23. **All-caps UI** — every visible string in the builder is uppercase. `builder.css` sets `text-transform: uppercase` on the body and on form controls, so flag any `text-transform: none`. CSS can't reach native dialogs (`APP.dialog.ask`), the window title or `title=` tooltips. Mixed-case strings there are LOW findings for the user to decide on.
23a. **Dialogs in the app** — `tauri-plugin-dialog` replaces `window.confirm` with an async function, so in the app a bare `confirm()` returns a promise (truthy) and the action goes ahead whatever the user clicks; in a browser it blocks as usual, so this only shows in the app. Every confirmation must be `await ask(...)` (the helper in `builder.js`) inside an async function. Flag any bare `confirm(` or `alert(` as HIGH when it guards a destructive action. `prompt()` is not replaced.
24. **Docs drift** — check that the documentation describes what the code does today:
    - `README.md`: *The builder* (piece descriptions, the start-screen link table, the recents count, the desktop build steps), the `<trek-padd>` and `<lcars-waveform>` attribute tables, *Behavior* timings, *JavaScript API*;
    - the spec comments at the top of `flow.js`, `pieces.js`, `outline.js`, `trek-padd.js` and `main.rs`.

24a. **Windows** — every builder window (`main`, `builder-N`) is made from the `main` window config (`"create": false`) by `open_builder`; the capability's `windows` list must match the labels. Each preview is `preview-<builder label>`, served from `Preview` by `ctx.webview_label()`. Windows are made off the main thread outside `setup` (`second_start` spawns a thread). Check that `window_file` is told whenever the project's file changes (`setFile`), or "already open in another window" breaks.

## Legacy-data edge cases

Verify handling wherever relevant:
- a single-page `.json` from before sites (no `pages` array);
- pages with no `version`, or below 3, and pages with no `flow`/`sound`;
- only the old `trektext-builder:v1` storage present;
- a `.lcars` with no `images`, and an image referenced by a piece but not in `attached`;
- a published folder's `site.json` opened (it has no pictures);
- duplicate or empty page file names, and no page named `index`;
- a recent project whose file has moved or been deleted;
- no font file (text shapes fall back to live text, and Antonio stands in);
- an empty site;
- gauges with typed `labels` from before counting;
- `start-screen.lcars` unreachable (`file://`).

## Output format

Numbered findings grouped by severity:

### HIGH — bugs, security issues, data-loss risks
### MEDIUM — correctness, parity, performance, data quality
### LOW — style, consistency, polish

Each finding:
- **File and line** — as a clickable relative link, e.g. `[builder.js:1957](builder/builder.js#L1957)`
- **What's wrong** — one sentence
- **How it manifests** — one sentence; observable user-facing or runtime symptom, naming which path (app / Chrome / Firefox / published page / `file://`), or "latent" if it cannot currently trigger
- **Suggested fix** — one sentence

End with: `| Severity | Count | Key items |`

## Rules

- Do **not** implement fixes. Report only. Don't run builds (`npm run build` or `stage.mjs` rewrite `desktop/web/`) or `tools/build_palette.py` (it rewrites tracked files in place).
- Filter false positives:
  - paths that come back from Tauri dialogs are user-chosen, not attacker-controlled;
  - `catch { /* storage unavailable */ }` around localStorage is the intended idiom;
  - the `trektext*` / `lcars-builder` identifiers in class 20 are deliberate;
  - the font being absent from the repo is deliberate;
  - findings in `desktop/web/` are a stale copy: report the source file instead;
  - "Blocked script execution in 'about:srcdoc'" in the console is `outline.js`'s sandboxed frame working as intended;
  - `open_path` showing an Open dialog for a recent project is the one-time confirmation for files chosen before the chosen-files list existed.
- Separate architecture suggestions from actionable defects, and say which is which.
- Read the surrounding code before reporting anything you can't verify from the snippet. `builder.js` is over 3,000 lines; find the definition rather than guessing.
- Run these from the repo root and report the results:
  ```powershell
  Get-ChildItem builder/*.js, lcars/*.js, trek-padd.js, palette-data.js, desktop/stage.mjs | ForEach-Object { node --check $_.FullName }
  python -B .claude/skills/polaris-code-review/check_palette.py
  cargo clippy --manifest-path desktop/src-tauri/Cargo.toml
  ```
  There is no test framework, linter config or type checker. These three, plus reading, are the whole net.
- To exercise the builder in a headless browser, serve it with `python tools/serve.py <port>` on a port **other than 8765**, which is the user's own server. Check that the port is free first, and stop only the process you started.
- To test the built app itself (CSP, ACL, single instance), make sure POLARIS isn't running: it's single-instance, so a test launch would hand over to the user's window. Then start `polaris.exe` with `WEBVIEW2_USER_DATA_FOLDER` set to a scratch folder, so the user's kept work isn't touched, and `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`, and attach Playwright with `connectOverCDP`. The Rust `settings.json` is still the user's: don't grant paths in tests.
- There is no separate conventions document. For category 5, the standard is the existing code and `README.md`, plus the project's `CLAUDE.md`.
