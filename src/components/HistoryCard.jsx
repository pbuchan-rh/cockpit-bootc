import React, { useState } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Tab, TabTitleText, Tabs } from "@patternfly/react-core/dist/esm/components/Tabs/index.js";

function formatDigest(digest) {
    if (!digest) return null;
    const hash = digest.startsWith("sha256:") ? digest.slice(7) : digest;
    return "sha256:" + hash.slice(0, 12) + "…";
}

function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export const HistoryCard = ({ bootHistory, activityLog, onDownloadLog }) => {
    const [activeTab, setActiveTab] = useState('image');

    async function handleDownload(entry) {
        const text = await onDownloadLog(entry.log_file);
        downloadText(entry.log_file, text);
    }

    return (
        <Card>
            <Tabs activeKey={activeTab} onSelect={(_event, key) => setActiveTab(key)}>
                <Tab eventKey="image" title={<TabTitleText>Image History</TabTitleText>}>
                    <CardBody>
                        <table className="ct-boot-history-table" role="grid" aria-label="Image history">
                            <thead>
                                <tr role="row">
                                    <th role="columnheader" scope="col">Observed</th>
                                    <th role="columnheader" scope="col">Version</th>
                                    <th role="columnheader" scope="col">Image</th>
                                    <th role="columnheader" scope="col">Digest</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bootHistory.map(entry => (
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
                </Tab>
                <Tab eventKey="activity" title={<TabTitleText>Activity</TabTitleText>}>
                    <CardBody>
                        <table className="ct-boot-history-table" role="grid" aria-label="Activity log">
                            <thead>
                                <tr role="row">
                                    <th role="columnheader" scope="col">Started</th>
                                    <th role="columnheader" scope="col">Action</th>
                                    <th role="columnheader" scope="col">Target</th>
                                    <th role="columnheader" scope="col">Result</th>
                                    <th role="columnheader" scope="col">Log</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activityLog.map(entry => (
                                    <tr key={entry.started_at} role="row">
                                        <td role="cell">{new Date(entry.started_at).toLocaleString()}</td>
                                        <td role="cell">{entry.kind === 'switch' ? "Switch" : "Download"}</td>
                                        <td role="cell"><code>{entry.ref}</code></td>
                                        <td role="cell">{entry.success ? "✓ Done" : "✗ Failed"}</td>
                                        <td role="cell">
                                            <Button variant="link" isInline onClick={() => handleDownload(entry)}>
                                                Download
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardBody>
                </Tab>
            </Tabs>
        </Card>
    );
};
