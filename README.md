# dicom3tools-web-distributions

David Clunie's [dicom3tools](https://www.dclunie.com/dicom3tools.html) compiled to
WebAssembly, served as a static page, so DICOM files can be validated and
inspected in a browser without installing the command line tools.

Files are read and processed inside the browser tab. Nothing is uploaded.

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

## Testing

`test.sh` compares the wasm build against the native binaries from the
`dicom3tools` wheel, which is the reference this is meant to reproduce.

```sh
pip install dicom3tools
./test.sh /path/to/dicom/files
```

The text-producing tools are expected to be byte identical. Tools that mint
fresh UIDs and timestamps on every run (`dcsmpte`, `dcmulti`, `dcdirmk`,
`dcuidchg`) are not byte comparable even against themselves, so they are not
covered; compare those structurally with `dcdump` instead.

Known upstream behaviour, not a porting defect: `dcstats` and `dchist` abort on
compressed pixel data, natively and in wasm alike.

## TODO

- **CI/CD needs work.** There is no automated build or deploy. `build.sh` is run
  by hand and the result committed, and deploys are triggered manually with the
  Netlify CLI. This should become: build the wasm on a workflow, publish a
  deploy preview for each pull request, and deploy to production on merge to
  `main`. The sibling
  [dicom3tools-python-distributions](https://github.com/ImagingDataCommons/dicom3tools-python-distributions)
  repository builds per upstream snapshot and pins artefacts by SHA256; this
  repository should follow the same pattern rather than committing the binary.
- No automated rebuild when a new upstream dicom3tools snapshot is released.
  `VERSION.txt` records the snapshot the committed binary was built from.
- Seven tools show a written description rather than captured output in the
  picker, because they need input the samples do not cover: a structured
  report, a DICOMDIR, a matched pair.
- `dcanon` is not implemented.

## Licence

The build tooling and web interface in this repository are under the Apache
License 2.0; see [LICENSE](LICENSE).

The dicom3tools programs compiled into `public/dicom3tools.wasm` are David
Clunie's work under his own BSD-style licence, reproduced in
[COPYRIGHT.dicom3tools](COPYRIGHT.dicom3tools). `VERSION.txt` names the upstream
snapshot the binary was built from.

Not for clinical use. This will not find every error.
