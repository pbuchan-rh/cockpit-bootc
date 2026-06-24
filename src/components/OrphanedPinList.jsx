import React from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";

// A deployment ostree still has pinned, but that has rotated out of all 3 of
// bootc's reported slots (booted/staged/rollback) after enough later
// upgrades — invisible to the cards above, still consuming disk, with no
// other way in this UI to find or release it. Anything still in a slot
// already has its own card and Unpin button, so this deliberately only
// lists the orphaned ones, not a full deployment browser. Plain markup
// (not @patternfly/react-table) since this is a static, usually 0-1-row
// list with no sorting/expansion needed.
export const OrphanedPinList = ({ deployments, pinningIndex, onUnpin, disabled }) => {
    const orphaned = deployments.filter(d => d.pinned && !d.slot);
    if (orphaned.length === 0) return null;

    return (
        <div className="ct-orphaned-pin-list">
            <p className="ct-orphaned-pin-heading">
                Pinned deployments not shown on any card — still on disk, still protected from cleanup:
            </p>
            <table className="pf-v6-c-table pf-m-compact" role="grid" aria-label="Orphaned pinned deployments">
                <thead className="pf-v6-c-table__thead">
                    <tr className="pf-v6-c-table__tr">
                        <th className="pf-v6-c-table__th" scope="col">Index</th>
                        <th className="pf-v6-c-table__th" scope="col">Version</th>
                        <th className="pf-v6-c-table__th" scope="col">Pinned</th>
                        <th className="pf-v6-c-table__th" scope="col"><span className="pf-v6-u-screen-reader">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="pf-v6-c-table__tbody">
                    {orphaned.map(d => (
                        <tr className="pf-v6-c-table__tr" key={d.index}>
                            <td className="pf-v6-c-table__td" data-label="Index">{d.index}</td>
                            <td className="pf-v6-c-table__td" data-label="Version">
                                <code>{d.checksum.slice(0, 12)}</code>
                            </td>
                            <td className="pf-v6-c-table__td" data-label="Pinned">
                                <Label color="purple">Pinned</Label>
                            </td>
                            <td className="pf-v6-c-table__td" data-label="Actions">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    isDisabled={disabled || pinningIndex === d.index}
                                    isLoading={pinningIndex === d.index}
                                    onClick={() => onUnpin(d.index, true)}
                                >
                                    Unpin
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
