import React from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";

export const UpdateActions = ({
    updateAvailable,
    checking,
    downloading,
    disabled,
    onCheckForUpdates,
    onDownloadUpdate,
}) => {
    return (
        <>
            {updateAvailable === true && <Label color="blue">Update available</Label>}
            {updateAvailable === false && <Label color="green">Up to date</Label>}
            <Button
                variant="primary"
                onClick={onCheckForUpdates}
                isDisabled={disabled || checking}
                isLoading={checking}
            >
                {checking ? "Checking…" : "Check for Updates"}
            </Button>
            <Button
                variant="primary"
                onClick={onDownloadUpdate}
                isDisabled={disabled || checking || updateAvailable !== true}
                isLoading={downloading}
            >
                {downloading ? "Downloading…" : "Download Update"}
            </Button>
        </>
    );
};
