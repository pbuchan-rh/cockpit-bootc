import React, { useEffect, useRef } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";

const DONE_HINT = {
    download: "Download complete — staged below. Click \"Apply & Reboot\" when you're ready to use it.",
    switch: "Switch complete — staged below. Click \"Apply & Reboot\" when you're ready to use it.",
};

export const ProgressLog = ({ lines, running, kind, onDismiss }) => {
    const codeRef = useRef(null);

    useEffect(() => {
        if (codeRef.current)
            codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }, [lines]);

    return (
        <div className="ct-progress-log-block">
            <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                    <p className="ct-switch-label">
                        {running ? "Working…" : "Done"}
                    </p>
                </FlexItem>
                <FlexItem>
                    <Button variant="plain" onClick={onDismiss} isDisabled={running} aria-label="Dismiss progress log">×</Button>
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
                <p className="ct-progress-done-hint">{DONE_HINT[kind] || "Done."}</p>
            )}
        </div>
    );
};
