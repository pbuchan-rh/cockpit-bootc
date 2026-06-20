import cockpit from 'cockpit';

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
 * Download and stage an update without committing it.
 * Streams all output (stdout + stderr) to onProgress.
 * Call applyUpdate() to reboot into the staged image.
 */
export function stageUpdate(onProgress) {
    return cockpit.spawn(
        ["bootc", "upgrade", "--download-only"],
        { superuser: "require", err: "out" }
    ).stream(line => {
        if (onProgress) onProgress(line);
    });
}

/**
 * Apply a previously staged update and reboot.
 * Uses --soft-reboot=auto so bootc decides whether a soft reboot
 * (userspace-only, faster) or full reboot is needed. Falls back automatically.
 * This is the sole reboot path for updates — do not call reboot() after stageUpdate().
 */
export function applyUpdate() {
    return cockpit.spawn(
        ["bootc", "upgrade", "--from-downloaded", "--apply", "--soft-reboot=auto"],
        { superuser: "require", err: "message" }
    );
}

/**
 * Stage a rollback to the previous image.
 * Fast — no download required. Requires a reboot to take effect.
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
