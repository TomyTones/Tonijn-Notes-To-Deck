# Notes → Deck Generator — Project Context

_Last reviewed: 2026-09-01_

## What this project is

A tool that extracts **PowerPoint speaker notes** and re-issues them as a
separate, properly typeset **notes deck** for a second monitor — while keeping
the original deck click-synchronised with it.

Two delivery modes wrap the same PPTX processor:

1. **`notes-to-deck.html`** — pure browser tool, no server, no build step. Open
   directly in Safari or Chrome. **This file is the reference implementation:**
   its format options are the approved, settled set (see *Format options* below).
2. **`watch.js`** — Node.js Watch-Folder daemon + settings web UI at
   http://localhost:4040. Drop a `.pptx` into `Watch-Folder/` and outputs appear
   in `Output-Folder/`. Runs as a launchd service (auto-start at login).

Both produce the same two outputs from each `.pptx`:

- **Notes deck** (`teleprompter-deck.pptx` / `<name>-teleprompter.pptx`) —
  speaker notes, one block per slide, typeset for reading at a distance.
- **Patched source** (`<name>-patched.pptx`) — the original deck with duplicate
  slides inserted where notes overflow, so one clicker press advances both
  screens together.

---

## Settled decisions

These are confirmed and should not be re-litigated without an explicit request.

### No page numbers on the notes deck

The generated notes slides carry **no slide number and no continuation label**.
Neither generator renders one, and none should be added.

- The only text besides the notes themselves is the **original slide title**,
  set small and muted, top-right (13pt, `#888888`; `#555555` on empty slides).
- `watch-settings.json` previously carried an unused `showNum` key. It has been
  removed. Do not reintroduce a slide-number setting.
- Earlier documentation described `5 (1/3)` continuation labels. That feature was
  never implemented and is now explicitly out of scope.

### Format options are final

The option set exposed by `notes-to-deck.html` is approved as-is:

| Option | Values | New default |
|---|---|---|
| Background colour | colour picker | `#FFFFFF` |
| Text colour | colour picker | `#000000` |
| Font size | 18–60pt, step 2 | **18pt** |
| Slide layout | 16:9 / 16:10 / 4:3 | 16:9 |
| Empty slides | Include as empty / Skip | Include |

The original premise was a dark stage-autocue deck (`#111111` / `#F0F0F0` /
32pt). **That is superseded.** The deck is now a light, typeset notes document;
white background, black text, 18pt are the standard defaults in
`notes-to-deck.html`, `watch.js` `DEFAULTS`, and `watch-settings.json`.

### Source formatting is ignored — Arial only, by design

The notes deck imposes its own typography. **All character and paragraph
formatting in the source notes is deliberately discarded.** Authors write notes
in whatever font, size, weight or colour PowerPoint gave them; none of it reaches
the output.

Discarded on purpose:

- Typeface — `<a:rPr typeface="...">` is never read. Output is **always Arial**.
- Size, weight, italic, underline, colour, highlight — all `<a:rPr>` attributes.
- Line spacing, space-before/after, alignment — all `<a:pPr>` children.
- Any bullet character or glyph the author typed or PowerPoint applied.

Kept, because it is structure rather than formatting:

- Paragraph breaks (`<a:p>`).
- Bullet indent level (`lvl="N"`), which drives our own `•` / `◦` / `–` scheme.
- Inline line breaks (`<a:br/>`, i.e. Shift+Enter).

**Consequence for the capacity model:** `ARIAL_CW = 0.52` is not an approximation
of an unknown font — it is the *correct* constant, because the output font is
fixed. Do not add typeface detection, per-font width tables, or an
`<a:rPr typeface>` reader. If output typography ever needs to change, change it
in one place — the generator — not by inheriting it from the source deck.

### Slide geometry is approved — reviewed 1 September 2026

The corrected geometry was tested on a real deck and signed off. Treat these
numbers as settled:

