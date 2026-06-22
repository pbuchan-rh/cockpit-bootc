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
  recent-refs dropdown and a `skopeo`-based preview (version, digest, created date,
  source/revision link) before committing
- Cancel a staged update or queued rollback cleanly — returns to neutral, no
  reboot, no side effects
- Toggle the `bootc-fetch-apply-updates.timer` for automatic updates (with a
  confirmation, since enabling it means unattended fetch+apply+reboot on a
  recurring schedule, not just a periodic check)
- Image History (boot transitions over time) and Activity (completed
  Download/Switch transactions, each with a downloadable full log)
- A drift warning if `/usr` has a transient `bootc usr-overlay` mounted
- Works correctly under Cockpit's Limited Access mode — read-only data still
  shows (via a cached last-known snapshot, since `bootc status` itself
  unconditionally requires root), every mutating action is properly gated until
  admin access is unlocked

## Requirements

- [Cockpit](https://cockpit-project.org/)
- [bootc](https://github.com/containers/bootc) (`/usr/bin/bootc`)
- [skopeo](https://github.com/containers/skopeo) (`/usr/bin/skopeo`) — used for
  update checks and switch-target previews

## Building

```
npm install
./build.js
```

See `DESIGN.md` for architecture rationale, `GOTCHAS.md` for non-obvious bootc/
PatternFly/Cockpit lessons learned, `TESTING.md` for manual verification notes, and
`Makefile` for RPM packaging.

## License

LGPL-2.1-or-later, see `LICENSE`.
