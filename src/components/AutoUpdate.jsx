import React from 'react';
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch/index.js";

export const AutoUpdate = ({ status, onToggle }) => {
    const isChecked = status === 'active';

    return (
        <Switch
            id="bootc-auto-update-switch"
            label="Automatically check for and apply updates"
            isChecked={isChecked}
            isDisabled={status === 'unknown'}
            onChange={(_event, checked) => onToggle(checked)}
        />
    );
};
