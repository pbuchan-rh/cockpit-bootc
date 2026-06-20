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

This is now confirmed against an actual upstream decision, not just our own read.
[cockpit-ostree#300](https://github.com/cockpit-project/cockpit-ostree/issues/300)
("support ostree native containers (container as OS)", filed 2022-12-06, still open
as of 2026-06) is the closest upstream discussion of native-container/bootc-adjacent
support. A cockpit-project member (`garrett`) wrote directly in the issue body:

> Related, but a little different: https://github.com/containers/bootc (we'll likely
> keep our integration point at rpm-ostree)

No further bootc-specific discussion happened on that issue after 2022-12-13, and no
later cockpit-ostree or cockpit-project issue revisits the position (checked via
`gh issue list --search bootc` across both repos, June 2026). One genuinely new data
point this surfaced: [cockpit#21201](https://github.com/cockpit-project/cockpit/issues/21201)
was a *core* Cockpit bug (cockpit-session running setuid, wrong file ownership on
bootc-deployed images) fixed in Cockpit 330 — that's a packaging/compatibility fix so
Cockpit itself runs cleanly on a bootc image, not a feature module for managing bootc
updates. It doesn't change the analysis above.

Also checked the Cockpit blog (cockpit-project.org/blog, posts through Cockpit 363 /
2026-06-04) for any newer module announcement — none found covering bootc, "image
mode," or OS-image update management as of this writing.

### Extend cockpit-packagekit (Updates page)

Rejected. PackageKit's model is package-level: individual packages, dependency
resolution, partial upgrades. bootc systems are image-based — the entire root
filesystem is swapped atomically as a single unit via a container image pull. There
is no package list to reconcile. The two are different update *paradigms*, not two
backends for the same one; bolting bootc support onto the existing Updates page would
require either faking a package-list abstraction over an atomic image swap, or
branching the UI so heavily that it stops being one cohesive module.

Unlike the cockpit-ostree case, this reasoning is **not** backed by a found upstream
citation — searches of cockpit-project/cockpit issues for "bootc" and "image mode"
turned up only unrelated bug reports (e.g. a CentOS 10 image-mode storage *test*
failure, cockpit#23295), nothing discussing or rejecting bootc support in the Updates
page specifically. Treat this section as architectural inference, not a confirmed
upstream position.

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
