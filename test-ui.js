// Drives the real page scripts against a DOM and asserts the picker behaves.
//
//   npm install --no-save jsdom && node test-ui.js
//
// This exists because of a bug that shipped: `.picker-panel { display: flex }`
// outranks the browser default for `[hidden]`, so the dropdown rendered open
// on load and the attribute did nothing. Nothing in a syntax check catches
// that, and the same override silently broke .file-actions and .summary-bar
// too. The CSS assertions at the end guard specifically against it.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUBLIC = path.join(__dirname, 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');

let failures = 0;
function check(name, condition) {
  console.log((condition ? '  pass  ' : '  FAIL  ') + name);
  if (!condition) failures++;
}

const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
const d = w.document;

// Same order as the page loads them; one eval so top-level consts share scope
// the way separate <script> tags do in a browser.
w.eval(
  [read('build-info.js'), read('tools.js'), read('app.js')].join('\n') +
  // top-level const in an eval is scoped to that eval, so hand out what the
  // assertions below need to reach
  '\nwindow.__TOOLS = TOOLS;' +
  '\nwindow.__app = { els, renderResults, setResults: (r) => { lastResults = r; } };'
);

const panel = d.getElementById('tool-panel');
const list = d.getElementById('tool-list');
const search = d.getElementById('tool-search');
const rows = () => list.querySelectorAll('.opt').length;
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const key = (k) => search.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));

console.log('picker');
check('panel is closed on load', panel.hasAttribute('hidden'));
check('every tool is listed on load', rows() === w.__TOOLS.length);
check('trigger shows the selected tool', d.getElementById('tool-name').textContent === 'dciodvfy');
check('detail panel is populated on load', d.getElementById('tool-detail').textContent.includes('dciodvfy'));

click(d.getElementById('tool-trigger'));
check('clicking the trigger opens it', !panel.hasAttribute('hidden'));

search.value = 'compress';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
check('filter matches on description, not just name', list.querySelector('[data-id=dcdecmpr]') !== null);

search.value = '';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
key('ArrowDown');
key('ArrowDown');
const active = list.querySelector('.opt.active');
check('arrow keys move the active row', active !== null);
check('detail panel follows the keyboard',
  d.getElementById('tool-detail').querySelector('h3').textContent === active.dataset.id);

key('Enter');
check('Enter selects and closes', panel.hasAttribute('hidden'));

click(d.getElementById('tool-trigger'));
key('Escape');
check('Escape closes', panel.hasAttribute('hidden'));

click(d.getElementById('tool-trigger'));
click(list.querySelector('[data-id=dcdump]'));
check('clicking a row selects and closes',
  panel.hasAttribute('hidden') && d.getElementById('tool-name').textContent === 'dcdump');
check('options re-render for the newly selected tool',
  d.getElementById('options').innerHTML.includes('describe'));

console.log('version');
check('snapshot is shown in the page',
  /^\d{8,}$/.test(d.getElementById('build-snapshot').textContent.trim()));
check('snapshot matches VERSION.txt',
  fs.readFileSync(path.join(__dirname, 'VERSION.txt'), 'utf8')
    .includes(d.getElementById('build-snapshot').textContent.trim()));

console.log('catalog');
const TOOLS = w.__TOOLS;
check('every tool has a summary', TOOLS.every((t) => t.summary));
check('every tool has an example command', TOOLS.every((t) => t.example && t.example.cmd));
check('every example says whether it is real output',
  TOOLS.every((t) => typeof t.example.real === 'boolean'));

console.log('identifiers');
// Examples are captured by running the tools against real DICOM files, so it
// is easy to paste a patient id, accession number or study date into the
// repository without noticing. The shape of the output is the point; the real
// values add nothing. Anything identifier-shaped has to be replaced with an
// obviously synthetic value before it lands here.
const STANDARD_UID = /^1\.2\.840\.10008[\d.]*$/;      // DICOM standard root
const ALLOWED = new Set(['unknown^unknown', 'Anon^Patient']);

