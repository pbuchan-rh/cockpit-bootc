import cockpit from 'cockpit';

const _ = cockpit.gettext;

/**
 * /run/ostree-booted already exists on every bootc-booted system (it's the
 * marker file bootc's own bootc-fetch-apply-updates.service checks via
 * ConditionPathExists) — used as a flock target so concurrent bootc-mutating
 * calls from multiple cockpit-bootc tabs/sessions serialize instead of
 * racing, with zero new files written. Does NOT protect against
 * bootc-fetch-apply-updates.service itself, which doesn't take this lock —
 * that's a separate systemd unit we don't own and won't patch.
 */
const LOCK_FILE = "/run/ostree-booted";

// --verbose is what makes flock print "failed to get lock" (how asFriendlyError
// tells a held lock from a bootc failure); its two informational lines are
// noise and get stripped from anything shown to the user.
function withLock(argv) {
    return ["flock", "--nonblock", "--verbose", LOCK_FILE, ...argv];
}

export function stripFlockLines(text) {
    return text.split("\n")
            .filter(line => !/^flock: (getting lock took|executing) /.test(line))
            .join("\n");
}

// Turn the registry errors skopeo (and bootc, which uses the same
// containers/image code) print into one sentence. Matches the error text, not
// exit codes: skopeo exits 1 for all of them. Returns null when unrecognized.
// Samples (skopeo 1.20, .229):
//   reading manifest does-not-exist in 10.0.0.208:5000/bootc-cockpit-demo: manifest unknown
//   reading manifest latest in docker.io/library/null: requested access to the resource is denied
//   pinging container registry nonexistent-host.invalid: Get "...": dial tcp: lookup ...: no such host
//   pinging container registry 10.0.0.208:5001: Get "...": dial tcp ...: connect: no route to host
function registryErrorMessage(raw) {
    const manifest = raw.match(/reading manifest (\S+) in (\S+): /);
    const registry = raw.match(/pinging container registry (\S+): /);
    if (/manifest unknown/.test(raw)) {
        return manifest
            ? cockpit.format(_("Tag \"$0\" was not found in $1."), manifest[1], manifest[2])
            : _("The image was not found in the registry.");
    }
    if (/requested access to the resource is denied|unauthorized|authentication required/i.test(raw)) {
        return manifest
            ? cockpit.format(_("The registry denied access to $0. The repository may not exist, or the registry needs credentials this system doesn't have."), manifest[2])
            : _("The registry denied access to the image. The repository may not exist, or the registry needs credentials this system doesn't have.");
    }
    const host = registry ? registry[1] : _("the registry");
    if (/no such host/.test(raw)) {
        return cockpit.format(_("Could not find $0: the host name did not resolve."), host);
    }
    if (/i\/o timeout|timed out|no route to host|connection refused|network is unreachable|TLS handshake timeout/i.test(raw)) {
        return cockpit.format(_("Could not connect to $0."), host);
    }
    return null;
}

