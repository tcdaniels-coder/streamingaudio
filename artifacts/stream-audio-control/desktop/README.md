# Desktop installers

The desktop app bundles the console and local X32/ATEM bridge. People using the
installed app do not need Node.js or pnpm.

## Build installers

The GitHub Actions workflow `Build desktop installers` creates:

- A universal macOS `.dmg`, built on a macOS runner.
- A Windows x64 `.exe` installer, built on a Windows runner.

Push the full project to a GitHub repository, then open **Actions → Build
desktop installers → Run workflow**. Download the `macOS-installer` and
`Windows-installer` artifacts from the completed run.

The build is unsigned because signing requires certificates owned by the
publisher. macOS may ask the user to approve an unidentified developer, and
Windows SmartScreen may show a publisher warning. The installer does not need
to change ATEM settings or install software on the mixer.

## Native build commands

With Node.js 24 and pnpm 10 installed, the package can also be built on its
target operating system from the project root:

```sh
pnpm install
pnpm --filter "@workspace/stream-audio-control" run package:mac
```

Use `pnpm --filter "@workspace/stream-audio-control" run package:win` on
Windows. Installer files are written to `artifacts/stream-audio-control/release`.
