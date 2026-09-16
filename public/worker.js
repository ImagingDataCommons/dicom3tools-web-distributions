// Runs dicom3tools programs, compiled to WebAssembly, entirely in the browser.
//
// The wasm is compiled once and re-instantiated for every run. These are
// command-line programs that expect to run once and exit, so each run gets a
// clean instance rather than a second call into main().
//
// stdout is captured as raw bytes rather than as text lines: most of the
// file-producing tools (dctoraw, dccp, dcmulti, dcdirmk, dcsmpte) write their
// output file to stdout, and decoding that as text would corrupt it.

importScripts('dicom3tools.js');

const WORKDIR = '/work';

let compiledPromise = null;

function compiledModule() {
  if (!compiledPromise) {
    compiledPromise = fetch('dicom3tools.wasm')
      .then((response) => {
        if (!response.ok) {
          throw new Error('could not load dicom3tools.wasm (HTTP ' + response.status + ')');
        }
        return response.arrayBuffer();
      })
      .then((bytes) => WebAssembly.compile(bytes));
  }
  return compiledPromise;
}

function listAllFiles(FS, dir, into) {
  for (const entry of FS.readdir(dir)) {
    if (entry === '.' || entry === '..') continue;
    const path = dir + '/' + entry;
    if (FS.isDir(FS.stat(path).mode)) listAllFiles(FS, path, into);
    else into.push(path);
  }
  return into;
}

async function run({ tool, args, inputs, mkdirs }) {
  const compiled = await compiledModule();
  const stdoutBytes = [];
  const stderrBytes = [];

  const instance = await createDicom3tools({
    noInitialRun: true,
    preRun: [
      (mod) => {
        mod.FS.init(
          null,
          (c) => { if (c !== null) stdoutBytes.push(c); },
          (c) => { if (c !== null) stderrBytes.push(c); }
        );
      },
    ],
    instantiateWasm(imports, onSuccess) {
      WebAssembly.instantiate(compiled, imports).then((inst) => onSuccess(inst, compiled));
      return {};
    },
  });

  const FS = instance.FS;
  FS.mkdir(WORKDIR);
  FS.chdir(WORKDIR);
  for (const dir of mkdirs || []) FS.mkdir(WORKDIR + '/' + dir);

  const before = new Set();
  for (const input of inputs) {
    const path = WORKDIR + '/' + input.name;
    FS.writeFile(path, new Uint8Array(input.bytes));
    before.add(path);
  }

  let exitCode = 0;
  try {
    exitCode = instance.callMain([tool].concat(args));
  } catch (err) {
    if (err && typeof err.status === 'number') {
      exitCode = err.status;
    } else {
      // Some tools abort on input they cannot handle - dcstats and dchist
      // assert on compressed pixel data, for instance. Whatever they managed
      // to report before dying is still worth showing, so record the abort
      // alongside that output rather than discarding both.
      const message = '\n' + (err && err.message ? err.message : String(err)) + '\n';
      for (const byte of new TextEncoder().encode(message)) stderrBytes.push(byte);
      exitCode = -1;
    }
  }

  // Anything in the working directory that was not an input is something the
  // tool produced. This catches tools like dcdirmk and dcuidchg without the
  // caller having to predict the filename.
  const produced = [];
  for (const path of listAllFiles(FS, WORKDIR, [])) {
    if (before.has(path)) continue;
    const bytes = FS.readFile(path);
    produced.push({ name: path.slice(WORKDIR.length + 1), bytes: bytes.buffer });
  }

  return {
    stdout: new Uint8Array(stdoutBytes).buffer,
    stderr: new Uint8Array(stderrBytes).buffer,
    exitCode: exitCode | 0,
    produced,
  };
}

self.onmessage = async (event) => {
  const { id } = event.data;
  try {
    const result = await run(event.data);
    const transfer = [result.stdout, result.stderr].concat(result.produced.map((f) => f.bytes));
    self.postMessage({ id, ok: true, ...result }, transfer);
  } catch (err) {
    const message = 'Could not run the tool: ' + (err && err.message ? err.message : String(err));
    self.postMessage({
      id,
      ok: false,
      stdout: new ArrayBuffer(0),
      stderr: new TextEncoder().encode(message).buffer,
      exitCode: -1,
      produced: [],
    });
  }
};
