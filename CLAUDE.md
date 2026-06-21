# cockpit-bootc — Project Rules

Layers on top of `~/Projects/cockpit/CLAUDE.md`. Where the two conflict, this file
wins for this module — see override below.

---

## Override: JS stack

The shared CLAUDE.md says "vanilla JS only — no frameworks, no npm, no CDN imports."
That rule does **not** apply to cockpit-bootc.

**Goal:** cockpit-bootc must look, feel, and behave like an official upstream Cockpit
module (the kind shipped for RHEL/Fedora/CentOS), not like a hand-rolled add-on. The
way upstream achieves that today is the Cockpit Starter Kit stack — React +
PatternFly v6 + esbuild + npm — which is exactly what cockpit-podman, cockpit-machines,
and other native modules use. Vanilla JS would actively work against the goal here.

**Therefore, for this module:**
- React + PatternFly v6 (`@patternfly/react-core`, `react-icons`, `react-styles`) via npm — required, not optional
- esbuild (via `build.js` / `npm run build` / `npm run watch`) — required
- npm dependencies are scoped to what the Starter Kit itself pulls in (see
  `package.json`) plus anything `bootc` itself needs wrapped — no unrelated
  dependency additions. "What is exactly needed" means: matching the Starter Kit's
  baseline, not minimizing below it.
- All other shared rules still apply: `cockpit.spawn()` for subprocess exec,
  `cockpit.file()` for file I/O, `{ superuser: "require" }` scoped to privileged
  calls only, no eval/dynamic script injection, no outbound network calls.

**How to apply:** When in doubt about a UI/UX or code-organization decision, match
how an existing official module (cockpit-podman is the closest analog — also a thin
CLI-wrapping module) does it, rather than inventing a new pattern.

---

## SELinux / data storage

This module is currently CLI-read-mostly (bootc/systemctl calls) and does not persist
its own data files yet. If/when it needs to write state, follow the shared rule:
`/var/lib/cockpit-bootc/` with a matching SELinux file context in `selinux/bootc.fc`.

---

## Environments

- **10.0.0.40** (`cockpit-bootc-test.beastmode.localdomain`, RHEL 10.2, package-mode,
  no `bootc` installed) — dev/build host. Deploy `dist/` here for UI iteration.
- **Bootc-booted test host** — address TBD (being re-provisioned). Used for testing
  real `bootc upgrade` / `rollback` / `switch` lifecycle end-to-end.
- 10.0.0.243 — superseded, not in active use.

## Scope

See `DESIGN.md` for full scope/rationale. `bootc switch` is currently marked
out-of-scope (v1) and is under review — do not assume it stays excluded without
checking DESIGN.md for the latest decision.