function suspectTokens(text) {
  const found = [];
  for (const token of text.split(/[\s<>()[\]="',|]+/).filter(Boolean)) {
    if (STANDARD_UID.test(token)) continue;
    if (ALLOWED.has(token)) continue;
    if (/^ANON\d+$|^ACC\d+$/.test(token)) continue;      // synthetic by construction
    if (/^\d{8}$/.test(token) && !/^20200101$/.test(token)) found.push(token + ' (date-shaped)');
    else if (/^\d{9,}$/.test(token)) found.push(token.slice(0, 12) + '... (long identifier)');
    else if (/^[A-Za-z]+\^[A-Za-z^]+$/.test(token)) found.push(token + ' (person-name-shaped)');
  }
  return found;
}

for (const tool of TOOLS) {
  const hits = suspectTokens(tool.example.cmd + ' ' + tool.example.out);
  check('no identifier-shaped values in ' + tool.id + (hits.length ? ': ' + hits.join(', ') : ''),
    hits.length === 0);
}

console.log('clearing');
// A dump holds everything the file held, so "Remove all" has to take the
// results with it, and the object URLs behind any produced files have to be
// released rather than left pinning those bytes in memory.
{
  const revoked = [];
  const realRevoke = w.URL.revokeObjectURL;
  w.URL.revokeObjectURL = (u) => { revoked.push(u); if (realRevoke) realRevoke.call(w.URL, u); };
  w.URL.createObjectURL = w.URL.createObjectURL || (() => 'blob:stub');

  // stand in a finished run, including a produced file to download
  w.__app.setResults([{
    label: 'a.dcm', lines: ['Error - something'], exitCode: 1,
    errors: 1, warnings: 0,
    produced: [{ name: 'a.raw', bytes: new w.ArrayBuffer(8) }],
  }]);
  w.__app.els.resultsSection.hidden = false;
  w.__app.renderResults();
  check('a finished run renders results', d.getElementById('results').children.length > 0);
  check('a produced file gets a download link', d.querySelectorAll('.download').length === 1);

  d.getElementById('clear-files').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  check('clearing files clears the results', d.getElementById('results').children.length === 0);
  check('clearing files hides the results section', d.getElementById('results-section').hasAttribute('hidden'));
  check('clearing files releases the object URLs', revoked.length > 0);
}

console.log('content policy');
{
  const html = read('index.html');
  const m = html.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/);
  check('a content policy is declared', !!m);
  const csp = m ? m[1] : '';
  check("only same-origin requests are allowed", /connect-src 'self'/.test(csp));
  check('no remote script origins are allowed', /script-src 'self' 'wasm-unsafe-eval'/.test(csp));
  check('wasm compilation is still permitted', /'wasm-unsafe-eval'/.test(csp));
  check('objects and form posts are denied', /object-src 'none'/.test(csp) && /form-action 'none'/.test(csp));
}

console.log('source link');
{
  const link = d.querySelector('.repo-link');
  check('a source link is present', !!link);
  check('it points at this repository',
    !!link && link.getAttribute('href') === 'https://github.com/ImagingDataCommons/dicom3tools-web-distributions');
  check('it opens safely in a new tab',
    !!link && link.getAttribute('target') === '_blank' && /noopener/.test(link.getAttribute('rel') || ''));
  // An externally hosted logo would be blocked by img-src 'self' data:.
  check('the icon is inline rather than fetched', !!link && !!link.querySelector('svg') && !link.querySelector('img'));
}

console.log('css');
const css = read('style.css');
check('[hidden] outranks any class that sets display',
  /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css));
for (const el of [...d.querySelectorAll('[hidden]')]) {
  const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const overriding = classes.filter((c) => new RegExp('\\.' + c + '\\s*\\{[^}]*display\\s*:').test(css));
  if (overriding.length) {
    check('#' + (el.id || '?') + ' hidden is not defeated by ' + overriding.join(', '),
      /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css));
  }
}

console.log(failures ? '\n' + failures + ' failing' : '\nall checks pass');
process.exit(failures ? 1 : 0);
