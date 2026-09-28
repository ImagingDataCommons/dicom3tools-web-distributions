#!/bin/bash
#
# Builds dicom3tools to WebAssembly: one wasm binary containing every tool.
#
# Everything runs inside the emscripten/emsdk container, so the only
# requirement on the host is Docker.
#
#   ./build.sh
#
# The source is the upstream commit pinned in upstream.env, so a rebuild of the
# same pin compiles the same code. The output (public/dicom3tools.js,
# public/dicom3tools.wasm, public/build-info.js) is not committed: CI publishes
# it as a release, and fetch-wasm.sh downloads a published one.
#
# Two things about the upstream build are worth knowing, because they are what
# make this short:
#
#   1. All of dicom3tools' code generation is awk driving template files. No
#      compiled host tool is run during the build, so there is no host/target
#      split to arrange - the compiler can simply be swapped for em++.
#   2. Each tool is a single .cc linked against three static libraries. Renaming
#      each tool's main() lets them all share one wasm, so the ~18MB of
#      dictionary and IOD tables is paid for once rather than per tool.
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=upstream.env
. "$HERE/upstream.env"
SRC_REPO="${SRC_REPO:-https://github.com/$UPSTREAM_REPO.git}"
EMSDK_IMAGE="${EMSDK_IMAGE:-emscripten/emsdk:3.1.74}"
WORK="$HERE/.build"

# Seven helpers are copy-pasted into several tools, so they collide when the
# tools share a binary. Renaming them per tool keeps each tool's own copy.
COLLIDING="dumpTransferSyntax dumpTransferSyntaxVR dumpTransferSyntaxUID \
dumpTransferSyntaxByteOrder dumpTransferSyntaxDescription \
dumpTransferSyntaxEncapsulation dumpTransferSyntaxPixelByteOrder"

mkdir -p "$WORK"

# Reuse an existing checkout only if it is the pinned commit; anything else
# would build different source from what upstream.env claims.
if [ -d "$WORK/src" ] && [ "$(git -C "$WORK/src" rev-parse HEAD 2>/dev/null)" != "$UPSTREAM_COMMIT" ]; then
  echo "Discarding checkout of a different commit"
  rm -rf "$WORK/src"
fi
if [ ! -d "$WORK/src" ]; then
  echo "Fetching dicom3tools $UPSTREAM_COMMIT"
  git init -q "$WORK/src"
  git -C "$WORK/src" fetch -q --depth 1 "$SRC_REPO" "$UPSTREAM_COMMIT"
  git -C "$WORK/src" checkout -q FETCH_HEAD
fi
if [ "$(cat "$WORK/src/VERSION.txt")" != "$UPSTREAM_ARCHIVE" ]; then
  echo "upstream.env says $UPSTREAM_ARCHIVE, but $UPSTREAM_COMMIT has $(cat "$WORK/src/VERSION.txt")" >&2
  exit 1
fi

cat > "$WORK/tools.txt" <<'EOF'
dciodvfy
dcentvfy
dcdump
dcfile
dcinfo
dckey
dcdict
dcsrdump
dccidump
dcdirdmp
dcstats
dchist
dccp
dcuidchg
dcsort
dcmulti
dcdirmk
dcdecmpr
dctoraw
rawtodc
dctopnm
dcsmpte
EOF

sed 's/^/TOOL(/;s/$/)/' "$WORK/tools.txt" > "$WORK/toollist.h"
cp "$HERE/dispatch.cc" "$WORK/dispatch.cc"

docker run --rm \
  -v "$WORK:/work" \
  -v "$HERE:/out" \
  "$EMSDK_IMAGE" bash -c '
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
# netpbm is needed: dcsmpte renders its label text with pbmtext at build time,
# and without it smptetxt.h is generated empty and dcsmpte will not compile.
apt-get install -y -qq xutils-dev gawk netpbm >/dev/null

cd /work/src

