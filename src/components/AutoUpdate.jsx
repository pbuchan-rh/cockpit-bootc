import cockpit from 'cockpit';
import React, { useState, useEffect } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";

const _ = cockpit.gettext;

// "in 18m" / "in 2h 5m" — recomputed on a slow tick so it counts down without
// needing any state outside this component.
function formatCountdown(nextRunMs, now) {
    const seconds = Math.max(0, Math.floor((nextRunMs - now) / 1000));
    if (seconds < 60) return _("due any moment");
    const minutes = Math.floor(seconds / 60) % 60;
    const hours = Math.floor(seconds / 3600);
    if (hours === 0) return cockpit.format(_("in ${0}m"), minutes);
    return cockpit.format(_("in ${0}h ${1}m"), hours, minutes);
}

export const AutoUpdate = ({ status, nextRun, onToggle, onKeepOff, disabled }) => {
    // status: { unitFileState, activeState, on } from getAutoUpdateStatus(), or null while unknown
    const isChecked = !!status?.on;
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (!nextRun) return;
        const id = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(id);
    }, [nextRun]);

    const toggle = (
        <Switch
            id="bootc-auto-update-switch"
            label={
                isChecked && nextRun
                    ? cockpit.format(_("Automatic updates (next check $0)"), formatCountdown(nextRun, now))
                    : _("Automatic updates")
            }
            isChecked={isChecked}
            isDisabled={disabled || !status}
            onChange={(_event, checked) => onToggle(checked)}
        />
    );

    // Stopped but not masked (from the CLI, or 1.1.1's disable): off now,
    // on again after the next boot. Say so, and offer the mask that keeps
    // it off, which is what turning it off here does.
    if (!status?.backAtBoot) return toggle;
    return (
        <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
            <FlexItem>{toggle}</FlexItem>
            <FlexItem id="bootc-auto-update-hint" className="ct-auto-update-hint">
                {_("Back on after reboot.")}
                {' '}
                <Button variant="link" isInline isDisabled={disabled} onClick={onKeepOff}>{_("Keep off")}</Button>
            </FlexItem>
        </Flex>
    );
};
