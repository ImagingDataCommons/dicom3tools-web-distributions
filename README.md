# dicom3tools-web-distributions

David Clunie's [dicom3tools](https://www.dclunie.com/dicom3tools.html) compiled to
WebAssembly, served as a static page, so DICOM files can be validated and
inspected in a browser without installing the command line tools.

Files are read and processed inside the browser tab. Nothing is uploaded.

Published to GitHub Pages whenever a release is published:
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

The wasm is not in the repository. Fetch the latest published build into
`public/` first, or build one (below):

```sh
./fetch-wasm.sh            # or ./fetch-wasm.sh <release tag>
```

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

It compiles the upstream commit pinned in `upstream.env`, not whatever
upstream's head happens to be, so the same pin always builds the same source.
The output (`public/dicom3tools.js`, `public/dicom3tools.wasm` and
`public/build-info.js`) is ignored by git.

Two things about the upstream build are worth knowing, since they are what keeps
this short:

- dicom3tools generates its headers and tables with awk rather than with
  compiled host tools, so there is no host/target split to arrange and the
  compiler can simply be swapped for `em++`.
- The link needs `EXIT_RUNTIME=1`. Most file-producing tools write their output
  to stdout, and without the exit handlers the final buffer is never flushed,
  silently truncating the result.

Tools that mint UIDs (`dcsmpte`, `dcuidchg`, `dcmulti`, `dcdirmk`, among
others) use the QIICR root `1.3.6.1.4.1.43046.3.1.5`, with implementation class
UID `1.3.6.1.4.1.43046.3.0.2` and instance creator UID
`1.3.6.1.4.1.43046.3.0.3`, the same values as the upstream package builds.
Upstream's own default is a `0.0.0.0` placeholder that `dciodvfy` rejects.

`netpbm` is a real build dependency: `dcsmpte` renders its label text with
`pbmtext` at build time, and without it `smptetxt.h` is generated empty and the
tool fails to compile.

## Updating dicom3tools and releasing

The wasm is published as release assets rather than committed, and a new
upstream version reaches the site in four steps, only the last of which is by
hand:

1. `.github/workflows/watch-upstream.yml` runs weekly. It compares the upstream
   commit pinned in `upstream.env` with the head of
   [ImagingDataCommons/dicom3tools](https://github.com/ImagingDataCommons/dicom3tools),
   the C++ source `build.sh` fetches. Changes limited to upstream's `.github/`
   and `README.md` are ignored, since they do not change what is compiled.
2. If the source has moved, it pushes a branch moving the pin, builds that
   branch with `build.yml`, and opens a pull request that shows the build
   result as a `Build wasm` status. A newer bump closes an older unmerged one.
3. Merging runs `.github/workflows/build.yml` on `main`, which builds the pin
   again and saves the result as a **draft release** tagged
   `snapshot-<snapshot>-<hash of build.sh, dispatch.cc and upstream.env>`.
4. Publishing the draft runs `.github/workflows/pages.yml`, which deploys it.

The build checks behaviour only coarsely: `check-build.js` confirms the wasm is
well formed, that every tool in the page's catalog is compiled in, that the
build matches the pin, and that `dcsmpte` output is recognised by `dciodvfy`.
Before publishing a release, run `test.sh` (below) against the native tools on
real data.

`pages.yml` deploys `main`'s `public/` with the latest published release, on
publish and on any page change to `main`, so a page fix never rolls the wasm
back. A pin bump that has been merged but not published leaves the site on the
previous release, as intended.

Changes to `build.sh` or `dispatch.cc` go through the same path: the pull
request runs `build.yml`, and merging it drafts a release.

`.github/workflows/ci.yml` runs on every pull request and push to `main`. It
syntax checks every script and runs `test-ui.js`, which drives the real page
scripts against a DOM and asserts the tool picker behaves.

Two repository settings are needed once: Pages must use "GitHub Actions" as its
source (Settings - Pages), and "Allow GitHub Actions to create and approve pull
requests" must be enabled (Settings - Actions - General) for the watcher to
open its pull request.

## Testing

`test.sh` compares the wasm build against the native binaries from the
`dicom3tools` wheel, which is the reference this is meant to reproduce.

```sh
pip install dicom3tools
./fetch-wasm.sh            # or ./build.sh, or the build run's dicom3tools-wasm artifact
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

- `dcsort` is the one tool still showing a written description rather than
  captured output. It produced no output on any input tried, including a single
  series and a directory of images, so it needs investigating rather than a
  better sample.
- `dcanon` is not implemented.

## Licence

The build tooling and web interface in this repository are under the Apache
License 2.0; see [LICENSE](LICENSE).

The dicom3tools programs compiled into `public/dicom3tools.wasm` are David
Clunie's work under his own BSD-style licence, reproduced in
[COPYRIGHT.dicom3tools](COPYRIGHT.dicom3tools). `upstream.env` names the upstream
commit and snapshot it is built from, and each release's notes record them.

Not for clinical use. This will not find every error.
