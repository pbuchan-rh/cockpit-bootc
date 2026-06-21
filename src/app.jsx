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
} from './lib/bootc.js';

import { ImageStatus } from './components/ImageStatus.jsx';
import { ProgressLog } from './components/ProgressLog.jsx';
import { AutoUpdate } from './components/AutoUpdate.jsx';
import { UpdateActions } from './components/UpdateActions.jsx';

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

    const loadStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [s, autoUpdate] = await Promise.all([
                getStatus(),
                getAutoUpdateStatus(),
            ]);
            setStatus(s.status);
            setAutoUpdateStatus(autoUpdate);
        } catch (ex) {
            setError(ex.message);
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
        setError(null);
        try {
            await stageRollback();
            await loadStatus();
            setPhase(PHASE.ROLLBACK_STAGED);
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
                {error && (
                    <Alert
                        variant="danger"
                        title="Error"
                        isInline
                        actionClose={<Button variant="plain" onClick={() => setError(null)}>×</Button>}
                    >
                        {error}
                    </Alert>
                )}

                <Card>
                    <CardBody>
                        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                            <FlexItem>
                                <AutoUpdate
                                    status={autoUpdateStatus}
                                    onToggle={handleAutoUpdateToggle}
                                />
                            </FlexItem>
                            <FlexItem>
                                <UpdateActions
                                    updateAvailable={updateAvailable}
                                    checking={checking}
                                    downloading={phase === PHASE.DOWNLOADING}
                                    disabled={phase === PHASE.DOWNLOADING || phase === PHASE.REBOOTING || phase === PHASE.ROLLBACK_STAGED || phase === PHASE.DOWNLOADED || !!status?.staged}
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
                        onConfirmUpdate={() => setRebootModal('update')}
                        onRollback={handleRollback}
                        onConfirmReboot={() => setRebootModal('rollback')}
                    />
                )}

                {progress.length > 0 && (
                    <ProgressLog lines={progress} />
                )}
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
                    >
                        {phase === PHASE.REBOOTING ? "Rebooting…" : "Reboot"}
                    </Button>
                    <Button variant="link" onClick={() => setRebootModal(null)}>
                        Cancel
                    </Button>
                </ModalFooter>
            </Modal>
        </Page>
    );
};
