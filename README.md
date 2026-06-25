# cockpit-bootc

A [Cockpit](https://cockpit-project.org/) module for managing
[bootc](https://bootc-dev.github.io/bootc/) image-based system updates and
rollbacks.

## Features

- View the booted, staged, and rollback container image status, with the actual
  tracked reference always labeled so it's never ambiguous what's being checked
- Check for updates (via a fresh `skopeo inspect` digest comparison, not bootc's
  own `--check`, which can be unreliable against floating tags — see `GOTCHAS.md`),
  download, and apply with a soft or full reboot
- Roll back to the previous image, in either direction
- Switch to a different image reference entirely — registry/tag input with a
  `skopeo`-based preview (version, digest, created date, source/revision link)
  before committing
- Cancel a staged update or queued rollback cleanly — returns to neutral, no
  reboot, no side effects
- Toggle the `bootc-fetch-apply-updates.timer` for automatic updates (with a
  confirmation, since enabling it means unattended fetch+apply+reboot on a
  recurring schedule, not just a periodic check)
- Pin or unpin the booted/rollback deployment to protect it from `bootc`'s
  automatic garbage collection
- An expandable view of every deployment ostree knows about, not just the 3
  slots `bootc status` reports — a pinned deployment can rotate out of all 3
  while still sitting on disk, and this is the only way to see and unpin it —
  plus the combined disk usage of the image store
- A drift warning if `/usr` has a transient `bootc usr-overlay` mounted
- Every mutating action is gated behind Cockpit's admin-access permission

The module is intentionally stateless — it has no data of its own anywhere on
disk (no `/var/lib/cockpit-bootc/`, no settings, no history). Everything shown is
a live read of `bootc status`/`skopeo inspect`; nothing is cached or remembered
between sessions.

## Requirements

- [Cockpit](https://cockpit-project.org/)
- [bootc](https://bootc-dev.github.io/bootc/) (`/usr/bin/bootc`)
- [skopeo](https://github.com/containers/skopeo) (`/usr/bin/skopeo`) — used for
  update checks and switch-target previews
- [ostree](https://ostreedev.github.io/ostree/) (`/usr/bin/ostree`) — used
  directly for pinning and listing deployments, since `bootc` itself has no
  pin/unpin command (ships with every real bootc base image; see `DESIGN.md`)

## Building

```
npm install
./build.js
```

See `DESIGN.md` for architecture rationale, `GOTCHAS.md` for non-obvious bootc/
PatternFly/Cockpit lessons learned, `TESTING.md` for manual verification notes, and
`Makefile` for RPM packaging. Real automated tests (Playwright, against a live
bootc host) live under `tests/`.

Translation infrastructure (`cockpit.gettext`/`po/*.pot` extraction) is wired up
the same way as other Cockpit modules, but `po/` deliberately has no real
`<lang>.po` files yet — those come from translator contributions, not this repo.

## License

LGPL-2.1-or-later, see `LICENSE`.
