# Security Policy

## Supported Versions

Only the latest release receives security fixes.

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Older releases | ❌ |

## Reporting a Vulnerability

You can report security issues either by:
- Opening a [GitHub issue](https://github.com/pbuchan-rh/cockpit-bootc/issues) for lower-severity findings
- Using GitHub's [private vulnerability reporting](https://github.com/pbuchan-rh/cockpit-bootc/security/advisories/new) if you prefer to disclose confidentially
- Emailing pbuchan@redhat.com with "cockpit-bootc security" in the subject line

Please include OS version, `bootc --version`, Cockpit version (`cockpit --version`), steps
to reproduce, and potential impact.

## Context and Scope

cockpit-bootc is a Cockpit browser UI module that runs locally on a single bootc-based host.
It is not a network daemon and does not expose any external services. It invokes `bootc`,
`skopeo`, and `ostree` as subprocesses via `cockpit.spawn()`; it writes no files of its own
anywhere on disk (the module is deliberately stateless).

The attack surface is intentionally narrow: only users who already have access to Cockpit on
the host can interact with this module, and every mutating action (update, rollback, switch,
pin/unpin, auto-update toggle) additionally requires Cockpit's admin-access permission.

In scope:
- Unintended privilege escalation via `cockpit.spawn()` calls
- XSS via registry-controlled content (image labels, source URLs, switch-target previews) —
  see `src/lib/url-safety.js`'s allowlist, the intended defense for this class of issue
- A mutating action (switch/rollback/pin) running without the admin-access gate actually
  being active

Out of scope:
- Vulnerabilities in `bootc`, `skopeo`, `ostree`, or Cockpit itself — report those upstream
- The content of a container image a user deliberately switches to (this module previews a
  switch target before committing; trusting what you point it at is the operator's call)
- Issues requiring prior compromise of the host
