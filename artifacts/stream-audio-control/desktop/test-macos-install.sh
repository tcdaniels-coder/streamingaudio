#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
report_dir="${RUNNER_TEMP:?}/desktop-validation"
mkdir -p "$report_dir"
exec > >(tee "$report_dir/macos-validation.log") 2>&1
mount_dir="$(mktemp -d)"
install_dir="$(mktemp -d)"
cleanup() {
  hdiutil detach "$mount_dir" -quiet || true
  rm -rf "$mount_dir" "$install_dir"
}
trap cleanup EXIT

shopt -s nullglob
images=("$script_dir"/../release/*.dmg)
[[ ${#images[@]} -eq 1 ]] || { echo "Expected exactly one DMG"; exit 1; }
hdiutil verify "${images[0]}"
hdiutil attach "${images[0]}" -readonly -nobrowse -mountpoint "$mount_dir"
apps=("$mount_dir"/*.app)
[[ ${#apps[@]} -eq 1 ]] || { echo "Expected exactly one app in DMG"; exit 1; }
# Test a copy made with Apple tooling, not the build directory or mounted image.
ditto "${apps[0]}" "$install_dir/Stream Audio Control.app"
bundle="$install_dir/Stream Audio Control.app"
binary="$bundle/Contents/MacOS/Stream Audio Control"
plutil -lint "$bundle/Contents/Info.plist"
codesign --verify --deep --strict --verbose=4 "$bundle"
codesign --display --verbose=4 "$bundle" 2>&1 | tee "$report_dir/signature.txt"
codesign --display --entitlements :- "$bundle" > "$report_dir/entitlements.plist"
plutil -lint "$report_dir/entitlements.plist"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :com.apple.security.cs.allow-jit' "$report_dir/entitlements.plist")" == "true" ]]
lipo -verify_arch x86_64 arm64 "$binary"

# Gatekeeper is evidence, not an integrity check: ad-hoc test builds are expected
# to be rejected, and must never be advertised as Developer ID/notarized releases.
if spctl --assess --type execute --verbose=4 "$bundle" > "$report_dir/gatekeeper.txt" 2>&1; then
  echo "Gatekeeper accepted this bundle"
else
  echo "Gatekeeper rejected this ad-hoc test build (not production signed/notarized)"
fi
cat "$report_dir/gatekeeper.txt"

case "$(uname -m)" in
  arm64) expected_arch=arm64 ;;
  x86_64) expected_arch=x64 ;;
  *) echo "Unsupported native runner architecture"; exit 1 ;;
esac
node "$script_dir/test-packaged-app.mjs" "$binary" "$expected_arch" "$report_dir/macos-smoke.json"
echo "PASS: DMG copy, Apple signature validation, native $expected_arch launch, renderer, bridge, and shutdown"
