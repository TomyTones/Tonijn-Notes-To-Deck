#!/usr/bin/env node
'use strict';

// ── Teleprompter Watch-Folder ──────────────────────────────────────────────
//  Drop a .pptx into Watch-Folder — output files land in Output-Folder.
//  Open http://localhost:4040 to adjust settings and watch activity.
// ──────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const http = require('http');

const WATCH_DIR     = path.resolve(__dirname, '..', 'Watch-Folder');
const OUTPUT_DIR    = path.resolve(__dirname, '..', 'Output-Folder');
const SETTINGS_FILE = path.resolve(__dirname, 'watch-settings.json');  // stays in Data/
const PORT          = process.env.PORT || 4040;

// Slide dimensions in inches, per PptxGenJS layout name.
const SLIDE_DIMS = { LAYOUT_16x9:{w:10,h:5.625}, LAYOUT_16x10:{w:10,h:6.25}, LAYOUT_4x3:{w:10,h:7.5} };

// ── default settings ───────────────────────────────────────────────────────
// Standard defaults: light typeset notes deck (white ground, black text, 18pt).
// Supersedes the original dark 32pt stage-autocue preset. No slide numbers — by design.
const DEFAULTS = { bgColor:'FFFFFF', textColor:'000000', fontSize:18, layout:'LAYOUT_16x9', emptyMode:'include' };
let SETTINGS = Object.assign({}, DEFAULTS);

function loadSettings() {
  try { Object.assign(SETTINGS, JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))); } catch {}
}
function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(SETTINGS, null, 2));
}
loadSettings();

// ── startup checks ─────────────────────────────────────────────────────────
[WATCH_DIR, OUTPUT_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

let JSZip, PptxGenJS;
try { JSZip = require('jszip'); PptxGenJS = require('pptxgenjs'); }
catch { console.error('\nRun: npm install\n'); process.exit(1); }

// ── SSE broadcast ──────────────────────────────────────────────────────────
const sseClients = new Set();
function broadcast(type, payload) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(res => { try { res.write(msg); } catch { sseClients.delete(res); } });
}
function log(msg, level = 'info') {
  console.log(msg);
  broadcast('log', { msg, level });
}

