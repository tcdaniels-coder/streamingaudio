---
name: Desktop distribution constraints
description: Non-obvious environment limits and verification boundaries for desktop releases.
---

Desktop release files exceed the Library's 100 MiB per-file upload limit. Store the binaries in App Storage and present a small HTML download page with expiring links instead.

**Why:** Actual installer and Mac archive uploads were rejected as too large; App Storage download checks succeeded.

**How to apply:** Preserve a way to renew links. Tell users their expiration date and never put signed links in memory.

This environment runs x86-64 Linux but cannot execute 32-bit ELF launchers. The standard Wine launcher fails with an executable-format error even when Wine installation succeeds.

**Why:** Installing Wine did not enable the standard Windows installer build path.

**How to apply:** Prefer installer generation that does not execute Windows binaries on the build host.

Do not equate successful desktop packaging with native launch validation. Mac app ZIPs can be cross-built and ad-hoc signed here, but notarization and native signature acceptance are separate concerns.

**Why:** Both Mac architectures packaged successfully, but the cross-platform verifier reported unsupported/misleading CMS verification results for the ad-hoc signatures. Neither native OS nor physical equipment was available for testing.

**How to apply:** Identify these as initial test builds until native installation, launch, and physical equipment checks have passed. Do not promise live-show reliability from build success alone.

Ad-hoc macOS test builds intentionally do not use hardened runtime. Publisher
signing must revisit this choice rather than inheriting test-build settings.

**Why:** Hardened runtime's library validation can reject ad-hoc Electron code;
an integrity-valid ad-hoc bundle is still not a trusted, notarized distribution.

**How to apply:** Keep native signature integrity checks separate from Gatekeeper
trust assessment. Require Developer ID signing, hardened runtime, notarization,
and a successful Gatekeeper assessment before advertising production trust.
