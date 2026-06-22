import React, { useState, useEffect } from 'react';
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch/index.js";

// "in 18m" / "in 2h 5m" — recomputed on a slow tick so it counts down without
// needing any state outside this component.
function formatCountdown(nextRunMs, now) {
    const seconds = Math.max(0, Math.floor((nextRunMs - now) / 1000));
    if (seconds < 60) return "due any moment";
    const minutes = Math.floor(seconds / 60) % 60;
    const hours = Math.floor(seconds / 3600);
    if (hours === 0) return `in ${minutes}m`;
    return `in ${hours}h ${minutes}m`;
}

export const AutoUpdate = ({ status, nextRun, onToggle, disabled }) => {
    const isChecked = status === 'active';
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (!nextRun) return;
        const id = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(id);
    }, [nextRun]);

    return (
        <Switch
            id="bootc-auto-update-switch"
            label={
                isChecked && nextRun
                    ? `Automatic updates (next check ${formatCountdown(nextRun, now)})`
                    : "Automatic updates"
            }
            isChecked={isChecked}
            isDisabled={disabled || status === 'unknown'}
            onChange={(_event, checked) => onToggle(checked)}
        />
    );
};
