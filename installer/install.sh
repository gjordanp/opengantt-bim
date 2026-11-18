#!/bin/bash
# Opengantt BIM for macOS: downloads the latest release, checks its size and SHA-512, and installs it.
#   curl -fsSL https://raw.githubusercontent.com/gjordanp/opengantt-bim/main/installer/install.sh | bash
# Options (when the file is saved and run): --version 0.6.0   --check   --no-open
#
# Like the Windows script, it does not hide or turn off any macOS warning. The app is not signed by an Apple
# developer: a file downloaded with curl is not marked as "from the internet", so macOS does not ask about it, but
# one downloaded with a browser is, and then it must be allowed once (see the README).
set -euo pipefail

REPO='gjordanp/opengantt-bim'
VERSION=''
CHECK=0
OPEN=1
while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 ;;
    --check) CHECK=1; shift ;;
    --no-open) OPEN=0; shift ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# OGBIM_BASE_URL and OGBIM_ANY_OS exist only so the checks can be tried away from a Mac and a real release.
if [ "${OGBIM_ANY_OS:-}" != 1 ] && [ "$(uname -s)" != 'Darwin' ]; then
  echo 'This script installs Opengantt BIM on macOS. Nothing was downloaded.' >&2
  exit 1
fi

case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) echo "Unsupported processor: $(uname -m)" >&2; exit 1 ;;
esac

if [ -n "$VERSION" ]; then
  if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then echo "Not a version: $VERSION (use for example 0.6.0)" >&2; exit 1; fi
  BASE="https://github.com/$REPO/releases/download/v$VERSION"
else
  BASE="https://github.com/$REPO/releases/latest/download"
fi
BASE="${OGBIM_BASE_URL:-$BASE}"

echo 'Looking up the release...'
SUMS="$(curl -fsSL "$BASE/mac-checksums-$ARCH.txt")" || { echo "No macOS build ($ARCH) in that release." >&2; exit 1; }
# "<sha512 base64> <size> <file>": the .zip is the one installed (no disk image to open).
LINE="$(printf '%s\n' "$SUMS" | grep -E '\.zip$' | head -n 1)"
SHA="$(printf '%s' "$LINE" | awk '{print $1}')"
SIZE="$(printf '%s' "$LINE" | awk '{print $2}')"
FILE="$(printf '%s' "$LINE" | awk '{print $3}')"
if [ -z "$SHA" ] || [ -z "$SIZE" ] || [ -z "$FILE" ]; then echo 'The checksum file is missing the .zip.' >&2; exit 1; fi
if ! [[ "$FILE" =~ ^[A-Za-z0-9._-]+\.zip$ ]]; then echo "Unexpected file name: $FILE" >&2; exit 1; fi
echo "Opengantt BIM: $FILE ($((SIZE / 1048576)) MB, $ARCH)"
[ "$CHECK" = 1 ] && exit 0

TMP="$(mktemp -d "${TMPDIR:-/tmp}/openganttbim.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
echo 'Downloading...'
curl -fL --progress-bar -o "$TMP/$FILE" "$BASE/$FILE"

ACTUAL_SIZE="$(wc -c < "$TMP/$FILE" | tr -d ' ')"
if [ "$ACTUAL_SIZE" != "$SIZE" ]; then echo 'Wrong size: the download is damaged. Nothing was installed.' >&2; exit 1; fi
ACTUAL_SHA="$(openssl dgst -sha512 -binary "$TMP/$FILE" | base64 | tr -d '\n')"
if [ "$ACTUAL_SHA" != "$SHA" ]; then echo 'The SHA-512 of the download does not match the release. Nothing was installed.' >&2; exit 1; fi
echo 'Size and SHA-512 match the release.'

# Where it goes: /Applications when it can be written (an administrator account), else ~/Applications.
if [ -w /Applications ]; then DEST=/Applications; else DEST="$HOME/Applications"; mkdir -p "$DEST"; fi
APP="$DEST/Opengantt BIM.app"
if pgrep -x 'Opengantt BIM' >/dev/null 2>&1; then echo 'Opengantt BIM is open: close it and run this again.' >&2; exit 1; fi
[ -d "$APP" ] && { echo "Replacing the installed version in $DEST"; rm -rf "$APP"; }
# ditto keeps what a plain unzip loses on macOS (permissions, links and the signature).
ditto -x -k "$TMP/$FILE" "$DEST"
[ -d "$APP" ] || { echo 'The download did not contain the app.' >&2; exit 1; }
echo "Installed in $APP"
if [ "$OPEN" = 1 ]; then open "$APP"; fi
echo 'Done.'
