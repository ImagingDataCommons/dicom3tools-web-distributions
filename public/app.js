/* global TOOLS, TOOLS_BY_ID, GROUPS, OPTION_INPUT */

const els = {
  toolTrigger: document.getElementById('tool-trigger'),
  toolPanel: document.getElementById('tool-panel'),
  toolSearch: document.getElementById('tool-search'),
  toolList: document.getElementById('tool-list'),
  toolDetail: document.getElementById('tool-detail'),
  toolName: document.getElementById('tool-name'),
  toolSummary: document.getElementById('tool-summary'),
  options: document.getElementById('options'),
  extraArgs: document.getElementById('extra-args'),
  extraHint: document.getElementById('extra-hint'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  filelist: document.getElementById('filelist'),
  fileActions: document.getElementById('file-actions'),
  fileCount: document.getElementById('file-count'),
  clearFiles: document.getElementById('clear-files'),
  run: document.getElementById('run'),
  status: document.getElementById('status'),
  resultsSection: document.getElementById('results-section'),
  results: document.getElementById('results'),
  summary: document.getElementById('summary'),
  onlyProblems: document.getElementById('only-problems'),
  copyAll: document.getElementById('copy-all'),
};

let files = [];
let lastResults = [];

/* ---------- worker pool ---------- */

const POOL_SIZE = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
const pool = [];
let nextJobId = 0;

function acquireWorker() {
  const free = pool.find((w) => !w.busy);
  if (free) return free;
  if (pool.length < POOL_SIZE) {
    const entry = { worker: new Worker('worker.js'), busy: false };
    pool.push(entry);
    return entry;
  }
  return null;
}

function runInWorker(message) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const entry = acquireWorker();
      if (!entry) {
        setTimeout(attempt, 20);
        return;
      }
      entry.busy = true;
      const id = ++nextJobId;
      const onMessage = (event) => {
        if (event.data.id !== id) return;
        entry.worker.removeEventListener('message', onMessage);
        entry.worker.removeEventListener('error', onError);
        entry.busy = false;
        resolve(event.data);
      };
      const onError = (err) => {
        entry.worker.removeEventListener('message', onMessage);
        entry.worker.removeEventListener('error', onError);
        entry.busy = false;
        reject(new Error(err.message || 'worker failed'));
      };
      entry.worker.addEventListener('message', onMessage);
      entry.worker.addEventListener('error', onError);
      entry.worker.postMessage({ id, ...message });
    };
    attempt();
  });
}

/* ---------- tool picker ----------
 *
 * A listbox with each tool's description on the row, and a panel alongside
 * showing what that tool actually prints. The panel is what makes dcfile,
 * dcinfo and dcdump tellable apart, so it tracks the keyboard as well as the
 * pointer rather than being a hover-only flourish.
 */

let selectedToolId = 'dciodvfy';
let activeToolId = 'dciodvfy'; // the row the detail panel is describing
let visibleTools = TOOLS.slice();

