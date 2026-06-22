import cockpit from 'cockpit';

const SETTINGS_PATH = '/var/lib/cockpit-bootc/settings.json';
const STATUS_CACHE_PATH = '/var/lib/cockpit-bootc/status-cache.json';
const HISTORY_PATH = '/var/lib/cockpit-bootc/history.json';
const ACTIVITY_PATH = '/var/lib/cockpit-bootc/activity.json';
const LOGS_DIR = '/var/lib/cockpit-bootc/logs';
const MAX_RECENT_REFS = 10;
const MAX_HISTORY_ENTRIES = 20;
const MAX_ACTIVITY_ENTRIES = 20;

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
 * Cache the last-known status to disk (world-readable) so a session without
 * admin access can still show something — bootc status itself requires root
 * unconditionally, so this is the only way to show data in Limited Access mode.
 */
export async function cacheStatus(status) {
    const content = JSON.stringify({ status, cached_at: new Date().toISOString() }, null, 2);
    await cockpit.file(STATUS_CACHE_PATH, { superuser: "require" }).replace(content);
    await cockpit.spawn(["chmod", "644", STATUS_CACHE_PATH], { superuser: "require" });
}

/**
 * Read the cached status, if any. Returns null if never cached or unreadable.
 * Does not require admin access — that's the whole point.
 */
export async function getCachedStatus() {
    try {
        const content = await cockpit.file(STATUS_CACHE_PATH).read();
        if (!content) return null;
        return JSON.parse(content);
    } catch {
        return null;
    }
}

/**
 * Read the boot history log (most-recent-first). Returns [] if none yet.
 */
export async function getBootHistory() {
    try {
        const content = await cockpit.file(HISTORY_PATH).read();
        if (!content) return [];
        const h = JSON.parse(content);
        return Array.isArray(h.entries) ? h.entries : [];
    } catch {
        return [];
    }
}

/**
 * Append a boot-history entry if this digest differs from the most recent
 * recorded one. Call this whenever a fresh booted-image status is observed —
 * it's a no-op if nothing actually changed, so it's safe to call on every load.
 * Capped at MAX_HISTORY_ENTRIES, oldest dropped first.
 */
export async function recordBootIfChanged(bootedSlot) {
    const digest = bootedSlot?.image?.imageDigest;
    if (!digest) return;

    const entries = await getBootHistory();
    if (entries[0]?.digest === digest) return; // no real change since last recorded

    const entry = {
        digest,
        version: bootedSlot.image.version ?? null,
        reference: bootedSlot.image.image?.image ?? null,
        observed_at: new Date().toISOString(),
    };
    const newEntries = [entry, ...entries].slice(0, MAX_HISTORY_ENTRIES);
    await cockpit.file(HISTORY_PATH, { superuser: "require" })
            .replace(JSON.stringify({ entries: newEntries }, null, 2));
    await cockpit.spawn(["chmod", "644", HISTORY_PATH], { superuser: "require" });
}

/**
 * Read the activity log (completed Download/Switch transactions,
 * most-recent-first). Returns [] if none yet.
 */
export async function getActivityLog() {
    try {
        const content = await cockpit.file(ACTIVITY_PATH).read();
        if (!content) return [];
        const a = JSON.parse(content);
        return Array.isArray(a.entries) ? a.entries : [];
    } catch {
        return [];
    }
}

/**
 * Record a completed (or failed) Download/Switch transaction, with its full
 * streamed output saved as a downloadable log file. Capped at
 * MAX_ACTIVITY_ENTRIES, oldest dropped first (and its log file removed).
 */
export async function recordActivity({ kind, ref, version, success, logLines }) {
    const startedAt = new Date().toISOString();
    const logFile = `${startedAt.replace(/[:.]/g, '-')}-${kind}.log`;
    const logPath = `${LOGS_DIR}/${logFile}`;

    await cockpit.spawn(["mkdir", "-p", LOGS_DIR], { superuser: "require" });
    await cockpit.file(logPath, { superuser: "require" }).replace(logLines.join('\n'));
    await cockpit.spawn(["chmod", "644", logPath], { superuser: "require" });

    const entries = await getActivityLog();
    const entry = { started_at: startedAt, kind, ref, version: version ?? null, success, log_file: logFile };
    const newEntries = [entry, ...entries].slice(0, MAX_ACTIVITY_ENTRIES);

    const dropped = entries.slice(MAX_ACTIVITY_ENTRIES - 1);
    for (const old of dropped) {
        cockpit.spawn(["rm", "-f", `${LOGS_DIR}/${old.log_file}`], { superuser: "require" }).catch(() => {});
    }

    await cockpit.file(ACTIVITY_PATH, { superuser: "require" })
            .replace(JSON.stringify({ entries: newEntries }, null, 2));
    await cockpit.spawn(["chmod", "644", ACTIVITY_PATH], { superuser: "require" });
}

/**
 * Read a saved activity log's full text, for download.
 */
export async function getActivityLogText(logFile) {
    return cockpit.file(`${LOGS_DIR}/${logFile}`).read();
}

/**
 * Check for an available update without downloading.
 * Returns true if an update is available, false if already up to date.
 *
 * bootc always exits 0 here regardless of outcome — it prints "No changes
 * in: <ref>" to stdout when there's nothing new, so that's the only signal.
 */
export async function checkForUpdates() {
    const output = await cockpit.spawn(
        ["bootc", "upgrade", "--check"],
        { superuser: "require", err: "message" }
    );
    return !output.includes("No changes in");
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
export function switchImage(ref, onProgress) {
    return cockpit.spawn(
        ["bootc", "switch", "--transport", "registry", ref],
        { superuser: "require", err: "out" }
    ).stream(line => {
        if (onProgress) onProgress(line);
    });
}

/**
 * Read module settings (recent image refs). Returns defaults if the file
 * doesn't exist yet or is unreadable.
 */
export async function getSettings() {
    try {
        const content = await cockpit.file(SETTINGS_PATH).read();
        if (!content) return { recent_refs: [] };
        const s = JSON.parse(content);
        return { recent_refs: Array.isArray(s.recent_refs) ? s.recent_refs : [] };
    } catch {
        return { recent_refs: [] };
    }
}

/**
 * Record a successfully-switched-to image ref in settings, most-recent-first,
 * deduplicated, capped at MAX_RECENT_REFS.
 */
export async function addRecentRef(ref) {
    const settings = await getSettings();
    const recent_refs = [ref, ...settings.recent_refs.filter(r => r !== ref)].slice(0, MAX_RECENT_REFS);
    await cockpit.file(SETTINGS_PATH, { superuser: "require" })
            .replace(JSON.stringify({ recent_refs }, null, 2));
    await cockpit.spawn(["chmod", "644", SETTINGS_PATH], { superuser: "require" });
}
