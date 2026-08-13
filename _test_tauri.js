// jsdom tests for the Tauri frontend copy.
//  - Mode A (browser): no __TAURI__ -> storage-bridge falls back to localStorage, demo seeds.
//  - Mode B (Tauri):   mock __TAURI__.core.invoke via beforeParse -> load/save route through commands.
//    We capture the full browser-seeded state, stamp it, and feed it back through the mock so the
//    bridge test proves load() used the invoke result (not a re-seed) with a complete, valid shape.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, 'frontend/index.html');
const html = fs.readFileSync(file, 'utf8');

let pass = 0, fail = 0;
const errs = [];
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS  ' + msg); } else { fail++; console.log('  FAIL  ' + msg); } }

function makeDom(beforeParse) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errs.push((e.message || '') + (e.detail ? ' :: ' + (e.detail.stack || e.detail) : '')));
  return new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/frontend/index.html', virtualConsole: vc, beforeParse });
}
const wait = (dom, ms) => new Promise(r => setTimeout(() => { dom.window.__done = true; r(); }, ms));

(async () => {
  // ---------- Mode A: browser (localStorage fallback) ----------
  console.log('[A] browser mode (no __TAURI__, localStorage fallback)');
  const domA = makeDom(w => { w.scrollTo = () => {}; });
  await wait(domA, 400);
  const wA = domA.window;
  ok(errs.length === 0, 'no jsdom/console errors during load+boot (' + errs.length + ')');
  ok(wA.S && Array.isArray(wA.S.records), 'global S is seeded state object');
  ok(wA.S.records.length >= 3, 'demo records seeded (got ' + wA.S.records.length + ')');
  ok(wA.S.records.every(r => typeof r.amount === 'number' && typeof r.date === 'string' && !!r.cat), 'records have expected shape');
  const ymd = wA.ymd(new Date());
  ok(wA.S.records.filter(r => r.date < ymd).length >= 1, 'demo contains >=1 overdue/past item');
  ok(wA.localStorage.getItem('wb_worker_ledger_v1') !== null, 'seed persisted to localStorage');
  const todo = wA.document.getElementById('todoBox');
  ok(todo && /今天要处理/.test(todo.innerHTML), '"今天要处理" area rendered');
  ok(wA.document.getElementById('p-home').classList.contains('on'), 'home view present and active');

  // Capture the full seeded state and stamp a marker to detect re-seed in Tauri mode.
  const seed = JSON.parse(wA.localStorage.getItem('wb_worker_ledger_v1'));
  seed.bridgeMarker = 'TAURI-LOAD';
  const cannedStr = JSON.stringify(seed);

  // ---------- Mode B: Tauri (mock invoke) ----------
  console.log('\n[B] tauri mode (mock __TAURI__.core.invoke)');
  const captured = [];
  const domB = makeDom(w => {
    w.scrollTo = () => {};
    w.__TAURI__ = { core: { invoke: (cmd, args) => { captured.push({ cmd, args }); if (cmd === 'ledger-load') return Promise.resolve(cannedStr); if (cmd === 'ledger-save') return Promise.resolve(true); if (cmd === 'ledger-export') return Promise.resolve('/fake/exports/x.json'); return Promise.resolve(null); } } };
  });
  await wait(domB, 400);
  const wB = domB.window;
  ok(captured.some(c => c.cmd === 'ledger-load'), 'load() invoked ledger-load command');
  ok(wB.S && wB.S.bridgeMarker === 'TAURI-LOAD', 'load() used invoke result (not a re-seed)');
  ok(wB.S.records.length === seed.records.length, 'load() kept the invoke record count (' + wB.S.records.length + ')');
  wB.save(wB.S);
  await wait(domB, 400);
  ok(captured.some(c => c.cmd === 'ledger-save' && typeof c.args.json === 'string'), 'save() invoked ledger-save command with json');
  ok(wB.localStorage.getItem('wb_worker_ledger_v1') === null, 'no localStorage write in Tauri mode (uses file commands)');

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { errs.forEach(e => console.log('  ERR: ' + e)); process.exit(1); }
  process.exit(0);
})();
