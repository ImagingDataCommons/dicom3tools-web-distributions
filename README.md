# dicom3tools-web-distributions

David Clunie's [dicom3tools](https://www.dclunie.com/dicom3tools.html) compiled to
WebAssembly, served as a static page, so DICOM files can be validated and
inspected in a browser without installing the command line tools.

Files are read and processed inside the browser tab. Nothing is uploaded.

Published to GitHub Pages on every push to `main`:
**https://imagingdatacommons.github.io/dicom3tools-web-distributions/**

The page states which dicom3tools snapshot the binary was built from. This
matters: behaviour changes between releases, so what one snapshot reports as an
error another may not mention at all, and a finding is only meaningful against a
known version.

## What is included

24 tools, grouped as they appear in the page:

| Group | Tools |
| --- | --- |
| Validate | `dciodvfy`, `dcentvfy` |
| Inspect | `dcdump`, `dcfile`, `dcinfo`, `dcsrdump`, `dccidump`, `dcdirdmp`, `dckey`, `dcdict`, `dcstats`, `dchist` |
| Compare | `dccmp`, `dcdiff` |
| Convert | `dccp`, `dcdecmpr`, `dctoraw`, `dctopnm`, `dcuidchg`, `dcmulti`, `dcdirmk`, `dcsort`, `rawtodc`, `dcsmpte` |

22 of these are compiled programs sharing a single wasm binary, dispatched on
`argv`, so the roughly 18 MB of dictionary and IOD tables is paid for once
rather than per tool. The binary is 7.2 MB, about 1.1 MB over the wire once
compressed.

`dccmp` and `dcdiff` are shell scripts upstream, reimplemented in JavaScript by
chaining the other tools the same way the scripts do.

Two of the 26 programs the pip distribution ships are absent: `dcanon`, a
directory-tree anonymiser whose shell script chains several tools and keeps a
UID map across files, and `dcdisp`, which needs X11.

## Running it

The page needs to be served over HTTP. Opening `index.html` from the filesystem
does not work, because `file://` blocks web workers and wasm streaming.

```sh
cd public && python3 -m http.server 8000
```

## Building the wasm

Requires only Docker; everything else runs inside the Emscripten image.

```sh
./build.sh
```

Two things about the upstream build are worth knowing, since they are what keeps
this short:

- dicom3tools generates its headers and tables with awk rather than with
  compiled host tools, so there is no host/target split to arrange and the
  compiler can simply be swapped for `em++`.
- The link needs `EXIT_RUNTIME=1`. Most file-producing tools write their output
  to stdout, and without the exit handlers the final buffer is never flushed,
  silently truncating the result.

`netpbm` is a real build dependency: `dcsmpte` renders its label text with
`pbmtext` at build time, and without it `smptetxt.h` is generated empty and the
tool fails to compile.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and push to `main`:

- syntax checks every script,
- runs `test-ui.js`, which drives the real page scripts against a DOM and
  asserts the tool picker behaves,
- confirms the committed wasm is present and starts with the wasm magic number,
- confirms the snapshot in `public/build-info.js` matches `VERSION.txt`, so the
  page cannot claim a version it was not built from.

`.github/workflows/pages.yml` publishes `public/` to GitHub Pages on push to
`main`, and can be run by hand from the Actions tab. Nothing is compiled at
deploy time; the wasm is built by `build.sh` and committed, so a deploy is a
file copy.

`.github/workflows/watch-upstream.yml` runs weekly and compares the snapshot in
`VERSION.txt` against
[ImagingDataCommons/dicom3tools](https://github.com/ImagingDataCommons/dicom3tools),
the repository `build.sh` clones. If upstream has moved it opens an issue, one
per snapshot, explaining how to rebuild. It fails rather than reporting success
if the check itself cannot reach upstream, since a watcher that goes quiet on
error is worse than no watcher.

## Testing

`test.sh` compares the wasm build against the native binaries from the
`dicom3tools` wheel, which is the reference this is meant to reproduce.

```sh
pip install dicom3tools
./test.sh /path/to/dicom/files
```

The user interface has its own test, which needs no DICOM files and is what CI
runs:

```sh
npm install --no-save jsdom && node test-ui.js
```

The text-producing tools are expected to be byte identical. Tools that mint
fresh UIDs and timestamps on every run (`dcsmpte`, `dcmulti`, `dcdirmk`,
`dcuidchg`) are not byte comparable even against themselves, so they are not
covered; compare those structurally with `dcdump` instead.

Known upstream behaviour, not a porting defect: `dcstats` and `dchist` abort on
compressed pixel data, natively and in wasm alike.

## TODO

- The wasm is still built by hand. `build.sh` is run locally and the binary
  committed; CI only publishes it. The sibling
  [dicom3tools-python-distributions](https://github.com/ImagingDataCommons/dicom3tools-python-distributions)
  repository builds per upstream snapshot and pins artefacts by SHA256 rather
  than committing them, and this repository should follow that pattern before
  the history accumulates many 7 MB binaries.
- Rebuilding on a new upstream snapshot is still manual. `watch-upstream.yml`
  notices and opens an issue, but someone then runs `build.sh` and opens the
  pull request by hand.
- 11 of the 24 tools show a written description rather than captured output in
  the picker. Five produce text but need input the samples do not cover
  (`dcsrdump`, `dccidump`, `dcdirdmp`, `dccmp`, `dcsort` — a structured report,
  a DICOMDIR, a matched pair, a set worth sorting). Six produce files rather
  than text (`dccp`, `dcdecmpr`, `dcuidchg`, `dcmulti`, `dcdirmk`, `rawtodc`),
  so a useful sample needs something other than a few lines of output.
- `dcanon` is not implemented.

## Licence

The build tooling and web interface in this repository are under the Apache
License 2.0; see [LICENSE](LICENSE).

The dicom3tools programs compiled into `public/dicom3tools.wasm` are David
Clunie's work under his own BSD-style licence, reproduced in
[COPYRIGHT.dicom3tools](COPYRIGHT.dicom3tools). `VERSION.txt` names the upstream
snapshot the binary was built from.

Not for clinical use. This will not find every error.