function currentTool() {
  return TOOLS_BY_ID[selectedToolId];
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderToolDetail() {
  const tool = TOOLS_BY_ID[activeToolId];
  const example = tool.example || { cmd: tool.id, real: false, out: '' };
  els.toolDetail.innerHTML =
    '<h3>' + tool.id + '</h3>' +
    '<p class="detail-desc">' + escapeHtml(tool.summary) + '</p>' +
    '<div><p class="field-label">Command</p>' +
    '<pre class="cmd">' + escapeHtml(example.cmd) + '</pre></div>' +
    '<div><p class="field-label">' + (example.real ? 'Output' : 'What you get') +
    (example.real ? '<span class="real-badge">actual</span>' : '') + '</p>' +
    '<pre>' + escapeHtml(example.out) + '</pre></div>' +
    (example.real ? '' : '<p class="detail-note">No captured sample for this one yet.</p>');
}

function renderToolList() {
  const query = els.toolSearch.value.trim().toLowerCase();
  visibleTools = TOOLS.filter(
    (t) => !query || (t.id + ' ' + t.summary).toLowerCase().includes(query)
  );

  if (!visibleTools.length) {
    els.toolList.innerHTML = '<p class="empty">Nothing matches that.</p>';
    return;
  }
  if (!visibleTools.some((t) => t.id === activeToolId)) {
    activeToolId = visibleTools[0].id;
    renderToolDetail();
  }

  let html = '';
  for (const group of GROUPS) {
    const inGroup = visibleTools.filter((t) => t.group === group);
    if (!inGroup.length) continue;
    html += '<div class="grp">' + group + '</div>';
    for (const tool of inGroup) {
      html +=
        '<button type="button" class="opt' + (tool.id === activeToolId ? ' active' : '') +
        '" role="option" data-id="' + tool.id + '" aria-selected="' + (tool.id === selectedToolId) + '">' +
        '<span class="tick">' + (tool.id === selectedToolId ? '&#10003;' : '') + '</span>' +
        '<span><span class="opt-name">' + tool.id + '</span>' +
        '<span class="opt-desc">' + escapeHtml(tool.summary) + '</span></span></button>';
    }
  }
  els.toolList.innerHTML = html;
}

function setActiveTool(id) {
  // Only ever change on entering a new row, never on leaving one, so moving
  // the pointer diagonally towards the panel does not blank it.
  if (!id || id === activeToolId) return;
  activeToolId = id;
  for (const el of els.toolList.querySelectorAll('.opt')) {
    el.classList.toggle('active', el.dataset.id === activeToolId);
  }
  renderToolDetail();
}

function moveActiveTool(step) {
  const index = visibleTools.findIndex((t) => t.id === activeToolId);
  const next = visibleTools[Math.min(visibleTools.length - 1, Math.max(0, index + step))];
  if (!next) return;
  setActiveTool(next.id);
  const el = els.toolList.querySelector('.opt[data-id="' + next.id + '"]');
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}

function openToolPicker(open) {
  els.toolPanel.hidden = !open;
  els.toolTrigger.setAttribute('aria-expanded', String(open));
  if (open) {
    els.toolSearch.value = '';
    activeToolId = selectedToolId;
    renderToolList();
    renderToolDetail();
    els.toolSearch.focus();
  }
}

function selectTool(id) {
  selectedToolId = id;
  openToolPicker(false);
  els.toolTrigger.focus();
  renderOptions();
}

function renderOptions() {
  const tool = currentTool();
  els.toolName.textContent = tool.id;
  els.toolSummary.textContent = tool.summary;
  els.options.innerHTML = '';

  const addCheckbox = (flag, label, checked) => {
    const id = 'opt-' + flag.replace(/[^a-z0-9]/gi, '');
    const wrapper = document.createElement('label');
    wrapper.className = 'inline-check';
    wrapper.innerHTML =
      '<input type="checkbox" id="' + id + '" data-flag="' + flag + '"' + (checked ? ' checked' : '') + '> ' + label;
    els.options.appendChild(wrapper);
  };

  for (const option of tool.options || []) {
    addCheckbox(option.flag, option.label, option.default);
  }
  if (tool.arity !== 'none') {
    for (const option of OPTION_INPUT) addCheckbox(option.flag, option.label, false);
  }

  if (tool.profiles) {
    const wrapper = document.createElement('label');
    wrapper.className = 'inline-select';
    wrapper.innerHTML =
      'Profile <select id="profile">' +
      tool.profiles.map((p) => '<option value="' + p + '">' + (p || 'Default') + '</option>').join('') +
      '</select>';
    els.options.appendChild(wrapper);
  }

  els.extraHint.textContent = tool.freeformHint
    ? 'For example: ' + tool.freeformHint
    : 'Passed through verbatim, exactly as on the command line.';

  updateRunState();
}

function selectedFlags() {
  return Array.from(els.options.querySelectorAll('input[type=checkbox]:checked')).map((el) => el.dataset.flag);
}

function extraArgs() {
  const raw = els.extraArgs.value.trim();
  return raw ? raw.split(/\s+/) : [];
}

function commonArgs() {
  const args = selectedFlags();
  const profile = document.getElementById('profile');
  if (profile && profile.value) args.push('-profile', profile.value);
  return args.concat(extraArgs());
}

/* ---------- files ---------- */

function addFiles(list) {
  for (const file of list) {
    if (!files.some((f) => f.name === file.name && f.size === file.size)) files.push(file);
  }
  renderFiles();
}

function renderFiles() {
  els.filelist.innerHTML = '';
  for (const [index, file] of files.entries()) {
    const li = document.createElement('li');
    li.innerHTML =
      '<span class="fname"></span><span class="fsize">' +
      formatSize(file.size) +
      '</span><button type="button" class="link-button" data-index="' +
      index +
      '" aria-label="Remove file">Remove</button>';
    li.querySelector('.fname').textContent = file.name;
    els.filelist.appendChild(li);
  }
  els.fileActions.hidden = files.length === 0;
  els.fileCount.textContent = files.length + (files.length === 1 ? ' file' : ' files');
  updateRunState();
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function updateRunState() {
  const tool = currentTool();
  let ready;
  let hint = '';
  if (tool.arity === 'none') {
    ready = true;
  } else if (tool.arity === 'pair') {
    ready = files.length === 2;
    if (!ready) hint = tool.id + ' compares exactly two files (' + files.length + ' selected)';
  } else {
    ready = files.length > 0;
  }
  els.run.disabled = !ready;
  if (hint) els.status.textContent = hint;
  else if (els.status.dataset.sticky !== 'true') els.status.textContent = '';
}

/* ---------- running ---------- */

async function readFile(file) {
  return { name: file.name, bytes: await file.arrayBuffer() };
}

function buildArgs(tool, names) {
  const args = commonArgs();
  if (tool.outputVia === 'outdir') args.push('-outdir', 'out');
  const positional = names.slice();
  if (tool.outputVia === 'positional' && tool.outputName) {
    positional.push(tool.outputName(names[0]));
  }
  return args.concat(positional);
}

async function runTool() {
  const tool = currentTool();
  setBusy(true);
  els.results.innerHTML = '';
  els.resultsSection.hidden = false;
  lastResults = [];

  try {
    if (tool.composed) {
      lastResults = [await runComposed(tool)];
    } else if (tool.arity === 'none') {
      lastResults = [await runOne(tool, [], tool.id)];
    } else if (tool.arity === 'all') {
      const inputs = await Promise.all(files.map(readFile));
      lastResults = [await runOne(tool, inputs, files.map((f) => f.name).join(', '))];
    } else {
      const jobs = files.map(async (file) => {
        const input = await readFile(file);
        return runOne(tool, [input], file.name);
      });
      lastResults = await Promise.all(jobs);
    }
  } catch (err) {
    lastResults = [{ label: 'Error', lines: [String(err && err.message ? err.message : err)], errors: 1, warnings: 0, produced: [] }];
  }

  renderResults();
  setBusy(false);
}

async function runOne(tool, inputs, label) {
  const names = inputs.map((i) => i.name);
  const message = {
    tool: tool.id,
    args: buildArgs(tool, names),
    inputs,
    mkdirs: tool.outputVia === 'outdir' ? ['out'] : [],
  };
  const result = await runInWorker(message);
  return toResult(tool, label, names, result);
}

function decodeLines(buffer) {
  if (!buffer || buffer.byteLength === 0) return [];
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return text.replace(/\n$/, '').split('\n');
}

function toResult(tool, label, names, result) {
  const produced = (result.produced || []).slice();

  // Most file-producing tools write the file itself to stdout, so it must be
  // offered as a download rather than decoded as text.
  let lines;
  if (tool.output === 'file' && tool.outputVia === 'stdout') {
    lines = decodeLines(result.stderr);
    if (result.stdout.byteLength > 0) {
      produced.unshift({
        name: tool.outputName ? tool.outputName(names[0] || tool.id) : tool.id + '.out',
        bytes: result.stdout,
      });
    }
  } else {
    lines = decodeLines(result.stderr).concat(decodeLines(result.stdout));
  }

  return {
    label,
    lines,
    exitCode: result.exitCode,
    errors: lines.filter((l) => /^Error/.test(l)).length,
    warnings: lines.filter((l) => /^Warning/.test(l)).length,
    produced,
  };
}

/* dccmp and dcdiff are shell scripts upstream; reproduce them by chaining tools. */
async function runComposed(tool) {
  const [a, b] = await Promise.all(files.map(readFile));
  const label = a.name + ' vs ' + b.name;

  if (tool.id === 'dccmp') {
    // Upstream dccmp runs dctoraw on both files and compares the bytes.
    const [ra, rb] = await Promise.all([
      runInWorker({ tool: 'dctoraw', args: ['-ignoreoutofordertags', a.name], inputs: [a] }),
      runInWorker({ tool: 'dctoraw', args: ['-ignoreoutofordertags', b.name], inputs: [b] }),
    ]);
    if (!ra.stdout.byteLength || !rb.stdout.byteLength) {
      return { label, lines: ['Could not extract pixel data from both files.'], errors: 1, warnings: 0, produced: [] };
    }
    const lines = comparePixels(new Uint8Array(ra.stdout), new Uint8Array(rb.stdout));
    return { label, lines, errors: lines[0].startsWith('Pixel data differs') ? 1 : 0, warnings: 0, produced: [] };
  }

  // Upstream dcdiff runs dcdump on both files and diffs the text.
  const [da, db] = await Promise.all([
    runInWorker({ tool: 'dcdump', args: ['-ignoreoutofordertags', a.name], inputs: [a] }),
    runInWorker({ tool: 'dcdump', args: ['-ignoreoutofordertags', b.name], inputs: [b] }),
  ]);
  const lines = diffLines(
    decodeLines(da.stdout).concat(decodeLines(da.stderr)),
    decodeLines(db.stdout).concat(decodeLines(db.stderr))
  );
  return { label, lines, errors: 0, warnings: lines[0] === 'The two headers are identical.' ? 0 : 1, produced: [] };
}

function comparePixels(a, b) {
  if (a.length !== b.length) {
    return ['Pixel data differs in length: ' + a.length + ' bytes versus ' + b.length + ' bytes'];
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return ['Pixel data differs, first at byte ' + i];
  }
  return ['Pixel data is identical (' + a.length + ' bytes)'];
}

function diffLines(a, b) {
  // Longest common subsequence, adequate for header dumps.
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) out.push('< ' + a[i++]);
    else out.push('> ' + b[j++]);
  }
  while (i < n) out.push('< ' + a[i++]);
  while (j < m) out.push('> ' + b[j++]);
  return out.length ? out : ['The two headers are identical.'];
}

