import React from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardFooter, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Gallery } from "@patternfly/react-core/dist/esm/layouts/Gallery/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";

// Extract the display fields from a bootc image slot (booted, staged, rollback)
function parseImageSlot(slot) {
    if (!slot) return null;
    const img = slot.image ?? {};
    const ref = img.image ?? {};
    return {
        reference: ref.image ?? "Unknown",
        transport: ref.transport ?? "registry",
        version: img.version ?? null,
        digest: img.imageDigest ?? null,
        timestamp: img.timestamp ?? null,
        incompatible: slot.incompatible ?? false,
        softRebootCapable: slot.softRebootCapable ?? null,
    };
}

function formatDigest(digest) {
    if (!digest) return null;
    // Show "sha256:abc123de" truncated to 19 chars total
    const hash = digest.startsWith("sha256:") ? digest.slice(7) : digest;
    return "sha256:" + hash.slice(0, 12) + "…";
}

function formatTimestamp(ts) {
    if (!ts) return null;
    return new Date(ts).toLocaleString();
}

function ImageInfo({ data, showRebootType }) {
    return (
        <DescriptionList isCompact isHorizontal>
            <DescriptionListGroup>
                <DescriptionListTerm>Image</DescriptionListTerm>
                <DescriptionListDescription>
                    <code>{data.reference}</code>
                </DescriptionListDescription>
            </DescriptionListGroup>
            {data.version && (
                <DescriptionListGroup>
                    <DescriptionListTerm>Version</DescriptionListTerm>
                    <DescriptionListDescription>{data.version}</DescriptionListDescription>
                </DescriptionListGroup>
            )}
            {data.digest && (
                <DescriptionListGroup>
                    <DescriptionListTerm>Digest</DescriptionListTerm>
                    <DescriptionListDescription>
                        <code title={data.digest}>{formatDigest(data.digest)}</code>
                    </DescriptionListDescription>
                </DescriptionListGroup>
            )}
            {data.timestamp && (
                <DescriptionListGroup>
                    <DescriptionListTerm>Built</DescriptionListTerm>
                    <DescriptionListDescription>{formatTimestamp(data.timestamp)}</DescriptionListDescription>
                </DescriptionListGroup>
            )}
            {showRebootType && data.softRebootCapable !== null && (
                <DescriptionListGroup>
                    <DescriptionListTerm>Reboot type</DescriptionListTerm>
                    <DescriptionListDescription>
                        {data.softRebootCapable ? "Soft reboot" : "Full reboot"}
                    </DescriptionListDescription>
                </DescriptionListGroup>
            )}
        </DescriptionList>
    );
}

export const ImageStatus = ({
    booted,
    staged,
    rollback,
    phase,
    rollbackQueued,
    disabled,
    onConfirmUpdate,
    onRollback,
    onCancelStagedUpdate,
    onCancelRollback,
    onConfirmReboot,
}) => {
    const bootedData = parseImageSlot(booted);
    const stagedData = parseImageSlot(staged);
    const rollbackData = parseImageSlot(rollback);

    const isDownloading = phase === 'downloading';
    const isDownloaded = phase === 'downloaded';
    const isRollbackStaged = !!rollbackQueued;
    const isRebooting = phase === 'rebooting';
    const isBusy = isDownloading || isRebooting;

    // While an update is staged but not yet applied, there's no third
    // deployment on disk to be the real rollback target — bootc status
    // reports "rollback" as the next entry in the deploy list, which right
    // now is the same entry as the staged update. Not a bug in the data we're
    // handed, but showing it as if it were a real rollback target would be
    // misleading. Once the staged update is applied and rebooted into, the
    // deploy list reshuffles and rollback correctly points elsewhere.
    const rollbackAmbiguous = !isRollbackStaged && !!stagedData && !!rollbackData && stagedData.digest === rollbackData.digest;

    if (!bootedData) {
        return (
            <EmptyState>
                <EmptyStateBody>
                    This system is not booted from a bootc image.
                </EmptyStateBody>
            </EmptyState>
        );
    }

    return (
        <Gallery hasGutter minWidths={{ default: '280px' }} className="ct-status-gallery">

            {/* Booted image */}
            <Card isFullHeight>
                <CardTitle>
                    <Label color="green">Booted</Label>
                    {bootedData.incompatible && (
                        <Label color="orange" style={{ marginLeft: '0.5rem' }}>Incompatible layers</Label>
                    )}
                </CardTitle>
                <CardBody>
                    <ImageInfo data={bootedData} />
                </CardBody>
            </Card>

            {/* Staged update */}
            <Card isFullHeight>
                <CardTitle>
                    <Label color="blue">Staged Update</Label>
                </CardTitle>
                <CardBody>
                    {stagedData
                        ? <ImageInfo data={stagedData} showRebootType />
                        : (
                            <EmptyState variant="xs">
                                <EmptyStateBody>No update staged</EmptyStateBody>
                            </EmptyState>
                        )
                    }
                </CardBody>
                <CardFooter>
                    <Flex justifyContent={{ default: 'justifyContentCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                        <FlexItem>
                            <Button
                                variant="secondary"
                                onClick={onConfirmUpdate}
                                isDisabled={disabled || isBusy || !(stagedData || isDownloaded)}
                            >
                                {isRebooting ? <Spinner size="sm" /> : "Apply & Reboot"}
                            </Button>
                        </FlexItem>
                        {stagedData && (
                            <FlexItem>
                                <Button
                                    variant="secondary"
                                    onClick={onCancelStagedUpdate}
                                    isDisabled={disabled || isBusy}
                                >
                                    Cancel
                                </Button>
                            </FlexItem>
                        )}
                    </Flex>
                </CardFooter>
            </Card>

            {/* Rollback image */}
            <Card isFullHeight>
                <CardTitle>
                    <Label color="red">Rollback</Label>
                </CardTitle>
                <CardBody>
                    {rollbackAmbiguous
                        ? (
                            <EmptyState variant="xs">
                                <EmptyStateBody>Not yet determined — available after rebooting into the staged update</EmptyStateBody>
                            </EmptyState>
                        )
                        : rollbackData
                            ? <ImageInfo data={rollbackData} />
                            : (
                                <EmptyState variant="xs">
                                    <EmptyStateBody>No rollback available</EmptyStateBody>
                                </EmptyState>
                            )
                    }
                </CardBody>
                <CardFooter>
                    {rollbackData && !isRollbackStaged && !rollbackAmbiguous && (
                        <Button
                            variant="secondary"
                            onClick={onRollback}
                            isDisabled={disabled || isBusy}
                        >
                            Roll Back
                        </Button>
                    )}
                    {isRollbackStaged && (
                        <Flex justifyContent={{ default: 'justifyContentCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                            <FlexItem>
                                <Button
                                    variant="secondary"
                                    onClick={onConfirmReboot}
                                    isDisabled={disabled || isRebooting}
                                >
                                    {isRebooting ? <Spinner size="sm" /> : "Reboot to Roll Back"}
                                </Button>
                            </FlexItem>
                            <FlexItem>
                                <Button
                                    variant="secondary"
                                    onClick={onCancelRollback}
                                    isDisabled={disabled || isRebooting}
                                >
                                    Cancel
                                </Button>
                            </FlexItem>
                        </Flex>
                    )}
                </CardFooter>
            </Card>

        </Gallery>
    );
};
