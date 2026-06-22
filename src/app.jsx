import cockpit from 'cockpit';
import React, { useState, useEffect, useCallback } from 'react';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Skeleton } from "@patternfly/react-core/dist/esm/components/Skeleton/index.js";

import {
    getStatus,
    checkForUpdates,
    stageUpdate,
    applyUpdate,
    stageRollback,
    reboot,
    getAutoUpdateStatus,
    switchImage,
    inspectImage,
    getSettings,
    addRecentRef,
    cacheStatus,
    getCachedStatus,
    getBootHistory,
    recordBootIfChanged,
} from './lib/bootc.js';

import { ImageStatus } from './components/ImageStatus.jsx';
import { ProgressLog } from './components/ProgressLog.jsx';
import { AutoUpdate } from './components/AutoUpdate.jsx';
import { UpdateActions } from './components/UpdateActions.jsx';
import { SwitchImage } from './components/SwitchImage.jsx';
import { BootHistory } from './components/BootHistory.jsx';

// Phases of the update/rollback lifecycle
const PHASE = {
    IDLE: 'idle',
    CHECKING: 'checking',
    DOWNLOADING: 'downloading',
    DOWNLOADED: 'downloaded',     // staged, awaiting reboot confirm
    ROLLBACK_STAGED: 'rollback_staged', // awaiting reboot confirm
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
    const [checking, setChecking] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(null);
    const [switching, setSwitching] = useState(false);
    const [recentRefs, setRecentRefs] = useState([]);
    const [previewing, setPreviewing] = useState(false);
    const [preview, setPreview] = useState(null);
    const [previewError, setPreviewError] = useState(null);
    const [confirmAction, setConfirmAction] = useState(null); // { action: 'rollback' } | { action: 'switch', ref } | null
    const [adminAllowed, setAdminAllowed] = useState(true); // optimistic default; real enforcement is superuser:"require" on each call
    const [statusCachedAt, setStatusCachedAt] = useState(null); // set when status came from cache, not a live query
    const [bootHistory, setBootHistory] = useState([]);

    useEffect(() => {
        if (typeof cockpit.permission !== 'function') return;
        const permission = cockpit.permission({ admin: true });
        const update = () => setAdminAllowed(permission.allowed !== false);
        update();
        permission.addEventListener('changed', update);
        return () => permission.removeEventListener('changed', update);
    }, []);

    const loadStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        setStatusCachedAt(null);

        // These don't require root — load them independently so a permission
        // failure on getStatus() below doesn't block them too.
        getAutoUpdateStatus().then(setAutoUpdateStatus).catch(() => {});
        getSettings().then(s => setRecentRefs(s.recent_refs)).catch(() => {});
        getBootHistory().then(setBootHistory).catch(() => {});

        try {
            const s = await getStatus();
            setStatus(s.status);
            cacheStatus(s.status).catch(() => {});
            recordBootIfChanged(s.status.booted).then(() => getBootHistory().then(setBootHistory)).catch(() => {});
        } catch (ex) {
            const cached = await getCachedStatus();
            if (cached) {
                setStatus(cached.status);
                setStatusCachedAt(cached.cached_at);
            } else {
                setError(ex.message);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    async function handleCheckForUpdates() {
        setChecking(true);
        setError(null);
        try {
            const available = await checkForUpdates();
            setUpdateAvailable(available);
        } catch (ex) {
            setError(ex.message);
        } finally {
            setChecking(false);
        }
    }

    async function handleDownloadUpdate() {
        setPhase(PHASE.DOWNLOADING);
        setProgress([]);
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
            await loadStatus();
            setPhase(PHASE.ROLLBACK_STAGED);
            setUpdateAvailable(null);
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
            setPhase(PHASE.ROLLBACK_STAGED);
        }
    }

    async function handleSwitchImage(ref) {
        setConfirmAction(null);
        setSwitching(true);
        setError(null);
        try {
            await switchImage(ref);
            await addRecentRef(ref);
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
            setPreview(await inspectImage(ref));
        } catch (ex) {
            setPreviewError(ex.message);
        } finally {
            setPreviewing(false);
        }
    }

    async function handleAutoUpdateToggle(enabled) {
        const { setAutoUpdate } = await import('./lib/bootc.js');
        try {
            await setAutoUpdate(enabled);
            setAutoUpdateStatus(enabled ? 'active' : 'inactive');
        } catch (ex) {
            setError(ex.message);
        }
    }

    if (loading) {
        return (
            <Page className="no-masthead-sidebar">
                <PageSection>
                    <Skeleton width="75%" screenreaderText="Loading image status" />
                    <br />
                    <Skeleton width="50%" />
                </PageSection>
            </Page>
        );
    }

    return (
        <Page className="no-masthead-sidebar">
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

                {statusCachedAt && (
                    <Alert variant="warning" title="Showing last known status" isInline>
                        bootc requires root to query live image status. This is cached data from{' '}
                        {new Date(statusCachedAt).toLocaleString()} — unlock "Administrative access" above for current state.
                    </Alert>
                )}

                <Card>
                    <CardBody>
                        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                            <FlexItem>
                                <AutoUpdate
                                    status={autoUpdateStatus}
                                    onToggle={handleAutoUpdateToggle}
                                    disabled={!adminAllowed}
                                />
                            </FlexItem>
                            <FlexItem>
                                <UpdateActions
                                    updateAvailable={updateAvailable}
                                    checking={checking}
                                    downloading={phase === PHASE.DOWNLOADING}
                                    disabled={!adminAllowed || phase === PHASE.DOWNLOADING || phase === PHASE.REBOOTING || phase === PHASE.ROLLBACK_STAGED || phase === PHASE.DOWNLOADED || !!status?.staged}
                                    onCheckForUpdates={handleCheckForUpdates}
                                    onDownloadUpdate={handleDownloadUpdate}
                                />
                            </FlexItem>
                        </Flex>
                    </CardBody>
                </Card>

                {status && (
                    <ImageStatus
                        booted={status.booted}
                        staged={status.staged}
                        rollback={status.rollback}
                        phase={phase}
                        disabled={!adminAllowed}
                        onConfirmUpdate={() => setRebootModal('update')}
                        onRollback={() => setConfirmAction({ action: 'rollback' })}
                        onConfirmReboot={() => setRebootModal('rollback')}
                    />
                )}

                {progress.length > 0 && (
                    <ProgressLog lines={progress} />
                )}

                {bootHistory.length > 0 && (
                    <BootHistory entries={bootHistory} />
                )}

                <SwitchImage
                    recentRefs={recentRefs}
                    switching={switching}
                    disabled={phase === PHASE.DOWNLOADING || phase === PHASE.REBOOTING || phase === PHASE.ROLLBACK_STAGED}
                    switchDisabled={!adminAllowed}
                    onSwitch={ref => setConfirmAction({ action: 'switch', ref })}
                    previewing={previewing}
                    preview={preview}
                    previewError={previewError}
                    onPreview={handlePreview}
                />
            </PageSection>

            <Modal
                isOpen={rebootModal !== null}
                onClose={() => setRebootModal(null)}
                variant="small"
            >
                <ModalHeader
                    title={rebootModal === 'update' ? "Apply update and reboot?" : "Reboot to roll back?"}
                />
                <ModalBody>
                    {rebootModal === 'update'
                        ? "The staged update will be applied. The system will reboot — a soft reboot will be used if the kernel has not changed."
                        : "The system will reboot into the previous image."
                    }
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="danger"
                        onClick={rebootModal === 'update' ? handleApplyUpdate : handleReboot}
                        isDisabled={!adminAllowed}
                    >
                        {phase === PHASE.REBOOTING ? "Rebooting…" : "Reboot"}
                    </Button>
                    <Button variant="link" onClick={() => setRebootModal(null)}>
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
                    title={confirmAction?.action === 'switch' ? "Switch image?" : "Stage rollback?"}
                />
                <ModalBody>
                    {confirmAction?.action === 'switch'
                        ? <>The system will be reconfigured to track <code>{confirmAction.ref}</code> and the image will be staged for next boot. Nothing is applied until you reboot.</>
                        : "The previous image will be staged for next boot. Nothing is applied until you reboot."
                    }
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="danger"
                        onClick={() => confirmAction?.action === 'switch' ? handleSwitchImage(confirmAction.ref) : handleRollback()}
                        isDisabled={!adminAllowed}
                    >
                        {confirmAction?.action === 'switch' ? "Switch" : "Stage Rollback"}
                    </Button>
                    <Button variant="link" onClick={() => setConfirmAction(null)}>
                        Cancel
                    </Button>
                </ModalFooter>
            </Modal>
        </Page>
    );
};
