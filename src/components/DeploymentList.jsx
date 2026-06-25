import cockpit from 'cockpit';
import React, { useState } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Tooltip } from "@patternfly/react-core/dist/esm/components/Tooltip/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Table, Thead, Tbody, Tr, Th, Td } from "@patternfly/react-table/dist/esm/components/Table/index.js";

const _ = cockpit.gettext;

// Called per-render (not a module-level constant) so the translated string
// is always looked up against the current locale.
function slotLabel(slot) {
    if (slot === 'booted') return _("Booted");
    if (slot === 'staged') return _("Staged");
    if (slot === 'rollback') return _("Rollback");
    return "—";
}

// Every deployment ostree knows about, not just bootc's 3 reported slots —
// see getDeploymentList() for why a deployment can rotate out of all 3 while
// still pinned and on disk. Collapsed by default since the common case
// (nothing has rotated out yet) has nothing extra to show here.
export const DeploymentList = ({ deployments, versionByChecksum, diskUsage, pinningIndex, onTogglePin, deletingIndex, onDelete, disabled }) => {
    const [expanded, setExpanded] = useState(false);

    if (!deployments || deployments.length === 0) return null;

    const pinnedCount = deployments.filter(d => d.pinned).length;

    return (
        <ExpandableSection
            toggleText={cockpit.format(_("$0 of $1 deployments pinned"), pinnedCount, deployments.length)}
            isExpanded={expanded}
            onToggle={(_event, isExpanded) => setExpanded(isExpanded)}
            className="ct-deployment-list"
        >
            <Table aria-label={_("All ostree deployments")} variant="compact">
                <Thead>
                    <Tr>
                        <Th>{_("Index")}</Th>
                        <Th>{_("Version")}</Th>
                        <Th>{_("Slot")}</Th>
                        <Th>{_("Pinned")}</Th>
                        <Th screenReaderText={_("Actions")} />
                    </Tr>
                </Thead>
                <Tbody>
                    {deployments.map(d => (
                        <Tr key={d.index}>
                            <Td dataLabel={_("Index")}>{d.index}</Td>
                            <Td dataLabel={_("Version")}>
                                {versionByChecksum[d.checksum] || (
                                    <span className="ct-tracked-ref-value">{d.checksum.slice(0, 12)}</span>
                                )}
                            </Td>
                            <Td dataLabel={_("Slot")}>{slotLabel(d.slot)}</Td>
                            <Td dataLabel={_("Pinned")}>{d.pinned ? <Label color="purple">{_("Pinned")}</Label> : "—"}</Td>
                            <Td dataLabel={_("Actions")}>
                                <Flex spaceItems={{ default: 'spaceItemsSm' }} flexWrap={{ default: 'nowrap' }}>
                                    <FlexItem>
                                        <Button
                                            className="ct-deployment-action-btn"
                                            variant="secondary"
                                            size="sm"
                                            isDisabled={disabled || d.slot === 'staged' || pinningIndex === d.index}
                                            isLoading={pinningIndex === d.index}
                                            onClick={() => onTogglePin(d.index, d.pinned, d.checksum)}
                                        >
                                            {d.pinned ? _("Unpin") : _("Pin")}
                                        </Button>
                                    </FlexItem>
                                    <FlexItem>
                                        {d.slot !== null || d.pinned
                                            ? (
                                                <Tooltip content={
                                                    d.slot !== null ? _("Can't delete a deployment in active use")
                                                        : _("Unpin before deleting")
                                                }>
                                                    <Button
                                                        className="ct-deployment-action-btn"
                                                        variant="danger"
                                                        size="sm"
                                                        isAriaDisabled
                                                    >
                                                        {_("Delete")}
                                                    </Button>
                                                </Tooltip>
                                            )
                                            : (
                                                <Button
                                                    className="ct-deployment-action-btn"
                                                    variant="danger"
                                                    size="sm"
                                                    isAriaDisabled={disabled || deletingIndex === d.index}
                                                    isLoading={deletingIndex === d.index}
                                                    onClick={() => onDelete(d.index, d.checksum)}
                                                >
                                                    {_("Delete")}
                                                </Button>
                                            )}
                                    </FlexItem>
                                </Flex>
                            </Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
            <p className="ct-disk-usage-total">{cockpit.format(_("Total disk used by image store: $0"), diskUsage ?? "—")}</p>
        </ExpandableSection>
    );
};
