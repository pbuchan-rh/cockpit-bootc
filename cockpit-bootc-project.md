# cockpit-bootc

> A Cockpit plugin for managing bootc image updates and rollbacks.
> Standalone community project. Works on any Fedora/RHEL bootc-based system.

> **Note (2026-06-22):** this was the original planning doc, written before any
> code existed. Most of it (the command reference, PatternFly conventions, the
> "Scope" table below) is still accurate background, but the **"app.jsx — Skeleton
> Starting Point" section is now historical** — it describes an early sketch, not
> the actual implementation. For current behavior, read `src/app.jsx` directly,
> `README.md` for the feature list, and `GOTCHAS.md` for lessons learned that
> contradict or refine some of the assumptions made here (especially around
> `bootc upgrade --check` reliability and `bootc rollback`'s side effects).

---

## What This Is

A Cockpit plugin that surfaces `bootc` image management in the Cockpit web UI.
Currently no Cockpit plugin handles pure `bootc` systems end-to-end.
`cockpit-ostree` partially works (shows container origins) but depends on
`rpm-ostree` as a backend — not present or reliable on pure bootc systems.

This plugin talks directly to the `bootc` CLI.

---

## Scaffolding

This project is forked from the official Cockpit Starter Kit:
https://github.com/cockpit-project/starter-kit

```bash
# Fork starter-kit on GitHub, then:
git clone https://github.com/yourorg/cockpit-bootc.git
cd cockpit-bootc
npm install
make devel-install   # symlinks dist/ into ~/.local/share/cockpit/
make watch           # rebuild on file change
```

Development happens on a regular Fedora Server machine with Cockpit installed.
Do not develop inside a bootc image — iteration is too slow.
Test in bootc only to verify image composition and update lifecycle.

---

## Project Structure

```
cockpit-bootc/
├── src/
│   ├── manifest.json          # Cockpit package registration
│   ├── index.html             # Entry point
│   ├── index.js               # React app root
│   ├── app.jsx                # Top-level app component
│   ├── components/
│   │   ├── ImageStatus.jsx    # Current/staged/rollback image cards
│   │   ├── UpdateAction.jsx   # Check / Apply update controls
│   │   ├── RollbackAction.jsx # Rollback controls
│   │   ├── AutoUpdate.jsx     # Auto-update timer toggle
│   │   └── ProgressLog.jsx    # Streaming upgrade output
│   ├── lib/
│   │   └── bootc.js           # All bootc CLI interactions
│   └── app.scss               # Styles — PF6 tokens only
├── test/
│   └── check-application      # Integration tests
├── packaging/
│   └── cockpit-bootc.spec.in  # RPM spec
├── org.cockpit_project.cockpit_bootc.metainfo.xml
├── package.json
├── build.js
├── Makefile
└── README.md
```

---

## manifest.json

```json
{
  "version": 1,
  "require": {
    "cockpit": "286"
  },
  "conditions": [
    { "path-exists": "/usr/bin/bootc" }
  ],
  "menu": {
    "index": {
      "label": "Image Updates",
      "path": "index.html",
      "order": 42,
      "keywords": [
        {
          "matches": ["bootc", "image", "update", "rollback", "upgrade"]
        }
      ]
    }
  }
}
```

The `conditions` block means the plugin only appears if `bootc` is installed.
No bootc — no menu item. No custom code needed for this.

---

## bootc CLI Reference

All system interaction goes through `cockpit.spawn()`. bootc has no DBus API.

### bootc status --json

The primary data source. Call this on mount and after any action.

```bash
bootc status --json
```

**Output structure:**

```json
{
  "apiVersion": "org.containers.bootc/v1",
  "kind": "BootcHost",
  "status": {
    "booted": {
      "incompatible": false,
      "image": {
        "image": {
          "image": "quay.io/yourorg/fedora-firewall:latest",
          "transport": "registry"
        },
        "version": "1.2.0",
        "timestamp": "2026-06-01T10:00:00Z",
        "imageDigest": "sha256:abc123..."
      },
      "ostree": {
        "checksum": "abc123...",
        "deploySerial": 0
      }
    },
    "staged": null,
    "rollback": {
      "image": {
        "image": {
          "image": "quay.io/yourorg/fedora-firewall:latest"
        },
        "version": "1.1.0",
        "timestamp": "2026-05-01T10:00:00Z",
        "imageDigest": "sha256:def456..."
      }
    },
    "spec": {
      "image": {
        "image": "quay.io/yourorg/fedora-firewall:latest",
        "transport": "registry"
      }
    }
  }
}
```

Key fields:
- `status.booted` — currently running image. Always present.
- `status.staged` — update queued for next boot. `null` if none.
- `status.rollback` — previous image available to roll back to. `null` if none.
- `status.booted.image.version` — human-readable version string if set.
- `status.booted.image.imageDigest` — SHA256 digest of current image.

### bootc upgrade

Checks for and stages an update. Streams progress output. May take minutes
(pulling a container image). Always use `.stream()` not `.then()` alone.

```bash
bootc upgrade                    # check and stage (commits immediately)
bootc upgrade --check            # check only, no download
bootc upgrade --download-only    # stage without committing — reboot discards it but caches layers
bootc upgrade --from-downloaded  # commit a previously --download-only staged image
bootc upgrade --apply            # stage and reboot immediately (avoid in UI — use explicit reboot)
bootc upgrade --from-downloaded --apply --soft-reboot=auto  # preferred apply path in UI
```

**Soft reboot:** `--soft-reboot=auto` lets bootc decide whether a soft reboot (userspace
restart only, faster) or full reboot is needed based on whether the kernel changed.
Falls back to full reboot automatically. Only valid with `--apply`.

**Preferred UI workflow:** stage with `--download-only`, let user review, then apply with
`--from-downloaded --apply --soft-reboot=auto`. Do not expose soft vs. full reboot to the
user — bootc handles it transparently.

### bootc rollback

Stages the rollback image for next boot. Fast — no download needed.

```bash
bootc rollback
```

### bootc switch

Switch to a different image entirely (different registry/tag).

```bash
bootc switch quay.io/yourorg/fedora-firewall:v2
```

---

## lib/bootc.js — All bootc interactions

Keep all CLI calls in one module. Components import from here, never call
`cockpit.spawn` directly.

```javascript
// lib/bootc.js

/**
 * Get current bootc status.
 * Returns parsed JSON object or throws on error.
 */
export async function getStatus() {
    const output = await cockpit.spawn(
        ["bootc", "status", "--json"],
        { superuser: "require", err: "message" }
    );
    return JSON.parse(output);
}

/**
 * Check for available updates without downloading.
 * Returns true if an update is available.
 */
export async function checkForUpdates() {
    try {
        await cockpit.spawn(
            ["bootc", "upgrade", "--check"],
            { superuser: "require", err: "message" }
        );
        return true;
    } catch (ex) {
        // exit code 77 means no update available
        if (ex.exit_status === 77) return false;
        throw ex;
    }
}

/**
 * Stage an update in download-only mode. Streams progress lines to onProgress callback.
 * Resolves when download is complete. Does not commit — call applyUpdate() to reboot into it.
 * If rebooted before applying, the staged image is discarded but layers are cached for fast re-download.
 */
export function stageUpdate(onProgress) {
    return cockpit.spawn(
        ["bootc", "upgrade", "--download-only"],
        { superuser: "require", err: "message" }
    ).stream(line => {
        if (onProgress) onProgress(line);
    });
}

/**
 * Apply a previously staged (--download-only) update and reboot.
 * Uses --soft-reboot=auto so bootc decides whether a soft reboot (faster, userspace-only)
 * or full reboot is needed based on whether the kernel changed. Falls back automatically.
 * This is the sole reboot path for updates — do not call reboot() after stageUpdate().
 */
export function applyUpdate() {
    return cockpit.spawn(
        ["bootc", "upgrade", "--from-downloaded", "--apply", "--soft-reboot=auto"],
        { superuser: "require", err: "message" }
    );
}

/**
 * Stage a rollback. Fast — no download.
 */
export function stageRollback() {
    return cockpit.spawn(
        ["bootc", "rollback"],
        { superuser: "require", err: "message" }
    );
}

/**
 * Reboot the system via systemd DBus.
 * Used for rollback only — updates use applyUpdate() instead.
 * Always use this rather than spawning 'reboot' directly.
 */
export async function reboot() {
    const systemd = cockpit.dbus("org.freedesktop.systemd1");
    const manager = systemd.proxy(
        "org.freedesktop.systemd1.Manager",
        "/org/freedesktop/systemd1"
    );
    await manager.wait();
    return manager.Reboot();
}

/**
 * Get auto-update timer status.
 * Returns "active", "inactive", or "unknown".
 */
export async function getAutoUpdateStatus() {
    try {
        const output = await cockpit.spawn(
            ["systemctl", "is-active", "bootc-fetch-apply-updates.timer"],
            { err: "ignore" }
        );
        return output.trim();
    } catch {
        return "inactive";
    }
}

/**
 * Enable or disable the auto-update timer.
 */
export function setAutoUpdate(enabled) {
    const action = enabled ? "enable" : "disable";
    return cockpit.spawn(
        ["systemctl", action, "--now", "bootc-fetch-apply-updates.timer"],
        { superuser: "require", err: "message" }
    );
}
```

---

## Scope: Planned vs. Future Commands

> **Update (2026-06-22):** the split below is from the original plan, before any
> code existed. Both `bootc switch` and `bootc usr-overlay` (detection, not the
> ability to create one) ended up built — see `README.md` for what's actually
> implemented now. Also: `bootc upgrade --check` turned out to be unreliable
> against floating tags (see `GOTCHAS.md`) and is **not** used for "Check for
> Updates" — that's a `skopeo inspect` digest comparison instead.

### Built

| Command | UI action |
|---|---|
| `bootc status --json` | Load all image state on mount |
| `skopeo inspect` (digest comparison, not `bootc upgrade --check`) | "Check for Updates" button |
| `bootc upgrade --download-only` | Stage / download update |
| `bootc upgrade --from-downloaded --apply --soft-reboot=auto` | "Apply & Reboot" |
| `bootc rollback` (once) | "Roll Back" button |
| `bootc rollback` (twice, to undo the side effect) | "Cancel" on a staged update/queued rollback |
| `bootc switch --transport registry <ref>` | "Switch" + registry/tag input with preview |
| `skopeo inspect` | Switch-target preview (version/digest/created/source) |
| `systemctl ... bootc-fetch-apply-updates.timer` | Auto-update toggle (gated behind confirmation) |
| `systemd DBus Reboot()` | Full reboot after rollback/overlay-clear |
| `status.usrOverlay` field (read-only) | Drift warning banner + "Reboot to Clear" |

### Still out of scope

| Command | Why deferred |
|---|---|
| `bootc edit` (for pinning) | Real capability, scoped, but needs a spec read-modify-write cycle — not yet built. |
| `bootc edit` (general spec editing) | Too low-level for a general UI. Skip. |
| `bootc loader-entries` | Internal bootloader management. Skip. |

---

## Image Integrity and Signed Images

There are two distinct verification layers in the bootc ecosystem. Understanding both
matters for deciding what the UI should and should not try to surface.

### Pull-time signature verification (sigstore / cosign / policy.json)

bootc automatically respects the system container signature policy at
`/etc/containers/policy.json` when pulling updates via `bootc upgrade`. If the policy
is configured and the pulled image fails signature verification, `bootc upgrade` fails
and the error appears in the streamed output.

**UI handling:** no special code needed. The error surfaces naturally in the progress
log. Display it clearly. Do not try to configure or bypass signature policy from the UI.

### Runtime filesystem integrity (composefs + fsverity) — sealed images

Sealed images (landed as a Fedora test feature, April 2026) embed a SHA-512 composefs
digest of the entire root filesystem into the signed Unified Kernel Image (UKI) at
build time. At runtime, the kernel verifies every OS file against that digest — a
tampered or corrupted file returns an I/O error rather than loading.

The chain of trust runs: firmware → signed systemd-boot → signed UKI → composefs digest
→ fsverity-verified filesystem. `/etc` and `/var` are excluded (mutable by design).

**UI handling: do not attempt to surface seal status yet.** As of mid-2026, there is no
documented CLI command or `bootc status` JSON field that exposes whether the running
system is sealed or what its verification state is. The only relevant tool found is
`bootc container compute-composefs-digest`, which is a build-time utility. The composefs
backend is still marked experimental with on-disk formats subject to change.

**What to show now:** the `status.booted.image.imageDigest` field (SHA-256 of the booted
OCI image) is already available from `bootc status --json`. Surface this in the image
info card so users can independently verify the running image against a known-good digest.

**Future enhancement:** once bootc exposes a seal/verification status field in
`bootc status --json`, add a "Verified" / "Sealed" badge to the booted image card.
Track upstream: https://github.com/bootc-dev/bootc/issues/1190

---

## PatternFly 6 — Required Reading

### The one rule that prevents 90% of dark mode issues

**Never use raw color values. Only use semantic tokens.**

PF6 semantic tokens automatically switch between light and dark values.
Raw values do not. This is the single most important rule in the codebase.

```scss
// ✅ Correct — adapts to dark mode automatically
background-color: var(--pf-t--v6--global--background--color--primary--default);
color: var(--pf-t--v6--global--text--color--regular);
border-color: var(--pf-t--v6--global--border--color--default);

// ❌ Wrong — breaks in dark mode
background-color: #ffffff;
color: #151515;

// ❌ Wrong — palette token, not semantic
color: var(--pf-t--v6--color--blue--20);
```

### Token hierarchy — use in this order

1. **Semantic tokens** `--pf-t--v6--global--*` — always prefer these
2. **Component tokens** `--pf-v6-c-[component]--*` — for component overrides
3. **Base tokens** `--pf-t--v6--color--*` — only if no semantic token fits
4. **Never** — palette tokens, hex values, named colors (`white`, `black`)

### Component overrides — use component variables, not CSS selectors

```scss
// ✅ Correct
.pf-v6-c-button {
    --pf-v6-c-button--m-primary--BackgroundColor: var(--pf-t--v6--global--color--brand--default);
}

// ❌ Wrong — bypasses dark mode
.pf-v6-c-button.pf-m-primary {
    background-color: #0066cc;
}
```

### How dark mode works — you don't manage it

Cockpit adds `pf-v6-theme-dark` to `<html>` based on user preference.
Your plugin inherits this automatically. Do not implement your own theme toggle.
The starter-kit imports `cockpit-dark-theme` from Cockpit's `pkg/lib` via the
Makefile — this is what wires up theming. Do not import PatternFly CSS manually.

### SVG icons — use token fills

```scss
// ✅ Adapts to dark mode
.my-icon {
    fill: var(--pf-t--v6--global--icon--color--regular);
}
```

### Page component — required Cockpit fix

Every page using the PF6 `<Page>` component must add `.no-masthead-sidebar`:

```jsx
<Page className="no-masthead-sidebar">
  ...
</Page>
```

Without this, Cockpit's nav chrome appears inside your plugin's iframe.

### PR checklist — run before every merge

- [ ] Toggle Cockpit to dark mode — does everything look correct?
- [ ] Any hardcoded hex colors in SCSS? Find and replace with semantic tokens.
- [ ] All SVG icons using token fills?
- [ ] Status badges render correctly in both light and dark?
- [ ] EmptyState renders correctly in both?
- [ ] `make codecheck` passes (ESLint + Stylelint)?

---

## Recommended PF6 Components for This Plugin

| UI need | PF6 Component | Import |
|---|---|---|
| Page layout | `Page`, `PageSection` | `@patternfly/react-core` |
| Image info cards | `Card`, `CardTitle`, `CardBody` | `@patternfly/react-core` |
| Status indicators | `Label` | `@patternfly/react-core` |
| Update/rollback buttons | `Button` | `@patternfly/react-core` |
| Progress streaming | `CodeBlock`, `CodeBlockCode` | `@patternfly/react-core` |
| Reboot confirmation | `Modal`, `ModalBody`, `ModalFooter` | `@patternfly/react-core` |
| No rollback available | `EmptyState`, `EmptyStateBody` | `@patternfly/react-core` |
| Loading state | `Skeleton` | `@patternfly/react-core` |
| Auto-update toggle | `Switch` | `@patternfly/react-core` |
| Alert/error display | `Alert` | `@patternfly/react-core` |

### Label status colors — use these variants, not custom colors

```jsx
// These use semantic tokens internally — dark mode safe
<Label color="green">Running</Label>    // active/healthy
<Label color="blue">Staged</Label>      // update ready
<Label color="orange">Warning</Label>   // degraded
<Label color="red">Failed</Label>       // error
<Label color="grey">Inactive</Label>    // disabled/none
```

---

## app.jsx — Skeleton Starting Point

> **Historical.** This was the original sketch, written before any code existed.
> The real `src/app.jsx` diverged substantially (admin-gating, switch, history,
> cancel flows, activity logs, none of which are reflected below). Read the actual
> file for current behavior — this section is kept for context on the original
> intent, not as documentation of what's there now.

```jsx
import React, { useState, useEffect } from "react";
import {
    Page,
    PageSection,
    Card, CardTitle, CardBody,
    Button,
    Alert,
    Skeleton,
    EmptyState, EmptyStateBody,
} from "@patternfly/react-core";

import { getStatus, stageUpdate, applyUpdate, stageRollback, reboot } from "./lib/bootc.js";
import ImageStatus from "./components/ImageStatus.jsx";
import UpdateAction from "./components/UpdateAction.jsx";

export function App() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [upgrading, setUpgrading] = useState(false);
    const [progress, setProgress] = useState([]);

    useEffect(() => {
        loadStatus();
    }, []);

    async function loadStatus() {
        setLoading(true);
        setError(null);
        try {
            const s = await getStatus();
            setStatus(s.status);
        } catch (ex) {
            setError(ex.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleUpgrade() {
        setUpgrading(true);
        setProgress([]);
        try {
            await stageUpdate(line => setProgress(p => [...p, line]));
            await loadStatus();
            // staged — user now confirms reboot via modal
        } catch (ex) {
            setError(ex.message);
        } finally {
            setUpgrading(false);
        }
    }

    async function handleApplyUpdate() {
        try {
            await applyUpdate();
            // system is rebooting — no further UI update needed
        } catch (ex) {
            setError(ex.message);
        }
    }

    async function handleRollback() {
        try {
            await stageRollback();
            await loadStatus();
        } catch (ex) {
            setError(ex.message);
        }
    }

    if (loading) {
        return (
            <Page className="no-masthead-sidebar">
                <PageSection>
                    <Skeleton width="75%" />
                    <Skeleton width="50%" />
                </PageSection>
            </Page>
        );
    }

    return (
        <Page className="no-masthead-sidebar">
            <PageSection>
                {error && (
                    <Alert variant="danger" title="Error" isInline>
                        {error}
                    </Alert>
                )}
                {status && (
                    <ImageStatus
                        booted={status.booted}
                        staged={status.staged}
                        rollback={status.rollback}
                        onUpgrade={handleUpgrade}
                        onRollback={handleRollback}
                        onReboot={reboot}
                        upgrading={upgrading}
                        progress={progress}
                    />
                )}
            </PageSection>
        </Page>
    );
}
```

---

## AppStream Metadata

File: `org.cockpit_project.cockpit_bootc.metainfo.xml`

```xml
<component type="addon">
  <id>org.cockpit_project.cockpit_bootc</id>
  <metadata_license>CC0-1.0</metadata_license>
  <name>bootc Image Updates</name>
  <summary>Manage bootc image updates and rollbacks from Cockpit</summary>
  <description>
    <p>
      Provides a Cockpit interface for managing bootc-based system image
      updates and rollbacks. Shows current, staged, and rollback image
      information and allows triggering updates and rollbacks without
      using the command line.
    </p>
  </description>
  <extends>org.cockpit_project.cockpit</extends>
  <launchable type="cockpit-manifest">cockpit-bootc</launchable>
</component>
```

---

## Development Commands

```bash
# Install deps
sudo dnf install gettext nodejs npm make
npm install

# Live development
make devel-install       # link dist/ into cockpit
make watch               # rebuild on save
RSYNC=hostname make watch  # rebuild + sync to remote VM

# Check code quality (run before every PR)
make codecheck           # ESLint + Stylelint
npm run eslint:fix       # auto-fix lint
npm run stylelint:fix    # auto-fix CSS

# Run integration tests
make check
TEST_OS=fedora-42 make check
```

---

## Renaming from Starter Kit

After forking starter-kit, rename all references:

```bash
find . -iname '*starter*'
git grep -i starter
```

Replace `starter-kit` → `cockpit-bootc` throughout.
Update the AppStream metadata `<id>` and `<launchable>` values.
Update the RPM spec name in `packaging/`.

---

## Key References

| Resource | URL |
|---|---|
| Cockpit Starter Kit | https://github.com/cockpit-project/starter-kit |
| Cockpit Developer Guide | https://cockpit-project.org/guide/latest/development.html |
| Cockpit Embedding docs | https://cockpit-project.org/guide/latest/embedding.html |
| PatternFly 6 components | https://www.patternfly.org/components |
| PatternFly 6 tokens | https://www.patternfly.org/tokens/all-patternfly-tokens |
| PatternFly dark theme handbook | https://www.patternfly.org/developer-resources/dark-theme-handbook |
| bootc CLI docs | https://bootc-dev.github.io/bootc/ |
| bootc upgrade/rollback | https://bootc-dev.github.io/bootc/upgrades.html |
| bootc status JSON schema | https://bootc-dev.github.io/bootc/man/bootc-status.html |
| cockpit-ostree (reference) | https://github.com/cockpit-project/cockpit-ostree |