// skopeo's fatal line is a logrus record (time="..." level=fatal msg="...");
// show just the msg when nothing better is known.
function lastMeaningfulLine(raw) {
    const lines = raw.split("\n").map(l => l.trim())
            .filter(Boolean);
    const last = lines[lines.length - 1] || "";
    const logrus = last.match(/level=fatal msg="(.*)"$/);
    return logrus ? logrus[1].replace(/\\"/g, '"') : last;
}

// Turn a failed spawn into an Error the UI can show: a short message plus
// `details`, the raw tool output (flock chatter removed) for an expandable
// section. streamedText covers stageUpdate/switchImage, which use err: "out"
// (stderr merged into the streamed output, not ex.message).
function asFriendlyError(ex, streamedText = "") {
    const raw = stripFlockLines(streamedText || (ex && ex.message) || String(ex)).trim();
    const friendly = message => {
        const err = new Error(message);
        if (raw && raw !== message) err.details = raw;
        return err;
    };
    if (ex && ex.exit_status === 1 && /failed to get lock/.test(raw)) {
        return friendly(_("Another bootc operation is already in progress. Try again in a moment."));
    }
    if (ex && ex.problem === "timeout") {
        return friendly(_("The operation timed out — the registry may be unreachable. Try again."));
    }
    return friendly(registryErrorMessage(raw) || lastMeaningfulLine(raw) || _("The command failed."));
}

// cockpit.spawn() has no built-in timeout — a registry that hangs (network
// drop, auth stall) would otherwise leave the UI spinner stuck forever. Used
// for one-shot, non-streamed calls (metadata lookups) where any progress at
// all means it's done; see inactivityTimeout() below for the streamed
// (long-running download) case, where a flat timeout would also kill a slow
// but genuinely progressing transfer.
function spawnWithTimeout(args, options, timeoutMs) {
    const proc = cockpit.spawn(args, options);
    const timer = setTimeout(() => proc.close("timeout"), timeoutMs);
    proc.then(() => clearTimeout(timer), () => clearTimeout(timer));
    return proc;
}

// For streamed downloads (stageUpdate/switchImage): kill the process only if
// no output line arrives for `timeoutMs`, not after a flat total runtime —
// large image pulls can legitimately take many minutes as long as they're
// still producing progress lines.
function inactivityTimeout(proc, timeoutMs) {
    let timer = setTimeout(() => proc.close("timeout"), timeoutMs);
    return {
        reset: () => {
            clearTimeout(timer);
            timer = setTimeout(() => proc.close("timeout"), timeoutMs);
        },
        clear: () => clearTimeout(timer),
    };
}

const INSPECT_TIMEOUT_MS = 20000;
const DOWNLOAD_INACTIVITY_TIMEOUT_MS = 120000;
// Cap concurrent skopeo calls when cross-checking a repo's other tags — firing
// all of them at once risks tripping a registry's rate limit (HTTP 429) on a
// single image preview.
const TAG_CHECK_CONCURRENCY = 5;

/**
 * Whether this host is actually booted from a bootc/ostree image. The bootc
 * binary alone isn't enough — RHEL package-mode systems ship it too, and there
 * `bootc status` succeeds with booted: null. /run/ostree-booted is the same
 * marker the manifest condition and bootc's own units check, and reading it
 * needs no root, so this answers even before administrative access is on.
 */
export async function isOstreeBooted() {
    const content = await cockpit.file(LOCK_FILE).read();
    return content !== null;
}

/**
 * Get current bootc status.
 * Returns the parsed status object or throws on error.
 */
export async function getStatus() {
    const output = await cockpit.spawn(
        ["bootc", "status", "--json"],
        { superuser: "require", err: "message" }
    );
    return JSON.parse(output);
}

/**
 * List every deployment ostree knows about, not just the 3 slots `bootc
 * status` reports (booted/staged/rollback). A deployment pinned today can
 * rotate out of all 3 of those after enough later upgrades while still
 * sitting on disk, pinned, invisible to `bootc status` — this is the only
 * way to see it's still there. `slot` is null for anything not currently in
 * one of bootc's 3 reported slots.
 */
export async function getDeploymentList() {
    const output = await cockpit.spawn(
        ["ostree", "admin", "status", "--json"],
        { superuser: "require", err: "message" }
    );
    const { deployments } = JSON.parse(output);
    return deployments.map(d => ({
        index: d.index,
        checksum: d.checksum,
        serial: d.serial,
        pinned: d.pinned,
        slot: d.booted ? "booted" : d.rollback ? "rollback" : (d.staged || d.pending) ? "staged" : null,
    }));
}

/**
 * Real disk usage of the ostree object store. Deployments share most of
 * their files with each other via hardlinks into this same repo, so summing
 * a `du` per-deployment would double-count shared blocks and overstate what
 * unpinning any single one would actually free — this single total is the
 * only honest number to show.
 */
export async function getRepoDiskUsage() {
    const output = await cockpit.spawn(
        ["du", "-sh", "/ostree/repo"],
        { superuser: "require", err: "message" }
    );
    return output.split(/\s+/)[0];
}

/**
 * Check for an available update without downloading.
 * Returns true if an update is available, false if already up to date.
 *
 * Does NOT use `bootc upgrade --check` — it trusts a cached digest
 * comparison that can go stale against a floating tag (e.g. :latest)
 * and report "no changes" even when the registry genuinely has new
 * content. Confirmed independently against this registry: only a real
 * `bootc upgrade` (no --check) found content that --check missed.
 * Instead, compare a fresh skopeo inspect of the tracked reference
 * directly against the currently booted digest — no caching involved.
 */
export async function checkForUpdates(trackedRef, bootedDigest) {
    const info = await inspectImage(trackedRef);
    return info.digest !== bootedDigest;
}

/**
 * Download and stage an update without committing it.
 * Streams all output (stdout + stderr) to onProgress.
 * Call applyUpdate() to reboot into the staged image.
 */
export async function stageUpdate(onProgress) {
    let streamedText = "";
    const proc = cockpit.spawn(
        withLock(["bootc", "upgrade", "--download-only"]),
        { superuser: "require", err: "out" }
    );
    const { reset, clear } = inactivityTimeout(proc, DOWNLOAD_INACTIVITY_TIMEOUT_MS);
    proc.stream(line => {
        reset();
        streamedText += line;
        const shown = stripFlockLines(line);
        if (onProgress && shown.trim()) onProgress(shown);
    });
    try {
        return await proc;
    } catch (ex) {
        throw asFriendlyError(ex, streamedText);
    } finally {
        clear();
    }
}

/**
 * Apply a previously staged update and reboot.
 * Uses --soft-reboot=auto so bootc decides whether a soft reboot
 * (userspace-only, faster) or full reboot is needed. Falls back automatically.
 * This is the sole reboot path for updates — do not call reboot() after stageUpdate().
 */
export async function applyUpdate() {
    try {
        return await cockpit.spawn(
            withLock(["bootc", "upgrade", "--from-downloaded", "--apply", "--soft-reboot=auto"]),
            { superuser: "require", err: "message" }
        );
    } catch (ex) {
        throw asFriendlyError(ex);
    }
}

/**
 * Stage a rollback to the previous image.
 * Fast — no download required. Requires a reboot to take effect.
 */
export async function stageRollback() {
    try {
        return await cockpit.spawn(
            withLock(["bootc", "rollback"]),
            { superuser: "require", err: "message" }
        );
    } catch (ex) {
        throw asFriendlyError(ex);
    }
}

// bootc's deployment slots map directly to ostree's own index names. There's
// no "staged" entry here — ostree refuses to pin a staged-but-unapplied
// deployment ("error: Cannot pin staged deployment", confirmed live), so
// that slot intentionally has no Pin button in the UI.
const OSTREE_PIN_INDEX = { booted: "booted", rollback: "rollback" };

/**
 * Pin or unpin a deployment so it's protected from bootc's automatic
 * garbage collection (which otherwise only keeps booted + 1 rollback and
 * prunes anything older). `bootc` itself has no pin/unpin command — this is
 * the underlying ostree primitive bootc's own `status --json` already
 * reports via the `pinned` field on each slot, just not settable through
 * `bootc edit` (which only touches the `spec` section).
 */
export async function setDeploymentPinned(slot, pinned) {
    return setDeploymentPinnedByIndex(OSTREE_PIN_INDEX[slot], pinned);
}

// Raw ostree indices can drift: a deployment staged in the background (the
// auto-update timer, or another open tab) between when the UI fetched its
// deployment list and when the user clicks an action button can shift every
// later index down. Neither `ostree admin pin` nor `ostree admin undeploy`
// accept a checksum target — only an index or (for pin) a named slot — so the
// only way to catch drift is to verify it ourselves: re-fetch immediately
// before mutating and confirm the index still points at the checksum the UI
// showed.
async function verifyIndexMatchesChecksum(index, expectedChecksum) {
    const current = await getDeploymentList();
    const found = current.find(d => String(d.index) === String(index));
    if (!found || found.checksum !== expectedChecksum) {
        throw new Error(_("System state changed — refresh and try again."));
    }
}

/**
 * Same as setDeploymentPinned(), but addresses a deployment by its raw
 * ostree index (0, 1, 2...) instead of a bootc slot name — needed for
 * deployments that have rotated out of bootc's 3 reported slots, which only
 * getDeploymentList() can see. expectedChecksum is optional so
 * setDeploymentPinned() (which targets stable named slots, not raw indices,
 * and so isn't subject to index drift) can skip the check.
 */
export async function setDeploymentPinnedByIndex(index, pinned, expectedChecksum) {
    if (expectedChecksum) await verifyIndexMatchesChecksum(index, expectedChecksum);
    const args = ["ostree", "admin", "pin"];
    if (!pinned) args.push("--unpin");
    args.push(String(index));
    try {
        return await cockpit.spawn(args, { superuser: "require", err: "message" });
    } catch (ex) {
        throw asFriendlyError(ex);
    }
}

/**
 * Permanently delete an off-slot deployment, freeing its disk objects now
 * rather than waiting for the next upgrade/switch cycle's automatic GC (which
 * only prunes unpinned deployments older than booted + 1 rollback). `ostree`
 * itself refuses to delete the currently booted deployment, but does NOT
 * check pin status — the UI is responsible for requiring unpin first, since
 * pin exists specifically to signal "don't remove this."
 */
export async function deleteDeployment(index, expectedChecksum) {
    await verifyIndexMatchesChecksum(index, expectedChecksum);
    try {
        return await cockpit.spawn(["ostree", "admin", "undeploy", String(index)], { superuser: "require", err: "message" });
    } catch (ex) {
        throw asFriendlyError(ex);
    }
}

/**
 * Discard a staged update (from Download or Switch) and return to neutral —
 * no reboot, no rollback queued, nothing else changed.
 *
 * bootc has no direct "discard the stage" command; the only way to discard
 * one is `bootc rollback`, which also reorders the bootloader to queue a
 * rollback as a side effect. Since rollback is a toggle (confirmed: calling
 * it twice reverts the ordering), calling it twice in sequence discards the
 * stage and immediately undoes that side effect — net effect is exactly
 * "forget the staged update," not "forget it AND queue a rollback."
 *
 * The two calls aren't atomic — if the connection drops between them, the
 * appliance is left with a real rollback queued. Check status after the
 * first call and only fire the second if it's actually still needed, so an
 * interruption can't leave a silent surprise rollback for next reboot.
 */
export async function cancelStagedUpdate() {
    await stageRollback();
    const status = await getStatus();
    if (status.status?.rollbackQueued) {
        await stageRollback();
    }
}

/**
 * Reboot the system via systemd DBus.
 * Used for rollback only — updates use applyUpdate() instead.
 */
export async function reboot() {
    const systemd = cockpit.dbus("org.freedesktop.systemd1", { bus: "system", superuser: "require" });
    const manager = systemd.proxy(
        "org.freedesktop.systemd1.Manager",
        "/org/freedesktop/systemd1"
    );
    await manager.wait();
    return manager.Reboot();
}

const AUTO_UPDATE_TIMER = "bootc-fetch-apply-updates.timer";

/**
 * Get the auto-update timer state: { unitFileState, activeState, on }.
 *
 * Reads both halves on purpose. RHEL bootc images enable the timer from
 * /usr (default.target.wants), which `systemctl disable` can't remove, so a
 * disabled timer is active again after every boot. Only a mask keeps it off,
 * which is what setAutoUpdate(false) does. "On" therefore means running now
 * and not masked; a masked timer is off even if something left it running.
 * `systemctl show` (unlike is-enabled/is-active) exits 0 for every state.
 */
export async function getAutoUpdateStatus() {
    const output = await cockpit.spawn(
        ["systemctl", "show", "--property=UnitFileState,ActiveState", AUTO_UPDATE_TIMER],
        { err: "message" }
    );
    const props = {};
    for (const line of output.split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1);
    }
    const unitFileState = props.UnitFileState || "";
    const activeState = props.ActiveState || "";
    return {
        unitFileState,
        activeState,
        on: activeState === "active" && !unitFileState.startsWith("masked"),
    };
}

