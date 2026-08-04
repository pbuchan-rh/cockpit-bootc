# cockpit-bootc — Test suite + manual verification notes

A real, committed, assertion-based Playwright suite exists under `tests/`
(`status.spec.js`, `update-lifecycle.spec.js`, `rollback.spec.js`,
`switch-image.spec.js`, `auto-update.spec.js`, `admin-gating.spec.js`,
`security.spec.js`) — run with `npm test` against both Chromium and Firefox.
Most tests perform real mutating actions (switch, rollback, toggling
auto-update) against the live appliance and clean up after themselves,
verified against real `bootc status --json`/`systemctl` state, not just the
UI — see each spec for the specific cleanup step. This doc captures the
patterns and pitfalls found writing them, so they don't have to be
rediscovered for the next module.

## Scaffolding (`tests/`)

`tests/playwright.config.js` + `tests/.env` (copy `tests/.env.example`,
gitignored) + `tests/helpers/cockpit.js` give any script or future `.spec.js`
file a working `loginToCockpit(page)` without re-deriving the login/admin-unlock/
navigate dance each time. This intentionally does **not** mirror cockpit-scap's
`global-setup.js`/`global-teardown.js` — those reset a `settings.json` file via
SSH between runs, and cockpit-bootc has no settings file to reset (it's
deliberately stateless). Resetting *bootc's* state between test runs means real
`bootc switch`/`rollback` calls, which is a different problem to solve later if
a real suite needs it.

This pattern (config shape, `.env` for creds, generic login helper) is meant to
be reused by future Cockpit modules — see "Testing" in the shared
`~/Projects/cockpit/CLAUDE.md` for the documented standard, with this directory
as the reference implementation.

**Both Chromium and Firefox are required** — `playwright.config.js` defines a
project for each, since Cockpit itself needs to work in both. Install both
browsers (`npx playwright install chromium firefox`) and run the full matrix
with `npm test`, or a single browser with `npm run test:chromium` /
`npm run test:firefox` while iterating on one spec.

**The two browsers never run concurrently.** `workers: 1` caps the *entire*
run (across all projects, not per-project) to a single worker, so `npm test`
runs all of Chromium's tests, then all of Firefox's, one at a time — never
both browsers hitting the shared live appliance/Cockpit session at once.

`tests/adhoc/` holds ~100 throwaway scripts accumulated during development
(originally left in `/tmp`, moved here 2026-06-22 so they aren't lost to a
reboot/tmp-cleaner, plus the ones generated while debugging the admin-elevation
bug below). They're investigation scripts, not a test suite — most have no
assertions, just `console.log`/screenshots, and many still hardcode
host/credentials inline rather than using `tests/helpers/cockpit.js`. Treat
them as a reference for "how was X verified," not something to run as CI.

## A real bug the suite caught immediately

Writing `status.spec.js` surfaced a genuine, reproducible bug in
`helpers/cockpit.js`'s `requestAdmin()`: it used a list of fallback selectors
(each burning a full 5s timeout waiting for an element that was never going to
appear) and pressed Enter to submit the password instead of clicking
"Authenticate". The combination left the superuser handshake
(`init` → `Prompt` → `Answer` → `Current: sudo`, visible via a WebSocket trace)
incomplete by the time the helper returned, even though the shell's "Limited
access" text had already disappeared — so every privileged bootc call hung
indefinitely with no error once the module loaded. Fixed by mirroring the
exact sequence already proven reliable elsewhere in this session: a single
direct selector, an explicit click on "Authenticate", and a flat ~2s settle
wait. A polling probe (repeatedly attempting a privileged spawn until one
succeeds, instead of a flat wait) was tried first and made things *worse* —
overlapping spawn attempts mid-handshake left orphaned
`sudo -k -A cockpit-bridge` processes stuck server-side. If admin-elevation
flakes out again, check `ps aux | grep cockpit-bridge` on the target host for
this exact symptom before assuming it's a code regression.

**Backlog:** the remaining ad-hoc scripts in `tests/adhoc/` may still contain
useful coverage not yet ported into a real spec (e.g. progress-log streaming,
cancel-during-download timing, focus/tab-order checks) — not done, flagged so
it isn't lost track of.

## The login + navigation pattern

