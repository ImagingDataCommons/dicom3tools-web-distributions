// Checks the wasm assets in public/ before they are released or deployed.
//
//   node check-build.js          assets are well formed and the tools run
//   node check-build.js --pin    ...and were built from the source upstream.env pins
//
// The assets are not committed, so this runs wherever they appear: after
// build.sh in the build workflow (with --pin), and after fetch-wasm.sh in the
// deploy (without it, since a pin bump can land before its release is
// published and the deploy then correctly serves the previous release).

const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, 'public');
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8');

let failures = 0;
function check(name, condition, detail) {
  console.log((condition ? '  pass  ' : '  FAIL  ') + name + (condition || !detail ? '' : ': ' + detail));
  if (!condition) failures++;
}

console.log('assets');
const wasm = fs.readFileSync(path.join(PUBLIC, 'dicom3tools.wasm'));
check('wasm starts with the wasm magic number', wasm.subarray(0, 4).equals(Buffer.from([0, 0x61, 0x73, 0x6d])));
console.log('        wasm size: ' + (wasm.length / 1048576).toFixed(1) + ' MB');

const BUILD_INFO = new Function(read('build-info.js') + ';return BUILD_INFO;')();
const TOOLS = new Function(read('tools.js') + ';return TOOLS;')();
check('build-info names a snapshot', /^\d{8,}$/.test(BUILD_INFO.dicom3toolsSnapshot));

// dccmp and dcdiff are composed in JS from the other tools, so they are not
// in the binary.
const compiled = new Set(BUILD_INFO.tools || []);
const missing = TOOLS.filter((t) => !t.composed && !compiled.has(t.id)).map((t) => t.id);
check('every catalog tool is compiled in', missing.length === 0, missing.join(' '));

if (process.argv.includes('--pin')) {
  console.log('pin');
  const pin = Object.fromEntries(
    fs.readFileSync(path.join(__dirname, 'upstream.env'), 'utf8')
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]])
  );
  check('built from the pinned snapshot', BUILD_INFO.dicom3toolsArchive === pin.UPSTREAM_ARCHIVE,
    BUILD_INFO.dicom3toolsArchive + ' vs ' + pin.UPSTREAM_ARCHIVE);
  check('built from the pinned commit', BUILD_INFO.upstreamCommit === pin.UPSTREAM_COMMIT,
    BUILD_INFO.upstreamCommit + ' vs ' + pin.UPSTREAM_COMMIT);
}

// One fresh module per run, as the page's worker does.
const createDicom3tools = require(path.join(PUBLIC, 'dicom3tools.js'));
async function run(args, files = {}) {
  const lines = [];
  const m = await createDicom3tools({
    noInitialRun: true,
    print: (s) => lines.push(s),
    printErr: (s) => lines.push(s),
  });
  m.FS.mkdir('/work');
  m.FS.chdir('/work');
  for (const [name, bytes] of Object.entries(files)) m.FS.writeFile(name, bytes);
  let status = 0;
  try {
    status = m.callMain(args);
  } catch (e) {
    // EXIT_RUNTIME ends every run by throwing ExitStatus
    status = e.status === undefined ? -1 : e.status;
  }
  const out = {};
  for (const name of m.FS.readdir('/work')) {
    if (name !== '.' && name !== '..') out[name] = m.FS.readFile(name);
  }
  return { status, output: lines.join('\n'), files: out };
}

// Generating a file and validating it exercises the dictionary, the IOD tables
// and file output without needing any test data. The result is not expected
// to validate cleanly (dcsmpte leaves some Type 2 attributes empty); what
// matters is that dciodvfy recognises what it was given.
(async () => {
  console.log('smoke test');
  const made = await run(['dcsmpte', 'smpte.dcm']);
  const file = made.files['smpte.dcm'];
  check('dcsmpte writes a DICOM file',
    made.status === 0 && file && Buffer.from(file.subarray(128, 132)).toString() === 'DICM',
    'exit ' + made.status + ' ' + made.output.slice(0, 200));

  if (file) {
    // build.sh passes these to imake; a misspelt -D name is ignored silently
    // and leaves the 0.0.0.0 placeholder, which dciodvfy rejects.
    const text = Buffer.from(file).toString('latin1');
    const uids = {
      'UID root': '1.3.6.1.4.1.43046.3.1.5.',
      'implementation class UID': '1.3.6.1.4.1.43046.3.0.2',
      'instance creator UID': '1.3.6.1.4.1.43046.3.0.3',
    };
    for (const [what, uid] of Object.entries(uids)) {
      check('generated file uses the QIICR ' + what, text.includes(uid));
    }

    const verified = await run(['dciodvfy', 'smpte.dcm'], { 'smpte.dcm': file });
    check('dciodvfy identifies it as SCImage', /^SCImage$/m.test(verified.output), verified.output.slice(0, 200));
    check('dciodvfy accepts its UID roots', !/Illegal root for UID/.test(verified.output),
      verified.output.split('\n').find((l) => /Illegal root for UID/.test(l)));
  }

  // Each tool's exit sets process.exitCode; only the checks decide it.
  process.exitCode = failures ? 1 : 0;
  console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
})();
