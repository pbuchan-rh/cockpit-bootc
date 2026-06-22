# cockpit-bootc — Gotchas and lessons learned

Non-obvious things discovered the hard way, mostly by live testing against a real
bootc appliance. Read this before touching `bootc.js` or the update/rollback/switch
flow in `app.jsx`.

## bootc CLI quirks

**`bootc upgrade --check` is unreliable against floating tags.** It can trust a
stale cached digest comparison and report "no changes" even when the registry
genuinely has new content under the same tag (e.g. `:latest`). Confirmed
independently by two parties against the same registry: only a real
`bootc upgrade` (no `--check`) found content that `--check` missed. **Don't use it.**
`checkForUpdates()` instead does a fresh `skopeo inspect` of the tracked reference
and compares its digest directly against the currently booted digest — no caching
involved on our side.

**`bootc upgrade --check` always exits 0**, regardless of outcome. It prints
`"No changes in: <ref>"` to stdout when there's nothing new — that text is the only
signal, not the exit code. (This is now moot since we stopped using `--check`
entirely, but worth knowing if you ever go back to it.)

**`bootc rollback` is a toggle, not a one-way action.** Calling it once stages a
rollback (reorders the bootloader, current becomes rollback). Calling it again
*reverts that ordering* — confirmed empirically. This is the only way to discard a
staged entry (`bootc rollback --help`: *"If there is a `staged` entry... it will be
discarded"*) but it has a side effect: discarding a stage this way also queues a
rollback. To build a true "Cancel" (discard the stage, return to neutral, no
reboot, no rollback queued) you must call `bootc rollback` **twice** in sequence —
see `cancelStagedUpdate()` in `bootc.js`.

**Staged updates auto-apply on *any* reboot — except `--download-only` ones.**
`bootc upgrade --help`: plain `bootc upgrade` (and `bootc switch`) queue an update
that gets applied automatically at shutdown via `ostree-finalize-staged.service`,
regardless of how the reboot happens (Cockpit's own System page, `systemctl
reboot`, anything). Only `bootc upgrade --download-only` explicitly opts out of
this — that's why `stageUpdate()` uses `--download-only`, and why "Download
Update" needs an explicit separate "Apply & Reboot" step while a plain `switch`
does not.

**`bootc status` unconditionally requires root.** No unprivileged read path exists
(tested directly: `bootc status --booted --json` without sudo fails the same way as
plain `bootc status`). This is a hard bootc limitation, not something we can work
around at the Cockpit layer — it's why Limited Access mode falls back to a cached
last-known snapshot (`status-cache.json`) instead of live data.

**`rollbackQueued` is a real top-level field in `bootc status --json`** (sibling to
`booted`/`staged`/`rollback`), not something you have to infer. Use it directly —
don't track "is a rollback staged" as local component/React state, or it will rot
out of sync the moment something changes server-side without going through your
exact code path (we hit this twice in one session).

## App architecture gotchas

**Any local "phase" flag used to gate UI must be reset on every path that could end
it, or derived from real server state instead.** We built a `phase` state machine
(`PHASE.DOWNLOADING`, `PHASE.ROLLBACK_STAGED`, etc.) to gate buttons, and it rotted
twice: once because `ROLLBACK_STAGED` had no reset path except a full page reload
(fixed by deriving from `status.rollbackQueued` instead of local state), and again
because a *different* handler (`handleCancelStagedUpdate`) forgot to reset
`PHASE.DOWNLOADED` after a successful cancel, leaving buttons stuck disabled forever
even though the real server state was already correct. **Prefer deriving gating
from a real `bootc status` field over local-only flags wherever one exists.**

**`loadStatus()` must not set `loading=true` except on the very first mount.** The
top-level `if (loading) return <Skeleton/>` unmounts and remounts the *entire* page
tree. If every action (download, switch, rollback, cancel) calls `loadStatus()` and
that always flips `loading` back to true, every single action wipes all local
component state — including the text you just typed into the Switch ref input.
`loadStatus(showLoadingSkeleton = false)` now only shows the skeleton when
explicitly asked (the initial `useEffect` mount call passes `true`; every other
caller doesn't).

**`@patternfly/react-table` is not installed** (deliberately, to keep the
dependency footprint lean), and `patternfly-base.css` only carries the design
tokens/reset — not per-component styles. A class name like `.pf-v6-c-table` or
`.pf-v6-c-tabs` only has real CSS behind it if you actually `import` the
corresponding React component (esbuild bundles a component's CSS only when its JS
is imported). We hit this for `BootHistory`'s table (had to write custom
`.ct-boot-history-table` CSS) but *not* for `Tabs` (importing the real `Tabs`
component pulled in its CSS fine). If a PatternFly-classed element renders with
zero visual styling, check whether the actual component is imported, not just
whether the class name is referenced.

**Cache-busting must be automatic, not a hand-maintained `?v=N`.** See
`build.js`'s `copy-assets` plugin — it rewrites `?v=\d+` to the build timestamp on
every build. A static number that doesn't get bumped on every deploy means
long-running browser tabs can silently keep serving stale JS after a redeploy,
which looks *exactly* like a fix not working.

## Testing gotchas

**Cockpit module content lives in a nested iframe**, not at the top-level URL.
Navigating to `https://<host>:9090/bootc` loads the shell with the module in an
iframe at `https://<host>:9090/cockpit/@localhost/bootc/index.html`. For
Playwright, navigate the top-level page *directly* to that iframe URL after
logging in (rather than hunting through `page.frames()`) — see `cockpit-scap`'s
`tests/walkthrough.js` for the working pattern (login → unlock admin access →
direct navigate to the iframe URL).

**A fresh/clean Playwright context is the fastest way to tell "real bug" from
"stale local state."** Several apparent bugs this session turned out to be
client-only state (stuck `phase`, stale cache) that a brand-new browser context
(no cache, no prior session state) didn't reproduce. If a bug only shows up in a
long-running session and not in a fresh load, suspect local/cached state before
assuming the server-side logic is wrong.