/**
 * Get the auto-update timer's next scheduled run, in epoch milliseconds.
 * Returns null if the timer is inactive or has no next run scheduled.
 */
export async function getNextAutoUpdateRun() {
    try {
        const output = await cockpit.spawn(
            ["systemctl", "list-timers", AUTO_UPDATE_TIMER, "--output=json", "--no-pager"],
            { err: "ignore" }
        );
        const [entry] = JSON.parse(output);
        return entry?.next ? entry.next / 1000 : null;
    } catch {
        return null;
    }
}

/**
 * Turn the auto-update timer on or off.
 *
 * Off is stop + mask: the mask links the unit to /dev/null in /etc, which
 * outranks the image's own /usr enablement, so it stays off across reboots.
 * Stop first, then mask: `mask --now` masks before stopping, the running timer
 * loses its unit ("Unit to trigger vanished") and is left in the failed state,
 * which the shell then reports as a failed service (seen live on RHEL 10,
 * systemd 257). On is unmask + start; the image's /usr wants link
 * (or an existing /etc one) starts it at boot. Only mask/unmask/start — this
 * module never writes unit files or drop-ins for a unit bootc owns.
 *
 * The mask lives in /etc, and every deployment has its own /etc: rolling back
 * boots another deployment with its own auto-update setting.
 */
