import cockpit from 'cockpit';
import React, { useEffect, useRef } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Progress, ProgressMeasureLocation, ProgressSize } from "@patternfly/react-core/dist/esm/components/Progress/index.js";

const _ = cockpit.gettext;

// Called per-render (not a module-level constant) so the translated string
// is always looked up against the current locale, not whatever locale was
// active when this module first loaded.
function doneHintFor(kind) {
    if (kind === 'download' || kind === 'switch') return _("The update is staged. Select \"Apply and reboot\" when ready.");
    return _("Done.");
}

// bootc's progress stream (see parseProgressEvent in bootc.js) as a bar:
// bytes of the pull, then the import and deploy steps. Only real numbers from
// bootc are shown; nothing is estimated.
function PullProgress({ event }) {
    let title;
    let value;
    let label;
    if (event.task === 'pulling' && event.bytesTotal > 0) {
        title = _("Downloading");
        value = (event.bytes / event.bytesTotal) * 100;
        label = cockpit.format(_("$0 of $1 ($2 of $3 layers)"),
                               cockpit.format_bytes(event.bytes), cockpit.format_bytes(event.bytesTotal),
                               event.steps, event.stepsTotal);
    } else {
        title = event.task === 'staging' ? _("Deploying") : event.task === 'importing' ? _("Importing") : _("Working");
        value = event.stepsTotal > 0 ? (event.steps / event.stepsTotal) * 100 : 0;
        label = cockpit.format(_("Step $0 of $1"), Math.min(event.steps + 1, event.stepsTotal), event.stepsTotal);
    }
    return (
        <Progress
            id="bootc-pull-progress"
            className="ct-pull-progress"
            title={title}
            value={Math.min(100, Math.max(0, value))}
            label={label}
            valueText={label}
            measureLocation={ProgressMeasureLocation.outside}
            size={ProgressSize.sm}
        />
    );
}

export const ProgressLog = ({ lines, running, kind, unchanged, pullEvent, onDismiss }) => {
    const codeRef = useRef(null);

    useEffect(() => {
        if (codeRef.current)
            codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }, [lines]);

    const doneHint = unchanged ? _("Already running this image — nothing to switch.") : doneHintFor(kind);

    return (
        <div className="ct-progress-log-block">
            <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                    <p className="ct-switch-label">
                        {running ? _("Working…") : _("Done")}
                    </p>
                </FlexItem>
                <FlexItem>
                    <Button variant="plain" onClick={onDismiss} isDisabled={running} aria-label={_("Dismiss progress log")}>×</Button>
                </FlexItem>
            </Flex>
            {running && pullEvent && <PullProgress event={pullEvent} />}
            {lines.length > 0 && (
                <CodeBlock>
                    <div ref={codeRef} className="ct-progress-log">
                        <CodeBlockCode id="bootc-progress-log">
                            {lines.join('\n')}
                        </CodeBlockCode>
                    </div>
                </CodeBlock>
            )}
            {!running && (
                <p className="ct-progress-done-hint">{doneHint}</p>
            )}
        </div>
    );
};
