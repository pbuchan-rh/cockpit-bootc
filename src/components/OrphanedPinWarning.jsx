import React from 'react';
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";

// A deployment ostree still has pinned, but that has rotated out of all 3 of
// bootc's reported slots (booted/staged/rollback) after enough later
// upgrades — invisible to the cards above, still consuming disk, with no
// other way in this UI to find or release it. Anything still in a slot
// already has its own card and Unpin button, so this deliberately only
// surfaces the orphaned ones, not a full deployment browser.
export const OrphanedPinWarning = ({ deployments, pinningIndex, onUnpin, disabled }) => {
    const orphaned = deployments.filter(d => d.pinned && !d.slot);
    if (orphaned.length === 0) return null;

    return (
        <Alert
            variant="warning"
            isInline
            title={orphaned.length === 1
                ? "A pinned deployment is no longer shown on any card"
                : `${orphaned.length} pinned deployments are no longer shown on any card`}
            className="ct-orphaned-pin-warning"
        >
            <p>
                Pinning protects a deployment from automatic cleanup, but it can still age out of the
                cards above after enough later upgrades. It stays on disk and pinned either way.
            </p>
            <ul>
                {orphaned.map(d => (
                    <li key={d.index}>
                        <code>{d.checksum.slice(0, 12)}</code>{' '}
                        <Button
                            variant="link"
                            isInline
                            isDisabled={disabled || pinningIndex === d.index}
                            isLoading={pinningIndex === d.index}
                            onClick={() => onUnpin(d.index, true)}
                        >
                            Unpin
                        </Button>
                    </li>
                ))}
            </ul>
        </Alert>
    );
};
