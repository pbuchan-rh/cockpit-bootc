import React from 'react';
import { Card, CardBody, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";

function formatDigest(digest) {
    if (!digest) return null;
    const hash = digest.startsWith("sha256:") ? digest.slice(7) : digest;
    return "sha256:" + hash.slice(0, 12) + "…";
}

export const BootHistory = ({ entries }) => {
    return (
        <Card>
            <CardTitle>Boot History</CardTitle>
            <CardBody>
                <table className="ct-boot-history-table" role="grid" aria-label="Boot history">
                    <thead>
                        <tr role="row">
                            <th role="columnheader" scope="col">Observed</th>
                            <th role="columnheader" scope="col">Version</th>
                            <th role="columnheader" scope="col">Image</th>
                            <th role="columnheader" scope="col">Digest</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map(entry => (
                            <tr key={entry.digest + entry.observed_at} role="row">
                                <td role="cell">{new Date(entry.observed_at).toLocaleString()}</td>
                                <td role="cell">{entry.version || "Unknown"}</td>
                                <td role="cell"><code>{entry.reference || "Unknown"}</code></td>
                                <td role="cell"><code title={entry.digest}>{formatDigest(entry.digest)}</code></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </CardBody>
        </Card>
    );
};
