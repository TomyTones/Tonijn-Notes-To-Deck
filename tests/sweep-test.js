const fs = require('fs'), path = require('path');
const DATA = process.argv[2];
const JSZip = require(path.join(DATA, 'node_modules/jszip'));
const src = fs.readFileSync(path.join(DATA, 'watch.js'), 'utf8');
function grabFn(n){const s=src.indexOf('function '+n+'(');const e=src.indexOf('\n}',s);return src.slice(s,e+2);}
function grabConst(n){for(const l of src.split('\n'))if(l.startsWith('const '+n+' ')||l.startsWith('const '+n+'='))return l;throw new Error(n);}
const model=[grabConst('SLIDE_DIMS'),grabConst('PAD'),grabConst('TEXT_W'),grabConst('ARIAL_CW'),
 grabConst('LINE_PITCH'),grabConst('PARA_SPACE_PT'),grabConst('BULLET_INDENT'),grabConst('FILL_SAFETY'),
 grabConst('BULLET_CODES'),grabFn('textBoxHeight'),grabFn('stripLeadingBullet'),grabFn('paraHeight'),
 grabFn('reflowOversizedPara'),grabFn('splitParasIntoChunks')].join('\n\n').replace(/^const /gm,'var ');
eval(model);

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(process.argv[3]));
  const names = Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a,b)=>+a.match(/\d+/)[0]-+b.match(/\d+/)[0]);

  const deck = [];
  for (const n of names) {
    const xml = await zip.file(n).async('text');
    const paras = [];
    for (const m of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
      const blk = m[1];
      const txt = [...blk.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(x=>x[1]).join('');
      if (!txt.trim()) continue;
      const marL = blk.match(/marL="(\d+)"/);
      paras.push({ text:(marL && +marL[1]>0 ? '- ' : '')+txt, level:0 });
    }
    if (paras.length) deck.push({ slide:+n.match(/\d+/)[0], paras });
  }

  console.log('Regression sweep — ' + deck.length + ' content slides from the test output\n');
  let worstFail = 0, totalFail = 0, cases = 0;
  for (const layout of ['LAYOUT_16x9','LAYOUT_16x10','LAYOUT_4x3']) {
    const boxH = textBoxHeight(layout);
    for (const fs_ of [18,24,32,44,60]) {
      let maxH = 0, fails = 0, chunkTotal = 0;
      for (const s of deck) {
        const chunks = splitParasIntoChunks(s.paras, fs_, boxH);
        chunkTotal += chunks.length;
        for (const c of chunks) {
          const h = c.reduce((a,p)=>a+paraHeight(p,fs_),0);
          if (h > maxH) maxH = h;
          if (h > boxH) { fails++; totalFail++; if (h-boxH > worstFail) worstFail = h-boxH; }
        }
      }
      cases++;
      console.log(`  ${layout.padEnd(13)} ${String(fs_).padStart(2)}pt  box ${boxH.toFixed(3)}"  ` +
                  `tallest chunk ${maxH.toFixed(3)}"  slides ${String(chunkTotal).padStart(3)}  ` +
                  (fails ? `${fails} OVERFLOW` : 'all fit'));
    }
  }
  console.log('\n' + cases + ' configurations tested. ' +
    (totalFail ? totalFail + ' overflowing chunks, worst by ' + worstFail.toFixed(3) + '"'
               : 'No chunk exceeds its text box in any configuration.'));
})();
