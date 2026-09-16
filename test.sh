#!/bin/bash
#
# Checks the WebAssembly build against the native binaries from the
# dicom3tools pip wheel, which is the reference this is meant to reproduce.
#
#   pip install dicom3tools
#   ./test.sh /path/to/dicom/files
#
# Tools that mint fresh UIDs and timestamps on every run (dcsmpte, dcmulti,
# dcdirmk, dcuidchg) are not byte-comparable even against themselves, so they
# are not covered here; compare those structurally with dcdump instead.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="${1:-}"
EMSDK_IMAGE="${EMSDK_IMAGE:-emscripten/emsdk:3.1.74}"
TOOLS="${TOOLS:-dciodvfy dcdump dcfile dcinfo dcsrdump dccidump dcdirdmp dcstats dchist dckey}"

if [ -z "$DATA" ] || [ ! -d "$DATA" ]; then
  echo "usage: $0 <directory of DICOM files>" >&2
  exit 2
fi

BIN="$(python3 -c 'import dicom3tools; print(dicom3tools.bin_dir())' 2>/dev/null || true)"
if [ -z "$BIN" ]; then
  echo "dicom3tools is not installed; run: pip install dicom3tools" >&2
  exit 2
fi

RUNNER="$(mktemp -d)/runner.js"
cat > "$RUNNER" <<'EOF'
const createDicom3tools = require('/app/dicom3tools.js');
const fs = require('fs');
const [, , tool, ...args] = process.argv;
(async () => {
  const out = [], err = [];
  const m = await createDicom3tools({
    noInitialRun: true,
    preRun: [(mod) => mod.FS.init(null,
      (c) => { if (c !== null) out.push(c); },
      (c) => { if (c !== null) err.push(c); })],
  });
  m.FS.mkdir('/work'); m.FS.chdir('/work');
  for (const f of fs.readdirSync('/data')) {
    m.FS.writeFile('/work/' + f, new Uint8Array(fs.readFileSync('/data/' + f)));
  }
  try { m.callMain([tool, ...args]); } catch (e) {}
  process.stdout.write(Buffer.concat([Buffer.from(err), Buffer.from(out)]));
})();
EOF

pass=0; fail=0
for tool in $TOOLS; do
  for path in "$DATA"/*; do
    [ -f "$path" ] || continue
    name="$(basename "$path")"
    native="$(cd "$DATA" && "$BIN/$tool" "$name" 2>&1)"
    wasm="$(docker run --rm \
      -v "$HERE/public:/app" -v "$DATA:/data" -v "$(dirname "$RUNNER"):/r" \
      "$EMSDK_IMAGE" node /r/runner.js "$tool" "$name" 2>/dev/null)"
    if [ "$native" = "$wasm" ]; then
      pass=$((pass + 1))
    else
      fail=$((fail + 1))
      echo "MISMATCH: $tool $name"
      diff <(echo "$native") <(echo "$wasm") | head -10
    fi
  done
done

echo "----------------------------------------"
echo "identical: $pass   mismatched: $fail"
[ "$fail" -eq 0 ]
