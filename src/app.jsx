import cockpit from 'cockpit';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, AlertActionLink } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Divider } from "@patternfly/react-core/dist/esm/components/Divider/index.js";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Skeleton } from "@patternfly/react-core/dist/esm/components/Skeleton/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip/index.js";
import { LockIcon } from "@patternfly/react-icons/dist/esm/icons/lock-icon.js";
import { EmptyStatePanel } from "cockpit-components-empty-state";
import { SuperuserButton } from "superuser-dialogs";

import {
    getStatus,
    checkForUpdates,
    stageUpdate,
    applyUpdate,
    stageRollback,
    cancelStagedUpdate,
    reboot,
    getAutoUpdateStatus,
    getNextAutoUpdateRun,
    switchImage,
    inspectImage,
    setAutoUpdate,
    setDeploymentPinned,
    setDeploymentPinnedByIndex,
    deleteDeployment,
    getDeploymentList,
    getRepoDiskUsage,
    isOstreeBooted,
} from './lib/bootc.js';

import { ImageStatus } from './components/ImageStatus.jsx';
import { ProgressLog } from './components/ProgressLog.jsx';
import { AutoUpdate } from './components/AutoUpdate.jsx';
import { UpdateActions } from './components/UpdateActions.jsx';
import { SwitchImage } from './components/SwitchImage.jsx';
import { DeploymentList } from './components/DeploymentList.jsx';
import { ErrorDetails } from './components/ErrorDetails.jsx';

const _ = cockpit.gettext;

// "just now" / "Xm ago" / "Xh ago" — recomputed on a slow tick so the badge
// tooltip stays roughly fresh without needing a re-render trigger elsewhere.
function formatAgo(date, now) {
    const seconds = Math.floor((now - date.getTime()) / 1000);
    if (seconds < 60) return _("just now");
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return cockpit.format(_("${0}m ago"), minutes);
    const hours = Math.floor(minutes / 60);
    return cockpit.format(_("${0}h ago"), hours);
}

// What the error Alert (and the inspect error) shows: a title naming what
// failed, the friendly message, and the raw tool output when bootc.js kept it.
function errorFrom(title, ex) {
    return { title, message: ex?.message || String(ex), details: ex?.details || null };
}

// The automatic check on page load gives up after this long. It runs in the
// background after the status cards render; an offline or air-gapped host
// should not sit on a spinner.
const AUTO_CHECK_TIMEOUT_MS = 10000;

// Phases of the update/rollback lifecycle
const PHASE = {
    IDLE: 'idle',
    CHECKING: 'checking',
    DOWNLOADING: 'downloading',
    DOWNLOADED: 'downloaded', // staged, awaiting reboot confirm
    REBOOTING: 'rebooting',
};

