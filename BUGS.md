# Known Issues & Improvement Ideas

_Last reviewed: 2026-09-01_

## Settled — do not reopen without an explicit request

### No page numbers on the notes deck ✓ Decided
The generated notes deck carries no slide number and no continuation label. The
only marker on a slide is the original slide title, small and muted, top-right.
The unused `showNum` key has been removed from `watch-settings.json`. Any
previously documented `5 (1/3)` continuation-label feature is out of scope — it
was never implemented.

### Format options are final ✓ Decided
The five options in `notes-to-deck.html` — background colour, text colour, font
size, slide layout, empty-slide handling — are the approved set. New defaults:
white background, black text, 18pt, 16:9, include empty slides. The dark 32pt
stage-autocue preset is superseded.

### Bullet indents approved — no external spec ✓ Decided
The generator's native PptxGenJS bullets (`marL` 342900 EMU = 0.375" per level,
with a matching negative indent) give a true hanging indent and were accepted on
1 September 2026.

The InDesign files in `../Assets/InDesign/` were an earlier reference and are **no
longer relevant** — ignore them. Their centimetre values (1.5 cm / −1.5 cm,
2 cm / −1 cm) are not a target. Do not replace the native bullets with explicit
paragraph indents to chase them.

If the indent is ever changed deliberately, update `BULLET_INDENT` in the capacity
model to match, or the usable-width calculation drifts.

### Slide geometry approved ✓ Decided
The corrected text box was reviewed against a real deck on 1 September 2026 and
accepted: 4.250" high at 16:9, top at 0.825", **0.550" bottom margin** matching
the sides. `PAD = 0.55` governs all three.

The box is deliberately generous — 4.25" of a 5.625" slide — so slides read
emptier than a dense layout. That is the approved look. Do not trade the bottom
margin back for density, and do not reintroduce a literal box height: everything
comes from `textBoxHeight(layout)`.

### Arial only — source formatting is ignored ✓ Decided
The notes deck imposes its own typography. All character and paragraph formatting
in the source notes is discarded on purpose: typeface, size, weight, italic,
colour, line spacing, alignment, and any author-typed bullet glyph. Output is
always Arial.

Only *structure* survives: paragraph breaks, bullet indent level (`lvl="N"`), and
inline `<a:br/>` line breaks.

This makes `ARIAL_CW = 0.52` a correct constant rather than an assumption, since
the output font cannot vary. **Do not add typeface detection or a per-font width
table** — that would reintroduce the dependency this decision removes.

---

## Active issues

### Continued bullets read as new bullets
When a single paragraph is too tall for one slide, `reflowOversizedPara` breaks it
at word boundaries and keeps the author's bullet on every piece, so a continued
bullet looks like a fresh bullet. Each piece but the last ends in an ellipsis,
which is the only cue. Only triggers at large font sizes — never at the 18pt
default.

**Possible fix:** render continuation pieces without a bullet glyph but with the
parent's `marL`, so the text aligns under the parent bullet. PptxGenJS drops
`marL` when `bullet:false`, so this needs explicit paragraph indents.

**Also accepted:** hard line breaks (Shift+Enter) inside an oversized paragraph are
reflowed away.

### Patched source duplicates are visually identical
The duplicate slides inserted in the patched source look exactly like the
original. A presenter advancing slides needs to know they are on a continuation.

**Possible fix:** add a small coloured dot or border to the duplicated slides in
the patched source to signal "continuation — advance to next notes page."

---

## Closed

### ~~`lineToLevel` lookup can fail on duplicate paragraph text~~ ✓ Fixed
`lineToLevel` replaced with `splitParasIntoChunks({text,level}[])`.

### ~~Notes deck and patched source slide counts could diverge~~ ✓ Fixed
`buildPatchedSource` was using `splitIntoChunks` (string-based) while
`buildTeleprompter` used `splitParasIntoChunks` (structured). Different
prefix-length estimates caused different chunk counts → misaligned outputs. Both
now call `splitParasIntoChunks` with the same `{text,level}[]` data.

### ~~Patched PPTX always shows a repair warning on open~~ ✓ Fixed
The `<p:sldIdLst>` rebuild was scanning ALL `id=` attributes including
`<p:sldMasterId id="2147483648">`. Since the OOXML `ST_SlideId` max is
2147483647, every generated slide ID was out-of-range → PowerPoint repaired on
open. Fixed: scan only `<p:sldId>` elements; preserve original slide IDs; only
mint new IDs for inserted duplicates.

### ~~Text ran off the bottom of the slide~~ ✓ Fixed
Reported from a real test: slide 2 of the output deck overflowed the bottom edge.
Two independent causes, both now fixed.

