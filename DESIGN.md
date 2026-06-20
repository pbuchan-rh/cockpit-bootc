# cockpit-bootc — Design

## Problem

`bootc` systems (Fedora/RHEL bootc images) have no Cockpit module that manages their
update/rollback lifecycle end-to-end. Two existing pieces of Cockpit cover adjacent
ground but neither fits:

- **cockpit-ostree** — manages OSTree-based systems (Silverblue, Kinoite, RHEL CoreOS)
  via the `rpm-ostree` D-Bus API.
- **cockpit-packagekit** (the "Software Updates" / Updates page) — manages package-level
  updates via PackageKit (dnf/yum transactions) on traditional mutable systems.

Neither covers a pure bootc system, and bootc has no D-Bus API at all — it's CLI-only.

## Alternatives considered

### Fork cockpit-ostree

Rejected. `cockpit-ostree`'s entire data model is built around the `rpm-ostree` D-Bus
API — deployments, origin, staged/rollback state all come from daemon calls, not CLI
output. `bootc` systems frequently don't run `rpm-ostree` at all, and `bootc` itself
exposes no D-Bus interface — only a CLI (`bootc status --json`, `bootc upgrade`,
`bootc rollback`). Forking would mean discarding cockpit-ostree's data layer entirely
and rebuilding it on `cockpit.spawn()` calls, at which point little of the original
module survives beyond incidental UI markup.

Not independently verified against an upstream cockpit-ostree maintainer statement —
this is our own architectural read, not a cited decision from the cockpit-ostree project.

### Extend cockpit-packagekit (Updates page)

Rejected. PackageKit's model is package-level: individual packages, dependency
resolution, partial upgrades. bootc systems are image-based — the entire root
filesystem is swapped atomically as a single unit via a container image pull. There
is no package list to reconcile. The two are different update *paradigms*, not two
backends for the same one; bolting bootc support onto the existing Updates page would
require either faking a package-list abstraction over an atomic image swap, or
branching the UI so heavily that it stops being one cohesive module.

### Build a new module from the Cockpit Starter Kit (chosen)

`bootc` interaction is CLI-only, so the natural shape is a thin module that wraps
`cockpit.spawn()` calls in one library (`src/lib/bootc.js`) and renders state from
`bootc status --json`. The Starter Kit gives a clean React + PatternFly v6 + esbuild
scaffold with no inherited data-model assumptions to undo.

## Scope

See `cockpit-bootc-project.md` for the full command reference and component breakdown.
Summary:

**In scope (v1):** status display (booted/staged/rollback images), check for updates,
stage + apply update with soft-reboot, rollback, auto-update timer toggle.

**Out of scope (v1):** `bootc switch` (image/registry switching), tag-pinned upgrades,
`bootc usr-overlay`, `bootc edit`, bootloader entry management, sealed-image
verification status (no `bootc status` field exposes this yet — tracked upstream at
bootc-dev/bootc#1190).

## Status

Not upstream — standalone community module, not yet public. Hosted privately on
Gitea (`git.beastmode.localdomain`) until ready for public release; GitHub remote
deferred until then.
