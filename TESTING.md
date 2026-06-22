# cockpit-bootc — Manual verification notes

There is no committed automated test suite yet (deliberately deferred — see
`GOTCHAS.md` and project memory). Verification so far has been manual, live, ad-hoc
Playwright scripts run against the real bootc appliance. This doc captures the
working pattern so it doesn't have to be rediscovered.

When a real test suite does get built, mirror cockpit-scap's structure
(`@playwright/test` with `global-setup.js`/`global-teardown.js`, `.env` for
`COCKPIT_URL`, `fullyParallel: false` since a Cockpit session is shared state) —
that's a working, project-proven precedent, not Cockpit's own `testlib.py`
convention.

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

await page.goto('https://10.0.0.229:9090/', { waitUntil: 'networkidle' });
await page.fill('#login-user-input', 'pbuchan');
await page.fill('#login-password-input', '***REDACTED***');
await page.click('#login-button');
await page.waitForFunction(() => !document.getElementById('login-user-input'), { timeout: 15000 });

// Unlock admin access — required for anything that calls bootc (it needs root)
const unlock = page.locator('button:has-text("Limited access"), button:has-text("Turn on administrative access")').first();
await unlock.waitFor({ timeout: 5000 });
await unlock.click();
const pw = page.locator('#account-password-input, input[type="password"]').first();
await pw.waitFor({ timeout: 5000 });
await pw.fill('***REDACTED***');
await page.locator('button:has-text("Authenticate"), button[type="submit"]').first().click();
await page.waitForTimeout(2000);

// Navigate directly to the module's actual iframe URL — not /bootc
await page.goto('https://10.0.0.229:9090/cockpit/@localhost/bootc/index.html');
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
ssh pbuchan@<host> "echo <password> | sudo -S bootc status --json 2>/dev/null" | python3 -c "
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

SSH sudo on the bootc appliance needs an interactive password; for one-off checks,
pipe it: `echo <password> | sudo -S <command>`. If the superuser bridge in Cockpit
itself seems stuck (actions fail with permission errors even after unlocking
"Administrative access" in the UI), try `sudo systemctl restart cockpit.socket` on
the target host.
