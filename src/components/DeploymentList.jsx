import React, { useState } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Table, Thead, Tbody, Tr, Th, Td } from "@patternfly/react-table/dist/esm/components/Table/index.js";

const SLOT_LABEL = { booted: "Booted", staged: "Staged", rollback: "Rollback" };

// Every deployment ostree knows about, not just bootc's 3 reported slots —
// see getDeploymentList() for why a deployment can rotate out of all 3 while
// still pinned and on disk. Collapsed by default since the common case
// (nothing has rotated out yet) has nothing extra to show here.
export const DeploymentList = ({ deployments, versionByChecksum, diskUsage, pinningIndex, onTogglePin, disabled }) => {
    const [expanded, setExpanded] = useState(false);

    if (!deployments || deployments.length === 0) return null;

    const pinnedCount = deployments.filter(d => d.pinned).length;

    return (
        <ExpandableSection
            toggleText={`${pinnedCount} of ${deployments.length} deployments pinned`}
            isExpanded={expanded}
            onToggle={(_event, isExpanded) => setExpanded(isExpanded)}
            className="ct-deployment-list"
        >
            <Table aria-label="All ostree deployments" variant="compact">
                <Thead>
                    <Tr>
                        <Th>Index</Th>
                        <Th>Version</Th>
                        <Th>Slot</Th>
                        <Th>Pinned</Th>
                        <Th screenReaderText="Actions" />
                    </Tr>
                </Thead>
                <Tbody>
                    {deployments.map(d => (
                        <Tr key={d.index}>
                            <Td dataLabel="Index">{d.index}</Td>
                            <Td dataLabel="Version">
                                {versionByChecksum[d.checksum] || (
                                    <span className="ct-tracked-ref-value">{d.checksum.slice(0, 12)}</span>
                                )}
                            </Td>
                            <Td dataLabel="Slot">{SLOT_LABEL[d.slot] || "—"}</Td>
                            <Td dataLabel="Pinned">{d.pinned ? <Label color="purple">Pinned</Label> : "—"}</Td>
                            <Td dataLabel="Actions">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    isDisabled={disabled || d.slot === 'staged' || pinningIndex === d.index}
                                    isLoading={pinningIndex === d.index}
                                    onClick={() => onTogglePin(d.index, d.pinned)}
                                >
                                    {d.pinned ? "Unpin" : "Pin"}
                                </Button>
                            </Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
            <p className="ct-disk-usage-total">Total disk used by image store: {diskUsage ?? "—"}</p>
        </ExpandableSection>
    );
};
