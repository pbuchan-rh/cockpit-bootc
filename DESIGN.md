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

#### `rpm-ostree` vs. plain `ostree` — why our binary calls are safe

The UI resemblance to cockpit-ostree is real and expected — both render the same
underlying concept (ostree deployments: booted/staged/rollback slots, pinning) —
but the two modules call different binaries, and that distinction matters for
whether our calls are even valid on a bootc system:

- **`rpm-ostree`** is a separate daemon/CLI layered *on top of* ostree, used for
  package layering on classic ostree desktop/server systems (Silverblue, Kinoite,
  RHEL CoreOS). It is **not** part of bootc and is frequently not installed on
  bootc systems at all — there's nothing to layer packages onto when the entire
  root is replaced as a container image.
- **`ostree`** is the lower-level engine that `bootc` itself is built on
  (libostree) — deployments, booted/staged/rollback state, and pinning are all
  native ostree concepts that `bootc` delegates to under the hood. Every bootc
  system has the plain `ostree` CLI available, because `bootc` cannot function
  without it.

`cockpit-bootc` only ever shells out to `bootc`, `ostree`, `skopeo`, `systemctl`,
`du`, and `flock` (see `src/lib/bootc.js`) — it never calls `rpm-ostree`. The
`ostree admin status --json` / `ostree admin pin` calls are safe specifically
*because* they're one level below bootc, not because bootc systems happen to
also ship `rpm-ostree`. Verified end-to-end on the real bootc appliance
(10.0.0.229) where the full pin/unpin/status lifecycle was exercised against
real `ostree` output.

#### What cockpit-ostree's UI actually does (read directly from source, 2026-06-24)

Cloned `cockpit-ostree` into `reference/` and read `src/ostree.jsx` end to end to
check the resemblance claim against the real implementation, not assumption:

- **Layout**: a `Gallery` of cards — "Status" (up-to-date / update-available),
  "OSTree source" (repository + branch, with a kebab for rebase/add/edit/remove
  *remote repository*), and "Deployments and updates" — an expandable
  `ListingTable` with columns Version / Status labels / Time / Branch / action
  button. Each row expands into tabs: **Tree** (OS/version/released/origin),
  **Packages** (rpm-level diff: additions/removals/updates/downgrades),
  **Signatures** (GPG signer/validity).
- **Backend**: almost everything goes over D-Bus to the `rpm-ostreed` daemon
  (`client.js`, named transactions `"Rollback"` / `"Deploy"` / `"Rebase"`). The
  *only* plain CLI calls in the whole module are `ostree admin pin` / `ostree
  admin undeploy`, for per-row Pin/Unpin/Delete — confirming the pin/unpin path
  is the one place even cockpit-ostree itself drops to bare `ostree`, same as us.
- **Features that don't map to bootc and shouldn't be copied**: ostree
  remote/repository management (add/edit/remove/rebase to a different remote +
  branch — bootc uses container registries instead, no concept of an ostree
  remote), per-deployment RPM package diff, GPG signature tab, "Reset"/"Clean
  up" kebab actions. None of these have a bootc equivalent.
- **Features that do map, and that we already cover**: deployment list with
  status labels (Current/Pinned/Updating/Failed/New) ↔ our `DeploymentList`
  table; per-row Pin/Unpin ↔ ours; rollback/update behind a reboot-confirm
  modal ↔ ours.

One more distinction worth keeping precise, confirmed by reading `client.js`:
the "Packages" and "Signatures" tabs are not the same kind of feature.
**Packages** (rpm add/remove/update diff) comes from `GetDeploymentsRpmDiff` /
`GetCachedUpdateRpmDiff` — `rpm-ostreed` D-Bus methods that diff the RPM
database embedded in each commit. Plain `ostree` has no concept of "packages"
at all; bootc has no rpmdb-diff equivalent and no per-deployment package list
to diff, since the whole rootfs moves as one container-image unit. This one is
correctly out of scope, structurally, not just by choice. **Signatures**, by
contrast, decode genuine ostree commit-signing GVariant data — a real ostree
feature, independent of rpm-ostree. A bootc system pulling from a signed
ostree-backed registry could in principle expose the same data; we just
haven't built it. Don't lump these two together as "rpm-ostree-only and out
of scope" — only the Packages tab is.

