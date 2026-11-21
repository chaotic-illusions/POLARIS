# POLARIS

*Programmable Operations Layout Author Rendering Interface System*

POLARIS lays out LCARS-style pages and whole sites, inspired by the computer displays in *Star Trek: The Next Generation*, and publishes them as plain web pages. It runs in the browser or as a Windows app; see [The builder](#the-builder).

It grew out of *TrekText*, a Java applet from 2002: an LCARS-style PADD text display, where text types onto a black screen one line at a time, with a computer beep and color codes for each word or letter. That display is rebuilt here as `<trek-padd>`, a single, dependency-free [web component](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) that runs in any modern browser. It needs no plugins or build step. The timing, colors and beep were recovered from the original compiled applet.

**[Demo](index.html)** · **[Font specimens](fonts.html)** · **[Motion review](motion.html)** · **[Waveform](waveform.html)**

## Quick start

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Antonio&display=swap">
<script src="trek-padd.js"></script>

<trek-padd src="trek.txt" style="height: 400px"></trek-padd>
```

You can also put the text inline, which works even when a page is opened straight from disk:

```html
<trek-padd>
  <script type="text/plain">
    ##{lilac}SUBSPACE COMMUNICATIONS OPEN - ##{tanoi}DOWNLOADING FILE
    ##{melrose}WELCOME ABOARD.
  </script>
</trek-padd>
```

Browsers won't let a page opened from disk (`file://`) fetch other files, so `src="..."` needs the folder to be served over HTTP. For example:

```sh
python -m http.server
# then open http://localhost:8000
```

## Color codes

`##{name}` switches the color until the next code. For example, `##{chestnut-rose}RED ALERT ##{melrose}ALL HANDS` shows "RED ALERT" in chestnut rose and the rest in melrose.

- `##{}` goes back to the default color, melrose (`#9999FF`).
- `##{#RRGGBB}` uses any hex color.
- An unknown name is ignored.

Any of the 130 LCARS color names in [`palette-data.js`](palette-data.js) can be used by name. **[picks.html](picks.html)** shows them all grouped by color family, with the 26 colors picked for POLARIS highlighted:

| Family | Picks |
|---|---|
| Reds | `red-alert-2`, `cardinal`, `chestnut-rose`, `red-damask` |
| Oranges | `tangerine`, `atomic-tangerine`, `yellow-alert-2`, `sandy-brown` |
| Browns and tans | `bourbon`, `flat-dark-earth`, `tanoi`, `golden-tanoi` |
| Green | `green-apple` |
| Blues | `frozen-pond`, `ghost`, `andorian-blue`, `nemesis-blue`, `melrose`, `blue-bell`, `indigo` |
| Purples | `lilac`, `lavender-purple`, `hopbush`, `cosmic` |
| Greys | `silver`, `pewter` |

A page can restyle any color with its CSS variable, `--lcars-<name>`.

### Converting old text files

The original applet used one-letter codes (`##r`, `##b`, …). To convert old files to color names:

```sh
python tools/convert_codes.py --dry-run path/to/folder   # list what would change
python tools/convert_codes.py path/to/folder             # convert every .txt, keeping .bak copies
```

| Old | New | Old | New |
|---|---|---|---|
| `##r` | `##{chestnut-rose}` | `##b` | `##{melrose}` |
| `##o` | `##{sandy-brown}` | `##B` | `##{blue-bell}` |
| `##O` | `##{atomic-tangerine}` | `##p` | `##{lilac}` |
| `##y` | `##{tanoi}` | `##P` | `##{hopbush}` |

`##o` was orange peel (`#FF9966`), which isn't a pick, so it becomes sandy brown, the closest picked color.

### Changing the palette

Colors are defined once, in `palette-data.js`. After editing it, run `python tools/build_palette.py` to regenerate `lcars/palette.css` and the color list inside `trek-padd.js`.

## Behavior

- Lines appear every 65 ms. The beep is limited to one every 96 ms, so it plays on about every other line.
- When a page is full, **Next** (or a click or tap on the screen) moves on. If nothing is clicked, the page advances on its own after 16 seconds. The countdown pauses while the pointer is over the display. On the last page, **Restart** goes back to the beginning.
- Clicking **Next** while a page is still typing finishes the page right away.
- Keyboard: <kbd>→</kbd>, <kbd>Space</kbd>, <kbd>Enter</kbd> or <kbd>PgDn</kbd> go to the next page. <kbd>←</kbd> or <kbd>PgUp</kbd> go back, and <kbd>Home</kbd> restarts.
- Browsers block sound until the visitor interacts with the page, so the beep starts after the first click or key press.
- With *reduced motion* turned on in the operating system, each page appears all at once.

### Stardates

A stardate header is shown at the top of the text. TNG's convention is that 2364 began at stardate 41000.0 and each year adds 1000. Extending that backwards and letting the five-digit counter roll over (99999.9 → 00000.0) means the counter last reset on **January 1, 2023**. Partway through 2026 the stardate is in the 03xxx range.

Each whole stardate unit is 1/1000 of a year (about 8.76 hours), and each tenth is about 52.6 minutes. The header updates on screen whenever the last digit changes.

```js
TrekPadd.stardate(new Date(2364, 0, 1)); // "41000.0"
TrekPadd.stardate();                     // today, e.g. "03847.8"
```

## Attributes

| Attribute | Default | Description |
|---|---|---|
| `src` | | URL of a text file. If it's missing, the element's inline text is used. |
| `hold` | `16` | Seconds before a finished page advances by itself. `0` means it only advances when clicked. |
| `line-delay` | `65` | Milliseconds between lines. |
| `muted` | | Starts with sound off. The **Audio** button toggles it. |
| `volume` | `0.5` | Beep volume, from 0 to 1. |
| `beep` | built-in | URL of a different sound file. |
| `no-stardate` | | Leaves out the stardate header. |
| `color` | `melrose` | Text color before any code, as a color name or `#RRGGBB`. `##{}` returns to it. |
| `glyphs` | | The `id` of a `<script type="application/json">` holding letter shapes, written by POLARIS when it publishes. The text is then drawn with those shapes, so it shows in the LCARS font without the font installed. |

## Styling

Size the element like any block element (`width`, `height`). Its appearance is controlled by CSS custom properties:

```css
trek-padd {
  height: 420px;
  --padd-font: "Helvetica Ultra Compressed", "Antonio", sans-serif;
  --padd-font-size: 26px;
  --padd-font-weight: 400;
  --padd-line-height: 1.1;
  --padd-bg: #000;
  --padd-padding: 12px 16px 10px;
  --lcars-atomic-tangerine: #FF9900;  /* restyle any color by name */
}
```

### Fonts

`<trek-padd>` uses **Helvetica Ultra Compressed**, the face Michael Okuda used for TNG's LCARS displays, when it's available. That font is commercial, so it isn't included here. To use it, install your own licensed copy, or place it in `fonts/` (which git ignores). The demo pages' `site.css` shows the `@font-face` rule to use. Without it, the display falls back to [Antonio](https://fonts.google.com/specimen/Antonio), a free Google font. [fonts.html](fonts.html) compares several free alternatives. Pages exported from the [POLARIS builder](#the-builder) can draw their text as shapes instead, so they show the real font without shipping it.

You can also style the internals with `::part()`, using `frame`, `screen`, `text`, `controls`, `page` and `button` (plus `prev`, `sound` and `next`).

## JavaScript API

```js
const padd = document.querySelector("trek-padd");
padd.text = "##{red-alert-2}PRIORITY ONE MESSAGE"; // replace the text and restart
padd.next(); padd.prev(); padd.restart();
padd.page; padd.pageCount;
padd.addEventListener("pagecomplete", (e) => console.log(e.detail));
```

`window.TrekPadd` also exposes `NAMED` (every color name and its hex value), `TIMING`, `stardate()`, `parse()` and `toFragment()` (renders marked-up text without animation).

## The builder

[builder/](builder/index.html) lays out whole LCARS pages: elbows, bars, buttons, frames, gauges, PADDs and more, on a snapping grid. Serve the folder over HTTP with `python tools/serve.py` and open http://127.0.0.1:8765/builder/. (`python -m http.server` also works, but browsers may keep running old copies of the scripts after an update.) **Publish** writes the whole site as web pages, ready to put online: each page as `name.html` with its own `name.css`, the shared `lcars/` files, any pictures you chose from disk in `images/`, and `site.json` (the site itself, which **Open** can read to keep working on it). It goes into a new folder named after the project, made inside the folder you pick; pick a folder you published to before and it's updated in place. Chrome and Edge ask for the folder. Firefox, which can't write a folder, downloads one `.zip` holding the site's folder.

**Save or Publish?** **Save** keeps the project, its `.lcars` file, to come back to and keep editing. **Publish** makes the web pages from it. A published folder's `site.json` can also be opened, but it doesn't hold pictures chosen from disk; the `.lcars` file does.

**Desktop app.** [desktop/](desktop/) builds the builder as a Windows program, *POLARIS*, with [Tauri](https://tauri.app). It shows the builder in Windows' built-in Edge engine (WebView2) and does the file work natively: **Open**, **Save** (to the same file each time, <kbd>Ctrl+S</kbd>), **Save As** (<kbd>Ctrl+Shift+S</kbd>) and **Publish** use Windows dialogs, the window title shows the file and a `*` while changes aren't saved to it, and closing with unsaved changes asks first. If the project's file has moved, **Save** asks where to save it instead. Publishing into a folder that already has files asks first: the site's files are overwritten there, and old ones (pages since deleted or renamed) stay. Like VS Code, POLARIS has a window per project: **New Window** (<kbd>Ctrl+Shift+N</kbd>) opens another, each window keeps its own work, double-clicking a `.lcars` file opens it in a new window (or brings its window forward if it's open already), and the windows open when you quit come back next time. Closing a window that isn't the last lets its unsaved work go, after asking. The app reads and writes only project files you've chosen in it, in an Open or Save dialog or by double-clicking one; a recent project from before that was in place asks you to confirm it once, in the Open dialog. **Preview** opens its own window showing exactly what Publish writes, with links between your pages working and PADD sound without a click. Under the page are playback controls for dialling in the opening: *Restart*, *Play*/*Pause* (<kbd>Space</kbd>), *Stop* (back to the start, paused), *Frame* back and on (<kbd>←</kbd> <kbd>→</kbd>, 1/30 second; with <kbd>Shift</kbd>, 250 ms), a scrubber in milliseconds from the opening's start, speeds of ¼×, ½× (both silent) and 1×, *Loop*, and *Shuffle* for another take of the random parts (the power-up's key presses, gauges and the like: within one take, every run is the same). Moving through it is smooth both ways, at any speed: the opening, its sounds and the effects (blinks, gauges, number cascades, waveforms) all show exactly as they are at that moment. Under the controls are the opening's **tracks**, on one time scale with a playhead: *Video* (the frame, the content and each step, with how long each takes) and *Audio* (the power-up or the page's own opening sound, each layered sound and each step's sound, drawn as its waveform); show *Video*, *Audio* or *Both*, or hide them (*Tracks*, or <kbd>T</kbd>). Click or drag on them to move through the opening. This runs on `builder/preview.html` and `builder/preview-clock.js`, which only Preview uses; they're never published. The font is never packaged: *Choose font file* (under *Page*, *Publish*) copies your own copy into the app's data folder (`%APPDATA%\org.crymson.lcars-builder\fonts`; the folder keeps the app's name from before POLARIS, so nothing saved there was lost), and the app also looks in a `fonts` folder beside the program.

To build it you need Node.js and Rust (with the MSVC build tools); then, in `desktop/`:

```sh
npm install
npm run build        # release: src-tauri/target/release/polaris.exe, and an installer in src-tauri/target/release/bundle/nsis/
npm run build:debug  # the designer's build: src-tauri/target/debug/polaris.exe (no installer)
npm run dev          # run it while working on the builder (a debug build)
```

The release build is the one to hand out. Only a debug build (or the builder run from the source in a browser) can use the start screen's own features, such as the power-up; a release build treats every project as an ordinary one. Close POLARIS before building: a running copy stops the build replacing the program.

`stage.mjs` copies `builder/`, `lcars/` and the scripts they use into `desktop/web/`, which is built into the program; it never copies `fonts/`.

**Projects.** The builder works on one project at a time: a site, named for its domain (`crymson.org`, say), with all its pages, layouts and pictures, saved together as one `.lcars` file. It opens on a start screen: **New Project** asks for the site's name and a starting layout, **Open Project** opens a `.lcars` file (or a `.json` site saved before projects), **Resume** returns to the project you were last working on, and in the app, your recent projects are listed too. **Close** returns to the start screen. In the app, a new project is saved as soon as it's made, so it always has a file, and the installer sets `.lcars` files to open in the app.

**Pages.** A site is a set of pages. **Pages**, in the menu bar, lists them under the project's name (each as its file, name.html), switches between them and adds new ones; the top bar shows the project's name and the page on the board. Click an empty part of the board for the page's settings: its title, its file name (`index` is the home page; links use `name.html`), and *New page*, *Duplicate page* and *Delete page*. A button's *Link* offers your other pages to pick from, or takes any URL. Renaming a page's file updates the buttons that link to it. In a preview, links between your pages open the other page's preview. Opening a single page saved before sites adds it to the open project as a new page.

**Selecting, copying and the menu.** Click a piece to select it; <kbd>Shift</kbd>-click adds pieces to the selection or takes them out, and dragging across empty board selects every piece the box touches. Drag any selected piece to move them all; the arrows nudge (<kbd>Shift</kbd> for 4 cells). <kbd>Ctrl+C</kbd>, <kbd>Ctrl+X</kbd> and <kbd>Ctrl+V</kbd> copy, cut and paste every selected piece with all its settings (pictures included), on any page or into another project; each paste lands 2 cells down and right of the last, and the first paste after a cut goes back where the pieces were. <kbd>Ctrl+D</kbd> duplicates, <kbd>Del</kbd> deletes, <kbd>Ctrl+A</kbd> selects everything and <kbd>Esc</kbd> nothing; <kbd>Ctrl+]</kbd> and <kbd>Ctrl+[</kbd> bring a piece forward or send it back; <kbd>Ctrl+G</kbd> and <kbd>Ctrl+Shift+G</kbd> group and ungroup. The menu bar, top left, has *File*, *Edit*, *Arrange*, *Group* and *Pages*, every command with its shortcut; with one menu open, pointing at another opens it. The page's *Help* lists them too.

**The panel.** A piece's panel runs the same way for every kind of piece: its colors first, then its shape, then what it shows (picture, text), then its motion and what it does (any piece can open a group), its *Opening* step and group, and last its exact *Position and size* (closed until you open it).

**Blinking.** Bars, buttons, elbows, text, quotes, lists, title bars and insignia can *Blink* (slow, normal or fast) in their *Motion* section. A blink dims the piece; choose a color under *Blink to* and it flashes to that color instead (text, quotes and lists change their words' color too).

**Pictures.** An *Image* or *Image Frame* piece's *Shape* section can **Turn the picture** (upright, 90° clockwise, upside down, or 90° counter-clockwise) inside the piece, so a tall picture can fill a wide frame without the frame turning. *Keep image shape* follows the turned picture, and dragging a cropped picture moves it in its own directions. (Rotating the piece itself turns the frame too.)

**Templates.** The bottom of the *Pages* menu offers three starting pages, each fitted to the current Screen shape:

- *Classic frame*: two elbow frames with an image and a PADD.
- *LCARS Access*: a TNG data screen with a field of numbers and two gauges, with the middle left open for your own content.
- *Holodeck panel*: a holodeck program menu, built only from blocks, elbows, buttons and text.

**Button sounds.** POLARIS brings no sounds of its own to your pages: you supply them. Add sound effects and voice clips in **Preferences**, *Sounds* (MP3, WAV, OGG, M4A or FLAC, up to 30 MB each): *Add sound* for a few files, *Add folder* for every sound in a folder and its subfolders. They're kept in POLARIS for every project and show as tiles: click one to hear it (*Find* narrows them by name), and *Remove* takes it away. The designer's own builds (a debug build of the app, or the builder run from the source) also offer the four sounds POLARIS used to include (Keypress, Panel tap, Chirp, PADD beep) for the start screen; a release build ships with none. A button's *Sound when clicked* (under *Action*) lists them by name, with the sound files already in the project (*None* for silence, which new buttons start with); choosing one plays it, so you can pick by ear. A button using one of yours carries a copy of the file in its project (like a page's sounds), so the project and its published site keep it even if you remove it from your sounds.

**Colors in the pickers.** **Preferences** (under *Edit*: tabs for the *Board*, *Colors* and *Sounds*) chooses which colors the builder's color pickers offer. Start from a *Color set*: your picks, sets you've saved, the POLARIS picks, one of the *Show themes* (from [thelcars.com](https://www.thelcars.com/colors.php): Classic, Nemesis Blue, Lower Decks, Lower Decks PADD, Picard, Voyager), or a film or series palette. Then tick colors on or off. **Save as my picks** makes the current colors yours, so **Reset to my picks** brings them back. **Save as a new set** keeps them under a name. Sets are kept in your browser. *Preferences* (in *File*) also turns the board's editing grid on or off.

**Gauges.** A Gauge is a bracket with a numbered scale and an oval pointer that swings up and down. Every swing goes a random distance, so two gauges never move in step. The pointer moves like a needle with weight: it speeds up and slows down gently, up to a top speed that crosses the scale in about 5 seconds, so short hops stay calm. It pauses for a quarter second each time it changes direction. Untick *Show pointer* for a gauge with no pointer. Each gauge's *Pattern* number varies where its scale breaks and its accent blocks. The swings come from `lcars/pieces.js`, which exported pages load. *Turn* (in *Shape*) lays a gauge on its side or upside down; its numbers stay upright, along the scale. *Turn* with *Side* puts the numbers above, below, left or right, and a negative step reverses them. Turn clockwise is in the *Arrange* menu too.

The scale's numbers are *Counted* by default: set where they start, the step between them (a negative step counts down, a step like 0.5 gives decimals), how many there are, and how many digits to pad them to with zeros (3 gives 010, 020, ...). Or switch to *Typed in* to write each one yourself, any text, one per line, with color codes like any label; the typed numbers start as a copy of the counted ones. *Tick marks between numbers* sets how finely the ruler is divided: 0 puts a tick by each number only. Gauges made before counting existed keep their typed numbers.

**Number Cascades.** Columns of numbers. *Motion* sets how they move: *Scroll* (the columns drift up, each at its own pace), *Fill* (the rows type in from the top, hold, one row flares white, then they clear and refill with some numbers new), *Sweep* (the rows type in and hold, then a band two rows deep in the highlight colour moves down a row at a time, waits on the bottom rows, and they clear and refill, as on the Master Systems Status screens), *Shift* (now and then one column slides a few rows up or down, wrapping round), *Update* (single numbers change in place, a few a second) or *Still*. *Highlighted numbers* sets which numbers show in the highlight colour: *Fixed* (the *Pattern* number picks them), *Come and go at random* (random single numbers light up for a few seconds each) or *None*. The motion comes from `lcars/pieces.js`, which published pages load.

**Openings.** Each page's *Opening* (in the Page panel, with nothing selected) sets how it appears when it loads. *Console* builds it like the old LCARS Flash intros: the header and footer rails draw together in the middle of the screen and slide apart (when the top and bottom are elbows, as on the start screen, they start as two bars in the middle, draw out to the right, then open like a sheet, their sidebars growing out of the seam and the blocks between them coming into view), the elbows bloom from their corners one after another, everything else grows out of them (bars telescope along the arms, sidebars and button columns stack away from the joints), and then the content comes up: words key on, pictures scan in, text types, number columns fill, PADDs start. *Spread* floods colour out from the top left instead; *None* just shows the page.

**Opening steps.** To bring pieces in later, give them an *Opening step* in their panel (1, 2, 3 ...; select several to set them together). A piece with a step leaves the build: after the frame and the rest of the content, each step comes in, in order. Bars, buttons and gauges grow along their long side and then their words key on; text types, pictures scan in, and so on. The board marks each piece with its step. In the page's *Opening* section, each step can have its own start time (milliseconds from the beginning; blank shares the time out) and a sound that plays as it comes in.

**Button sounds.** A button's *Sound when clicked* is a TNG console *Keypress* (new buttons), a *Panel tap*, a *Chirp* (TrekCore's, from `lcars/sounds/`, as the opening's presses are), the *PADD beep*, or *None*. Buttons from before the choice that beeped now use the keypress.

**Groups.** Select pieces and press <kbd>Ctrl+G</kbd> (or *Group* in the menu) to name them as a group. On the published page a group stays hidden until a piece that opens it is clicked: set that piece's *Action* to *Clicking it opens a group* (any piece can, a picture or a button; a button that opens a group doesn't follow its link). The group then grows in, its pieces' Opening steps in order, and clicking again closes it, so a *Close* button inside the group works too. A group that overlaps the one opening closes first, so panels in the same place take turns, and opened from a picture, the group's pictures grow out of it (a thumbnail growing to full size). Openers work from the keyboard and tell screen readers whether their group is open. In the builder groups always show, marked with their name; the page's *Groups* section renames, selects or ungroups them, and hides one while you edit what's under it.

New pages start with Console; pages made before openings existed keep *None*. On a page with an opening, following a link to another page of the site plays the opening backwards, quickly, before going, and coming back with the Back button plays it again. It's `lcars/flow.js`; with reduced motion turned on in the operating system, pages just show. The builder's start screen uses its own Opening too; press **R** on the start screen to play it again.

**Power-up sound.** The builder's start screen opens with a power-up, the one sound that isn't a file of yours. Only the start screen project (`start-screen.lcars`), opened in a debug build of the app or the builder run from the source, can use it (a release build never offers it); on other pages every sound is a file, and older pages that had it open without it. With the *Power-up* first in the start screen's *Sounds*, the opening plays a power-up from `lcars/sounds/`: the power rising (TrekCore's Power Up 1 and 2 clean, joined into one rise), console key presses at random moments through it (Keypress 2, a panel tap and a chirp; sometimes two systems at once, and now and then a quick run of ticks like the computer beep sequences), and the computer starting to process as the power peaks, at full volume right to the end. Every opening mixes a new one, about 4.5 seconds, and the opening is timed to it: the frame draws through the power-up's rise and stands as the power peaks, the content comes up while the computer processes, finishing with the sound, and each key press you hear lights up a piece on screen, like a system coming online. Browsers only allow sound once a visitor has clicked something on the site, so a site's first page may open silently and the pages they go on to will sound; the POLARIS app always plays it. The sounds come from TrekCore's audio library, for a fan site. *Remove* takes it away, and *Add power-up* brings it back. Pages made with an opening sound file of their own keep it first in the list instead: the opening takes as long as it does (the frame stands about two thirds of the way in, at most 3 seconds, and the steps share the rest). Sound files are kept in the project, like pictures, and published in `sounds/`.

**Sounds.** The Page panel's *Sounds* section lists the opening's sounds, one line each (on the start screen, the power-up first, at 0), such as a computer voice. *Add sound* adds one; each starts at its own time, in milliseconds from the beginning (250 is a quarter of a second), and *Remove* takes it away. They don't change how long the opening takes.

**Waveforms.** A Waveform is a comm-channel waveform: a row of thin lines in a diamond, an oval or an even band, moving like a voice. Pick its *Main color* and *Second color* and how they *Blend*: along each line (the main color in the middle, the second at the tips), by height (short lines stay the main color), left to right, or the main color only. *Fade the tips out* lets the lines fade into the black. *Motion* is *Voice* (bursts and pauses, like speech), *Pulse* (a slow breath), *Ripple* (waves travelling across) or *Still*, at any *Speed*. *Show brackets* puts LCARS brackets either side, each with accent blocks down its side. *Accent blocks* sets how they're laid out: *Even* (three the same size), *Patterned* (2 to 4 blocks of varied sizes, reaching varied distances along the side, from the *Pattern* number: change the number for another layout) or *Random* (a new layout each time the page opens). Each side gets its own blocks unless *Same blocks on both sides* is ticked. The piece is the `<lcars-waveform>` element (see [Waveform](#waveform)), which published pages load from `lcars/waveform.js`. *Turn* (in *Shape*) stands a waveform on end or turns it over, brackets and all.

**Insignia.** The Starfleet insignia, in any one color, keeping its proportions in whatever box you give it. The backing is cut away around the delta, so the two still read apart in a single color. Add a description for screen readers if it means something on the page; leave it blank if it's decoration. The same drawing is in [`lcars/insignia.svg`](lcars/insignia.svg) for use anywhere else (it takes its color from `color`, as `fill="currentColor"`). It was traced from a picture of the badge by `tools/trace_badge.py`, which writes both `lcars/insignia.svg` and the `lcars/insignia.js` the builder uses: `python tools/trace_badge.py badge.png` (add `--gap 14` for a wider gap between the delta and backing, or `--preview out.png` to draw the result).

The UFP emblem is traced the same way, into [`lcars/ufp.svg`](lcars/ufp.svg) (grey leaves and ring, a blue disc with white stars) and [`lcars/ufp-mono.svg`](lcars/ufp-mono.svg) (one color, from `color`, with the stars and ring cut through): `python tools/trace_emblem.py lcars/UFP.png --color "#0055AA" --outer "#ACACAC"`. That tool takes any one-color emblem on a light background; `--outer` gives the parts outside a ring their own color.

**The builder's start screen** is itself a builder project, `builder/start-screen.lcars` (kept out of the repository for now; without it the builder shows a written-in start screen). To change it, open that file in the builder (*Open*), edit it like any page, and *Save* it over itself (in a debug build of the app: a release build doesn't offer the start screen's power-up); the next app build (`npm run build` or `npm run build:debug` in `desktop/`) packages it. While you work on it, there's no need to rebuild: a debug build of the app (and the builder served with `tools/serve.py`) reads `builder/start-screen.lcars` again each time the start screen shows, so after *Save*, *Close* shows the change with its opening and sounds (*Resume* goes back), and <kbd>R</kbd> on the start screen reads it again and replays it. To see it before saving, use **Preview**, as for any page. A release build shows only the copy built into it. Its buttons work through their *Link*:

| Link | What the button does |
|---|---|
| `#new` | New Project |
| `#open` | Open Project |
| `#resume` | Back to the project the builder kept; its text becomes "Resume" and the project's name |
| `#recent` | Opens a recent project; the app fills these in order down the page, with each project's name (it remembers 8). The project Resume returns to isn't listed again |
| `#remove-recent` | Takes the recent project beside it off the list (its file stays): the first goes with the first `#recent` button, and so on down the page |

Resume is always drawn: when there's no project for it, it keeps its own text (blank in the design) and does nothing. Recent and remove buttons without a project to go with are hidden. Other links do nothing on the start screen. If the file can't be loaded (a builder opened straight from disk), a built-in start screen stands in.

**Screen shape.** A page is a grid of cells that scales to fit any window, keeping its proportions. Where the window's shape differs, black fills the edges. Pick a **Screen** preset under *Page* so the page fills the window it's meant for. Each preset is the page area of a maximized browser window (tabs, toolbar and bookmarks bar shown) on Windows 11. **This window** measures the window the builder is open in.

**Text as shapes.** With *Publish text as shapes* on (the default), the builder draws each piece's text with the font's outlines, so published pages look identical on every computer, with or without the font. The font file is never copied into what you publish. It needs your copy of the font in `fonts/Helvetica Ultra Compressed.otf`, or chosen with **Choose font file**. Text in a shape can't be selected or copied, but a hidden copy is kept for screen readers. A PADD types and pages its text as it goes, so instead the page carries the shapes of just the letters its PADDs use, and the PADD draws each line with them. Characters the font doesn't have stay live text. The builder uses [opentype.js](https://github.com/opentypejs/opentype.js) (MIT, in `builder/vendor/`) to read the font.

## Waveform

[`lcars/waveform.js`](lcars/waveform.js) defines `<lcars-waveform>`, an animated LCARS waveform that works in any page, with or without the builder. [waveform.html](waveform.html) shows several.

```html
<link rel="stylesheet" href="lcars/palette.css">  <!-- optional: lets pages restyle colors by name -->
<script src="lcars/waveform.js"></script>

<lcars-waveform bracket fade style="width: 420px; height: 240px"></lcars-waveform>
<lcars-waveform gradient="across" color="nemesis-blue" color2="cardinal" shape="flat"></lcars-waveform>
```

| Attribute | Default | Description |
|---|---|---|
| `color` | `chestnut-rose` | Main color: an LCARS color name or any CSS color. |
| `color2` | `tamarillo` | Second color. |
| `gradient` | `lines` | How the colors blend: `lines` (along each line, `color` in the middle, `color2` at the tips), `height` (`color` across the middle, `color2` toward top and bottom), `across` (left to right) or `solid`. |
| `fade` | | The tips of the lines fade out. |
| `lines` | `48` | How many lines. |
| `thickness` | `50` | Line width, as a percentage of the space for each line. |
| `shape` | `diamond` | `diamond`, `oval` or `flat`. |
| `motion` | `voice` | `voice`, `pulse`, `ripple` or `still`. |
| `speed` | `1` | Animation speed. |
| `bracket` | | Draws LCARS brackets either side. |
| `bracket-color` | `andorian-blue` | The brackets' color. |
| `accent`, `accent2`, `accent3` | `flat-dark-earth`, `husk`, `blue-bell` | The blocks down each bracket's side. |
| `pattern` | | How the blocks are laid out. Left out: three blocks the same size. A number: 2 to 4 blocks of varied sizes, reaching varied distances along the side, starting from a varied accent color (the same number always gives the same layout). `random`: a new layout each time the page loads. |
| `mirror` | | With a `pattern`, both brackets get the same blocks; otherwise each side has its own. |

It's 160 px tall unless sized otherwise. It pauses while scrolled out of view, and holds still when the operating system's *reduced motion* setting is on.

## History

The original *TrekText* applet (v1.44, 2002–2003) ran on the author's site *Crymson's Illusion*. It was built on a small Java game toolkit from a Northern Arizona University course, which isn't included here. Its source code was lost, so the behavior was recovered by decompiling the surviving `.jar`. [`trek.txt`](trek.txt) is the applet's original text file.

---

*Star Trek* and related marks are trademarks of CBS Studios Inc. This is an unofficial fan project and is not affiliated with or endorsed by CBS or Paramount.
