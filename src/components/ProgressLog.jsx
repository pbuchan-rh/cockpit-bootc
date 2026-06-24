import cockpit from 'cockpit';
import React, { useEffect, useRef } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";

const _ = cockpit.gettext;

// Called per-render (not a module-level constant) so the translated string
// is always looked up against the current locale, not whatever locale was
// active when this module first loaded.
function doneHintFor(kind) {
    if (kind === 'download') return _('Download complete — staged below. Click "Apply & Reboot" when you\'re ready to use it.');
    if (kind === 'switch') return _('Switch complete — staged below. Click "Apply & Reboot" when you\'re ready to use it.');
    return _("Done.");
}

export const ProgressLog = ({ lines, running, kind, unchanged, onDismiss }) => {
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
            <CodeBlock>
                <div ref={codeRef} className="ct-progress-log">
                    <CodeBlockCode id="bootc-progress-log">
                        {lines.join('\n')}
                    </CodeBlockCode>
                </div>
            </CodeBlock>
            {!running && (
                <p className="ct-progress-done-hint">{doneHint}</p>
            )}
        </div>
    );
};