| | 16:9 | 16:10 | 4:3 |
|---|---|---|---|
| Slide height | 5.625" | 6.25" | 7.5" |
| Text box top | 0.825" | 0.825" | 0.825" |
| Text box height | **4.250"** | 4.875" | 6.125" |
| Bottom margin | **0.550"** | 0.550" | 0.550" |

`PAD = 0.55` is the single number that governs the left, right and bottom margins.
The box is deliberately generous: at 16:9 it uses 4.25" of a 5.625" slide, so
slides read emptier than a dense layout would. **That is the approved look** — do
not reclaim the bottom margin for density unless asked.

Everything derives from `textBoxHeight(layout)`. Never reintroduce a literal
height, and never let the generator and the capacity model compute it separately.

### Bullet indents — PptxGenJS native, approved as-is

The generator uses PptxGenJS's native `bullet` + `indentLevel`, which emits
`marL` 342900 EMU (0.375") with a matching negative `indent`. That is a true
hanging indent: wrapped lines align under the text, not under the bullet. The
result was reviewed and accepted on 1 September 2026.

**There is no external specification to match.** The InDesign files in
`../Assets/InDesign/` were an earlier reference and are **no longer relevant** —
ignore them. Do not chase their centimetre values, and do not replace the native
bullets with explicit paragraph indents to hit a target that no longer exists.

The 0.375"-per-level figure matters in one other place: the capacity model
subtracts it from the usable width. If the indent ever changes, `BULLET_INDENT`
must change with it.

---

## File structure

```
Research-PowerPoint-Notes-To-Deck/
  Watch-Folder/           ← drop .pptx here to trigger watch.js processing
  Output-Folder/          ← processed files + original moved here after run
  Assets/
    Powerpoint/           ← Test-Short.pptx, Test-Large.pptx (test inputs)
    InDesign/             ← retired reference, no longer relevant — ignore
  Data/
    watch.js              ← Node.js watcher + HTTP server (port 4040)
    notes-to-deck.html    ← standalone browser tool — reference implementation
    watch-settings.json   ← persisted settings (bgColor, textColor, fontSize…)
    package.json          ← jszip + pptxgenjs
    CLAUDE.md             ← this file
    README.md             ← user-facing instructions
    BUGS.md               ← known issues and improvement ideas
    tests/                ← capacity-model regression scripts + their README
    node_modules/         ← installed; jszip + pptxgenjs
```

**launchd service:** `~/Library/LaunchAgents/be.tonijn.teleprompter-watch.plist`
- Starts `Data/watch.js` at login; auto-restarts on crash.
- To reload after plist edits:
  `launchctl unload ~/Library/LaunchAgents/be.tonijn.teleprompter-watch.plist && launchctl load ~/Library/LaunchAgents/be.tonijn.teleprompter-watch.plist`

---

## Libraries

| Library | CDN | Purpose |
|---|---|---|
| JSZip 3.10.1 | cdnjs | Read/write `.pptx` ZIP archives |
| PptxGenJS 3.12.0 | unpkg (`pptxgen.min.js`) | Create new `.pptx` files |

**Critical:** use `pptxgen.min.js`, NOT `pptxgen.bundle.js`. The bundle variant is
an IIFE that returns the class but never assigns it to `window`, so `PptxGenJS`
would be undefined. The `.min.js` file starts with `var PptxGenJS = ...` and
creates a proper global.

---

## PPTX internal structure (hard-won knowledge)

A `.pptx` file is a ZIP archive. Relevant paths:

```
ppt/slides/slide1.xml                    ← slide content
ppt/slides/_rels/slide1.xml.rels         ← links to layout + notesSlide
ppt/notesSlides/notesSlide1.xml          ← speaker notes
ppt/notesSlides/_rels/notesSlide1.xml.rels ← back-link to slide
ppt/presentation.xml                     ← slide order (<p:sldIdLst>)
ppt/_rels/presentation.xml.rels          ← rId → slide file mapping
[Content_Types].xml                      ← declares every file in the ZIP
```

### Notes XML shape structure

Each `notesSlide.xml` has exactly **3 shapes** inside `<p:spTree>` (split on
`<p:sp>`):
- **Shape 1** — slide thumbnail placeholder (skip)
- **Shape 2** — notes text body ← **the one we want** (`parts[2]`)
- **Shape 3** — slide number placeholder (contains literal "1", "2"… — must skip
  or it leaks into output). This is the *source* deck's number placeholder; it is
  discarded, which is consistent with the no-page-numbers decision above.

### Paragraph parsing rules

Inside the notes text body (`<p:txBody>`):

| Element | Meaning | Action |
|---|---|---|
| `<a:p>` | paragraph | process |
| `<a:pPr lvl="N"/>` | bullet indent level | read `N`, then **strip entire block** |
| `<a:pPr>...</a:pPr>` | paragraph props with children | strip entire block — child text leaks |
| `<a:r><a:rPr/><a:t>text</a:t></a:r>` | text run with formatting | take `<a:t>` only, ignore `<a:rPr>` — **deliberate**, see *Source formatting is ignored* |
| `<a:br/>` | inline line break (Shift+Enter) | convert to `\n` |
| `<a:endParaRPr/>` | empty spacer paragraph | produces empty string → discard |
| `<a:fld type="slidenum">` | slide number field | skip entire paragraph |
| `\xa0` | non-breaking space (used for indent) | replace with regular space |

**Why simple regex fails:** `<a:pPr>` can contain deeply nested children
(`<a:lnSpc>`, `<a:buChar>`, `<a:defRPr>` etc.). A naive `<a:p>(.*?)</a:p>` regex
stops at the first `</a:p>` it finds, which may be inside a nested element. Use
the depth-aware `splitParagraphs()` function instead.

---

## Key functions (mirrored in `notes-to-deck.html` and `watch.js`)

Keep both implementations in step. `notes-to-deck.html` leads; port changes to
`watch.js` in the same pass.

### Parsing pipeline

```
handleFile(file)
  └─ JSZip.loadAsync(buffer)
  └─ for each slide:
       extractTitle(slideXml)           → string
       extractNotesParas(notesXml)      → { text, level }[]
         └─ splitParagraphs(body)       → string[]   (depth-aware)
         └─ stripPpr(paraXml)           → string     (removes <a:pPr> block)
         └─ token walk: <a:t>, <a:br>
       parasToString(paras)             → string     (normalised bullets)
         └─ stripLeadingBullet(text)    → { stripped, hadBullet }
```

### Bullet rendering (native PptxGenJS)

Authors type their own bullet chars in notes (`-`, `o`, `*`, etc.).
`stripLeadingBullet()` strips them and the slide generator uses PptxGenJS's
native `bullet` property for proper hanging indents:

```javascript
const BULLET_CODES = ['2022', '25E6', '2013'];  // • ◦ –

// Per text-run options:
{
  bullet: useBullet ? { characterCode: BULLET_CODES[lvl] } : false,
  indentLevel: lvl,    // PptxGenJS handles the hanging indent automatically
  paraSpaceAfter: 6
}
```

**Why native bullets:** PptxGenJS `characterCode` + `indentLevel` produces a
PowerPoint hanging indent — wrapped lines align under the first word, not under
the bullet character. The old NBSP-prefix approach wrapped back to the text-box
edge.

`stripLeadingBullet()` handles: `-`, `*`, `•`, `–`, `—`, `>`, `.` (before space),
`o` (before space only — avoids stripping `o` from words like `overview`).

### Capacity model (`paraHeight` + `splitParasIntoChunks`)

**Measured in inches, not in "lines".** The original line-counting model let text
run off the bottom of the slide. Two errors compounded, both of them the model
disagreeing with what the generator actually wrote:

| | Model assumed | Generator wrote |
|---|---|---|
| Line spacing | 1.15 × font size | `lineSpacingMultiple: 1.2`, which PowerPoint applies on top of Arial's own ≈1.15 line box → ≈**1.38 ×** |
| Paragraph spacing | nothing | `paraSpaceAfter: 6` after **every** paragraph — 0.83" on a ten-bullet slide at 18pt |
| Bullet indent | 3 characters of "prefix" | `marL` 342900 EMU = **0.375" per level** of lost width |

A real ten-bullet slide at 18pt measured **4.97"** against a 4.53" box. The old
82% margin could not absorb that, and `shrinkText: true` did not help — PptxGenJS
emits `<a:normAutofit/>` with no `fontScale`, so PowerPoint only shrinks once the
box is edited by hand.

Geometry, all in inches, all derived from one function:

```
PAD    = 0.55                        left / right / BOTTOM margin
TEXT_W = 10 - PAD*2 = 8.9"           text box width
textBoxHeight(layout) = slideH - PAD*1.5 - PAD
```

**`textBoxHeight()` is the fix for the bottom margin.** The old code set the box
top at `PAD*1.5` (0.825", clearing the title) but the height to `SH - PAD*2`,
which put the bottom edge at 5.35" on a 5.625" slide — a 0.275" margin, half of
the left and right ones, and no room to absorb any estimation error. The correct
height subtracts the actual top offset: `slideH - PAD*1.5 - PAD` = 4.25", giving a
0.55" bottom margin that matches the sides.

The generator and the capacity model **must both call `textBoxHeight(layout)`** —
never a literal. That drift is what caused the overflow, so `boxH` is now computed
once per generate and passed into `splitParasIntoChunks(paras, fontSize, boxH)`.

```
ARIAL_CW      = 0.52    Arial average char width factor (× fontSize / 72)
LINE_PITCH    = 1.38    lineSpacingMultiple 1.2 × Arial line box ≈ 1.15
PARA_SPACE_PT = 6       matches the generator's paraSpaceAfter
BULLET_INDENT = 0.375   inches per indent level (marL 342900 EMU)
FILL_SAFETY   = 0.95    5% headroom for within-Arial glyph variance
```

`paraHeight(para, fontSize)` returns the inches one paragraph occupies: it wraps
against `TEXT_W` minus the bullet indent for its level, treats each hard `<a:br/>`
break as starting a new line, and adds the 6pt space-after.

`splitParasIntoChunks(paras, fontSize, boxH)` fills `boxH × FILL_SAFETY` and is
**the single source of truth for chunk counts** — the preview, the notes deck and
the patched source all call it, so the three can never disagree. The old
string-based `splitIntoChunks` has been deleted.

### Oversized single paragraphs (`reflowOversizedPara`)

Packing whole paragraphs cannot help when *one* paragraph is taller than the box —
a long bullet at 44pt measured 9.4" against a 4.25" box, and no amount of chunking
fixes that. Such paragraphs are reflowed at **word boundaries** before packing, so
the "never split mid-word" guarantee holds. Each piece but the last ends in an
ellipsis so the reader can see the thought continues.

Two accepted consequences, both documented in `BUGS.md`:
- The author's bullet is kept on every piece, so a continued bullet reads as a new
  bullet. Cosmetic.
- Hard line breaks inside an oversized paragraph are reflowed away.

**Regression sweep:** 15 configurations (three layouts × 18/24/32/44/60pt) across
a 23-slide real deck, plus full runs of `Test-Short.pptx` (8 → 9 slides) and
`Test-Large.pptx` (52 → 71 slides). Every generated slide keeps the full 0.55"
bottom margin. Re-run these after touching the model.

### Patched source generation (`generatePatchedSource`)

For each overflow slide (notes split into N chunks), inserts N-1 duplicate slides
immediately after the original. Per duplicate:

1. Copy `slideN.xml` → `slideM.xml` (verbatim)
2. Copy `_rels/slideN.xml.rels` → `_rels/slideM.xml.rels` (update notesSlide ref)
3. Copy `notesSlideN.xml` → `notesSlideM.xml` (verbatim)
4. Copy `_rels/notesSlideN.xml.rels` → `_rels/notesSlideM.xml.rels` (update slide back-ref)
5. Add `<Override>` entries in `[Content_Types].xml`
6. Add `<Relationship>` in `ppt/_rels/presentation.xml.rels`
7. Rebuild `<p:sldIdLst>` in `ppt/presentation.xml` in the new order

**Slide ID rules (critical):**
- Scan only `<p:sldId>` elements for `maxId` — NOT all `id=` attributes. The slide
  master uses `<p:sldMasterId id="2147483648">` which exceeds the OOXML
  `ST_SlideId` max of 2147483647; picking it up as maxId makes every new slide ID
  out-of-range and triggers a repair warning on open.
- Preserve existing slide IDs for original slides; only mint new IDs for inserted
  duplicates.
- Use `highestNumber()` and `highestRid()` for slide file and rId counters.

**Both generate functions must be `await`ed sequentially** — never
fire-and-forget. They share `disableBtns()` and `setStatus()` and will race if
run concurrently.

---

## Known issues / improvement areas

See `BUGS.md` for the full list. Summary:

- Capacity model now measures inches and matches the generator's line spacing,
  paragraph spacing and bullet indent; verified across 15 configurations. The
  residual variance is within-Arial (all-caps, wide characters), covered by the 5%
  `FILL_SAFETY` headroom.
- Patched-source duplicates are visually identical to the original slide. A
  subtle continuation indicator may be wanted.
- No support yet for RTL text or non-Latin scripts in the notes.

Closed: `lineToLevel` fragility; split-function mismatch between the two outputs;
slide-ID overflow repair warning; page-number ambiguity (decided: none); font
handling (decided: Arial only, source formatting ignored); bottom-margin
overflow (fixed: inch-based model + `textBoxHeight()`); oversized single
paragraphs (fixed: word-boundary reflow); InDesign indent spec (retired — the
reference is no longer relevant, native PptxGenJS indents approved).

---

## How to run locally

```bash
# No install needed — just open the file
open notes-to-deck.html         # macOS
start notes-to-deck.html        # Windows
xdg-open notes-to-deck.html     # Linux
```

Requires an internet connection on first open to load JSZip and PptxGenJS from
CDN. After that, works offline.

**Does not work inside Claude's artifact preview panel** — the sandboxed iframe
blocks file input and download triggers. Must be opened as a local file.

---

## Picking this up in a new session

State as of 1 September 2026, end of the last working session.

**Working and signed off.** The bottom-overflow bug is fixed in both
implementations, tested, and accepted on a real deck. Nothing is half-finished; no
uncommitted train of thought to resume.

**Verify the tree is healthy before changing anything:**

```bash
cd Data
node --check watch.js                                        # syntax
node tests/sweep-test.js "$PWD" ../Output-Folder/teleprompter-deck.pptx
node tests/full-test.js  "$PWD" ../Assets/Powerpoint/Test-Large.pptx
```

Expected: 15 configurations all fit; `Test-Large.pptx` 52 → 71 slides; smallest
bottom margin 0.550". `tests/README.md` explains the harness — it slices model
functions out of `watch.js` by name, so renaming one means updating the lists at
the top of each script.

**What is in `Output-Folder/`:**
- `teleprompter-deck.pptx` — the test output that exposed the overflow, kept for
  before/after comparison. Its slide 2 is the failing case.
- `Test-Large-teleprompter-FIXED.pptx` — regenerated after the fix, cream ground
  at 18pt, for eyeballing the bottom spacing.

Neither is an input. Both can be deleted once they have served their purpose.

**Not verified this session:** whether the launchd watcher is actually installed
and running. The shell available to Claude sees only the connected project folder,
not the user's home directory, so `~/Library/LaunchAgents/` and `launchctl` could
not be checked. Assume nothing about the daemon's state — ask, or check on the Mac
directly.

**Order of work, if changing the engine.** `notes-to-deck.html` first, then port
to `watch.js` in the same pass, then re-run the three test scripts. The two files
duplicate the model deliberately (the browser tool has no build step), so a change
in one without the other is the most likely source of a regression.

**Do not reopen** the settled decisions above without being asked: no page
numbers, Arial only with source formatting ignored, the approved slide geometry and
bottom margin, the format-option set, and the retired InDesign reference.