echo "==> configuring"
./Configure >/dev/null
# UIDs are minted under the QIICR root (1.3.6.1.4.1.43046.3, as in dcmqi
# QIICRUIDs.h) rather than the 0.0.0.0 placeholder in config/site.p-def, which
# dciodvfy rejects. Same values as the upstream package builds, passed on the
# command line as they are there because the upstream sync replaces config/.
# check-build.js fails if they do not reach the binary, since a misspelt -D
# name is silently ignored.
imake -I./config -DInstallInTopDir \
  -DDefaultUIDRoot=1.3.6.1.4.1.43046.3.1.5 \
  -DDefaultImplementationClassUID=1.3.6.1.4.1.43046.3.0.2 \
  -DDefaultInstanceCreatorUID=1.3.6.1.4.1.43046.3.0.3

# First pass with the host compiler. Its object files are thrown away; what is
# wanted is the awk-generated headers and tables, which are compiler
# independent. -k because some targets (X11-dependent ones) are expected to
# fail and are not needed here.
echo "==> generating headers"
make -k World >/dev/null 2>&1 || true

echo "==> rebuilding libraries with em++"
find . -name "*.o" -delete
find . -name "*.a" -delete
rm -f libsrc/lib/lib*
cd libsrc
make -k CC=emcc CCC=em++ AR="emar rcv" RANLIB=emranlib STRIP=: >/dev/null 2>&1 || true
ls lib/libdctl.a lib/libdlcl.a lib/libgener.a >/dev/null

echo "==> compiling tools"
cd /work/src/appsrc/dcfile
OBJS=""
while read -r t; do
  DEFS="-Dmain=${t}_main"
  for c in '"$COLLIDING"'; do DEFS="$DEFS -D${c}=${t}_${c}"; done
  rm -f "$t.o"
  make "$t.o" CCC="em++ $DEFS" >/dev/null 2>&1
  OBJS="$OBJS $t.o"
done < /work/tools.txt

cp /work/dispatch.cc /work/toollist.h .
em++ -c -I. -O2 dispatch.cc -o dispatch.o

echo "==> linking"
# EXIT_RUNTIME=1 matters: most file-producing tools write their output to
# stdout, and without the exit handlers the final buffer is never flushed,
# silently truncating the result.
em++ -O2 dispatch.o $OBJS \
  -L/work/src/libsrc/lib -ldctl -ldlcl -lgener \
  -o /out/public/dicom3tools.js \
  -sMODULARIZE=1 -sEXPORT_NAME=createDicom3tools \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 \
  -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 \
  -sENVIRONMENT=web,worker,node -sSTACK_SIZE=5MB
'

echo "==> recording build info"
SNAPSHOT_ARCHIVE="$(cat "$WORK/src/VERSION.txt")"
SNAPSHOT_ID="$(printf %s "$SNAPSHOT_ARCHIVE" | sed -E 's/.*snapshot\.([0-9]+)\.tar.*/\1/')"
cat > "$HERE/public/build-info.js" <<EOF
// Generated by build.sh. Describes the binary in this directory.
//
// dicom3tools behaviour changes between snapshots - what a given release
// treats as an error, a warning, or says nothing about is not stable - so the
// snapshot the wasm was built from is shown in the page rather than left to
// the repository.

const BUILD_INFO = {
  // Upstream snapshot the programs were compiled from.
  dicom3toolsSnapshot: '$SNAPSHOT_ID',
  dicom3toolsArchive: '$SNAPSHOT_ARCHIVE',
  upstreamCommit: '$UPSTREAM_COMMIT',
  emscripten: '$(printf %s "$EMSDK_IMAGE" | sed 's/.*://')',
  built: '$(date -u +%Y-%m-%d)',
  // Programs compiled into the wasm. check-build.js compares this with the
  // catalog in tools.js, since a listed tool that is missing from the binary
  // fails only when someone picks it.
  tools: [$(sed "s/.*/'&'/" "$WORK/tools.txt" | paste -sd, - | sed 's/,/, /g')],
};
EOF

echo
echo "Built:"
ls -la "$HERE/public/dicom3tools.js" "$HERE/public/dicom3tools.wasm" "$HERE/public/build-info.js"
echo "dicom3tools snapshot: $SNAPSHOT_ID"
