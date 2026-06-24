import cockpit from 'cockpit';
import React from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";

const _ = cockpit.gettext;

export const UpdateActions = ({
    updateAvailable,
    checking,
    downloading,
    disabled,
    onCheckForUpdates,
    onDownloadUpdate,
}) => {
    return (
        <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsMd' }}>
            <FlexItem>
                <Button
                    variant="secondary"
                    onClick={onCheckForUpdates}
                    isDisabled={disabled || checking}
                    isLoading={checking}
                >
                    {checking ? _("Checking…") : _("Check for Updates")}
                </Button>
            </FlexItem>
            <FlexItem>
                <Button
                    variant="secondary"
                    onClick={onDownloadUpdate}
                    isDisabled={disabled || checking || updateAvailable !== true}
                    isLoading={downloading}
                >
                    {downloading ? _("Downloading…") : _("Download Update")}
                </Button>
            </FlexItem>
        </Flex>
    );
};