export async function setAutoUpdate(enabled) {
    const opts = { superuser: "require", err: "message" };
    if (enabled) {
        await cockpit.spawn(["systemctl", "unmask", AUTO_UPDATE_TIMER], opts);
        await cockpit.spawn(["systemctl", "start", AUTO_UPDATE_TIMER], opts);
    } else {
        await cockpit.spawn(["systemctl", "stop", AUTO_UPDATE_TIMER], opts);
        await cockpit.spawn(["systemctl", "mask", AUTO_UPDATE_TIMER], opts);
    }
}

/**
 * Inspect an image reference in the registry without pulling it, for preview
 * before switching. Works on any reference, including ones never deployed —
 * unlike bootc status, which only knows about already-fetched deployments.
 */
export async function inspectImage(ref) {
    let output;
    try {
        output = await spawnWithTimeout(
            ["skopeo", "inspect", `docker://${ref}`],
            { err: "message" },
            INSPECT_TIMEOUT_MS
        );
    } catch (ex) {
        throw asFriendlyError(ex);
    }
    const info = JSON.parse(output);
    const labels = info.Labels || {};

    // RepoTags is every tag in the repo, not the tags that resolve to this
    // digest — confirmed empirically (e.g. a real registry where most tags
    // pointed at entirely different builds, including one with known bugs).
    // Resolve each tag's own digest, keeping only real matches.
    const lastSlash = ref.lastIndexOf('/');
    const lastColon = ref.lastIndexOf(':');
    const repo = lastColon > lastSlash ? ref.slice(0, lastColon) : ref;
    const requestedTag = lastColon > lastSlash ? ref.slice(lastColon + 1) : null;
    // Cap how many other tags we cross-check — a repo with hundreds of CI
    // tags would otherwise mean hundreds of skopeo calls per single preview.
    const otherTags = (info.RepoTags || []).filter(tag => tag !== requestedTag).slice(0, 20);
    const alsoTagged = [];
    // Batch instead of firing all of them at once — a burst of 20 concurrent
    // registry calls for one image preview risks tripping rate limits (429).
    for (let i = 0; i < otherTags.length; i += TAG_CHECK_CONCURRENCY) {
        const chunk = otherTags.slice(i, i + TAG_CHECK_CONCURRENCY);
        const results = await Promise.allSettled(chunk.map(async tag => {
            const tagOutput = await spawnWithTimeout(
                ["skopeo", "inspect", `docker://${repo}:${tag}`],
                { err: "ignore" },
                INSPECT_TIMEOUT_MS
            );
            return { tag, digest: JSON.parse(tagOutput).Digest };
        }));
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value.digest === info.Digest)
                alsoTagged.push(r.value.tag);
        }
    }

    return {
        digest: info.Digest,
        created: labels["org.opencontainers.image.created"] || info.Created || null,
        version: labels["org.opencontainers.image.version"] || null,
        architecture: info.Architecture,
        revision: labels["org.opencontainers.image.revision"] || null,
        source: labels["org.opencontainers.image.source"] || null,
        rhelVersion: labels["redhat.version-id"] || null,
        alsoTagged,
    };
}

/**
 * Switch to a different image reference. Stages the new deployment without
 * rebooting — use applyUpdate()'s reboot path (or a manual reboot) afterward.
 * Streams progress (layer pull, deploy) the same way stageUpdate() does —
 * a registry pull can take a while with nothing else on screen otherwise.
 */
export async function switchImage(ref, onProgress) {
    let streamedText = "";
    const proc = cockpit.spawn(
        withLock(["bootc", "switch", "--transport", "registry", ref]),
        { superuser: "require", err: "out" }
    );
    const { reset, clear } = inactivityTimeout(proc, DOWNLOAD_INACTIVITY_TIMEOUT_MS);
    proc.stream(line => {
        reset();
        streamedText += line;
        const shown = stripFlockLines(line);
        if (onProgress && shown.trim()) onProgress(shown);
    });
    try {
        return await proc;
    } catch (ex) {
        throw asFriendlyError(ex, streamedText);
    } finally {
        clear();
    }
}
