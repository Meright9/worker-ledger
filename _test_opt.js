// jsdom regression tests for the optimization pass (browser mode).
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
const wait = (dom, ms) => new Promise(r => setTimeout(() => r(), ms));

(async () => {
  console.log('[OPT] optimization regression (browser mode)');
  const dom = makeDom(w => { w.scrollTo = () => {}; });
  await wait(dom, 400);
  const w = dom.window;
  ok(errs.length === 0, 'no jsdom errors during boot (' + errs.length + ')');
  ok(w.S && Array.isArray(w.S.records), 'S seeded');

  // 1) migrate robustness: missing records/savings must not throw / must init arrays
  const bad = { profile: { net: 5000 } };
  let mOk = true, mRes = null;
  try { mRes = w.migrate(bad); } catch (e) { mOk = false; }
  ok(mOk, 'migrate() does not throw on object missing records/savings');
  ok(mRes && Array.isArray(mRes.records) && Array.isArray(mRes.savings), 'migrate inits records & savings arrays');
  ok(mRes && Array.isArray(mRes.fixed) && Array.isArray(mRes.accounts), 'migrate inits fixed & accounts arrays');

  // 2) mergeInto: keep existing, add new, no overwrite, fill missing
  const base = { records: [{ id: 'a', amount: 1 }], fixed: [], accounts: [], recurring: [], savings: [], challenges: [], fund: null, budgets: {}, settings: {} };
  const inc = { records: [{ id: 'a', amount: 9 }, { id: 'b', amount: 2 }], fixed: [{ id: 'f1' }], accounts: [], recurring: [], savings: [], challenges: [], fund: { target: 1 }, budgets: { total: 5 }, settings: { inflation: 3 } };
  w.mergeInto(base, inc);
  ok(base.records.length === 2, 'mergeInto keeps existing + adds new (got ' + base.records.length + ')');
  ok(base.records.find(r => r.id === 'a').amount === 1, 'mergeInto does not overwrite existing record');
  ok(base.fund && base.fund.target === 1, 'mergeInto fills missing fund');

  // 3) search filter (keyword + amount range)
  w.S.records.push({ id: 'x9', date: w.ymd(new Date()), type: 'expense', amount: 88, cat: '咖啡', note: '拿铁测试ZZ', bucket: '想要', account: '', sub: '' });
  const setF = (kw, mn, mx) => { w.document.getElementById('fKw').value = kw || ''; w.document.getElementById('fMin').value = mn || ''; w.document.getElementById('fMax').value = mx || ''; w.document.getElementById('fMonth').value = ''; w.document.getElementById('fCat').value = ''; };
  setF('拿铁测试ZZ');
  w.renderAdd();
  let all = Array.from(w.document.getElementById('allRec').children);
  let matched = all.filter(d => /拿铁测试ZZ/.test(d.textContent));
  ok(matched.length === 1, 'keyword filter shows only the matching record (got ' + matched.length + ')');
  setF('', '100');
  w.renderAdd();
  matched = Array.from(w.document.getElementById('allRec').children).filter(d => /拿铁测试ZZ/.test(d.textContent));
  ok(matched.length === 0, 'amount-min filter hides the 88-yuan record');
  setF('', '', '');
  w.renderAdd();

  // 4) recurring pause vs active
  const before = w.S.records.length;
  w.S.recurring.push({ id: 'skip1', name: '暂停规则', day: 15, type: 'expense', amount: 10, cat: '其他', skip: true, bucket: '必要', account: '' });
  w.genRecurring();
  ok(w.S.records.filter(r => r._rec === 'skip1').length === 0, 'paused recurring rule does not generate a record');
  w.S.recurring.push({ id: 'run1', name: '运行规则', day: 15, type: 'expense', amount: 10, cat: '其他', bucket: '必要', account: '' });
  w.genRecurring();
  ok(w.S.records.filter(r => r._rec === 'run1').length === 1, 'active recurring rule generates a record');
  ok(typeof w.nextRecurDate({ day: 15 }).getMonth === 'function', 'nextRecurDate returns a Date');

  // 5) budget remaining summary
  w.S.budgets = { total: 1000, cats: {} };
  w.renderHome();
  const bud = w.document.getElementById('budList');
  ok(bud && /本月还可花/.test(bud.innerHTML), 'budget panel shows 本月还可花 summary');

  // 6) voice gating on desktop (Tauri) — in browser mode startVoice should still work path; just ensure fn exists
  ok(typeof w.startVoice === 'function', 'startVoice defined');

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