Cockpit's module content lives in a **nested iframe**, not at the top-level URL.
Navigating to `https://<host>:9090/bootc` loads the shell with the module inside an
iframe at `https://<host>:9090/cockpit/@localhost/bootc/index.html`. The simplest
approach: log in and unlock admin access against the top-level shell page, then
navigate the *top-level* page directly to that iframe URL — don't hunt through
`page.frames()`.

```js
const { chromium } = require('playwright');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// COCKPIT_URL/COCKPIT_USER/COCKPIT_PASS come from tests/.env (gitignored) —
// same convention as tests/helpers/cockpit.js. Never hardcode real credentials here.
await page.goto(process.env.COCKPIT_URL, { waitUntil: 'networkidle' });
await page.fill('#login-user-input', process.env.COCKPIT_USER);
await page.fill('#login-password-input', process.env.COCKPIT_PASS);
await page.click('#login-button');
await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });

// Unlock admin access — required for anything that calls bootc (it needs root)
const unlock = page.locator('button:has-text("Limited access"), button:has-text("Turn on administrative access")').first();
await unlock.waitFor({ timeout: 5000 });
await unlock.click();
const pw = page.locator('#account-password-input, input[type="password"]').first();
await pw.waitFor({ timeout: 5000 });
await pw.fill(process.env.COCKPIT_PASS);
await page.locator('button:has-text("Authenticate"), button[type="submit"]').first().click();
await page.waitForTimeout(2000);

// Navigate directly to the module's actual iframe URL — not /bootc
await page.goto(process.env.COCKPIT_URL + '/cockpit/@localhost/bootc/index.html');
await page.waitForTimeout(2000);
```

Package directory note: the module installs to `/usr/share/cockpit/bootc/` (package
name is `bootc`, not `cockpit-bootc` — see `package.json`), so the iframe path is
`@localhost/bootc/`, matching that.

## Common pitfalls

**A disabled-button assertion can be a false positive from input state, not app
logic.** `Preview`/`Switch` are disabled when the ref text input is empty — that's
correct behavior, not a bug, and it's easy to mistake for a stale-state issue if you
forgot to `fill()` the input first in a fresh test run.

**Full page reloads reset local component state.** If you `page.goto()` again
mid-test (rather than staying in the same continuous session), anything held in
local component state (e.g. the typed Switch ref) resets to empty. To verify
something stays correct *within a single session* (no reload), don't re-navigate —
stay on the same `page` object and just wait/click.

**A fresh context is your fastest way to tell "real bug" from "stale local state or
cache."** Several apparent bugs this session turned out to be client-only state or
browser cache, not server-side logic — a brand-new `chromium.launch()` context
with no prior history is the cleanest way to check whether the *real* underlying
state is actually correct.

**Wait for actual completion, not a fixed timeout, when an action streams
progress.** `bootc switch`/`upgrade --download-only` against a real registry can
take anywhere from a couple seconds to tens of seconds depending on layer count.
Poll for the button's loading-label to disappear rather than guessing a sleep
duration:

```js
for (let i = 0; i < 30; i++) {
  const stillRunning = await page.locator('button:has-text("Switching…")').count();
  if (stillRunning === 0) break;
  await page.waitForTimeout(1000);
}
```

## Verifying real bootc/server state directly

When in doubt about whether something is a real backend issue vs. a UI bug, check
`bootc status --json` directly over SSH rather than trusting only what the page
shows:

```bash
ssh -t pbuchan@<host> "sudo bootc status --json 2>/dev/null" | python3 -c "
import json, sys
d = json.load(sys.stdin)['status']
print('staged:', d.get('staged') is not None)
print('rollbackQueued:', d.get('rollbackQueued'))
print('booted:', d['booted']['image']['version'])
"
```

This was the deciding check in several investigations this session — comparing
"what the UI shows" against "what `bootc status` actually says" is what
distinguished a real backend bug from a stale client-side flag every time.

## Sudo notes for the live appliance

SSH sudo on the bootc appliance needs an interactive password. Use `ssh -t` so
the terminal prompts for it directly — never embed a plaintext password in the
command itself (e.g. `echo <password> | sudo -S ...`); that pattern puts the
credential in shell history and process listings, and this project's tooling
now actively blocks it. If the superuser bridge in Cockpit itself seems stuck
(actions fail with permission errors even after unlocking "Administrative
access" in the UI), try `sudo systemctl restart cockpit.socket` on the target
host.
