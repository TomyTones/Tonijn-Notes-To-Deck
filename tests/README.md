# Capacity model tests

Node scripts that verify the notes deck never overflows its text box. They slice
the model functions out of `watch.js` by name — `watch.js` starts an HTTP server
and a file watcher on `require`, so it cannot be imported directly.

Run from the `Data/` folder:

```bash
# One slide in detail — geometry, per-chunk heights, bottom clearance
node tests/capacity-test.js "$PWD" ../Output-Folder/<a-generated-deck>.pptx

# Regression sweep — 3 layouts × 18/24/32/44/60pt, asserts no chunk overflows
node tests/sweep-test.js "$PWD" ../Output-Folder/<a-generated-deck>.pptx

# Full pipeline on a real source deck — parse, build, measure every output slide
node tests/full-test.js "$PWD" ../Assets/Powerpoint/Test-Large.pptx
```

`capacity-test.js` and `sweep-test.js` take a *generated notes deck* as input and
reconstruct the parser's paragraph list from it (`marL > 0` means the author had a
bullet there). `full-test.js` takes an *original deck with speaker notes*.

Expected output, after the September 2026 fix:

- every chunk fits its box in all 15 sweep configurations
- smallest bottom margin across every generated slide is 0.550", equal to `PAD`

Re-run all three after touching `paraHeight`, `splitParasIntoChunks`,
`reflowOversizedPara`, `textBoxHeight`, or any generator geometry.

Note: the scripts slice functions by name. If you rename one, update the
`grabFn`/`fn` lists at the top of each script or it will fail loudly.
