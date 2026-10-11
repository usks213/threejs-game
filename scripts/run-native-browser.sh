#!/usr/bin/env bash
set -euo pipefail

if (( $# == 0 )); then
  echo 'Usage: bash scripts/run-native-browser.sh <browser test command> [arguments...]' >&2
  exit 2
fi

# Test discovery needs neither X11 nor native input packages.
for argument in "$@"; do
  if [[ "$argument" == '--list' ]]; then
    exec "$@"
  fi
done

echo 'Native desktop acceptance: headed Chromium, isolated Xvfb, one worker, zero retries.'
export E2E_NATIVE_MOUSE=1
exec xvfb-run --auto-servernum --server-args='-screen 0 1920x1080x24' bash -euo pipefail -c '
  xdpyinfo -queryExtensions | grep -w XTEST
  xdotool version
  exec "$@"
' native-browser "$@" --headed --workers=1 --retries=0