/* ---------- results ---------- */

function setBusy(busy) {
  els.run.disabled = busy;
  els.status.dataset.sticky = busy ? 'true' : 'false';
  els.status.textContent = busy ? 'Running...' : '';
  if (!busy) updateRunState();
}

function renderResults() {
  els.results.innerHTML = '';
  const onlyProblems = els.onlyProblems.checked;

  let withErrors = 0;
  let withWarnings = 0;
  for (const result of lastResults) {
    if (result.errors) withErrors++;
    else if (result.warnings) withWarnings++;
  }

  els.summary.hidden = false;
  els.summary.innerHTML =
    '<span class="chip chip-total">' + lastResults.length + ' run' + (lastResults.length === 1 ? '' : 's') + '</span>' +
    '<span class="chip chip-error">' + withErrors + ' with errors</span>' +
    '<span class="chip chip-warn">' + withWarnings + ' with warnings only</span>' +
    '<span class="chip chip-ok">' + (lastResults.length - withErrors - withWarnings) + ' clean</span>';

  for (const result of lastResults) {
    if (onlyProblems && !result.errors && !result.warnings) continue;
    els.results.appendChild(renderResult(result));
  }
}

function renderResult(result) {
  const card = document.createElement('details');
  card.className = 'result';
  card.open = lastResults.length <= 3 || result.errors > 0;
  if (result.errors) card.classList.add('has-error');
  else if (result.warnings) card.classList.add('has-warning');

  const status = result.errors
    ? result.errors + ' error' + (result.errors === 1 ? '' : 's')
    : result.warnings
      ? result.warnings + ' warning' + (result.warnings === 1 ? '' : 's')
      : 'clean';

  const summary = document.createElement('summary');
  summary.innerHTML = '<span class="rname"></span><span class="rstatus">' + status + '</span>';
  summary.querySelector('.rname').textContent = result.label;
  card.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'result-body';

  const pre = document.createElement('pre');
  pre.textContent = result.lines.length ? result.lines.join('\n') : '(no output)';
  body.appendChild(pre);

  if (result.produced && result.produced.length) {
    const downloads = document.createElement('div');
    downloads.className = 'downloads';
    for (const file of result.produced) {
      const blob = new Blob([file.bytes]);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file.name;
      link.className = 'download';
      link.textContent = 'Download ' + file.name + ' (' + formatSize(blob.size) + ')';
      downloads.appendChild(link);
    }
    body.appendChild(downloads);
  }

  card.appendChild(body);
  return card;
}

