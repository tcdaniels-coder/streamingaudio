# Desktop installers

The desktop app bundles the console and local X32/ATEM bridge. People using the
installed app do not need Node.js or pnpm.

## Current downloadable builds

The release directory contains a Windows x64 installer and separate macOS ZIPs
for Intel and Apple Silicon. ZIP users extract the app and move it to Applications.
These are initial test builds: native installation, launch, uninstallation, and
physical X32/ATEM validation are still pending. Do not describe them as
live-show-ready.

The Windows custom NSIS script generates its uninstaller on the user's machine;
building it does not require Wine. Native dependencies use their supplied Node-API
prebuilds, and host-compiled FreeType output is excluded from the bundle.

Mac ZIPs can be cross-built with:

```sh
pnpm --filter "@workspace/stream-audio-control" exec electron-builder --mac zip --x64 --arm64 --config.mac.identity=null
```

The current Mac archives were then recursively ad-hoc signed with rcodesign 0.29.0,
using `desktop/entitlements.plist`, and re-zipped with symlinks preserved.
Ad-hoc signing is not Apple Developer ID signing or notarization. Native macOS
signature validation is still required; the cross-platform verifier could not
validate the ad-hoc CMS structure.

To upload completed builds to the configured App Storage bucket and generate a
small download page with seven-day links, run:

```sh
node artifacts/stream-audio-control/desktop/upload-downloads.mjs
```

The script verifies each download with a range request and includes SHA-256
checksums. It never logs signed URLs. Re-run it to renew the links.

## Build installers

The GitHub Actions workflow `Build desktop installers` creates:

- A universal macOS `.dmg`, built on a macOS runner.
- A Windows x64 `.exe` installer, built on a Windows runner.

Push the full project to a GitHub repository, then open **Actions → Build
desktop installers → Run workflow**. Download the `macOS-installer` and
`Windows-installer` artifacts from the completed run.

Windows builds have no publisher signature. The Mac build uses an ad-hoc
signature with the supplied Electron entitlements; this is not Developer ID
signing or notarization. Hardened runtime is disabled for these ad-hoc test
builds so library validation does not block Electron's bundled code. Production
signing must enable hardened runtime and use publisher-owned certificates.
macOS Gatekeeper may reject the download, and Windows SmartScreen may show a
publisher warning. The installer does not need to change ATEM settings or
install software on the mixer.

## Native validation gate

The workflow tests the **newly built** release, not previously downloaded files:

- Windows: start an unelevated interactive task in the fresh hosted runner's
  per-user profile. Refuse existing app files, shortcuts, or uninstall entries.
  Silently install, verify HKCU registration and both shortcuts (and no HKLM
  registration), launch the installed executable from outside the repository,
  and run read-only console/bridge checks. Silently uninstall and require removal
  of all installed files, shortcuts, and registration, without test-side cleanup.
  Electron user preferences/cache are intentionally not deleted by uninstall.
- Mac: build one universal DMG, then download that same DMG on `macos-15`
  (Apple Silicon) and `macos-15-intel`. Verify the disk image, copy its app with
  `ditto`, run Apple's `codesign --verify --deep --strict`, inspect entitlements,
  and require both Mach-O architectures. Launch natively on each runner and
  require Electron to report the matching runtime architecture.
- Both: a packaged-only smoke launch loads the real bridge dependencies,
  checks disconnected local status, bundled HTML/JavaScript/CSS, a visible window,
  and the rendered Live console. It then stops the bridge and exits. An external
  harness enforces a timeout, successful process exit, the expected executable
  and architecture, and a closed loopback port before and after launch. It never
  connects to hardware or sends mixer/switcher commands.

`Windows-installer` uploads only after Windows checks pass.
`macOS-candidate` is **not validated**; `macOS-installer` uploads only after both
Mac runners pass. Validation logs and JSON reports are retained for 30 days,
including on failures. Gatekeeper's assessment is saved separately: rejection
is expected for ad-hoc test builds and is not treated as signature corruption.

Workflow success establishes native install/launch smoke checks only, not
production trust, notarization, or physical X32/ATEM reliability. Until a native
run succeeds, existing downloads remain unverified initial test builds.

The smoke assertions can be checked on any OS with:

```sh
node --test artifacts/stream-audio-control/desktop/smoke-check.test.mjs
```

## Native build commands

With Node.js 24 and pnpm 10 installed, the package can also be built on its
target operating system from the project root:

```sh
pnpm install
pnpm --filter "@workspace/stream-audio-control" run package:mac
```

Use `pnpm --filter "@workspace/stream-audio-control" run package:win` on
Windows. Installer files are written to `artifacts/stream-audio-control/release`.