**1 — The text box had almost no bottom margin.** The box top was set to
`PAD*1.5` (0.825", clearing the title) but its height to `SH - PAD*2`, putting the
bottom edge at 5.350" on a 5.625" slide — a 0.275" margin against 0.55" on the
sides. Replaced by `textBoxHeight(layout) = slideH - PAD*1.5 - PAD` → 4.250" high,
0.550" bottom margin, matching left and right. The generator and the capacity
model now both call this function; the literal is gone, so they cannot drift apart
again.

**2 — The capacity model under-counted height.** It counted "lines" and disagreed
with what the generator actually wrote:

| | Model assumed | Generator wrote |
|---|---|---|
| Line spacing | 1.15 × size | `lineSpacingMultiple: 1.2` on top of Arial's ≈1.15 line box → ≈1.38 × |
| Paragraph spacing | nothing | `paraSpaceAfter: 6` after every paragraph |
| Bullet indent | 3 characters | `marL` 342900 EMU = 0.375" per level |

The reported slide measured 4.973" of content against a 4.525" box — it needed to
split and the model said it fit. `shrinkText: true` was no safety net either:
PptxGenJS emits `<a:normAutofit/>` with no `fontScale`, so PowerPoint only shrinks
after a manual edit. The model is now measured in inches (`paraHeight`), matches
all three values, and keeps 5% headroom (`FILL_SAFETY`). That slide now splits
into two, at 3.772" and 1.202".

The string-based `splitIntoChunks` has been deleted — the preview, the notes deck
and the patched source all call `splitParasIntoChunks` now, so all three agree.

**Reviewed and accepted 1 September 2026** against a regenerated deck
(`Test-Large-teleprompter-FIXED.pptx` in `Output-Folder/`). Closed.

### ~~A single paragraph taller than the box could never fit~~ ✓ Fixed
Found by the regression sweep while fixing the above. Because chunking kept each
paragraph whole, one long bullet at 32pt or more exceeded the box no matter how it
was packed — a 44pt bullet measured 9.360" against a 4.250" box. Added
`reflowOversizedPara`, which breaks such a paragraph at word boundaries (never
mid-word) with an ellipsis on each piece but the last. See the cosmetic follow-up
under Active issues.

### ~~Indents not measured against the InDesign specification~~ ✓ Closed — spec retired
Previously the main open typographic item: measure the generated indents against
`Assets/InDesign/input claude slide.png` and set explicit paragraph indents if they
diverged. Closed on 1 September 2026 — the InDesign reference is no longer
relevant and the native PptxGenJS indents are approved as they are.

### ~~Better font/size handling~~ ✓ Closed by decision
Previously logged as an improvement: read `<a:rPr typeface="...">` and adjust the
capacity estimate per font. Closed — source formatting is ignored by design and
the output font is always Arial, so there is nothing to detect.

### ~~Documentation described features that did not exist~~ ✓ Fixed
`README.md` listed a slide-number label setting and `(1/3)` continuation labels;
neither existed in code. Resolved by decision — no page numbers — and the docs
now match.

---

## Improvement ideas

### Support for RTL text
Arabic, Hebrew, and other RTL notes are not tested. `<a:pPr rtl="1"/>` would need
to be detected and the text direction set accordingly in PptxGenJS.

### Offline / self-contained mode
Currently loads JSZip and PptxGenJS from CDN. A bundled version would work fully
offline without any network dependency.
To bundle: download both libraries and inline them, or use a simple build step:
```bash
curl -o jszip.min.js https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
curl -o pptxgen.min.js https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.min.js
# Then replace the CDN <script> tags with local ones
```

### Preview rendering
The notes preview in the UI is plain text. A visual preview showing roughly how
the slide will look (correct ground colour, approximate line breaks) would help
users choose the right font size before generating.

### Multi-monitor slide sync indicator
The notes-deck operator currently has to manually advance their slides. A future
version could embed slide timing data or a WebSocket-based sync signal so both
screens advance together automatically.

### Slide title treatment
The original slide title is shown in small muted text at the top-right of each
notes slide. Some users may want to hide it entirely or set it larger. Could
become a sixth option: `Show slide title: [Yes / No / Large]`. Note this is the
*title*, not a page number — page numbers remain out of scope.

### Preserve hyperlinks as plain URLs — needs a ruling
Notes containing hyperlinks (`<a:hlinkClick>`) lose the URL entirely — only the
link text is kept. A `[url]` annotation could be useful, but this sits against the
ignore-source-formatting rule. A hyperlink is arguably *content* rather than
formatting, so this needs an explicit decision before implementing. Parked.

---

## Testing checklist

When making changes, test with slides that have:

- [ ] No speaker notes (empty slide)
- [ ] Short notes (fits one slide)
- [ ] Long notes with wrapping lines (overflow → split) — retest at 18pt
- [ ] Notes with `<a:br>` inline breaks (Shift+Enter in PowerPoint)
- [ ] Notes with rich `<a:pPr>` formatting (bullet chars, line spacing)
- [ ] Notes with `lvl="1"` sub-bullets — wrapped lines align under the text
- [ ] Notes with `&amp;`, `&lt;`, `&gt;` XML entities
- [ ] Notes with non-breaking spaces (`\xa0`)
- [ ] Slides with duplicate notes text
- [ ] Very large decks (50+ slides) — `Assets/Powerpoint/Test-Large.pptx`
- [ ] Bottom margin holds: every generated slide keeps 0.55" clear below the text
- [ ] A single paragraph longer than one slide (test at 44pt and 60pt)
- [ ] Regression sweep: three layouts × 18/24/32/44/60pt, no chunk exceeds its box
- [ ] No page number appears anywhere on the output slides
- [ ] Notes set in a non-Arial font, coloured, bold or italic → output is plain
      Arial in the configured text colour, with no inherited styling
