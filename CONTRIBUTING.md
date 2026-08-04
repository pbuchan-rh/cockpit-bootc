# Contributing to cockpit-bootc

Thanks for your interest in contributing. cockpit-bootc is a community project that gives
[bootc](https://bootc-dev.github.io/bootc/)-based systems a native Cockpit GUI for updates,
rollbacks, and deployment management — contributions of any size are welcome.

## Good first contributions

Not sure where to start? These areas are approachable without deep knowledge of the codebase:

- **Bug reports** — if something breaks against your bootc image, open an issue (see below)
- **Documentation** — typos, unclear steps, missing examples
- **Translations** — `po/` has the extraction infrastructure wired up but no real
  `<lang>.po` files yet
- **UI polish** — small visual improvements that follow the existing PatternFly 6 patterns

For larger features, open an issue first to discuss scope before investing time in an
implementation — see [DESIGN.md](DESIGN.md) for what's deliberately out of scope (this is a
GUI **updater**, not a full deployment manager).

## Requirements

Meaningful testing requires a **real bootc-based host** — `bootc`, `skopeo`, and `ostree`
all need to be genuinely present and reflect real deployment state; there's no useful way to
mock this locally. Any RHEL 10 (or other bootc-capable) system booted via `bootc install` or
built as a bootc container image works. See [DESIGN.md](DESIGN.md) for why `ostree` is used
directly alongside `bootc` (pinning/listing deployments has no `bootc`-native equivalent).

## Getting the code

```bash
git clone https://github.com/pbuchan-rh/cockpit-bootc.git
cd cockpit-bootc
```

## Development workflow

cockpit-bootc is a React 18 + PatternFly 6 module, bundled with esbuild — same stack as
`cockpit-podman`.

```bash
npm install
./build.js
```

**Install for development** (no system files touched — symlinks `dist/` into your
user-local Cockpit package path):

```bash
make devel-install
```

Cockpit serves `~/.local/share/cockpit/` with higher priority than the system path. Since
`/usr` is read-only on a bootc system at runtime, this symlink approach (rather than copying
into `/usr/share/cockpit/`) is the only way to iterate on a live bootc host — see
`GOTCHAS.md` for more on this constraint.

```bash
./build.js --watch    # or: make watch
```

rebuilds `dist/` on save; a browser refresh picks up the change immediately.

```bash
make devel-uninstall  # removes the symlink
```

## Testing

A real, assertion-based Playwright suite lives under `tests/` — see
[TESTING.md](TESTING.md) for setup, the login/navigation pattern this module's tests use
(Cockpit modules run inside a nested iframe), and pitfalls found writing them.

```bash
npm test               # full suite, Chromium + Firefox
npm run test:chromium  # single browser, faster while iterating
```

Tests need `tests/.env` (gitignored, copy `tests/.env.example`) pointing at a real bootc host
— never commit credentials.

## Code conventions

- **React 18 + PatternFly 6** — semantic design tokens only
  (`--pf-t--v6--global--*`/`--pf-v6-c-[component]--*`), never raw hex values or named colors;
  see `cockpit-bootc-project.md` for the full token hierarchy and dark-mode rationale
- **Stateless by design** — no `/var/lib/cockpit-bootc/`, no settings file, no cached
  history; every read is a live `bootc status`/`skopeo inspect` call. Don't add persistence
  without discussing it first (see DESIGN.md)
- `cockpit.spawn()` for every `bootc`/`skopeo`/`ostree` call — see `src/lib/bootc.js` for the
  existing one-function-per-call wrapper pattern
- Every mutating action gated behind Cockpit's admin-access permission
- Registry-controlled content (image labels, source URLs) must go through
  `src/lib/url-safety.js`'s `isSafeUrl()` allowlist before ever being rendered as a clickable
  `href` — see `tests/security.spec.js` for the coverage this protects

## File structure

```
cockpit-bootc/
├── src/
│   ├── app.jsx                  # Orchestrator + modals
│   ├── index.jsx, index.html    # Entry point
│   ├── manifest.json            # Cockpit module manifest
│   ├── app.scss                 # PatternFly token overrides
│   ├── components/
│   │   ├── ImageStatus.jsx      # Booted/Staged/Rollback cards
│   │   ├── DeploymentList.jsx   # Expandable all-deployments/pinning table
│   │   ├── SwitchImage.jsx      # Switch-to-image + skopeo preview
│   │   ├── AutoUpdate.jsx       # Auto-update timer toggle
│   │   ├── UpdateActions.jsx    # Check/Download/Apply controls
│   │   └── ProgressLog.jsx      # Streaming action output
│   └── lib/
│       ├── bootc.js             # bootc/skopeo/ostree call wrappers
│       └── url-safety.js        # XSS allowlist for registry-controlled URLs
├── tests/                       # Playwright suite (see TESTING.md)
└── Makefile                     # Build/install/RPM packaging targets
```

## Submitting changes

1. Fork the repository and create a branch for your change
2. Run the relevant Playwright spec(s) against a real bootc host before opening a PR
3. Open a pull request with a clear description of what the change does and why
4. Include a screenshot or screen recording for any UI change

## Reporting bugs

Open a [GitHub issue](https://github.com/pbuchan-rh/cockpit-bootc/issues) with:

- `bootc --version` and `cockpit --version`
- Output of `bootc status --json` if the issue relates to update/rollback/switch state
- Steps to reproduce
- What you expected vs. what happened
- Browser console output if relevant (F12 → Console)

## License

cockpit-bootc is licensed under the [GNU Lesser General Public License v2.1 or later](LICENSE).
