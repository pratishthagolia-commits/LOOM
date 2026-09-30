#!/usr/bin/env bash
# Packages the extension into website/loom-extension.zip and copies pet/background art
# so the site can show them. Run this after every change to the extension or its assets.
set -euo pipefail
cd "$(dirname "$0")"

rm -f loom-extension.zip
(cd ../extension && zip -qr ../website/loom-extension.zip . -x "*.DS_Store" -x "README.md" -x "assets/README.md")

mkdir -p assets
for d in pets backgrounds; do
  rm -rf "assets/$d"
  [ -d "../extension/assets/$d" ] && cp -R "../extension/assets/$d" "assets/$d"
done
echo "Built website/loom-extension.zip ($(du -h loom-extension.zip | cut -f1))"
