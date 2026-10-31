---
name: Native desktop validation constraints
description: Hosted-runner and universal packaging behavior that differs from Linux cross-builds.
---

Use a genuinely new standard Windows account to validate per-user installation;
a scheduled task requesting limited privileges for the runner's administrator
account is not sufficient.

**Why:** The hosted Windows image kept administrator group privileges even with
the task's limited run level, so the non-administrator assertion correctly failed.

**How to apply:** Check the token inside the test account, use its own profile
and HKCU, and collect test evidence before removing that account. A standard-user
scheduled task also failed to start on the hosted image, so prefer a directly
launched profile-loaded process and bound its lifetime. Rebuild inherited profile
environment variables from the actual user's loaded profile, not runneradmin's.
An account that has never logged into Explorer also needs its usual per-user
shell folders provisioned. Already-loaded shell APIs can cache empty lookups;
assert the fresh installer's real shortcut files and targets rather than
treating those cached lookups as evidence of installer failure.

Preserve architecture-specific app archives inside the universal Mac bundle
rather than merging their automatically unpacked dependency files.

**Why:** Universal archive merging generated an unpack glob beyond the archive
library's pattern-length limit. FreeType also ships separate CPU-named prebuilds;
identical copies of those files must not be combined into a universal binary.

**How to apply:** Keep architecture-scoped native prebuilds intact and verify
the final bundle on both native CPU architectures after packaging changes.

Retain the supported Windows and Mac variants of frontend build tools in the
workspace dependency resolution, even when everyday development is on Linux.

**Why:** Platform-pruning overrides let Linux builds pass but removed the native
Rollup, CSS, and bundler binaries required by the actual release runners.

**How to apply:** Treat native CI as the authority for installer readiness and
keep frozen-lockfile installs reproducible on every supported build platform.
