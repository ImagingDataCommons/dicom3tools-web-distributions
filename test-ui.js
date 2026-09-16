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
  // top-level const in an eval is scoped to that eval, so hand the catalog out
  '\nwindow.__TOOLS = TOOLS;'
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