/* ---------- events ---------- */

/* The snapshot the wasm was built from. dicom3tools behaviour changes between
   releases, so a result is only meaningful against a known version. */
if (typeof BUILD_INFO !== 'undefined') {
  const snapshot = document.getElementById('build-snapshot');
  const extra = document.getElementById('build-extra');
  if (snapshot) {
    snapshot.textContent = BUILD_INFO.dicom3toolsSnapshot;
    snapshot.title = BUILD_INFO.dicom3toolsArchive;
  }
  if (extra) extra.textContent = ', built ' + BUILD_INFO.built;
}

els.toolTrigger.addEventListener('click', () => openToolPicker(els.toolPanel.hidden));
els.toolSearch.addEventListener('input', renderToolList);
els.toolSearch.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveActiveTool(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveActiveTool(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); selectTool(activeToolId); }
  else if (e.key === 'Escape') { openToolPicker(false); els.toolTrigger.focus(); }
});
els.toolList.addEventListener('pointermove', (e) => {
  const button = e.target.closest('.opt');
  if (button) setActiveTool(button.dataset.id);
});
els.toolList.addEventListener('click', (e) => {
  const button = e.target.closest('.opt');
  if (button) selectTool(button.dataset.id);
});
document.addEventListener('click', (e) => {
  if (els.toolPanel.hidden) return;
  if (!els.toolPanel.contains(e.target) && !els.toolTrigger.contains(e.target)) openToolPicker(false);
});