// ── HTTP server ────────────────────────────────────────────────────────────
const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Teleprompter Watch-Folder</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#0f0f0f;color:#e8e8e8;display:grid;grid-template-columns:340px 1fr;min-height:100vh}
aside{border-right:1px solid #1e1e1e;padding:1.5rem;display:flex;flex-direction:column;gap:0}
main{padding:1.5rem;display:flex;flex-direction:column}
h1{font-size:1rem;font-weight:600;color:#fff;margin-bottom:1rem}
.badge{display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .8rem;border-radius:20px;font-size:.78rem;font-weight:600;margin-bottom:1.5rem}
.badge.idle{background:#161616;color:#555;border:1px solid #2a2a2a}
.badge.processing{background:#001840;color:#5b8bff;border:1px solid #1a3a6a}
.badge.done{background:#0d1a0d;color:#5dbd5d;border:1px solid #1e3d1e}
.dot{width:7px;height:7px;border-radius:50%;background:currentColor}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
.processing .dot{animation:pulse 1s infinite}
.section-title{font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#555;margin:1rem 0 .6rem}
.field{display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #191919}
.field:last-of-type{border-bottom:none}
.lbl{font-size:.84rem;color:#ccc}
.lbl small{display:block;font-size:.74rem;color:#555;margin-top:.1rem}
select,input[type=color],input[type=range]{background:#1e1e1e;border:1px solid #2e2e2e;color:#e8e8e8;border-radius:6px;padding:.25rem .45rem;font-size:.82rem;cursor:pointer}
input[type=color]{width:44px;height:28px;padding:2px}
input[type=range]{width:100px}
.rw{display:flex;align-items:center;gap:.4rem}
.rv{font-size:.78rem;color:#666;min-width:26px}
.save{margin-top:1.2rem;width:100%;padding:.6rem;background:#5b8bff;color:#fff;border:none;border-radius:8px;font-size:.87rem;font-weight:600;cursor:pointer;transition:background .15s}
.save:hover{background:#4a7aee}
.save-msg{text-align:center;font-size:.78rem;color:#5dbd5d;margin-top:.5rem;min-height:1rem}
.log-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem}
.log-hdr h2{font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#555}
.log-actions{display:flex;align-items:center;gap:.8rem}
.conn{font-size:.72rem;color:#444}
.conn.live{color:#5dbd5d}
.clr{font-size:.75rem;color:#3a3a3a;background:none;border:none;cursor:pointer;padding:.2rem .3rem}
.clr:hover{color:#777}
.log{flex:1;background:#080808;border:1px solid #1a1a1a;border-radius:8px;padding:.7rem 1rem;overflow-y:auto;font-family:'SF Mono',Menlo,monospace;font-size:.78rem;line-height:1.75;min-height:200px}
.line{white-space:pre-wrap;word-break:break-all}
.info{color:#666}
.head{color:#ccc;font-weight:600}
.ok{color:#5dbd5d}
.warn{color:#c8972a}
.err{color:#e06060}
.empty{color:#2a2a2a;font-style:italic}
</style>
</head>
<body>
<aside>
  <h1>Teleprompter<br>Watch-Folder</h1>
  <div class="badge idle" id="badge"><span class="dot"></span><span id="badgeTxt">Idle — watching</span></div>

  <div class="section-title">Output settings</div>
  <form id="form">
    <div class="field"><div class="lbl">Background color</div><input type="color" id="bgColor" name="bgColor"></div>
    <div class="field"><div class="lbl">Text color</div><input type="color" id="textColor" name="textColor"></div>
    <div class="field">
      <div class="lbl">Font size (pt)<small>Larger = readable further away</small></div>
      <div class="rw"><input type="range" id="fontSize" name="fontSize" min="18" max="60" step="2"><span class="rv" id="fsVal">32</span></div>
    </div>
    <div class="field">
      <div class="lbl">Slide layout</div>
      <select id="layout" name="layout">
        <option value="LAYOUT_16x9">16:9 (default)</option>
        <option value="LAYOUT_16x10">16:10</option>
        <option value="LAYOUT_4x3">4:3</option>
      </select>
    </div>
    <div class="field">
      <div class="lbl">Empty slides</div>
      <select id="emptyMode" name="emptyMode"><option value="include">Include as empty</option><option value="skip">Skip</option></select>
    </div>
    <button type="submit" class="save">Save settings</button>
    <div class="save-msg" id="saveMsg"></div>
  </form>
</aside>
<main>
  <div class="log-hdr">
    <h2>Activity</h2>
    <div class="log-actions">
      <span class="conn" id="conn">connecting…</span>
      <button class="clr" onclick="clearLog()">clear</button>
    </div>
  </div>
  <div class="log" id="log"><span class="line empty">Waiting for files…</span></div>
</main>
<script>
var logEl = document.getElementById('log');
var fresh = true;

fetch('/settings').then(function(r){return r.json();}).then(function(s){
  document.getElementById('bgColor').value   = '#'+s.bgColor;
  document.getElementById('textColor').value = '#'+s.textColor;
  document.getElementById('fontSize').value  = s.fontSize;
  document.getElementById('fsVal').textContent = s.fontSize;
  document.getElementById('layout').value    = s.layout;
  document.getElementById('emptyMode').value = s.emptyMode;
});

document.getElementById('fontSize').addEventListener('input',function(){
  document.getElementById('fsVal').textContent = this.value;
});

document.getElementById('form').addEventListener('submit',function(e){
  e.preventDefault();
  var data = {
    bgColor:   document.getElementById('bgColor').value.replace('#',''),
    textColor: document.getElementById('textColor').value.replace('#',''),
    fontSize:  parseInt(document.getElementById('fontSize').value),
    layout:    document.getElementById('layout').value,
    emptyMode: document.getElementById('emptyMode').value
  };
  fetch('/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
    .then(function(){
      var m = document.getElementById('saveMsg');
      m.textContent = '✔ Saved — applies to next file';
      setTimeout(function(){m.textContent='';},3000);
    });
});

function addLine(msg, cls){
  if(fresh){logEl.innerHTML='';fresh=false;}
  var d = document.createElement('div');
  d.className = 'line '+(cls||'info');
  d.textContent = msg;
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
}

function clearLog(){
  logEl.innerHTML = '<span class="line empty">Log cleared.</span>';
  fresh = false;
}

function setStatus(val, file){
  var b = document.getElementById('badge');
  var t = document.getElementById('badgeTxt');
  b.className = 'badge '+val;
  if(val==='processing') t.textContent = 'Processing '+(file||'…');
  else if(val==='done')  t.textContent = 'Done';
  else                   t.textContent = 'Idle — watching';
}

var es = new EventSource('/events');
es.onopen = function(){
  var c = document.getElementById('conn');
  c.textContent = 'live'; c.classList.add('live');
};
es.onerror = function(){
  var c = document.getElementById('conn');
  c.textContent = 'disconnected'; c.classList.remove('live');
};
es.addEventListener('log',function(e){
  var d = JSON.parse(e.data);
  addLine(d.msg, d.level||'info');
});
es.addEventListener('status',function(e){
  var d = JSON.parse(e.data);
  setStatus(d.value, d.file);
});
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(UI_HTML);

  } else if (req.method === 'GET' && req.url === '/settings') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(SETTINGS));

  } else if (req.method === 'POST' && req.url === '/settings') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const incoming = JSON.parse(body);
        Object.assign(SETTINGS, incoming);
        saveSettings();
        log('[settings] Saved — applies to next file', 'info');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400); res.end('Bad request');
      }
    });

  } else if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':\n\n');  // keep-alive comment
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));

  } else {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('─'.repeat(50));
  console.log('  Teleprompter Watch-Folder');
  console.log(`  Watch:    ${WATCH_DIR}`);
  console.log(`  Output:   ${OUTPUT_DIR}`);
  console.log(`  Browser:  http://localhost:${PORT}`);
  console.log('─'.repeat(50));
  console.log('  Drop a .pptx into Watch-Folder to begin.\n');
});

// ── watcher ────────────────────────────────────────────────────────────────
const inProgress = new Set();

fs.watch(WATCH_DIR, (event, filename) => {
  if (!filename || !filename.toLowerCase().endsWith('.pptx')) return;
  const fp = path.join(WATCH_DIR, filename);
  if (inProgress.has(fp) || !fs.existsSync(fp)) return;
  inProgress.add(fp);
  waitForFile(fp)
    .then(() => processFile(fp, filename))
    .catch(err => { if (err.message !== 'File disappeared') log(`  ✗ ${filename}: ${err.message}`, 'err'); })
    .finally(() => inProgress.delete(fp));
});

// Poll until file size stabilises (handles Dropbox sync / slow copies)
function waitForFile(fp, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let prev = -1;
    const poll = () => {
      if (!fs.existsSync(fp)) return reject(new Error('File disappeared'));
      const sz = fs.statSync(fp).size;
      if (sz > 0 && sz === prev) return resolve();
      prev = sz;
      if (Date.now() > deadline) return reject(new Error('Timed out waiting for file'));
      setTimeout(poll, 600);
    };
    setTimeout(poll, 600);
  });
}

// ── main processor ─────────────────────────────────────────────────────────
async function processFile(filePath, filename) {
  const baseName = filename.replace(/\.pptx$/i, '');
  broadcast('status', { value: 'processing', file: filename });
  log(`[${ts()}] ${filename}`, 'head');

  const buf    = fs.readFileSync(filePath);
  const zip    = await JSZip.loadAsync(buf);
  const slides = await parseSlides(zip);
  const nc     = slides.filter(s => s.str.trim()).length;
  log(`         ${slides.length} slides, ${nc} with speaker notes`, 'info');

  const teleBuf  = await buildTeleprompter(slides);
  const teleFile = path.join(OUTPUT_DIR, `${baseName}-teleprompter.pptx`);
  fs.writeFileSync(teleFile, teleBuf);
  log(`  ✔ ${path.basename(teleFile)}`, 'ok');

  const patchBuf = await buildPatchedSource(zip, slides, buf);
  if (patchBuf) {
    const patchFile = path.join(OUTPUT_DIR, `${baseName}-patched.pptx`);
    fs.writeFileSync(patchFile, patchBuf);
    log(`  ✔ ${path.basename(patchFile)}`, 'ok');
  } else {
    log(`  — no overflow slides, patched source not needed`, 'warn');
  }

  try {
    fs.renameSync(filePath, path.join(OUTPUT_DIR, filename));
    log(`  ✔ original moved → Output-Folder`, 'ok');
  } catch (e) {
    if (e.code === 'ENOENT') {
      log(`  — original already removed by Dropbox (outputs are safe)`, 'warn');
    } else {
      throw e;
    }
  }
  log('', 'info');
  broadcast('status', { value: 'done' });
  setTimeout(() => broadcast('status', { value: 'idle' }), 3000);
}

// ── PPTX parsing ───────────────────────────────────────────────────────────
async function parseSlides(zip) {
  const slideFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  if (!slideFiles.length) throw new Error('No slides found in file');

  const slides = [];
  for (const sf of slideFiles) {
    const num      = parseInt(sf.match(/\d+/)[0]);
    const slideXml = await zip.files[sf].async('text');
    const title    = extractTitle(slideXml);
    let paras = [];
    const rp  = `ppt/slides/_rels/slide${num}.xml.rels`;
    if (zip.files[rp]) {
      const np = extractNotesPath(await zip.files[rp].async('text'));
      if (np) {
        const fp = 'ppt/notesSlides/' + np.split('/').pop();
        if (zip.files[fp]) paras = extractNotesParas(await zip.files[fp].async('text'));
      }
    }
    slides.push({ slideNumber: num, title, paras, str: parasToString(paras) });
  }
  return slides;
}

// ── teleprompter generator ─────────────────────────────────────────────────
async function buildTeleprompter(slides) {
  const { bgColor, textColor, fontSize, layout, emptyMode } = SETTINGS;
  const SW   = SLIDE_DIMS[layout].w;
  const boxH = textBoxHeight(layout);   // leaves a full PAD of bottom margin

  const pres = new PptxGenJS();
  pres.layout = layout;

  for (const slide of slides) {
    const filteredParas = slide.paras.filter(p => p.text.trim());
    const hasNotes      = filteredParas.length > 0;
    if (!hasNotes && emptyMode === 'skip') continue;

    if (!hasNotes) {
      const s = pres.addSlide();
      s.background = { color: bgColor };
      if (slide.title) s.addText(slide.title, { x:PAD, y:PAD*0.5, w:SW-PAD*2, h:0.35, fontSize:13, color:'555555', fontFace:'Arial', align:'right', margin:0 });
      continue;
    }

    // splitParasIntoChunks keeps each bullet as a unit — never splits a word
    const paraChunks = splitParasIntoChunks(filteredParas, fontSize, boxH);
    for (let pi = 0; pi < paraChunks.length; pi++) {
      const s = pres.addSlide();
      s.background = { color: bgColor };
      if (slide.title) s.addText(slide.title, { x:PAD, y:PAD*0.5, w:SW-PAD*2, h:0.35, fontSize:13, color:'888888', fontFace:'Arial', align:'right', margin:0 });

      const chunk    = paraChunks[pi];
      const textRuns = chunk.map((para, i) => {
        const { stripped, hadBullet } = stripLeadingBullet(para.text);
        const useBullet = hadBullet || para.level > 0;
        const lvl = Math.min(para.level, BULLET_CODES.length - 1);
        return {
          text: useBullet ? stripped : para.text,
          options: {
            bullet: useBullet ? { characterCode: BULLET_CODES[lvl] } : false,
            indentLevel: lvl,
            breakLine: i < chunk.length - 1,
            paraSpaceAfter: 6
          }
        };
      });

      s.addText(textRuns, {
        x: PAD, y: PAD * 1.5, w: SW - PAD * 2, h: boxH,
        fontSize, color: textColor, fontFace: 'Arial', align: 'left', valign: 'top',
        shrinkText: true, lineSpacingMultiple: 1.2, margin: 0
      });
    }
  }
  return pres.write({ outputType: 'nodebuffer' });
}

// ── patched source generator ───────────────────────────────────────────────
async function buildPatchedSource(sourceZip, slides, originalBuf) {
  const fontSize       = SETTINGS.fontSize;
  // Same box height as the notes deck, so both outputs agree on chunk counts.
  const boxH           = textBoxHeight(SETTINGS.layout);
  const overflowSlides = slides.filter(s => splitParasIntoChunks(s.paras.filter(p => p.text.trim()), fontSize, boxH).length > 1);
  if (!overflowSlides.length) return null;

  const zip     = await JSZip.loadAsync(originalBuf);
  const allKeys = Object.keys(zip.files);
  let maxSlide  = highestNumber(allKeys, /^ppt\/slides\/slide(\d+)\.xml$/);
  let maxNotes  = highestNumber(allKeys, /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/);

  let presXml     = await zip.files['ppt/presentation.xml'].async('text');
  let presRelsXml = await zip.files['ppt/_rels/presentation.xml.rels'].async('text');
  let ctXml       = await zip.files['[Content_Types].xml'].async('text');
  let maxRid      = highestRid(presRelsXml);

  const ridToFile = {};
  const relRe = /Id="(rId\d+)"[^>]*Type="[^"]*\/slide"[^>]*Target="([^"]+)"/g;
  let rm;
  while ((rm = relRe.exec(presRelsXml)) !== null) ridToFile[rm[1]] = rm[2];

  const sldIdRe = /<p:sldId\b[^\/]*/g;
  let sm;
  const order = [];
  while ((sm = sldIdRe.exec(presXml)) !== null) {
    const ridM = sm[0].match(/r:id="(rId\d+)"/);
    if (ridM && ridToFile[ridM[1]]) order.push({ slideFile: ridToFile[ridM[1]], rId: ridM[1] });
  }

  const insertions = [];
  slides.forEach(slide => {
    const extras = splitParasIntoChunks(slide.paras.filter(p => p.text.trim()), fontSize, boxH).length - 1;
    if (!extras) return;
    const pos = order.findIndex(e => e.slideFile === `slides/slide${slide.slideNumber}.xml`);
    if (pos !== -1) insertions.push({ pos, count: extras, srcNum: slide.slideNumber });
  });
  insertions.sort((a, b) => b.pos - a.pos);

  for (const ins of insertions) {
    const { srcNum } = ins;
    const srcSlideXml = await zip.files[`ppt/slides/slide${srcNum}.xml`].async('uint8array');
    const srcSlideRel = await zip.files[`ppt/slides/_rels/slide${srcNum}.xml.rels`].async('text');
    const notesRef    = extractNotesPath(srcSlideRel);
    const notesFile   = notesRef ? notesRef.split('/').pop() : null;
    const notesNum    = notesFile ? parseInt(notesFile.match(/\d+/)[0]) : null;
    let srcNotesXml = null, srcNotesRel = null;
    if (notesNum) {
      if (zip.files[`ppt/notesSlides/notesSlide${notesNum}.xml`])        srcNotesXml = await zip.files[`ppt/notesSlides/notesSlide${notesNum}.xml`].async('uint8array');
      if (zip.files[`ppt/notesSlides/_rels/notesSlide${notesNum}.xml.rels`]) srcNotesRel = await zip.files[`ppt/notesSlides/_rels/notesSlide${notesNum}.xml.rels`].async('text');
    }

    for (let ci = 0; ci < ins.count; ci++) {
      maxSlide++; maxNotes++; maxRid++;
      const [ns, nn, nr] = [maxSlide, maxNotes, 'rId' + maxRid];

      zip.file(`ppt/slides/slide${ns}.xml`, srcSlideXml);
      zip.file(`ppt/slides/_rels/slide${ns}.xml.rels`,
        notesFile ? srcSlideRel.replace(new RegExp(notesFile.replace('.', '\\.'), 'g'), `notesSlide${nn}.xml`) : srcSlideRel);
      if (srcNotesXml) zip.file(`ppt/notesSlides/notesSlide${nn}.xml`, srcNotesXml);
      if (srcNotesRel) zip.file(`ppt/notesSlides/_rels/notesSlide${nn}.xml.rels`,
        srcNotesRel.replace(new RegExp(`slide${srcNum}\\.xml`, 'g'), `slide${ns}.xml`));

      let addCT = `<Override PartName="/ppt/slides/slide${ns}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
      if (srcNotesXml) addCT += `<Override PartName="/ppt/notesSlides/notesSlide${nn}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`;
      ctXml = ctXml.replace('</Types>', addCT + '</Types>');

      presRelsXml = presRelsXml.replace('</Relationships>',
        `<Relationship Id="${nr}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${ns}.xml"/></Relationships>`);

      order.splice(ins.pos + 1 + ci, 0, { slideFile: `slides/slide${ns}.xml`, rId: nr });
    }
  }

  // Build rId→id map from existing sldId entries (preserves original IDs, avoids picking up
  // slide master ID which exceeds the OOXML ST_SlideId max of 2147483647).
  const existingSldIds = {};
  let sm2;
  const sldIdScan = /<p:sldId\b[^>]+>/g;
  while ((sm2 = sldIdScan.exec(presXml)) !== null) {
    const im = sm2[0].match(/\bid="(\d+)"/), rm = sm2[0].match(/r:id="(rId\d+)"/);
    if (im && rm) existingSldIds[rm[1]] = parseInt(im[1]);
  }
  let maxId = Math.max(256, ...Object.values(existingSldIds));
  let newLst = '<p:sldIdLst>';
  order.forEach(e => {
    const id = existingSldIds[e.rId] !== undefined ? existingSldIds[e.rId] : ++maxId;
    newLst += `<p:sldId id="${id}" r:id="${e.rId}"/>`;
  });
  newLst += '</p:sldIdLst>';
  presXml = presXml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, newLst);

  zip.file('ppt/presentation.xml',            presXml);
  zip.file('ppt/_rels/presentation.xml.rels', presRelsXml);
  zip.file('[Content_Types].xml',             ctXml);

  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

// ── capacity model ────────────────────────────────────────────────────────
//  Measured in inches, not in "lines". The previous line-counting model
//  ignored two things the generator actually writes onto the slide:
//    · lineSpacingMultiple 1.2 — it assumed 1.15, and PowerPoint applies
//      the multiple on top of Arial's own ~1.15 line box, so the real line
//      pitch is ≈1.38 × font size.
//    · paraSpaceAfter 6pt after EVERY paragraph — 0.83" on a ten-bullet
//      slide at 18pt, a fifth of the whole text box.
//  Both under-counted height, so text ran off the bottom of the slide.
const PAD    = 0.55;             // left / right / BOTTOM margin in inches
const TEXT_W = 10 - PAD * 2;     // 8.9"

// Text box height for a layout, leaving a full PAD of bottom margin.
// The generator and the capacity model MUST both call this — never a literal,
// or the two drift apart and text overflows again.
function textBoxHeight(layout) {
  const dim = SLIDE_DIMS[layout] || SLIDE_DIMS.LAYOUT_16x9;
  return dim.h - PAD * 1.5 - PAD;
}

const ARIAL_CW      = 0.52;   // Arial average char width factor (× fontSize / 72)
const LINE_PITCH    = 1.38;   // lineSpacingMultiple 1.2 × Arial line box ≈ 1.15
const PARA_SPACE_PT = 6;      // paraSpaceAfter the generator writes per paragraph
const BULLET_INDENT = 0.375;  // inches of indent per level (marL 342900 EMU)
const FILL_SAFETY   = 0.95;   // 5% headroom for within-Arial glyph variance

// Unicode bullet code points per indent level — used with PptxGenJS native bullet property.
// Native bullets give correct hanging indents (wrapped lines align under text, not bullet).
const BULLET_CODES = ['2022', '25E6', '2013'];  // • ◦ –

// Height in inches one paragraph occupies, including its space-after.
// Accounts for the bullet indent stealing width, and for hard line breaks
// (Shift+Enter) each starting a new line regardless of width.
function paraHeight(para, fontSize) {
  const r         = stripLeadingBullet(para.text);
  const useBullet = r.hadBullet || para.level > 0;
  const lvl       = Math.min(para.level, BULLET_CODES.length - 1);
  const usableW   = TEXT_W - (useBullet ? BULLET_INDENT * (lvl + 1) : 0);
  const charW     = ARIAL_CW * fontSize / 72;
  let lines = 0;
  for (const seg of r.stripped.split('\n')) {
    lines += Math.max(1, Math.ceil(seg.length * charW / usableW));
  }
  return lines * (fontSize * LINE_PITCH / 72) + PARA_SPACE_PT / 72;
}

// The single source of truth for chunk counts — used by both the notes deck
// and the patched source, so the two can never disagree. Operates on
// {text,level}[] and keeps each bullet whole; never splits mid-word.
function splitParasIntoChunks(paras, fontSize, boxH) {
  const budget = (boxH || textBoxHeight('LAYOUT_16x9')) * FILL_SAFETY;

  // A single paragraph can be taller than the whole box (long bullet, large
  // font). Packing whole paragraphs cannot fix that, so oversized ones are
  // reflowed at word boundaries first — still never mid-word.
  const queue = [];
  for (const para of paras) {
    if (paraHeight(para, fontSize) > budget) queue.push(...reflowOversizedPara(para, fontSize, budget));
    else queue.push(para);
  }

  const chunks = [];
  let cur = [], used = 0;
  for (const para of queue) {
    const h = paraHeight(para, fontSize);
    if (used + h > budget && cur.length) { chunks.push(cur); cur = [para]; used = h; }
    else { cur.push(para); used += h; }
  }
  if (cur.length) chunks.push(cur);
  return chunks.length ? chunks : [paras];
}

// Break one over-tall paragraph into pieces that each fit the budget, cutting
// only at spaces. Every piece but the last ends in an ellipsis so the reader
// can see the thought continues. The author's bullet is kept on each piece,
// which is why a continued bullet reads as a new bullet — cosmetic, logged in
// BUGS.md. Hard line breaks inside an oversized paragraph are reflowed away.
function reflowOversizedPara(para, fontSize, budget) {
  const r         = stripLeadingBullet(para.text);
  const lvl       = Math.min(para.level, BULLET_CODES.length - 1);
  const useBullet = r.hadBullet || para.level > 0;
  const usableW   = TEXT_W - (useBullet ? BULLET_INDENT * (lvl + 1) : 0);
  const charW     = ARIAL_CW * fontSize / 72;
  const lineH     = fontSize * LINE_PITCH / 72;

  const perLine  = Math.max(8, Math.floor(usableW / charW));
  const linesFit = Math.max(1, Math.floor((budget - PARA_SPACE_PT / 72) / lineH));
  const maxChars = Math.max(perLine, perLine * linesFit) - 2;   // room for the ellipsis

  const words  = r.stripped.split(/\s+/).filter(Boolean);
  const pieces = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? cur + ' ' + w : w;
    if (candidate.length > maxChars && cur) { pieces.push(cur); cur = w; }
    else cur = candidate;
  }
  if (cur) pieces.push(cur);

  return pieces.map((text, i) => ({
    text: (r.hadBullet ? '- ' : '') + text + (i === pieces.length - 1 ? '' : '…'),
    level: para.level
  }));
}

function extractPlainText(xml) {
  const runs = [], re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g; let m;
  while ((m = re.exec(xml)) !== null) runs.push(decodeXmlEntities(m[1]));
  return runs.join('');
}

function extractTitle(slideXml) {
  const m = slideXml.match(/<p:sp>(?:(?!<p:sp>)[\s\S])*?<p:ph[^>]*type="(?:title|ctrTitle)"[^>]*\/>[\s\S]*?<\/p:sp>/);
  if (m) { const t = extractPlainText(m[0]).trim(); if (t) return t; }
  return '';
}

function extractNotesPath(relsXml) {
  const re = /<Relationship[^>]+>/g; let m;
  while ((m = re.exec(relsXml)) !== null) {
    if (m[0].indexOf('notesSlide') !== -1) { const t = m[0].match(/Target="([^"]+)"/); if (t) return t[1]; }
  }
  return null;
}

function extractNotesParas(notesXml) {
  const parts = notesXml.split('<p:sp>');
  if (parts.length < 3) return [];
  const body = parts[2];

  function splitParagraphs(xml) {
    const paras = []; let pos = 0;
    while (pos < xml.length) {
      const start = xml.indexOf('<a:p', pos);
      if (start === -1) break;
      const after = xml[start + 4];
      if (after !== '>' && after !== ' ' && after !== '\t' && after !== '\r' && after !== '\n') { pos = start + 4; continue; }
      let depth = 1, search = start + 4;
      outer: while (depth > 0 && search < xml.length) {
        let no = xml.indexOf('<a:p', search);
        const nc = xml.indexOf('</a:p>', search);
        if (no !== -1) { const c = xml[no+4]; if (c!=='>'&&c!==' '&&c!=='\t'&&c!=='\r'&&c!=='\n') no = -1; }
        if (no !== -1 && (nc === -1 || no < nc)) { depth++; search = no + 4; }
        else if (nc !== -1) { depth--; if (!depth) { paras.push(xml.slice(start, nc+6)); pos = nc+6; break outer; } search = nc+6; }
        else { pos = start + 4; break outer; }
      }
    }
    return paras;
  }

  function stripPpr(px) {
    const s = px.indexOf('<a:pPr'); if (s === -1) return px;
    const te = px.indexOf('>', s);
    if (te !== -1 && px[te-1] === '/') return px.slice(0,s) + px.slice(te+1);
    const cl = px.indexOf('</a:pPr>', s);
    return cl !== -1 ? px.slice(0,s) + px.slice(cl+8) : px;
  }

  const result = [];
  for (const paraXml of splitParagraphs(body)) {
    if (paraXml.indexOf('type="slidenum"') !== -1) continue;
    const lvlM  = paraXml.match(/<a:pPr[^>]*lvl="(\d+)"/);
    const level = lvlM ? parseInt(lvlM[1]) : 0;
    const inner = stripPpr(paraXml);
    let text = '', pos = 0;
    while (pos < inner.length) {
      const nt = inner.indexOf('<', pos); if (nt === -1) break;
      if (inner.substr(nt,4) === '<a:t') {
        const te = inner.indexOf('>', nt), ct = inner.indexOf('</a:t>', te !== -1 ? te : nt);
        if (te !== -1 && ct !== -1) { text += decodeXmlEntities(inner.slice(te+1,ct)); pos = ct+6; continue; }
      }
      if (inner.substr(nt,5) === '<a:br') { text += '\n'; const be = inner.indexOf('>', nt); pos = be !== -1 ? be+1 : nt+5; continue; }
      pos = nt + 1;
    }
    text = text.replace(/\xa0/g,' ').replace(/ /g,' ').trim();
    result.push({ text, level });
  }
  while (result.length && !result[0].text)                result.shift();
  while (result.length && !result[result.length-1].text)  result.pop();
  return result;
}

const BULLET_SYMBOLS = ['• ','◦ ','– '];  // preview symbols match teleprompter output

function stripLeadingBullet(text) {
  let any = false;
  const lines = text.split('\n').map(l => {
    // Strips: - * • – — > and . or o when followed by whitespace
    const m = l.match(/^([-*•–—>]|\.(?=\s)|o(?=\s))\s*/);
    if (m) { any = true; return l.slice(m[0].length); }
    return l;
  });
  return { stripped: lines.join('\n'), hadBullet: any };
}

function parasToString(paras) {
  return paras.filter(p => p.text.trim()).map(p => {
    const r   = stripLeadingBullet(p.text);
    const sym = BULLET_SYMBOLS[Math.min(p.level, BULLET_SYMBOLS.length - 1)];
    return (r.hadBullet || p.level > 0) ? '  '.repeat(p.level) + sym + r.stripped : p.text;
  }).join('\n');
}

function decodeXmlEntities(s) {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
          .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
          .replace(/&#xA;/g,'\n').replace(/&#x0D;/g,'');
}

function highestNumber(keys, re) {
  let max = 0; keys.forEach(k => { const m = k.match(re); if(m){const n=parseInt(m[1]);if(n>max)max=n;} }); return max;
}
function highestRid(xml) {
  let max = 0, m; const re = /Id="rId(\d+)"/g;
  while ((m = re.exec(xml)) !== null) { const n = parseInt(m[1]); if(n>max) max=n; } return max;
}
function ts() { return new Date().toTimeString().slice(0,8); }
