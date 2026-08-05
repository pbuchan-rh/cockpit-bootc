# cockpit-bootc

A [Cockpit](https://cockpit-project.org/) module for managing
[bootc](https://bootc-dev.github.io/bootc/) image-based system updates and
rollbacks.

## Features

- **Image status** — booted, staged, and rollback state at a glance, with the actual tracked reference always labeled
- **Check for updates, download, apply** — soft or full reboot as needed; see `GOTCHAS.md` for why this doesn't rely on `bootc upgrade --check`
- **Roll back**, in either direction
- **Switch images** — point at any registry/tag, preview version/digest/source before committing
- **Cancel** a staged update or queued rollback cleanly — no reboot, no side effects
- **Automatic updates** — toggle the `bootc-fetch-apply-updates.timer`, with a confirmation before enabling unattended fetch+apply+reboot
- **Pin/unpin** the booted or rollback deployment against `bootc`'s automatic garbage collection
- **All deployments view** — every deployment ostree knows about, not just the 3 slots `bootc status` reports, plus combined image-store disk usage
- **`/usr` drift warning** if a transient `bootc usr-overlay` is mounted

The module is intentionally stateless — no `/var/lib/cockpit-bootc/`, no settings, no history. Everything shown is a live read of `bootc status`/`skopeo inspect`.

## Privilege model

Every mutating action (update, rollback, switch, pin/unpin, auto-update toggle) requires Cockpit's admin-access permission, enforced via `{ superuser: "require" }` on the actual `bootc`/`ostree`/`systemctl` call — not just a disabled button. Read-only status queries need no elevation. See `SECURITY.md` for the full scope.

## Requirements

- [Cockpit](https://cockpit-project.org/)
- [bootc](https://bootc-dev.github.io/bootc/) (`/usr/bin/bootc`)
- [skopeo](https://github.com/containers/skopeo) (`/usr/bin/skopeo`) — used for
  update checks and switch-target previews
- [ostree](https://ostreedev.github.io/ostree/) (`/usr/bin/ostree`) — used
  directly for pinning and listing deployments, since `bootc` itself has no
  pin/unpin command (ships with every real bootc base image; see `DESIGN.md`)

## Installation

**RPM via Fedora COPR (recommended):**

```bash
sudo dnf copr enable pbuchan-rh/cockpit-bootc
sudo dnf install cockpit-bootc
```

Available for RHEL 10, CentOS Stream 10, and Fedora 43/44.

**From source (Makefile):**

```bash
git clone https://github.com/pbuchan-rh/cockpit-bootc.git
cd cockpit-bootc
npm install
sudo make install
```

## Building

```
npm install
./build.js
```

Real automated tests (Playwright, against a live bootc host) live under `tests/` —
see `TESTING.md` for setup and the login/navigation pattern.

Translation infrastructure (`cockpit.gettext`/`po/*.pot` extraction) is wired up
the same way as other Cockpit modules, but `po/` deliberately has no real
`<lang>.po` files yet — those come from translator contributions, not this repo.

## Troubleshooting

Hitting something that looks like a `bootc`/Cockpit bug? Check `GOTCHAS.md` first —
it documents several non-obvious issues already found and fixed (e.g. `bootc upgrade
--check` giving false negatives against a floating tag, `bootc rollback` being a
toggle rather than a one-way action) that can otherwise look like new bugs.
`DESIGN.md` covers architecture rationale and what's deliberately out of scope.

## License

LGPL-2.1-or-later, see `LICENSE`.
