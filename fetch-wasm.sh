#!/bin/bash
#
# Downloads a published build into public/, which is how the page gets its
# wasm without building it: the binary is released, not committed.
#
#   ./fetch-wasm.sh          # the latest published release
#   ./fetch-wasm.sh <tag>    # a specific one
#
# Used by the Pages deploy and for local development. Only curl
# is needed, so it works without the gh CLI or a token.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-ImagingDataCommons/dicom3tools-web-distributions}"
HERE="$(cd "$(dirname "$0")" && pwd)"
TAG="${1:-}"
ASSETS="dicom3tools.js dicom3tools.wasm build-info.js"

if [ -z "$TAG" ]; then
  # /releases/latest redirects to /releases/tag/<tag>. With no published
  # release there is nothing to redirect to, so fail rather than guess.
  url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" || true)"
  case "$url" in
    */releases/tag/*) TAG="${url##*/}" ;;
    *) echo "no published release found for $REPO" >&2; exit 1 ;;
  esac
fi

echo "Fetching $REPO release $TAG"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for f in $ASSETS SHA256SUMS; do
  curl -fsSL --retry 3 -o "$tmp/$f" "https://github.com/$REPO/releases/download/$TAG/$f"
done

# A truncated download would otherwise surface only as a page that fails to
# start.
if command -v sha256sum >/dev/null; then
  (cd "$tmp" && sha256sum -c --quiet SHA256SUMS)
else
  (cd "$tmp" && shasum -a 256 -c --quiet SHA256SUMS)
fi

for f in $ASSETS; do
  cp "$tmp/$f" "$HERE/public/$f"
done
echo "$TAG" > "$HERE/.release-tag"
echo "Installed $TAG into public/"
