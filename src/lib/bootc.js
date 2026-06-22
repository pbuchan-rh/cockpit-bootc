import cockpit from 'cockpit';

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

function withLock(argv) {
    return ["flock", "--nonblock", "--verbose", LOCK_FILE, ...argv];
}

// Distinguish "another bootc-mutating call is already running" from a real
// command failure so the UI can show something actionable instead of raw
// flock/bootc stderr. streamedText covers stageUpdate/switchImage, which use
// err: "out" (stderr merged into the streamed output, not ex.message).
function asFriendlyError(ex, streamedText = "") {
    const text = (ex && ex.message) || streamedText;
    if (ex && ex.exit_status === 1 && /failed to get lock/.test(text)) {
        return new Error("Another bootc operation is already in progress. Try again in a moment.");
    }
    return ex;
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
    try {
        return await cockpit.spawn(
            withLock(["bootc", "upgrade", "--download-only"]),
            { superuser: "require", err: "out" }
        ).stream(line => {
            streamedText += line;
            if (onProgress) onProgress(line);
        });
    } catch (ex) {
        throw asFriendlyError(ex, streamedText);
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
 */
export async function cancelStagedUpdate() {
    await stageRollback();
    await stageRollback();
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

/**
 * Get the auto-update timer state.
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
    return cockpit.spawn(
        ["systemctl", enabled ? "enable" : "disable", "--now", "bootc-fetch-apply-updates.timer"],
        { superuser: "require", err: "message" }
    );
}

/**
 * Inspect an image reference in the registry without pulling it, for preview
 * before switching. Works on any reference, including ones never deployed —
 * unlike bootc status, which only knows about already-fetched deployments.
 */
export async function inspectImage(ref) {
    const output = await cockpit.spawn(
        ["skopeo", "inspect", "--tls-verify=false", `docker://${ref}`],
        { err: "message" }
    );
    const info = JSON.parse(output);
    const labels = info.Labels || {};
    return {
        digest: info.Digest,
        created: labels["org.opencontainers.image.created"] || info.Created || null,
        version: labels["org.opencontainers.image.version"] || null,
        architecture: info.Architecture,
        revision: labels["org.opencontainers.image.revision"] || null,
        source: labels["org.opencontainers.image.source"] || null,
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
    try {
        return await cockpit.spawn(
            withLock(["bootc", "switch", "--transport", "registry", ref]),
            { superuser: "require", err: "out" }
        ).stream(line => {
            streamedText += line;
            if (onProgress) onProgress(line);
        });
    } catch (ex) {
        throw asFriendlyError(ex, streamedText);
    }
}
