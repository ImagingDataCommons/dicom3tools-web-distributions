# Maintaining

This page covers updating dicom3tools and publishing a new build. For how the
pipeline works, see
[Updating dicom3tools and releasing](README.md#updating-dicom3tools-and-releasing)
in the README.

The build is fully automated. A maintainer does two things: merge a pull
request and publish a release. Nothing is built or uploaded by hand.

## Updating to a new upstream version

1. **Wait for the pull request, or ask for it now.** Every Monday the watcher
   checks [ImagingDataCommons/dicom3tools](https://github.com/ImagingDataCommons/dicom3tools)
   and, if the source has changed, opens a pull request titled
   *Build from upstream dicom3tools_1.00.snapshot.…*. To check immediately,
   run **Actions → Watch upstream dicom3tools → Run workflow**. If no pull
   request appears, the run log says why: either the build is up to date,
   upstream only changed `.github/` or `README.md`, or a pull request for that
   commit is already open.

2. **Review the pull request.** It changes only `upstream.env`. Check that:
   - the **Build wasm** status is green. It comes from the watcher's run, not
     from CI, and the description links to that run.
   - the snapshot in the table is the one you expect. The linked upstream
     comparison shows what changed.

   The `CI` check does not run on these pull requests, because they are opened
   by GitHub Actions. That is expected; they change nothing CI tests.

3. **Merge it.** About eight minutes later, **Build wasm** on `main` creates a
   **draft release** named after the snapshot and tagged
   `snapshot-<snapshot>-<hash>`. It is on the Releases page and only
   maintainers can see it. Merging does not change the site.

4. **Optionally, compare with the native tools.** The build only checks that
   the tools run. dicom3tools can change what it reports between snapshots,
   so for a larger update, compare the new build with the native binaries on
   real data before publishing:

   ```sh
   pip install --upgrade dicom3tools
   gh run download <run id of Build wasm on main> -n dicom3tools-wasm -D public
   ./test.sh /path/to/dicom/files
   ```

   The pip package may be built from a different snapshot, so a mismatch is
   worth reading rather than an automatic blocker.

5. **Publish the draft.** Open it on the Releases page and click
   **Publish release**, leaving *Set as the latest release* ticked. This
   starts **Deploy to GitHub Pages**, which downloads the release, checks it
   again and deploys it. The page footer shows the new snapshot once the
   deploy finishes. Browsers may keep the previous page for up to ten
   minutes.

## When something goes wrong

**The Build wasm status on the watcher's pull request is red.** The new
upstream source does not build, or the build fails `check-build.js`. The
status links to the run log. Fix `build.sh` (or `dispatch.cc`, `tools.js`) by
pushing commits to the pull request's `upstream/…` branch; your pushes run
**Build wasm** on the pull request as usual. Merge once it is green.

**Build wasm fails on `main` after merging.** No draft is created and the site
is unaffected. Fix it in a new pull request; merging that creates the draft.

**The deploy fails after publishing.** The site stays on the previous release.
Check the run's error:
- *Tag … is not allowed to deploy to github-pages*: the environment rule for
  release tags is missing; see [Repository settings](#repository-settings).
- *no published release found*: nothing is published, or the release was
  created by hand without the build's files.
- a failing `check-build.js` line: the released files are broken; publish a
  fixed build instead.

After fixing the cause, rerun the failed run (**Re-run jobs**).

**A published release turns out to be bad.** Go back to the previous one:
edit the previous release, tick **Set as the latest release**, save, then run
**Actions → Deploy to GitHub Pages → Run workflow**. The site always serves
the release marked *latest*. Leave the bad release in place rather than
deleting it, so there is a record of what was served; the next good release
replaces it as latest.

## Other changes

- **Changing the build** (`build.sh`, `dispatch.cc`, the emscripten version in
  `build.sh`) goes through an ordinary pull request. **Build wasm** runs on it,
  and merging creates a draft release. Publish that draft as in step 5. The
  release tag includes a hash of these files, so a rebuild of the same
  snapshot gets a new tag.
- **Changing only the page** (`public/`) needs no release. Merging it deploys
  the page with the current latest release.
- **Adding a tool** needs both: add it to the list in `build.sh` and to
  `public/tools.js` in the same pull request. `check-build.js` fails if the
  page lists a tool the build does not include.

## Do not

- **Create releases by hand, or pick a tag yourself.** A hand-made release has
  none of the build's files, and once published it becomes *latest*, so the
  next deploy fails. The drafts created by **Build wasm** are the only
  releases to publish.
- **Change the files on a published release.** It would no longer be the build
  that was checked, and if the files stop matching `SHA256SUMS` the deploy
  refuses them. To ship something different, merge a change and publish the
  new draft.
- **Edit `upstream.env` by hand** unless you mean to pin a specific upstream
  commit. It is normally changed only by the watcher's pull requests. If you
  do change it, update both `UPSTREAM_COMMIT` and `UPSTREAM_ARCHIVE`; the
  build fails if they disagree.

## Repository settings

These are set once. They are recorded here because the pipeline fails without
them and none of them is visible from the code.

| Setting | Where | Why |
|---|---|---|
| Source: **GitHub Actions** | Settings → Pages | The site is deployed by `pages.yml`, not from a branch. |
| Deployment branches and tags: branch `main` **and tag `snapshot-*`** | Settings → Environments → github-pages | Publishing a release runs the deploy on the release's tag; without the tag rule it is refused. |
| **Allow GitHub Actions to create and approve pull requests** | Settings → Actions → General | The watcher opens its pull requests with the workflow token. |
