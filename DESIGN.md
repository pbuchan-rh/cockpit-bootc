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

See `cockpit-bootc-project.md` for the original command reference (now partly
historical — see its own note) and `README.md` for the current feature list.

**Built (as of 2026-06-22):** status display (booted/staged/rollback images,
always-labeled tracked reference), check for updates (via `skopeo inspect` digest
comparison, not bootc's own unreliable `--check`), stage + apply update with
soft-reboot, bidirectional rollback, clean cancel for staged updates/queued
rollbacks, auto-update timer toggle (gated behind confirmation), `bootc switch`
with a `skopeo`-based preview before committing, `usr-overlay` drift detection
(warning only, not the ability to create one), and admin-gating.

**Deliberately stateless:** an earlier iteration added persistence
(`/var/lib/cockpit-bootc/` — recent-refs settings, a status cache for Limited
Access mode, an Image History log, an Activity log with downloadable transaction
logs). All of it was removed (2026-06-22) once it became clear it was scope
creep: none of it served the core mission, and no comparable native Cockpit
module (podman, machines, storaged) persists its own state — they're thin
wrappers over stateful backends, which is what this module should be too. The
module now has no data of its own anywhere on disk. See `GOTCHAS.md` and
project memory for the reasoning; the pre-removal state is preserved at git tag
`v0-with-persistence` if ever needed again.

The original "out of scope (v1)" list undersold what the module ended up covering —
`switch` and `usr-overlay` (detection) both moved from "out of scope" to "built"
once it became clear the module needed to cover the full bootc lifecycle, not just
a v1 slice. What's actually still out of scope:

- **Pinning** (`bootc edit` to protect a deployment from GC) — real bootc
  capability, scoped, but needs a spec read-modify-write cycle; not yet built.
- `bootc edit` (raw spec editing) and `bootc loader-entries` (bootloader
  internals) — still correctly excluded as too low-level for a general UI.
- Sealed-image/composefs verification status — blocked upstream, no `bootc status`
  field exposes this yet (tracked at bootc-dev/bootc#1190). Not a choice we made;
  there's nothing to surface until bootc adds it.

## Status

Not upstream — standalone community module, not yet public. Hosted privately on
Gitea (`git.beastmode.localdomain`) until ready for public release; GitHub remote
deferred until then.
