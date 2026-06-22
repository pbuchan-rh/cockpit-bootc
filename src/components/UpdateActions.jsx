import React, { useState, useEffect } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";

// "just now" / "Xm ago" / "Xh ago" — recomputed on a slow tick so it stays
// roughly fresh without needing any state outside this component.
function formatAgo(date, now) {
    const seconds = Math.floor((now - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

export const UpdateActions = ({
    updateAvailable,
    checking,
    lastChecked,
    downloading,
    disabled,
    onCheckForUpdates,
    onDownloadUpdate,
}) => {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (!lastChecked) return;
        const id = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(id);
    }, [lastChecked]);

    return (
        <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsMd' }}>
            {lastChecked && (
                <FlexItem>
                    <span className="ct-last-checked">Checked {formatAgo(lastChecked, now)}</span>
                </FlexItem>
            )}
            <FlexItem>
                <Button
                    variant="secondary"
                    onClick={onCheckForUpdates}
                    isDisabled={disabled || checking}
                    isLoading={checking}
                >
                    {checking ? "Checking…" : "Check for Updates"}
                </Button>
            </FlexItem>
            <FlexItem>
                <Button
                    variant="secondary"
                    onClick={onDownloadUpdate}
                    isDisabled={disabled || checking || updateAvailable !== true}
                    isLoading={downloading}
                >
                    {downloading ? "Downloading…" : "Download Update"}
                </Button>
            </FlexItem>
        </Flex>
    );
};
