import React, { useEffect, useRef } from 'react';
import { Card, CardBody, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock/index.js";

export const ProgressLog = ({ lines }) => {
    const codeRef = useRef(null);

    useEffect(() => {
        if (codeRef.current)
            codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }, [lines]);

    return (
        <Card>
            <CardTitle>Download Progress</CardTitle>
            <CardBody>
                <CodeBlock>
                    <div ref={codeRef} className="ct-progress-log">
                        <CodeBlockCode id="bootc-progress-log">
                            {lines.join('\n')}
                        </CodeBlockCode>
                    </div>
                </CodeBlock>
            </CardBody>
        </Card>
    );
};