export const App = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [phase, setPhase] = useState(PHASE.IDLE);
    const [progress, setProgress] = useState([]);
    const [pullEvent, setPullEvent] = useState(null); // latest structured progress event from bootc --progress-fd
    const [rebootModal, setRebootModal] = useState(null); // 'update' | 'rollback' | null
    const [autoUpdateStatus, setAutoUpdateStatus] = useState(null); // { unitFileState, activeState, on }, null = unknown
    const [nextAutoUpdateRun, setNextAutoUpdateRun] = useState(null); // epoch ms, or null if inactive/unscheduled
    const [checking, setChecking] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(null);
    const [switching, setSwitching] = useState(false);
    const [pinningSlot, setPinningSlot] = useState(null); // 'booted' | 'staged' | 'rollback' | null
    const [deployments, setDeployments] = useState([]); // full ostree deployment list, not just bootc's 3 reported slots
    const [pinningIndex, setPinningIndex] = useState(null); // raw ostree index currently being unpinned from OrphanedPinWarning
    const [deletingIndex, setDeletingIndex] = useState(null); // raw ostree index currently being deleted
    const [diskUsage, setDiskUsage] = useState(null); // real total disk used by /ostree/repo
    const [previewing, setPreviewing] = useState(false);
    const [preview, setPreview] = useState(null);
    const [previewError, setPreviewError] = useState(null);
    const [confirmAction, setConfirmAction] = useState(null); // { action: 'rollback' } | { action: 'switch', ref } | null
    const [adminAllowed, setAdminAllowed] = useState(true); // optimistic default; real enforcement is superuser:"require" on each call
    const [overlayWarningDismissed, setOverlayWarningDismissed] = useState(false);
    const [trackedRef, setTrackedRef] = useState(null); // spec.image.image — what upgrade/check actually targets
    const [progressKind, setProgressKind] = useState(null); // 'download' | 'switch' | null
    const [switchUnchanged, setSwitchUnchanged] = useState(false); // switch target matched the already-tracked ref
    const [lastChecked, setLastChecked] = useState(null); // Date of last successful check — in-memory only, resets on reload
    const [now, setNow] = useState(Date.now());
    const [markerPresent, setMarkerPresent] = useState(null); // /run/ostree-booted exists; null = not checked yet
    const switchRefRef = useRef(''); // live (non-stale) copy of SwitchImage's input value, updated on every keystroke
    const loadStatusIdRef = useRef(0); // guards against an older loadStatus() call's response landing after a newer one
    const checkIdRef = useRef(0); // bumped by every check and every action that clears the badge; a stale check result is dropped
    const autoCheckStartedRef = useRef(false); // the automatic check runs once per page open

    useEffect(() => {
        if (!lastChecked) return;
        const id = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(id);
    }, [lastChecked]);

    useEffect(() => {
        if (typeof cockpit.permission !== 'function') return;
        const permission = cockpit.permission({ admin: true });
        const update = () => setAdminAllowed(permission.allowed !== false);
        update();
        permission.addEventListener('changed', update);
        return () => permission.removeEventListener('changed', update);
    }, []);

    const loadStatus = useCallback(async (showLoadingSkeleton = false) => {
        // Only the very first load should unmount the page into the skeleton
        // state — every later refresh (after an action) must update data in
        // place, or every local component state (e.g. the typed switch ref)
        // gets wiped by the remount on every single action.
        if (showLoadingSkeleton) setLoading(true);
        setError(null);

        // Two different action buttons (e.g. Pin and Check for Updates) can
        // each trigger their own loadStatus() without sharing a single "busy"
        // flag — if an older call's response lands after a newer one, it
        // would otherwise overwrite fresher state with stale data. Each call
        // gets an id; any setState below is skipped once a newer call has
        // started.
        const requestId = ++loadStatusIdRef.current;
        const isStale = () => requestId !== loadStatusIdRef.current;

        // Doesn't require root — load it independently so a permission
        // failure on getStatus() below doesn't block it too.
        getAutoUpdateStatus().then(v => { if (!isStale()) setAutoUpdateStatus(v); })
                .catch(() => {});
        getNextAutoUpdateRun().then(v => { if (!isStale()) setNextAutoUpdateRun(v); })
                .catch(() => {});
        getDeploymentList().then(v => { if (!isStale()) setDeployments(v); })
                .catch(() => {});

        try {
            const s = await getStatus();
            if (isStale()) return s.status;
            setStatus(s.status);
            setTrackedRef(s.spec?.image?.image ?? null);
            return s.status;
        } catch (ex) {
            if (!isStale()) setError(errorFrom(_("Could not read image status"), ex));
            return null;
        } finally {
            if (!isStale()) setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus(true);
    }, [loadStatus]);

    // `du -sh /ostree/repo` walks every object in the image store (about
    // 100k files on the demo host), so it runs once, after the first status
    // render, and again only after operations that change the store
    // (download, switch, discard, delete), not on every status refresh. df
    // would be cheaper but measures the whole filesystem (/var included),
    // not the image store.
    const diskUsageStartedRef = useRef(false);
    const refreshDiskUsage = useCallback(() => {
        getRepoDiskUsage().then(setDiskUsage)
                .catch(() => {});
    }, []);
    useEffect(() => {
        if (diskUsageStartedRef.current || !status?.booted) return;
        diskUsageStartedRef.current = true;
        refreshDiskUsage();
    }, [status, refreshDiskUsage]);

    // Administrative access turned on after the page loaded (the button in
    // the limited-access empty state, or the shell's own): load what the
    // first, unprivileged attempt couldn't.
    const prevAdminAllowedRef = useRef(adminAllowed);
    useEffect(() => {
        if (adminAllowed && !prevAdminAllowedRef.current) loadStatus();
        prevAdminAllowedRef.current = adminAllowed;
    }, [adminAllowed, loadStatus]);

    useEffect(() => {
        // An unreadable marker isn't proof of anything — fall back to what
        // bootc status says (booted: null) instead of hiding the UI.
        isOstreeBooted().then(setMarkerPresent)
                .catch(() => setMarkerPresent(true));
    }, []);

    // quiet: the automatic check on page load. It fails silently (offline,
    // air-gapped, registry down, timeout): no error alert, just no badge.
    const runCheckForUpdates = useCallback(async ({ quiet = false } = {}) => {
        // Nothing to compare against without a booted image and a tracked
        // ref — skopeo would otherwise resolve "null" against Docker Hub.
        if (!trackedRef || !status?.booted) return;
        const checkId = ++checkIdRef.current;
        const isCurrent = () => checkId === checkIdRef.current;
        setChecking(true);
        if (!quiet) setError(null);
        setUpdateAvailable(null); // hide the stale badge while this check is in flight
        try {
            const available = await checkForUpdates(trackedRef, status.booted.image?.imageDigest,
                                                    quiet ? AUTO_CHECK_TIMEOUT_MS : undefined);
            if (!isCurrent()) return;
            setUpdateAvailable(available);
            setLastChecked(new Date());
        } catch (ex) {
            if (!quiet && isCurrent()) setError(errorFrom(_("Checking for updates failed"), ex));
        } finally {
            if (isCurrent()) setChecking(false);
        }
    }, [trackedRef, status]);

    // An action changed what is booted or staged: the badge no longer
    // applies, and a check still in flight must not bring it back.
    function clearUpdateCheck() {
        checkIdRef.current++;
        setUpdateAvailable(null);
        setChecking(false);
    }

    // Once per page open, after the status cards have rendered: the same
    // check as the button, in the background.
    useEffect(() => {
        if (autoCheckStartedRef.current || !trackedRef || !status?.booted) return;
        autoCheckStartedRef.current = true;
        runCheckForUpdates({ quiet: true });
    }, [trackedRef, status, runCheckForUpdates]);

    async function handleCheckForUpdates() {
        await runCheckForUpdates();
    }

    async function doDownloadUpdate() {
        setPhase(PHASE.DOWNLOADING);
        setProgress([]);
        setPullEvent(null);
        setProgressKind('download');
        setError(null);
        try {
            await stageUpdate(line => setProgress(p => [...p, line]), setPullEvent);
            await loadStatus();
            setPhase(PHASE.DOWNLOADED);
            clearUpdateCheck();
        } catch (ex) {
            setError(errorFrom(_("Downloading the update failed"), ex));
            setPhase(PHASE.IDLE);
        }
        refreshDiskUsage(); // a failed pull can still have stored layers
    }

    async function doApplyUpdate() {
        setRebootModal(null);
        setPhase(PHASE.REBOOTING);
        try {
            await applyUpdate();
        } catch (ex) {
            setError(errorFrom(_("Applying the update failed"), ex));
            setPhase(PHASE.DOWNLOADED);
        }
    }

    async function doRollback() {
        setConfirmAction(null);
        setError(null);
        try {
            await stageRollback();
            await loadStatus(); // status.rollbackQueued now reflects this — no local flag needed
            clearUpdateCheck();
        } catch (ex) {
            setError(errorFrom(_("Rollback failed"), ex));
        }
    }

    async function doTogglePin(slot, currentlyPinned) {
        setError(null);
        setPinningSlot(slot);
        try {
            await setDeploymentPinned(slot, !currentlyPinned);
            await loadStatus();
        } catch (ex) {
            setError(errorFrom(currentlyPinned ? _("Unpinning failed") : _("Pinning failed"), ex));
        } finally {
            setPinningSlot(null);
        }
    }

    async function doTogglePinByIndex(index, currentlyPinned, expectedChecksum) {
        setError(null);
        setPinningIndex(index);
        try {
            await setDeploymentPinnedByIndex(index, !currentlyPinned, expectedChecksum);
            await loadStatus();
        } catch (ex) {
            setError(errorFrom(currentlyPinned ? _("Unpinning failed") : _("Pinning failed"), ex));
        } finally {
            setPinningIndex(null);
        }
    }

    // Closing the modal returns focus to whichever button opened it — left
    // unblurred, a danger-variant button (e.g. Delete) keeps rendering its
    // :focus style, a darker red than its resting state, which reads as
    // "stuck" rather than "closed." The modal's own focus-restore-on-close
    // logic re-focuses that button *after* this handler runs, so blurring
    // immediately gets overridden — deferring to the next tick lets our blur
    // win.
    function closeConfirmModal() {
        setConfirmAction(null);
        setTimeout(() => document.activeElement?.blur(), 0);
    }

    async function doDeleteDeployment(index, expectedChecksum) {
        setConfirmAction(null);
        setError(null);
        setDeletingIndex(index);
        try {
            await deleteDeployment(index, expectedChecksum);
            await loadStatus();
            refreshDiskUsage();
        } catch (ex) {
            setError(errorFrom(_("Deleting the deployment failed"), ex));
        } finally {
            setDeletingIndex(null);
        }
    }

    async function doCancelStagedUpdate() {
        setConfirmAction(null);
        setError(null);
        try {
            await cancelStagedUpdate();
            await loadStatus();
            setPhase(PHASE.IDLE); // handleDownloadUpdate may have left phase stuck at DOWNLOADED
            refreshDiskUsage();
        } catch (ex) {
            setError(errorFrom(_("Discarding the staged update failed"), ex));
        }
    }

    async function doReboot() {
        setRebootModal(null);
        setPhase(PHASE.REBOOTING);
        try {
            await reboot();
        } catch (ex) {
            setError(errorFrom(_("Reboot failed"), ex));
            setPhase(PHASE.IDLE);
        }
    }

    async function doSwitchImage(ref) {
        setConfirmAction(null);
        setSwitching(true);
        setError(null);
        setProgress([]);
        setPullEvent(null);
        setProgressKind('switch');
        // Determine "no-op switch" from our own known state, not by parsing
        // bootc's English status text out of the streamed output — that
        // text is locale-dependent and could change with any bootc version.
        setSwitchUnchanged(trackedRef === ref);
        try {
            await switchImage(ref, line => setProgress(p => [...p, line]), setPullEvent);
            await loadStatus();
            clearUpdateCheck();
        } catch (ex) {
            setError(errorFrom(_("Switching image failed"), ex));
        } finally {
            setSwitching(false);
            refreshDiskUsage(); // a failed pull can still have stored layers
        }
    }

    async function handlePreview(ref) {
        setPreviewing(true);
        setPreview(null);
        setPreviewError(null);
        try {
            const result = await inspectImage(ref);
            // Discard a stale response if the input was edited while the
            // request was in flight — otherwise a slow lookup for an old ref
            // could land after the field already shows something else.
            if (switchRefRef.current === ref) setPreview(result);
        } catch (ex) {
            if (switchRefRef.current === ref) setPreviewError(errorFrom(_("Could not inspect image"), ex));
        } finally {
            setPreviewing(false);
        }
    }

    async function doAutoUpdateToggle(enabled) {
        try {
            await setAutoUpdate(enabled);
        } catch (ex) {
            setError(errorFrom(enabled ? _("Turning on automatic updates failed") : _("Turning off automatic updates failed"), ex));
        }
        // Re-read instead of assuming: the switch must show what systemd
        // reports, including after a partial failure (e.g. unmask worked,
        // start didn't).
        try {
            const autoUpdate = await getAutoUpdateStatus();
            setAutoUpdateStatus(autoUpdate);
            setNextAutoUpdateRun(autoUpdate.on ? await getNextAutoUpdateRun() : null);
        } catch {
            setAutoUpdateStatus(null);
        }
    }

    // One host-changing operation at a time. Without this, a double click
    // starts two: the rollback card's Cancel runs `bootc rollback` twice,
    // which either fails on the lock (a red error for a click) or, if the
    // first already finished, toggles the rollback straight back. A ref, not
    // state, because both clicks of a double click see the same render.
    const operationRef = useRef(false);
    const exclusive = fn => async (...args) => {
        if (operationRef.current) return;
        operationRef.current = true;
        try {
            return await fn(...args);
        } finally {
            operationRef.current = false;
        }
    };
    const handleDownloadUpdate = exclusive(doDownloadUpdate);
    const handleApplyUpdate = exclusive(doApplyUpdate);
    const handleRollback = exclusive(doRollback);
    const handleTogglePin = exclusive(doTogglePin);
    const handleTogglePinByIndex = exclusive(doTogglePinByIndex);
    const handleDeleteDeployment = exclusive(doDeleteDeployment);
    const handleCancelStagedUpdate = exclusive(doCancelStagedUpdate);
    const handleReboot = exclusive(doReboot);
    const handleSwitchImage = exclusive(doSwitchImage);
    const handleAutoUpdateToggle = exclusive(doAutoUpdateToggle);

    // Rollback only reorders local deployments; it doesn't touch the registry, so
    // if the auto-update timer runs on the rolled-back system it re-applies the
    // newer image and undoes the rollback (RHEL image mode docs: "If you perform a
    // rollback, the system will automatically update again unless you turn off
    // auto-updates"). Turning it off *here* doesn't help: the off switch is a mask
    // in /etc, every deployment has its own /etc, and the rollback target boots
    // with whatever auto-update setting its own /etc has. Say that, not "turn it
    // off first". Verified live on 3.12 -> 3.11 -> 3.12 (see RELEASE-1.1.2.md).
    // The why is in the README ("Rollback and /etc"); the dialogs say what to
    // do. Shown in both steps: the reboot step can be reached without the
    // first (a rollback queued from another session or the CLI).
    const rollbackAutoUpdateHint = (
        <p className="ct-modal-hint">{_("Automatic updates can undo a rollback. Check the setting after the reboot.")}</p>
    );

    // What a rollback goes back to, by name, in both the stage and the reboot
    // dialog: the version label bootc status reports for the rollback
    // deployment (it stays the target while the rollback is queued), or its
    // short digest when the image has no version label.
    const rollbackTarget = status?.rollback
        ? (status.rollback.image?.version || (status.rollback.image?.imageDigest || '').replace(/^sha256:/, '').slice(0, 12))
        : null;

    // Rollback dialog bodies. Step 1 (stage) also says when it discards a
    // staged update; step 2 (reboot) repeats the /etc loss.
    const rollbackStageBody = (
        <>
            <p>
                {status?.staged && <>{cockpit.format(_("The staged update ($0) will be discarded."), status.staged.image?.version || _("unknown version"))} </>}
                {cockpit.format(_("$0 will be staged for the next boot."), rollbackTarget)}
                {' '}<strong>{cockpit.format(_("/etc will revert to $0's copy, and changes made since then will be lost."), rollbackTarget)}</strong>
            </p>
            {rollbackAutoUpdateHint}
        </>
    );
    const rollbackRebootBody = (
        <>
            <p>{cockpit.format(_("The system will reboot into $0."), rollbackTarget)} <strong>{_("Changes to /etc made since then will be lost.")}</strong></p>
            {rollbackAutoUpdateHint}
        </>
    );

    // The delete dialog names its target by version, or by short checksum
    // when the image has no version label (title and body alike).
    const deleteTargetName = confirmAction?.action === 'delete-deployment' &&
        (confirmAction.version || confirmAction.checksum.slice(0, 12));

    if (loading) {
        return (
            <Page className="pf-m-no-sidebar">
                <PageSection>
                    <Skeleton width="75%" screenreaderText={_("Loading image status")} />
                    <br />
                    <Skeleton width="50%" />
                </PageSection>
            </Page>
        );
    }

    // RHEL package-mode hosts ship the bootc binary too; there `bootc status`
    // succeeds with booted: null. The manifest condition hides the module on
    // such hosts, but it can still be reached by URL, so render nothing
    // actionable rather than a UI where every action is meaningless.
    if (markerPresent === false || (status && !status.booted)) {
        return (
            <Page className="pf-m-no-sidebar">
                <PageSection>
                    <EmptyState
                        id="ct-not-bootc"
                        headingLevel="h1"
                        titleText={_("Not a bootc system")}
                    >
                        <EmptyStateBody>
                            {_("This system was not booted from a bootc image.")}
                        </EmptyStateBody>
                    </EmptyState>
                </PageSection>
            </Page>
        );
    }

    // bootc status needs root. Without administrative access there is nothing
    // to show, so do what Cockpit's own pages do: an empty state with the
    // button that turns administrative access on.
    if (!status && !adminAllowed) {
        return (
            <Page className="pf-m-no-sidebar">
                <PageSection>
                    <EmptyStatePanel
                        icon={LockIcon}
                        title={_("Administrative access required")}
                        paragraph={_("Image updates need administrative access.")}
                        action={<SuperuserButton />}
                    />
                </PageSection>
            </Page>
        );
    }

    // ostree's own deployment list (used for the full table below) only has
    // checksums, not human-readable versions — cross-reference by checksum
    // against everything bootc status knows a version for: the 3 named slots,
    // plus otherDeployments, which covers exactly the off-slot rows this
    // table exists to show (otherwise they'd fall back to a bare hash, the
    // one case where a real version string is most needed).
    const versionByChecksum = {};
    for (const slot of [status?.booted, status?.staged, status?.rollback, ...(status?.otherDeployments || [])]) {
        if (slot?.ostree?.checksum && slot?.image?.version) {
            versionByChecksum[slot.ostree.checksum] = slot.image.version;
        }
    }

    return (
        <Page className="pf-m-no-sidebar">
            <PageSection>
                {error && (
                    <Alert
                        variant="danger"
                        title={error.title}
                        isInline
                        actionClose={<Button variant="plain" aria-label={_("Close error")} onClick={() => setError(null)}>×</Button>}
                    >
                        {error.message}
                        <ErrorDetails details={error.details} />
                    </Alert>
                )}

                {status?.usrOverlay && !overlayWarningDismissed && (
                    <Alert
                        variant="warning"
                        title={_("/usr has a temporary overlay")}
                        isInline
                        actionClose={<Button variant="plain" aria-label={_("Dismiss overlay warning")} onClick={() => setOverlayWarningDismissed(true)}>×</Button>}
                        actionLinks={
                            <AlertActionLink onClick={() => setRebootModal('overlay')}>
                                {_("Reboot to clear")}
                            </AlertActionLink>
                        }
                    >
                        {_("Changes under /usr will be lost at the next reboot.")}
                    </Alert>
                )}

                <Card isPlain>
                    <CardHeader
                        id="ct-image-ref-header"
                        actions={{
                            actions: (
                                <Flex direction={{ default: 'column' }} alignItems={{ default: 'alignItemsFlexEnd' }} spaceItems={{ default: 'spaceItemsSm' }}>
                                    <FlexItem>
                                        <UpdateActions
                                            updateAvailable={updateAvailable}
                                            checking={checking}
                                            downloading={phase === PHASE.DOWNLOADING}
                                            disabled={!adminAllowed || phase === PHASE.DOWNLOADING || phase === PHASE.REBOOTING || !!status?.rollbackQueued || phase === PHASE.DOWNLOADED || !!status?.staged || switching}
                                            onCheckForUpdates={handleCheckForUpdates}
                                            onDownloadUpdate={handleDownloadUpdate}
                                        />
                                    </FlexItem>
                                    <FlexItem>
                                        <AutoUpdate
                                            status={autoUpdateStatus}
                                            nextRun={nextAutoUpdateRun}
                                            onToggle={enabled => enabled ? setConfirmAction({ action: 'autoupdate-enable' }) : handleAutoUpdateToggle(false)}
                                            onKeepOff={() => handleAutoUpdateToggle(false)}
                                            disabled={!adminAllowed}
                                        />
                                    </FlexItem>
                                </Flex>
                            ),
                        }}
                    >
                        {trackedRef && (
                            <CardTitle>
                                <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                                    <FlexItem>
                                        <Title headingLevel="h2" size="lg">{_("Container image reference")}</Title>
                                    </FlexItem>
                                    {updateAvailable !== null && (
                                        <FlexItem>
                                            <Tooltip content={cockpit.format(_("Checked $0"), formatAgo(lastChecked, now))}>
                                                <Label isCompact color={updateAvailable ? 'blue' : 'green'}>
                                                    {updateAvailable ? _("Update available") : _("Up to date")}
                                                </Label>
                                            </Tooltip>
                                        </FlexItem>
                                    )}
                                </Flex>
                                <code className="ct-tracked-ref-value">{trackedRef}</code>
                            </CardTitle>
                        )}
                    </CardHeader>
                    <CardBody>
                        <Divider className="ct-tracking-divider" />

                        <SwitchImage
                            switching={switching}
                            disabled={phase === PHASE.DOWNLOADING || phase === PHASE.REBOOTING || !!status?.rollbackQueued}
                            switchDisabled={!adminAllowed}
                            onSwitch={ref => setConfirmAction({ action: 'switch', ref })}
                            previewing={previewing}
                            preview={preview}
                            previewError={previewError}
                            onPreview={handlePreview}
                            onDismissPreview={() => { setPreview(null); setPreviewError(null) }}
                            onRefChange={value => {
                                // Any edit invalidates whatever's currently displayed — a preview
                                // for the old text shouldn't keep looking like it describes the new
                                // text just because no new request has resolved yet.
                                if (value !== switchRefRef.current) {
                                    setPreview(null);
                                    setPreviewError(null);
                                }
                                switchRefRef.current = value;
                            }}
                        />

                        {(progress.length > 0 || pullEvent || phase === PHASE.DOWNLOADING || switching) && (
                            <ProgressLog
                                lines={progress}
                                running={phase === PHASE.DOWNLOADING || switching}
                                kind={progressKind}
                                unchanged={progressKind === 'switch' && switchUnchanged}
                                pullEvent={pullEvent}
                                onDismiss={() => { setProgress([]); setPullEvent(null); setProgressKind(null) }}
                            />
                        )}

                        <Divider className="ct-status-divider" />
                    </CardBody>
                </Card>

                {status && (
                    <ImageStatus
                        booted={status.booted}
                        staged={status.staged}
                        rollback={status.rollback}
                        phase={phase}
                        rollbackQueued={!!status.rollbackQueued}
                        disabled={!adminAllowed || switching}
                        onConfirmUpdate={() => setRebootModal('update')}
                        onRollback={() => setConfirmAction({ action: 'rollback' })}
                        onCancelStagedUpdate={() => setConfirmAction({ action: 'cancel-staged' })}
                        onCancelRollback={handleRollback}
                        onConfirmReboot={() => setRebootModal('rollback')}
                        onTogglePin={handleTogglePin}
                        pinningSlot={pinningSlot}
                    />
                )}

                <DeploymentList
                    deployments={deployments}
                    versionByChecksum={versionByChecksum}
                    diskUsage={diskUsage}
                    pinningIndex={pinningIndex}
                    onTogglePin={handleTogglePinByIndex}
                    deletingIndex={deletingIndex}
                    onDelete={(index, checksum) => setConfirmAction({ action: 'delete-deployment', index, checksum, version: versionByChecksum[checksum] })}
                    disabled={!adminAllowed}
                />
            </PageSection>

            <Modal
                isOpen={rebootModal !== null}
                onClose={() => setRebootModal(null)}
                variant="small"
            >
                <ModalHeader
                    title={
                        rebootModal === 'update'
                            ? _("Apply update and reboot?")
                            : rebootModal === 'overlay'
                                ? _("Reboot to clear /usr overlay?")
                                : rollbackTarget ? cockpit.format(_("Reboot to roll back to $0?"), rollbackTarget) : _("Reboot to roll back?")
                    }
                />
                <ModalBody>
                    {rebootModal === 'update'
                        ? _("The system will reboot into the staged update.")
                        : rebootModal === 'overlay'
                            ? _("The system will reboot and discard the /usr overlay.")
                            : rollbackRebootBody
                    }
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="primary"
                        onClick={rebootModal === 'update' ? handleApplyUpdate : handleReboot}
                        isDisabled={!adminAllowed}
                    >
                        {phase === PHASE.REBOOTING ? _("Rebooting…") : _("Reboot")}
                    </Button>
                    <Button variant="secondary" onClick={() => setRebootModal(null)}>
                        {_("Cancel")}
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={confirmAction !== null}
                onClose={closeConfirmModal}
                variant="small"
            >
                <ModalHeader
                    title={
                        confirmAction?.action === 'switch'
                            ? _("Switch image?")
                            : confirmAction?.action === 'autoupdate-enable'
                                ? _("Enable automatic updates?")
                                : confirmAction?.action === 'cancel-staged'
                                    ? _("Discard staged update?")
                                    : confirmAction?.action === 'delete-deployment'
                                        ? cockpit.format(_("Delete $0?"), deleteTargetName)
                                        : rollbackTarget ? cockpit.format(_("Roll back to $0?"), rollbackTarget) : _("Stage rollback?")
                    }
                />
                <ModalBody>
                    {confirmAction?.action === 'switch'
                        ? cockpit.format(_("Switch to $0? It downloads now and takes effect at the next reboot."), confirmAction.ref)
                        : confirmAction?.action === 'autoupdate-enable'
                            ? _("New images will be downloaded and applied automatically, and the system will reboot without asking.")
                            : confirmAction?.action === 'cancel-staged'
                                ? _("The staged update will be removed. The system will not reboot.")
                                : confirmAction?.action === 'delete-deployment'
                                    ? cockpit.format(_("$0 will be deleted from this system. This cannot be undone."), deleteTargetName)
                                    : rollbackStageBody
                    }
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant={confirmAction?.action === 'delete-deployment' ? 'danger' : 'primary'}
                        onClick={() => {
                            if (confirmAction?.action === 'switch') {
                                handleSwitchImage(confirmAction.ref);
                            } else if (confirmAction?.action === 'autoupdate-enable') {
                                setConfirmAction(null);
                                handleAutoUpdateToggle(true);
                            } else if (confirmAction?.action === 'cancel-staged') {
                                handleCancelStagedUpdate();
                            } else if (confirmAction?.action === 'delete-deployment') {
                                handleDeleteDeployment(confirmAction.index, confirmAction.checksum);
                            } else {
                                handleRollback();
                            }
                        }}
                        isDisabled={!adminAllowed}
                    >
                        {confirmAction?.action === 'switch'
                            ? _("Switch")
                            : confirmAction?.action === 'autoupdate-enable'
                                ? _("Enable")
                                : confirmAction?.action === 'cancel-staged'
                                    ? _("Discard")
                                    : confirmAction?.action === 'delete-deployment'
                                        ? _("Delete")
                                        : _("Stage rollback")}
                    </Button>
                    <Button variant="secondary" onClick={closeConfirmModal}>
                        {_("Cancel")}
                    </Button>
                </ModalFooter>
            </Modal>
        </Page>
    );
};
