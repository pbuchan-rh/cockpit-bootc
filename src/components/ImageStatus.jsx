import cockpit from 'cockpit';
import React from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardFooter, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { ClipboardCopy } from "@patternfly/react-core/dist/esm/components/ClipboardCopy/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Gallery } from "@patternfly/react-core/dist/esm/layouts/Gallery/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";

const _ = cockpit.gettext;

// Extract the display fields from a bootc image slot (booted, staged, rollback)
function parseImageSlot(slot) {
    if (!slot) return null;
    const img = slot.image ?? {};
    const ref = img.image ?? {};
    return {
        reference: ref.image ?? _("Unknown"),
        transport: ref.transport ?? "registry",
        version: img.version ?? null,
        digest: img.imageDigest ?? null,
        timestamp: img.timestamp ?? null,
        incompatible: slot.incompatible ?? false,
        softRebootCapable: slot.softRebootCapable ?? null,
        pinned: slot.pinned ?? false,
    };
}

function formatTimestamp(ts) {
    if (!ts) return null;
    return new Date(ts).toLocaleString();
}

function ImageInfo({ data, showRebootType }) {
    return (
        <DescriptionList isCompact isHorizontal>
            <DescriptionListGroup>
                <DescriptionListTerm>{_("Image")}</DescriptionListTerm>
                <DescriptionListDescription>
                    <code>{data.reference}</code>
                </DescriptionListDescription>
            </DescriptionListGroup>
            {data.version && (
                <DescriptionListGroup>
                    <DescriptionListTerm>{_("Version")}</DescriptionListTerm>
                    <DescriptionListDescription>{data.version}</DescriptionListDescription>
                </DescriptionListGroup>
            )}
            {data.digest && (
                <DescriptionListGroup>
                    <DescriptionListTerm>{_("Digest")}</DescriptionListTerm>
                    <DescriptionListDescription>
                        <ClipboardCopy
                            isReadOnly isCode truncation
                            hoverTip={_("Copy")} clickTip={_("Copied")}
                            variant="inline-compact"
                        >
                            {data.digest}
                        </ClipboardCopy>
                    </DescriptionListDescription>
                </DescriptionListGroup>
            )}
            {data.timestamp && (
                <DescriptionListGroup>
                    <DescriptionListTerm>{_("Built")}</DescriptionListTerm>
                    <DescriptionListDescription>{formatTimestamp(data.timestamp)}</DescriptionListDescription>
                </DescriptionListGroup>
            )}
            {showRebootType && data.softRebootCapable !== null && (
                <DescriptionListGroup>
                    <DescriptionListTerm>{_("Reboot type")}</DescriptionListTerm>
                    <DescriptionListDescription>
                        {data.softRebootCapable ? _("Soft reboot") : _("Full reboot")}
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
    onTogglePin,
    pinningSlot,
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
                    {_("This system is not booted from a bootc image.")}
                </EmptyStateBody>
            </EmptyState>
        );
    }

    return (
        <Gallery hasGutter minWidths={{ default: '280px' }} className="ct-status-gallery">

            {/* Booted image */}
            <Card isFullHeight>
                <CardTitle>
                    <Label color="green">{_("Booted")}</Label>
                    {bootedData.incompatible && (
                        <Label color="orange" style={{ marginLeft: '0.5rem' }}>{_("Incompatible layers")}</Label>
                    )}
                    {bootedData.pinned && (
                        <Label color="purple" style={{ marginLeft: '0.5rem' }}>{_("Pinned")}</Label>
                    )}
                </CardTitle>
                <CardBody>
                    <ImageInfo data={bootedData} />
                </CardBody>
                <CardFooter>
                    <Button
                        variant="secondary"
                        onClick={() => onTogglePin('booted', bootedData.pinned)}
                        isDisabled={disabled || pinningSlot === 'booted'}
                        isLoading={pinningSlot === 'booted'}
                    >
                        {bootedData.pinned ? _("Unpin") : _("Pin")}
                    </Button>
                </CardFooter>
            </Card>

            {/* Staged update */}
            <Card isFullHeight>
                <CardTitle>
                    <Label color="blue">{_("Staged Update")}</Label>
                </CardTitle>
                <CardBody className={!stagedData ? "ct-card-body-centered" : undefined}>
                    {stagedData
                        ? <ImageInfo data={stagedData} showRebootType />
                        : (
                            <EmptyState variant="xs">
                                <EmptyStateBody>{_("No update staged")}</EmptyStateBody>
                            </EmptyState>
                        )
                    }
                </CardBody>
                {(stagedData || isDownloaded) && (
                    <CardFooter>
                        <Flex justifyContent={{ default: 'justifyContentCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                            <FlexItem>
                                <Button
                                    variant="primary"
                                    onClick={onConfirmUpdate}
                                    isDisabled={disabled || isBusy}
                                >
                                    {isRebooting ? <Spinner size="sm" /> : _("Apply & Reboot")}
                                </Button>
                            </FlexItem>
                            {stagedData && (
                                <FlexItem>
                                    <Button
                                        variant="secondary"
                                        onClick={onCancelStagedUpdate}
                                        isDisabled={disabled || isBusy}
                                    >
                                        {_("Cancel")}
                                    </Button>
                                </FlexItem>
                            )}
                        </Flex>
                    </CardFooter>
                )}
            </Card>

            {/* Rollback image */}
            <Card isFullHeight>
                <CardTitle>
                    <Label color="red">{_("Rollback")}</Label>
                    {rollbackData?.pinned && !rollbackAmbiguous && (
                        <Label color="purple" style={{ marginLeft: '0.5rem' }}>{_("Pinned")}</Label>
                    )}
                </CardTitle>
                <CardBody className={!rollbackData || rollbackAmbiguous ? "ct-card-body-centered" : undefined}>
                    {rollbackAmbiguous
                        ? (
                            <EmptyState variant="xs">
                                <EmptyStateBody>{_("Not yet determined — available after rebooting into the staged update")}</EmptyStateBody>
                            </EmptyState>
                        )
                        : rollbackData
                            ? <ImageInfo data={rollbackData} />
                            : (
                                <EmptyState variant="xs">
                                    <EmptyStateBody>{_("No rollback available")}</EmptyStateBody>
                                </EmptyState>
                            )
                    }
                </CardBody>
                {rollbackData && !rollbackAmbiguous && (
                    <CardFooter>
                        <Flex justifyContent={{ default: 'justifyContentCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                            {!isRollbackStaged && (
                                <FlexItem>
                                    <Button
                                        variant="secondary"
                                        onClick={onRollback}
                                        isDisabled={disabled || isBusy}
                                    >
                                        {_("Roll Back")}
                                    </Button>
                                </FlexItem>
                            )}
                            {isRollbackStaged && (
                                <>
                                    <FlexItem>
                                        <Button
                                            variant="primary"
                                            onClick={onConfirmReboot}
                                            isDisabled={disabled || isRebooting}
                                        >
                                            {isRebooting ? <Spinner size="sm" /> : _("Reboot to Roll Back")}
                                        </Button>
                                    </FlexItem>
                                    <FlexItem>
                                        <Button
                                            variant="secondary"
                                            onClick={onCancelRollback}
                                            isDisabled={disabled || isRebooting}
                                        >
                                            {_("Cancel")}
                                        </Button>
                                    </FlexItem>
                                </>
                            )}
                            <FlexItem>
                                <Button
                                    variant="secondary"
                                    onClick={() => onTogglePin('rollback', rollbackData.pinned)}
                                    isDisabled={disabled || pinningSlot === 'rollback'}
                                    isLoading={pinningSlot === 'rollback'}
                                >
                                    {rollbackData.pinned ? _("Unpin") : _("Pin")}
                                </Button>
                            </FlexItem>
                        </Flex>
                    </CardFooter>
                )}
            </Card>

        </Gallery>
    );
};