els.extraArgs.addEventListener('input', updateRunState);
els.run.addEventListener('click', runTool);
els.onlyProblems.addEventListener('change', renderResults);

els.dropzone.addEventListener('click', () => els.fileInput.click());
els.dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
});
els.fileInput.addEventListener('change', () => { addFiles(els.fileInput.files); els.fileInput.value = ''; });

for (const type of ['dragenter', 'dragover']) {
  els.dropzone.addEventListener(type, (e) => { e.preventDefault(); els.dropzone.classList.add('over'); });
}
for (const type of ['dragleave', 'drop']) {
  els.dropzone.addEventListener(type, (e) => { e.preventDefault(); els.dropzone.classList.remove('over'); });
}
els.dropzone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

els.filelist.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-index]');
  if (!button) return;
  files.splice(Number(button.dataset.index), 1);
  renderFiles();
});
els.clearFiles.addEventListener('click', () => { files = []; renderFiles(); });

els.copyAll.addEventListener('click', async () => {
  const text = lastResults.map((r) => '===== ' + r.label + ' =====\n' + r.lines.join('\n')).join('\n\n');
  try {
    await navigator.clipboard.writeText(text);
    els.copyAll.textContent = 'Copied';
    setTimeout(() => { els.copyAll.textContent = 'Copy all output'; }, 1500);
  } catch (err) {
    els.copyAll.textContent = 'Copy failed';
  }
});

renderOptions();
renderToolList();
renderToolDetail();
