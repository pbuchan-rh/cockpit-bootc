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
- **Automatic updates** — turn `bootc-fetch-apply-updates.timer` on or off, with a confirmation before enabling unattended fetch+apply+reboot. Off masks the timer (`systemctl stop` + `mask`), because RHEL bootc images enable it from `/usr` and a plain `disable` comes back at the next boot; On unmasks and starts it. The setting lives in `/etc`, and every deployment has its own `/etc`, so after a rollback check the switch again
- **Pin/unpin** any deployment (booted, rollback, or an older one that has rotated out of `bootc status`) against automatic garbage collection
- **All deployments view** — every deployment ostree knows about, not just the 3 slots `bootc status` reports, plus combined image-store disk usage
- **Delete** an unpinned deployment that is no longer booted, staged or the rollback (space is freed only for content no other deployment shares)
- **Readable registry errors** — "tag not found", "access denied" and "registry unreachable" in one sentence, with the raw `skopeo`/`bootc` output one click away
- **`/usr` drift warning** if a transient `bootc usr-overlay` is mounted

The module only appears on hosts actually booted from a bootc image (`/run/ostree-booted`); RHEL package-mode hosts ship the `bootc` binary too, but there is nothing for it to manage there.

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

cockpit-bootc manages a bootc-based root, so it's meant to ship as part of your
bootc image, not installed ad hoc on a running host afterward.

**Bake into a bootc image (recommended):**

```dockerfile
RUN dnf -y copr enable -y pbuchan-rh/cockpit-bootc rhel-10-x86_64 && \
    dnf -y install cockpit-bootc && \
    dnf -y copr disable pbuchan-rh/cockpit-bootc && \
    dnf clean all
```

This is the exact block we use to build our own bootc appliance image. Two
things worth knowing:

- Name the chroot explicitly (`rhel-10-x86_64`, `centos-stream-10-x86_64`, or
  `fedora-43-x86_64`/`fedora-44-x86_64`). `dnf copr enable` with no chroot
  argument can misdetect as `epel-10-x86_64` and fail, since that chroot
  doesn't exist in this project.
- Disable the COPR repo again once installed. bootc images update by pulling
  a whole new image, not `dnf update` on the deployed host, so there's no
  reason to leave a third-party repo enabled on a shipped appliance.

Rebuild and push your image as usual — no separate install step is needed on
the deployed host.

**Install directly on a running bootc host (testing only):**

```bash
sudo dnf copr enable pbuchan-rh/cockpit-bootc
sudo dnf install cockpit-bootc
```

Useful for trying the module on a host you don't want to rebuild yet, but a
bootc-managed root is read-only by design — this only works if `/usr` already
has a transient overlay (`bootc usr-overlay`) or the deployment has been
`ostree admin unlock`ed, and either way the install is lost on the next
reboot or image switch. Don't use this for a real deployment; use the
Containerfile method above instead.

**From source (Makefile), for local development on a non-bootc machine:**

```bash
git clone https://github.com/pbuchan-rh/cockpit-bootc.git
cd cockpit-bootc
npm install
sudo make install
```

## Building

```
npm install
./build.js                  # development build: unminified, with source maps
NODE_ENV=production ./build.js
make rpm                    # always a clean production build; fails otherwise
```

`make dist`/`srpm`/`rpm` rebuild `dist/` from scratch with `NODE_ENV=production`
and check the result (`make check-dist`): compressed `index.js.gz`/`index.css.gz`,
no source maps, a minified bundle, and the PatternFly assets the CSS references.
The version comes from `git describe`; to build an untagged tree as a given
version, pass it explicitly, e.g. `make rpm VERSION=1.1.2`.

Real automated tests (Playwright, against a live bootc host) live under `tests/` —
see `TESTING.md` for setup and the login/navigation pattern.

Translations: all UI strings go through `cockpit.gettext`, and the Makefile has
the usual Cockpit `po/*.pot` extraction targets, but nothing is translated yet.
`po/` has no `.pot` or `<lang>.po` files, and several sentences are still built
from separate fragments, which translators can't reorder. Making them
translatable is planned for 1.2.

## Troubleshooting

Hitting something that looks like a `bootc`/Cockpit bug? Check `GOTCHAS.md` first —
it documents several non-obvious issues already found and fixed (e.g. `bootc upgrade
--check` giving false negatives against a floating tag, `bootc rollback` being a
toggle rather than a one-way action) that can otherwise look like new bugs.
`DESIGN.md` covers architecture rationale and what's deliberately out of scope.

## License

LGPL-2.1-or-later, see `LICENSE`.
