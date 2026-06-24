import cockpit from 'cockpit';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { AlertActionLink } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Divider } from "@patternfly/react-core/dist/esm/components/Divider/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Skeleton } from "@patternfly/react-core/dist/esm/components/Skeleton/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip/index.js";

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
    setDeploymentPinned,
    setDeploymentPinnedByIndex,
    getDeploymentList,
    getRepoDiskUsage,
} from './lib/bootc.js';

import { ImageStatus } from './components/ImageStatus.jsx';
import { ProgressLog } from './components/ProgressLog.jsx';
import { AutoUpdate } from './components/AutoUpdate.jsx';
import { UpdateActions } from './components/UpdateActions.jsx';
import { SwitchImage } from './components/SwitchImage.jsx';
import { DeploymentList } from './components/DeploymentList.jsx';

// "just now" / "Xm ago" / "Xh ago" — recomputed on a slow tick so the badge
// tooltip stays roughly fresh without needing a re-render trigger elsewhere.
function formatAgo(date, now) {
    const seconds = Math.floor((now - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

// Phases of the update/rollback lifecycle
const PHASE = {
    IDLE: 'idle',
    CHECKING: 'checking',
    DOWNLOADING: 'downloading',
    DOWNLOADED: 'downloaded',     // staged, awaiting reboot confirm
    REBOOTING: 'rebooting',
};

export const App = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [phase, setPhase] = useState(PHASE.IDLE);
    const [progress, setProgress] = useState([]);
    const [rebootModal, setRebootModal] = useState(null); // 'update' | 'rollback' | null
    const [autoUpdateStatus, setAutoUpdateStatus] = useState('unknown');
    const [nextAutoUpdateRun, setNextAutoUpdateRun] = useState(null); // epoch ms, or null if inactive/unscheduled
    const [checking, setChecking] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(null);
    const [switching, setSwitching] = useState(false);
    const [pinningSlot, setPinningSlot] = useState(null); // 'booted' | 'staged' | 'rollback' | null
    const [deployments, setDeployments] = useState([]); // full ostree deployment list, not just bootc's 3 reported slots
    const [pinningIndex, setPinningIndex] = useState(null); // raw ostree index currently being unpinned from OrphanedPinWarning
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
    const switchRefRef = useRef(''); // live (non-stale) copy of SwitchImage's input value, updated on every keystroke

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

        // Doesn't require root — load it independently so a permission
        // failure on getStatus() below doesn't block it too.
        getAutoUpdateStatus().then(setAutoUpdateStatus).catch(() => {});
        getNextAutoUpdateRun().then(setNextAutoUpdateRun).catch(() => {});
        getDeploymentList().then(setDeployments).catch(() => {});
        getRepoDiskUsage().then(setDiskUsage).catch(() => {});

        try {
            const s = await getStatus();
            setStatus(s.status);
            setTrackedRef(s.spec?.image?.image ?? null);
            return s.status;
        } catch (ex) {
            setError(ex.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus(true);
    }, [loadStatus]);

    const runCheckForUpdates = useCallback(async () => {
        setChecking(true);
        setError(null);
        setUpdateAvailable(null); // hide the stale badge while this check is in flight
        try {
            const available = await checkForUpdates(trackedRef, status?.booted?.image?.imageDigest);
            setUpdateAvailable(available);
            setLastChecked(new Date());
        } catch (ex) {
            setError(ex.message);
        } finally {
            setChecking(false);
        }
    }, [trackedRef, status]);

    async function handleCheckForUpdates() {
        await runCheckForUpdates();
    }

    async function handleDownloadUpdate() {
        setPhase(PHASE.DOWNLOADING);
        setProgress([]);
        setProgressKind('download');
        setError(null);
        try {
            await stageUpdate(line => setProgress(p => [...p, line]));
            await loadStatus();
            setPhase(PHASE.DOWNLOADED);
            setUpdateAvailable(null);
        } catch (ex) {
            setError(ex.message);
            setPhase(PHASE.IDLE);
        }
    }

    async function handleApplyUpdate() {
        setRebootModal(null);
        setPhase(PHASE.REBOOTING);
        try {
            await applyUpdate();
        } catch (ex) {
            setError(ex.message);
            setPhase(PHASE.DOWNLOADED);
        }
    }

    async function handleRollback() {
        setConfirmAction(null);
        setError(null);
        try {
            await stageRollback();
            await loadStatus(); // status.rollbackQueued now reflects this — no local flag needed
            setUpdateAvailable(null);
        } catch (ex) {
            setError(ex.message);
        }
    }

    async function handleTogglePin(slot, currentlyPinned) {
        setError(null);
        setPinningSlot(slot);
        try {
            await setDeploymentPinned(slot, !currentlyPinned);
            await loadStatus();
        } catch (ex) {
            setError(ex.message);
        } finally {
            setPinningSlot(null);
        }
    }

    async function handleTogglePinByIndex(index, currentlyPinned) {
        setError(null);
        setPinningIndex(index);
        try {
            await setDeploymentPinnedByIndex(index, !currentlyPinned);
            await loadStatus();
        } catch (ex) {
            setError(ex.message);
        } finally {
            setPinningIndex(null);
        }
    }

    async function handleCancelStagedUpdate() {
        setConfirmAction(null);
        setError(null);
        try {
            await cancelStagedUpdate();
            await loadStatus();
            setPhase(PHASE.IDLE); // handleDownloadUpdate may have left phase stuck at DOWNLOADED
        } catch (ex) {
            setError(ex.message);
        }
    }

    async function handleReboot() {
        setRebootModal(null);
        setPhase(PHASE.REBOOTING);
        try {
            await reboot();
        } catch (ex) {
            setError(ex.message);
            setPhase(PHASE.IDLE);
        }
    }

    async function handleSwitchImage(ref) {
        setConfirmAction(null);
        setSwitching(true);
        setError(null);
        setProgress([]);
        setProgressKind('switch');
        // Determine "no-op switch" from our own known state, not by parsing
        // bootc's English status text out of the streamed output — that
        // text is locale-dependent and could change with any bootc version.
        setSwitchUnchanged(trackedRef === ref);
        try {
            await switchImage(ref, line => setProgress(p => [...p, line]));
            await loadStatus();
            setUpdateAvailable(null);
        } catch (ex) {
            setError(ex.message);
        } finally {
            setSwitching(false);
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
            if (switchRefRef.current === ref) setPreviewError(ex.message);
        } finally {
            setPreviewing(false);
        }
    }

    async function handleAutoUpdateToggle(enabled) {
        const { setAutoUpdate } = await import('./lib/bootc.js');
        try {
            await setAutoUpdate(enabled);
            setAutoUpdateStatus(enabled ? 'active' : 'inactive');
            setNextAutoUpdateRun(enabled ? await getNextAutoUpdateRun() : null);
        } catch (ex) {
            setError(ex.message);
        }
    }

    // Rollback only reorders local deployments — it doesn't touch the registry. If the
    // auto-update timer is still enabled, its next scheduled run has no idea a human just
    // deliberately rolled back to escape this exact image, and will silently re-stage and
    // re-apply it again, undoing the rollback. Confirmed against the official RHEL image
    // mode docs ("If you perform a rollback, the system will automatically update again
    // unless you turn off auto-updates").
    const autoUpdateWillUndoRollback = autoUpdateStatus === 'active' && (
        <> Automatic updates are currently <strong>enabled</strong> — the update timer has no way to
            know this was a deliberate rollback, so it will likely re-check, re-stage, and re-apply this
            same image again on its next scheduled run unless you turn off automatic updates first.</>
    );

    if (loading) {
        return (
            <Page className="pf-m-no-sidebar">
                <PageSection>
                    <Skeleton width="75%" screenreaderText="Loading image status" />
                    <br />
                    <Skeleton width="50%" />
                </PageSection>
            </Page>
        );
    }

    // bootc's 3 reported slots are the only place a deployment's human-readable
    // version is available — ostree's own deployment list (used for the full
    // table below) only has checksums. Cross-reference by checksum so rows
    // still in a known slot show their real version instead of just a hash.
    const versionByChecksum = {};
    for (const slot of [status?.booted, status?.staged, status?.rollback]) {
        if (slot?.ostree?.checksum && slot?.image?.version) {
            versionByChecksum[slot.ostree.checksum] = slot.image.version;
        }
    }

    return (
        <Page className="pf-m-no-sidebar">
            <PageSection>
                {error && !(!status && !adminAllowed) && (
                    <Alert
                        variant="danger"
                        title="Error"
                        isInline
                        actionClose={<Button variant="plain" onClick={() => setError(null)}>×</Button>}
                    >
                        {error}
                    </Alert>
                )}

                {!status && !adminAllowed && (
                    <Alert variant="info" title="Administrative access required" isInline>
                        bootc requires root to query image status. Unlock "Administrative access" above to view and manage updates.
                    </Alert>
                )}


                {status?.usrOverlay && !overlayWarningDismissed && (
                    <Alert
                        variant="warning"
                        title="/usr has a transient overlay mounted"
                        isInline
                        actionClose={<Button variant="plain" onClick={() => setOverlayWarningDismissed(true)}>×</Button>}
                        actionLinks={
                            <AlertActionLink onClick={() => setRebootModal('overlay')}>
                                Reboot to Clear
                            </AlertActionLink>
                        }
                    >
                        This system no longer matches its source image exactly — a writable overlay
                        ({status.usrOverlay.accessMode}, {status.usrOverlay.persistence}) is active on{' '}
                        <code>/usr</code>, likely from <code>bootc usr-overlay</code>. It will be
                        discarded on next reboot, but until then the running system has drifted from
                        what's documented here.
                    </Alert>
                )}

                <Card isPlain>
                    <CardHeader
                        id="ct-image-ref-header"
                        actions={{
                            actions: (
                                <Flex direction={{ default: 'column' }} alignItems={{ default: 'alignItemsFlexStart' }} spaceItems={{ default: 'spaceItemsSm' }}>
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
                                        <Title headingLevel="h2" size="lg">Container image reference</Title>
                                    </FlexItem>
                                    {updateAvailable !== null && (
                                        <FlexItem>
                                            <Tooltip content={`Checked ${formatAgo(lastChecked, now)}`}>
                                                <Label isCompact color={updateAvailable ? 'blue' : 'green'}>
                                                    {updateAvailable ? 'Update available' : 'Up to date'}
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
                            onDismissPreview={() => { setPreview(null); setPreviewError(null); }}
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

                        {progress.length > 0 && (
                            <ProgressLog
                                lines={progress}
                                running={phase === PHASE.DOWNLOADING || switching}
                                kind={progressKind}
                                unchanged={progressKind === 'switch' && switchUnchanged}
                                onDismiss={() => { setProgress([]); setProgressKind(null); }}
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
                        rebootModal === 'update' ? "Apply update and reboot?"
                            : rebootModal === 'overlay' ? "Reboot to clear /usr overlay?"
                                : "Reboot to roll back?"
                    }
                />
                <ModalBody>
                    {rebootModal === 'update'
                        ? "The staged update will be applied. The system will reboot — a soft reboot will be used if the kernel has not changed."
                        : rebootModal === 'overlay'
                            ? "The system will reboot, discarding the transient /usr overlay and any changes made through it."
                            : <>The system will reboot into the previous image. <strong>This also reverts /etc to that image's
                                frozen snapshot</strong> — any configuration changes made since then will be lost, not merged or
                                preserved.{autoUpdateWillUndoRollback}</>
                    }
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="primary"
                        onClick={rebootModal === 'update' ? handleApplyUpdate : handleReboot}
                        isDisabled={!adminAllowed}
                    >
                        {phase === PHASE.REBOOTING ? "Rebooting…" : "Reboot"}
                    </Button>
                    <Button variant="secondary" onClick={() => setRebootModal(null)}>
                        Cancel
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={confirmAction !== null}
                onClose={() => setConfirmAction(null)}
                variant="small"
            >
                <ModalHeader
                    title={
                        confirmAction?.action === 'switch' ? "Switch image?"
                            : confirmAction?.action === 'autoupdate-enable' ? "Enable automatic updates?"
                                : confirmAction?.action === 'cancel-staged' ? "Discard staged update?"
                                    : "Stage rollback?"
                    }
                />
                <ModalBody>
                    {confirmAction?.action === 'switch'
                        ? <>The system will be reconfigured to track <code>{confirmAction.ref}</code> and the image will be staged for next boot. Nothing is applied until you reboot.</>
                        : confirmAction?.action === 'autoupdate-enable'
                            ? "This system will automatically check for, download, apply, and reboot into new images on a recurring schedule (roughly every 8 hours), indefinitely, with no further confirmation. You won't be asked again before each reboot."
                            : confirmAction?.action === 'cancel-staged'
                                ? "The staged update will be discarded. No reboot happens, and the booted image is unaffected — you'll need to check/download or switch again to get it back."
                                : status?.staged
                                    ? <>The previous image will be staged for next boot. This will also <strong>discard the currently staged update</strong> ({status.staged.image?.version || "unknown version"}). Rolling back also reverts <code>/etc</code> to that image's frozen snapshot — any configuration changes made since then will be lost.{autoUpdateWillUndoRollback}</>
                                    : <>The previous image will be staged for next boot. Nothing is applied until you reboot, but note that rolling back also reverts <code>/etc</code> to that image's frozen snapshot — any configuration changes made since then will be lost.{autoUpdateWillUndoRollback}</>
                    }
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="primary"
                        onClick={() => {
                            if (confirmAction?.action === 'switch') handleSwitchImage(confirmAction.ref);
                            else if (confirmAction?.action === 'autoupdate-enable') { setConfirmAction(null); handleAutoUpdateToggle(true); }
                            else if (confirmAction?.action === 'cancel-staged') handleCancelStagedUpdate();
                            else handleRollback();
                        }}
                        isDisabled={!adminAllowed}
                    >
                        {confirmAction?.action === 'switch' ? "Switch"
                            : confirmAction?.action === 'autoupdate-enable' ? "Enable"
                                : confirmAction?.action === 'cancel-staged' ? "Discard"
                                    : "Stage Rollback"}
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmAction(null)}>
                        Cancel
                    </Button>
                </ModalFooter>
            </Modal>
        </Page>
    );
};
