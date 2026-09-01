# Notes → Deck

A browser-based tool that converts PowerPoint speaker notes into a clean notes
deck for a second monitor.

## What it does

1. You upload your `.pptx` presentation
2. The tool extracts all speaker notes
3. It generates two files:
   - **`teleprompter-deck.pptx`** — your notes, typeset large and readable, ready
     to run fullscreen on a second monitor
   - **`yourfile-patched.pptx`** — your original deck with duplicate slides
     inserted wherever notes are too long for one slide, keeping the clicker in
     sync with the notes deck

## Getting the tool (GitHub)

This project lives in a **private** GitHub repository:
https://github.com/TomyTones/Tonijn-Notes-To-Deck

You need to be added as a collaborator on the repo before you can access it —
ask the repo owner to add your GitHub account under **Settings → Collaborators**.
Once you have access:

1. Open [`notes-to-deck.html`](https://github.com/TomyTones/Tonijn-Notes-To-Deck/blob/main/notes-to-deck.html)
   on GitHub, click **Download raw file**, and save it to your computer.
2. Double-click the downloaded file to open it in your browser — see *How to
   use* below.

There is no install step and no server; the file works the same whether it
came from GitHub, Dropbox, or email.

## How to use

1. **Download** `notes-to-deck.html` to your computer (see above)
2. **Open** it in Safari or Chrome (double-click the file)
3. **Drop** your `.pptx` onto the upload area, or click to browse
4. **Adjust** the settings (font size, colours, layout)
5. **Click** one of the two buttons:
   - *Teleprompter deck only* — just the notes deck
   - *Teleprompter + patched source* — both files

> ⚠️ The tool must be opened as a local file. It will not work inside Claude's
> preview panel.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Background colour | `#FFFFFF` | White ground; any colour you like |
| Text colour | `#000000` | Black text |
| Font size | 18pt | Increase for larger screens / more distance |
| Slide layout | 16:9 | Match your monitor's aspect ratio |
| Empty slides | Include | Slides with no notes become a blank canvas |

These five options are the complete set. Each generated slide also carries the
original slide's title in small muted text, top-right, so you can tell where you
are in the deck.

## No page numbers

The notes deck deliberately carries **no slide numbers and no continuation
labels**. The pages are meant to be read, not referenced — the title in the
corner is the only orientation marker.

## Overflow slides

When a slide's notes are too long to fit on one notes slide, the tool splits the
notes across multiple output slides. If you use **Teleprompter + patched
source**, duplicate slides are inserted in the source deck at the same
positions, so pressing the clicker once advances both screens together.

The preview panel (shown after upload) highlights overflow slides in amber and
tells you how many duplicates will be inserted.

## Bullet points

The tool normalises all bullet styles — regardless of whether you typed `-`,
`o`, `*` or used PowerPoint's built-in bullets, the output always uses:

- `•` for top-level points
- `◦` for sub-points (indented)
- `–` for deeper sub-points

Bullets use PowerPoint's native hanging indents, so wrapped lines align under
the text rather than under the bullet character.

## Privacy

Nothing is uploaded to any server. All processing happens in your browser. Your
`.pptx` file never leaves your computer.

## Requirements

- A modern browser (Safari, Chrome, Firefox, Edge)
- Internet connection on first open (to load two small libraries from CDN)
- Works fully offline after first load

## Watch-folder mode

For hands-off processing, `watch.js` runs the same engine as a background service:
drop a `.pptx` into `Watch-Folder/` and the outputs appear in `Output-Folder/`.
Settings and a live activity log are at http://localhost:4040. See `CLAUDE.md`
for setup details.
