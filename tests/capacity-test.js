// Verifies the corrected capacity model against the real failing slide.
// watch.js starts a server on require, so the model functions are sliced out
// of the source text and evaluated in isolation instead.
const fs = require('fs'), path = require('path');
const DATA = process.argv[2];
const JSZip = require(path.join(DATA, 'node_modules/jszip'));
const src = fs.readFileSync(path.join(DATA, 'watch.js'), 'utf8');

function grabFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('missing function ' + name);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end + 2);
}
function grabConst(name) {
  for (const line of src.split('\n')) {
    if (line.startsWith('const ' + name + ' ') || line.startsWith('const ' + name + '=')) return line;
  }
  throw new Error('missing const ' + name);
}

const model = [
  grabConst('SLIDE_DIMS'), grabConst('PAD'), grabConst('TEXT_W'),
  grabConst('ARIAL_CW'), grabConst('LINE_PITCH'), grabConst('PARA_SPACE_PT'),
  grabConst('BULLET_INDENT'), grabConst('FILL_SAFETY'), grabConst('BULLET_CODES'),
  grabFn('textBoxHeight'), grabFn('stripLeadingBullet'),
  grabFn('paraHeight'), grabFn('splitParasIntoChunks'),
].join('\n\n')
  // const/let inside a direct eval stay scoped to the eval; var leaks out.
  .replace(/^const /gm, 'var ');
eval(model);

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(process.argv[3]));
  const xml = await zip.file('ppt/slides/slide2.xml').async('text');

  // Rebuild the parser's input: marL > 0 means the author had a bullet there.
  const paras = [];
  for (const m of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
    const blk = m[1];
    const txt = [...blk.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(x => x[1]).join('');
    if (!txt.trim()) continue;
    const marL = blk.match(/marL="(\d+)"/);
    paras.push({ text: (marL && +marL[1] > 0 ? '- ' : '') + txt, level: 0 });
  }

  const fontSize = 18, layout = 'LAYOUT_16x9';
  const boxH = textBoxHeight(layout), slideH = SLIDE_DIMS[layout].h;
  const top = PAD * 1.5;

  console.log('slide 2: ' + paras.length + ' paragraphs at ' + fontSize + 'pt\n');
  console.log('OLD geometry: box h 4.525", text ends at 5.350", clearance 0.275"');
  console.log('NEW geometry: box h ' + boxH.toFixed(3) + '", text ends at ' +
              (top + boxH).toFixed(3) + '", clearance ' + (slideH - top - boxH).toFixed(3) + '"\n');

  const total = paras.reduce((a, p) => a + paraHeight(p, fontSize), 0);
  console.log('unsplit content height: ' + total.toFixed(3) + '" vs box ' + boxH.toFixed(3) +
              '" → ' + (total > boxH ? 'OVERFLOWS, must split' : 'fits'));

  const chunks = splitParasIntoChunks(paras, fontSize, boxH);
  console.log('\nsplit into ' + chunks.length + ' slide(s):');
  let fail = 0;
  chunks.forEach((c, i) => {
    const h = c.reduce((a, p) => a + paraHeight(p, fontSize), 0);
    const bottom = top + h;
    const ok = h <= boxH && (slideH - bottom) >= PAD * 0.9;
    if (!ok) fail++;
    console.log('  slide ' + (i + 1) + ': ' + c.length + ' paras, height ' + h.toFixed(3) +
                '", ends at ' + bottom.toFixed(3) + '", clearance ' +
                (slideH - bottom).toFixed(3) + '"  ' + (ok ? 'PASS' : 'FAIL'));
  });
  console.log(fail ? '\n' + fail + ' chunk(s) FAILED' : '\nAll chunks fit, bottom margin intact.');
})();