#### Is `cockpit.spawn()`-only architecturally sound, or just what we're stuck with?

Sound — confirmed against the closest real precedent, not just asserted. `bootc`
has no D-Bus interface at all; there is no `bootcd` daemon to call into, by
design, so there's no daemon-based option being skipped here. The actual
question is whether CLI-spawning is itself a legitimate Cockpit pattern, and
`cockpit-podman` (already our named closest analog — also a thin CLI-wrapping
module, see this module's own `CLAUDE.md`) confirms it is: grepping its source
turns up 6 `cockpit.spawn()` calls driving `podman` directly, vs. exactly 1
`cockpit.dbus()` call — and that one isn't even for podman, it's
`cockpit.dbus("org.freedesktop.systemd1", ...)`, used to manage the podman
*service* via systemd, not podman itself. Podman has no conventional system-bus
daemon either. So `cockpit-bootc` spawning CLI commands as its only backend
isn't a compromise forced by bootc's limitations — it's the same shape as the
nearest real precedent in the Cockpit ecosystem, for the same underlying reason
(no daemon exists to call instead).

#### Could this module absorb cockpit-ostree's scope and let it be retired?

Raised 2026-06-24 (coworker suggested looping in a product owner on this).
Answering honestly before that conversation happens: this is the *same*
fork-rejection from "Fork cockpit-ostree" above, just pointed in the other
direction — extending us to also drive classic ostree/rpm-ostree systems
(Silverblue, Kinoite, RHEL CoreOS) hits the identical backend mismatch, just
mirrored.

What it would actually require, concretely:
- **A second backend, in full.** Everything we have today is
  `cockpit.spawn()` against `bootc`/`ostree`/`skopeo`/`systemctl`. Classic
  ostree systems are driven over D-Bus to `rpm-ostreed` (named transactions
  `Deploy`/`Rollback`/`Rebase`, per cockpit-ostree's `client.js`). Supporting
  both means runtime-detecting which world a host is in and branching the
  entire data layer, not just adding fields to existing components.
- **Repository/remote management** (add/edit/remove/rebase to an ostree
  remote+branch) — real UI we don't have at all (`repositoryModals.jsx` in
  cockpit-ostree), and no bootc concept maps to it (registries replace
  remotes).
- **RPM package-diff view** — structurally impossible from bootc (see above);
  would only ever work in the ostree half, so the UI has to know which mode
  it's in and hide/show entire tabs depending on backend.
- **No shared update/rollback state machine** — D-Bus transactions with their
  own progress/error model vs. our CLI exit-code/stdout parsing and
  `ProgressLog`. Two parallel code paths, not one shared one.
- **No shared auto-update concept** — `bootc-fetch-apply-updates.timer` has no
  rpm-ostree-side equivalent in cockpit-ostree today.
- **No shared "switch image" concept** — registry pull (bootc) vs. rebase to a
  different remote/branch (ostree) are different mental models, not the same
  feature with different plumbing.

Net: not "add a feature" — it's merging two modules with incompatible backends
into one codebase with runtime branching for which world you're in. Roughly
doubles the test matrix (need real Silverblue/CoreOS/Kinoite hosts in addition
to our bootc hosts, see Environments in the sibling `CLAUDE.md`) and a chunk of
the work (remote management, package diffs) is dead code on every bootc
system, since those concepts don't exist there.

**Question worth putting to the product owner directly, instead of assuming
the goal**: is the ask "one module, two backends" (a real merge, real ongoing
cost) — or "two modules sharing UI conventions, with cockpit-ostree quietly
stopping new feature investment" (much cheaper, same practical retirement
outcome, no merge risk)? Don't start engineering work toward either until
that's answered.

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
wrappers over stateful backends, which is what this module should be too. This
isn't just inferred by example — it's a stated Cockpit design ideal
([cockpit-project.org/ideals.html](https://cockpit-project.org/ideals.html),
"Direct System Interaction"): *"Cockpit does not store its own opinion of the
state of the server anywhere. The UI always reflects the actual current state
of the server."* Everything removed was exactly that — our own opinion of state,
stored separately from the server. The module now has no data of its own
anywhere on disk. See `GOTCHAS.md` and project memory for the reasoning; the
pre-removal state is preserved at git tag `v0-with-persistence` if ever needed
again.

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
