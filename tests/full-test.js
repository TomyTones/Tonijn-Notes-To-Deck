// Full pipeline on a real source deck: parse → build → measure every slide.
const fs = require('fs'), path = require('path');
const DATA = process.argv[2];
const JSZip = require(path.join(DATA, 'node_modules/jszip'));
const PptxGenJS = require(path.join(DATA, 'node_modules/pptxgenjs'));
const src = fs.readFileSync(path.join(DATA, 'watch.js'), 'utf8');
function fn(n){const s=src.indexOf('function '+n+'(');const e=src.indexOf('\n}',s);return src.slice(s,e+2);}
function afn(n){const s=src.indexOf('async function '+n+'(');const e=src.indexOf('\n}',s);return src.slice(s,e+2);}
function cst(n){for(const l of src.split('\n'))if(l.startsWith('const '+n+' ')||l.startsWith('const '+n+'='))return l;throw new Error(n);}

const model = [
  cst('SLIDE_DIMS'), cst('PAD'), cst('TEXT_W'), cst('ARIAL_CW'), cst('LINE_PITCH'),
  cst('PARA_SPACE_PT'), cst('BULLET_INDENT'), cst('FILL_SAFETY'), cst('BULLET_CODES'),
  cst('BULLET_SYMBOLS'),
  fn('textBoxHeight'), fn('stripLeadingBullet'), fn('paraHeight'), fn('reflowOversizedPara'),
  fn('splitParasIntoChunks'), fn('decodeXmlEntities'), fn('extractPlainText'), fn('extractTitle'),
  fn('extractNotesPath'), fn('extractNotesParas'), fn('parasToString'),
  afn('parseSlides'), afn('buildTeleprompter'),
].join('\n\n').replace(/^const /gm, 'var ');
var SETTINGS = { bgColor:'FFFBF1', textColor:'000000', fontSize:18, layout:'LAYOUT_16x9', emptyMode:'include' };
eval(model);

(async () => {
  const t0 = Date.now();
  const zip = await JSZip.loadAsync(fs.readFileSync(process.argv[3]));
  const slides = await parseSlides(zip);
  const withNotes = slides.filter(s => s.str.trim()).length;
  console.log(`source: ${slides.length} slides, ${withNotes} with notes  (${((Date.now()-t0)/1000).toFixed(1)}s)`);

  const buf = await buildTeleprompter(slides);
  const out = await JSZip.loadAsync(buf);
  const names = Object.keys(out.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n));
  const EMU = 914400, slideH = SLIDE_DIMS[SETTINGS.layout].h;

  let fails = [], minMargin = 99;
  for (const n of names) {
    const sx = await out.file(n).async('text');
    for (const m of sx.matchAll(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)) {
      const y = +m[2]/EMU, h = +m[4]/EMU;
      if (h <= 1) continue;                     // skip the title strip
      const margin = slideH - (y + h);
      if (margin < minMargin) minMargin = margin;
      if (margin < 0.54) fails.push(n + ' margin ' + margin.toFixed(3) + '"');
    }
  }
  console.log(`output: ${names.length} notes slides generated`);
  console.log(`smallest bottom margin across every generated slide: ${minMargin.toFixed(3)}" (PAD is 0.550")`);
  console.log(fails.length ? 'FAIL: ' + fails.join(', ') : 'PASS: every slide keeps a full bottom margin.');
  console.log(`total ${((Date.now()-t0)/1000).toFixed(1)}s`);
})();
